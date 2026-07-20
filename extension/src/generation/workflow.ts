import { validateCaptureRecordV1 } from "../capture/capture-record-v1";
import {
  createGeneratedComponentVersionId,
  createGeneratedComponentVersionTimestamp,
  type GeneratedComponentVersionEntryV1
} from "../shared/generated-version-contract";
import { loadSavedCaptureById, type SavedCaptureReadModel } from "../storage/capture-save";
import { PersistenceError } from "../storage/persistence-errors";
import { digestBlob } from "../storage/screenshot-asset";
import { addGeneratedComponentVersion } from "../storage/indexed-db";
import { GenerationError, toGenerationError } from "./errors";
import { buildGenerationRequestWithoutDataUrl } from "./projection";
import type {
  ComponentGenerationLocalContextV1,
  ComponentGenerationRequestV1,
  ComponentGenerationResponseV1,
  GenerationReviewModel,
  GenerationTransport
} from "./types";
import { verifyScreenshotAsset, blobToPngDataUrl } from "./screenshot";
import { computeReviewFingerprint } from "./fingerprint";
import { createFullRequest, validateGenerationResponse, validateRequestWithoutDataUrl } from "./request-validation";
import { GENERATION_CONTRACT_VERSION } from "./limits";

export async function prepareGenerationReview(
  savedCapture: SavedCaptureReadModel,
  endpointCategory: GenerationReviewModel["endpointCategory"]
): Promise<GenerationReviewModel> {
  try {
    validateCaptureRecordV1(savedCapture.record);
    const screenshot = await verifyScreenshotAsset(savedCapture.asset);
    const sourceRecordValidationDigest = await digestBlob(new Blob([JSON.stringify(savedCapture.record)], { type: "application/json" }));
    const requestWithoutDataUrl = buildGenerationRequestWithoutDataUrl({
      record: savedCapture.record,
      screenshot
    });
    validateRequestWithoutDataUrl(requestWithoutDataUrl);
    const reviewFingerprint = await computeReviewFingerprint({
      requestWithoutDataUrl,
      screenshotDigest: screenshot.digest,
      screenshotByteLength: screenshot.byteLength,
      screenshotWidth: screenshot.width,
      screenshotHeight: screenshot.height
    });

    const localContext: ComponentGenerationLocalContextV1 = {
      contractVersion: GENERATION_CONTRACT_VERSION,
      sourceCaptureId: savedCapture.record.id,
      sourceCaptureSavedAt: savedCapture.savedAt,
      sourceRecordWrapperId: savedCapture.record.id,
      sourceRecordValidationDigest,
      screenshotStorageKey: savedCapture.record.assets.screenshot.storageKey,
      screenshotBlobDigest: screenshot.digest,
      reviewFingerprint,
      reviewedRequestWithoutDataUrl: requestWithoutDataUrl
    };

    return {
      localContext,
      screenshot: {
        mediaType: "image/png",
        width: screenshot.width,
        height: screenshot.height,
        byteLength: screenshot.byteLength,
        blob: screenshot.blob,
        digest: screenshot.digest
      },
      endpointCategory
    };
  } catch (error) {
    throw toGenerationError(error);
  }
}

export async function prepareGenerationReviewById(
  sourceCaptureId: string,
  endpointCategory: GenerationReviewModel["endpointCategory"]
): Promise<GenerationReviewModel> {
  try {
    const latest = await loadSavedCaptureById(sourceCaptureId);
    return await prepareGenerationReview(latest, endpointCategory);
  } catch (error) {
    throw mapGenerationPreparationError(error);
  }
}

export async function generateFromReview({
  localContext,
  transport,
  signal
}: {
  localContext: ComponentGenerationLocalContextV1;
  transport: GenerationTransport;
  signal: AbortSignal;
}): Promise<GeneratedComponentVersionEntryV1> {
  let dataUrl: string | undefined;

  try {
    const latest = await loadSavedCaptureById(localContext.sourceCaptureId);
    validateCaptureRecordV1(latest.record);
    const screenshot = await verifyScreenshotAsset(latest.asset);
    const requestWithoutDataUrl = buildGenerationRequestWithoutDataUrl({
      record: latest.record,
      screenshot
    });
    validateRequestWithoutDataUrl(requestWithoutDataUrl);
    const fingerprint = await computeReviewFingerprint({
      requestWithoutDataUrl,
      screenshotDigest: screenshot.digest,
      screenshotByteLength: screenshot.byteLength,
      screenshotWidth: screenshot.width,
      screenshotHeight: screenshot.height
    });
    if (fingerprint !== localContext.reviewFingerprint) {
      throw new GenerationError("review_fingerprint_mismatch");
    }

    dataUrl = await blobToPngDataUrl(screenshot.blob);
    const request: ComponentGenerationRequestV1 = await createFullRequest(requestWithoutDataUrl, dataUrl);
    const response = await transport.generate(request, signal);
    validateGenerationResponse(response);
    const pendingEntry: GeneratedComponentVersionEntryV1 = {
      id: createGeneratedComponentVersionId(),
      sourceCaptureId: localContext.sourceCaptureId,
      sourceCaptureSavedAt: localContext.sourceCaptureSavedAt,
      sourceReviewFingerprint: localContext.reviewFingerprint,
      createdAt: createGeneratedComponentVersionTimestamp(),
      value: response
    };

    try {
      return await persistGeneratedVersionFromReview(localContext, pendingEntry);
    } catch (error) {
      const mapped = mapGenerationPreparationError(error, "persistence_failed");
      throw new GenerationError(mapped.code, undefined, { pendingEntry, originalError: error });
    }
  } catch (error) {
    throw mapGenerationPreparationError(error, "malformed_response");
  } finally {
    dataUrl = undefined;
  }
}

export async function persistGeneratedVersionFromReview(
  localContext: ComponentGenerationLocalContextV1,
  pendingEntry: GeneratedComponentVersionEntryV1
) {
  try {
    const latest = await loadSavedCaptureById(localContext.sourceCaptureId);
    validateCaptureRecordV1(latest.record);
    const screenshot = await verifyScreenshotAsset(latest.asset);
    const requestWithoutDataUrl = buildGenerationRequestWithoutDataUrl({
      record: latest.record,
      screenshot
    });
    validateRequestWithoutDataUrl(requestWithoutDataUrl);
    const fingerprint = await computeReviewFingerprint({
      requestWithoutDataUrl,
      screenshotDigest: screenshot.digest,
      screenshotByteLength: screenshot.byteLength,
      screenshotWidth: screenshot.width,
      screenshotHeight: screenshot.height
    });
    if (fingerprint !== localContext.reviewFingerprint) {
      throw new GenerationError("review_fingerprint_mismatch");
    }
    return await addGeneratedComponentVersion({
      entry: pendingEntry,
      expectedSourceSavedAt: localContext.sourceCaptureSavedAt,
      expectedReviewFingerprint: localContext.reviewFingerprint,
      expectedSourceRecordValue: latest.record
    });
  } catch (error) {
    throw mapGenerationPreparationError(error, "persistence_failed");
  }
}

function mapGenerationPreparationError(error: unknown, fallback: Parameters<typeof toGenerationError>[1] = "request_validation_failed") {
  if (error instanceof PersistenceError) {
    if (error.code === "persistence-conflict" || error.code === "constraint") {
      return new GenerationError("persistence_conflict", undefined, error);
    }
    if (error.code === "readback") {
      return new GenerationError("read_back_failed", undefined, error);
    }
    if (error.code === "not-found") {
      return new GenerationError(error.message.toLowerCase().includes("screenshot") ? "screenshot_missing" : "capture_missing", undefined, error);
    }
    if (error.code === "reference-mismatch" || error.code === "encoding") {
      return new GenerationError("invalid_screenshot", undefined, error);
    }
  }

  return toGenerationError(error, fallback);
}
