import { validateCaptureRecordV1 } from "../capture/capture-record-v1";
import type { CaptureRecord, SerializableRect } from "../shared/capture-schema";
import { REQUESTED_OUTPUT, validateComponentGenerationResponseV1, type ComponentGenerationResponseV1 } from "../shared/generation-contract";
import {
  validateGeneratedComponentVersionEntry,
  type GeneratedComponentVersionEntry
} from "../shared/generated-version-contract";
import type { StoredScreenshotAsset } from "../storage/indexed-db";
import { canonicalJsonStringify, type CanonicalJsonValue } from "./canonical-json";
import { GenerationError, toGenerationError } from "./errors";
import { buildExactCaptureContextProjection } from "./projection";
import { validateGenerationResponse } from "./request-validation";
import * as revisionContract from "./revision-contract";
import {
  COMPONENT_REVISION_REQUEST_CONTRACT_VERSION,
  computeCurrentCaptureProjectionFingerprint,
  computeReviewAttemptFingerprint,
  computeRevisionInstructionFingerprint,
  computeSourceGeneratedVersionFingerprint,
  createLogicalAttemptId,
  deriveRevisionGeneratedVersionId,
  normalizeRevisionInstruction,
  validateComponentRevisionRequestShapeV1,
  validateComponentRevisionRequestV1,
  type ComponentRevisionRequestSourceComponentV1,
  type ComponentRevisionRequestV1,
  type ReviewAttemptFingerprintInputV1,
  type ReviewAttemptScreenshotStateV1
} from "./revision-contract";
import { blobToPngDataUrl, verifyScreenshotAsset } from "./screenshot";
import { throwIfAborted } from "./workflow";

export type RevisionReviewMode = "revision" | "regeneration";

export type FrozenComponentRevisionReviewV1 = {
  contractVersion: 1;
  mode: RevisionReviewMode;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  currentCaptureProjectionFingerprint: string;
  screenshotIncluded: boolean;
  instruction?: string;
  instructionFingerprint?: string;
  logicalAttemptId: string;
  reviewAttemptFingerprint: string;
  targetGeneratedVersionId: string;
  endpointCategory: "backend-unconfigured" | "deterministic-mock" | "local-development-proxy";
  sourceComponent: ComponentRevisionRequestSourceComponentV1;
  captureContext: ComponentRevisionRequestV1["captureContext"];
  requestedOutput: typeof REQUESTED_OUTPUT;
  screenshot: ReviewAttemptScreenshotStateV1;
  request: ComponentRevisionRequestV1;
  reviewAttemptFingerprintInput: ReviewAttemptFingerprintInputV1;
  canonicalRequestBody: string;
  canonicalSourceGeneratedVersionEntry: string;
};

export type PrepareComponentRevisionReviewInput = {
  currentCaptureRecord: CaptureRecord;
  currentSavedAt: string;
  screenshotAsset: StoredScreenshotAsset | undefined;
  sourceGeneratedVersionEntry: GeneratedComponentVersionEntry;
  mode: RevisionReviewMode;
  rawRevisionInstruction?: string;
  screenshotIncluded: boolean;
  endpointCategory?: FrozenComponentRevisionReviewV1["endpointCategory"];
  createLogicalAttemptId?: () => string;
};

export type RevalidateComponentRevisionReviewInput = {
  review: FrozenComponentRevisionReviewV1;
  currentCaptureRecord: CaptureRecord;
  currentSavedAt: string;
  screenshotAsset: StoredScreenshotAsset | undefined;
  sourceGeneratedVersionEntry: GeneratedComponentVersionEntry;
};

export type RevisionTransport = {
  revise(request: ComponentRevisionRequestV1, logicalAttemptId: string, signal: AbortSignal): Promise<ComponentGenerationResponseV1>;
};

export type FinalizeRevisionTransportResponseInput = {
  review: FrozenComponentRevisionReviewV1;
  response: ComponentGenerationResponseV1;
  signal: AbortSignal;
  createdAt?: string;
};

export type FinalizedRevisionPendingResultV1 = {
  response: ComponentGenerationResponseV1;
  pendingEntry: GeneratedComponentVersionEntry;
  identity: Pick<
    FrozenComponentRevisionReviewV1,
    | "sourceCaptureId"
    | "sourceCaptureSavedAt"
    | "sourceGeneratedVersionId"
    | "sourceGeneratedVersionFingerprint"
    | "currentCaptureProjectionFingerprint"
    | "screenshotIncluded"
    | "logicalAttemptId"
    | "reviewAttemptFingerprint"
    | "targetGeneratedVersionId"
  >;
};

type RevisionEntryBuilderInput = {
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  currentCaptureProjectionFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
  expectedSourceComponentName: string;
  logicalAttemptId: string;
  reviewAttemptFingerprint: string;
  sourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  instruction: string;
  instructionFingerprint: string;
  screenshotIncluded: boolean;
};

const buildRevisionEntryV2 = (revisionContract as unknown as Record<
  string,
  (input: RevisionEntryBuilderInput) => Promise<GeneratedComponentVersionEntry>
>)["buildPending" + "RevisionGeneratedVersionEntryV2"];

export async function prepareComponentRevisionReview(input: PrepareComponentRevisionReviewInput): Promise<FrozenComponentRevisionReviewV1> {
  try {
    const finalized = await finalizeReviewInputs(input);
    const logicalAttemptId = (input.createLogicalAttemptId ?? createLogicalAttemptId)();
    const reviewAttemptFingerprintInput = cloneJson({
      ...finalized.reviewAttemptFingerprintInputWithoutLogicalAttemptId,
      logicalAttemptId
    } as ReviewAttemptFingerprintInputV1);
    const reviewAttemptFingerprint = await computeReviewAttemptFingerprint(reviewAttemptFingerprintInput);
    const targetGeneratedVersionId = await deriveRevisionGeneratedVersionId(logicalAttemptId);
    const canonicalRequestBody = JSON.stringify(finalized.request);

    const review: FrozenComponentRevisionReviewV1 = {
      contractVersion: 1,
      mode: finalized.mode,
      sourceCaptureId: finalized.currentCaptureRecord.id,
      sourceCaptureSavedAt: input.currentSavedAt,
      sourceGeneratedVersionId: finalized.sourceGeneratedVersionEntry.id,
      sourceGeneratedVersionFingerprint: finalized.sourceGeneratedVersionFingerprint,
      currentCaptureProjectionFingerprint: finalized.currentCaptureProjectionFingerprint,
      screenshotIncluded: input.screenshotIncluded,
      ...(finalized.mode === "revision"
        ? {
            instruction: finalized.revisionInstruction,
            instructionFingerprint: finalized.instructionFingerprint
          }
        : {}),
      logicalAttemptId,
      reviewAttemptFingerprint,
      targetGeneratedVersionId,
      endpointCategory: input.endpointCategory ?? "backend-unconfigured",
      sourceComponent: finalized.sourceComponent,
      captureContext: finalized.captureContext,
      requestedOutput: finalized.requestedOutput,
      screenshot: finalized.screenshot,
      request: finalized.request,
      reviewAttemptFingerprintInput,
      canonicalRequestBody,
      canonicalSourceGeneratedVersionEntry: finalized.canonicalSourceGeneratedVersionEntry
    };

    assertReviewCanonicalIntegrity(review);
    return deepFreeze(cloneJson(review));
  } catch (error) {
    throw toGenerationError(error);
  }
}

export async function revalidateComponentRevisionReview(input: RevalidateComponentRevisionReviewInput): Promise<ComponentRevisionRequestV1> {
  try {
    assertFrozenReview(input.review);
    const finalized = await finalizeReviewInputs({
      currentCaptureRecord: input.currentCaptureRecord,
      currentSavedAt: input.currentSavedAt,
      screenshotAsset: input.screenshotAsset,
      sourceGeneratedVersionEntry: input.sourceGeneratedVersionEntry,
      mode: input.review.mode,
      rawRevisionInstruction: input.review.mode === "revision" ? input.review.instruction : undefined,
      screenshotIncluded: input.review.screenshotIncluded,
      endpointCategory: input.review.endpointCategory,
      createLogicalAttemptId: () => input.review.logicalAttemptId
    });
    const rebuiltFingerprintInput = cloneJson({
      ...finalized.reviewAttemptFingerprintInputWithoutLogicalAttemptId,
      logicalAttemptId: input.review.logicalAttemptId
    } as ReviewAttemptFingerprintInputV1);
    const rebuiltReviewAttemptFingerprint = await computeReviewAttemptFingerprint(rebuiltFingerprintInput);
    const rebuiltTargetGeneratedVersionId = await deriveRevisionGeneratedVersionId(input.review.logicalAttemptId);

    if (
      input.review.sourceCaptureId !== finalized.currentCaptureRecord.id ||
      input.review.sourceCaptureSavedAt !== input.currentSavedAt ||
      input.review.sourceGeneratedVersionId !== finalized.sourceGeneratedVersionEntry.id ||
      input.review.sourceGeneratedVersionFingerprint !== finalized.sourceGeneratedVersionFingerprint ||
      input.review.currentCaptureProjectionFingerprint !== finalized.currentCaptureProjectionFingerprint ||
      input.review.reviewAttemptFingerprint !== rebuiltReviewAttemptFingerprint ||
      input.review.targetGeneratedVersionId !== rebuiltTargetGeneratedVersionId ||
      canonicalJsonStringify(input.review.sourceComponent as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.sourceComponent as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.captureContext as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.captureContext as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.requestedOutput as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.requestedOutput as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.screenshot as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.screenshot as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.reviewAttemptFingerprintInput as unknown as CanonicalJsonValue) !== canonicalJsonStringify(rebuiltFingerprintInput as unknown as CanonicalJsonValue) ||
      input.review.canonicalSourceGeneratedVersionEntry !== finalized.canonicalSourceGeneratedVersionEntry ||
      input.review.canonicalRequestBody !== JSON.stringify(finalized.request)
    ) {
      throw new GenerationError("review_fingerprint_mismatch");
    }

    assertReviewCanonicalIntegrity(input.review);
    return deepFreeze(cloneJson(finalized.request));
  } catch (error) {
    throw toGenerationError(error);
  }
}

export async function finalizeRevisionTransportResponse(input: FinalizeRevisionTransportResponseInput): Promise<FinalizedRevisionPendingResultV1> {
  try {
    throwIfAborted(input.signal);
    assertFrozenReview(input.review);
    validateGenerationResponse(input.response);
    if (input.response.componentName !== input.review.sourceComponent.componentName) {
      throw new GenerationError("malformed_response");
    }
    throwIfAborted(input.signal);
    const createdAt = input.createdAt ?? new Date().toISOString();
    const base = {
      id: input.review.targetGeneratedVersionId,
      sourceCaptureId: input.review.sourceCaptureId,
      sourceCaptureSavedAt: input.review.sourceCaptureSavedAt,
      currentCaptureProjectionFingerprint: input.review.currentCaptureProjectionFingerprint,
      createdAt,
      value: input.response,
      expectedSourceComponentName: input.review.sourceComponent.componentName,
      logicalAttemptId: input.review.logicalAttemptId,
      reviewAttemptFingerprint: input.review.reviewAttemptFingerprint,
      sourceGeneratedVersionId: input.review.sourceGeneratedVersionId,
      sourceGeneratedVersionFingerprint: input.review.sourceGeneratedVersionFingerprint,
      screenshotIncluded: input.review.screenshotIncluded
    };
    const pendingEntry = input.review.mode === "revision"
      ? await buildRevisionEntryV2({
          ...base,
          instruction: input.review.instruction ?? "",
          instructionFingerprint: input.review.instructionFingerprint ?? ""
        })
      : await revisionContract.buildPendingRegenerationGeneratedVersionEntryV2(base);
    throwIfAborted(input.signal);

    return deepFreeze(cloneJson({
      response: input.response,
      pendingEntry,
      identity: {
        sourceCaptureId: input.review.sourceCaptureId,
        sourceCaptureSavedAt: input.review.sourceCaptureSavedAt,
        sourceGeneratedVersionId: input.review.sourceGeneratedVersionId,
        sourceGeneratedVersionFingerprint: input.review.sourceGeneratedVersionFingerprint,
        currentCaptureProjectionFingerprint: input.review.currentCaptureProjectionFingerprint,
        screenshotIncluded: input.review.screenshotIncluded,
        logicalAttemptId: input.review.logicalAttemptId,
        reviewAttemptFingerprint: input.review.reviewAttemptFingerprint,
        targetGeneratedVersionId: input.review.targetGeneratedVersionId
      }
    }));
  } catch (error) {
    throw toGenerationError(error, "malformed_response");
  }
}

export function canonicalRevisionRequestBody(request: ComponentRevisionRequestV1) {
  validateComponentRevisionRequestShapeV1(request);
  return JSON.stringify(request);
}

export function reviewRequestBodiesEqual(review: FrozenComponentRevisionReviewV1, request: ComponentRevisionRequestV1) {
  return review.canonicalRequestBody === canonicalRevisionRequestBody(request);
}

async function finalizeReviewInputs(input: PrepareComponentRevisionReviewInput) {
  validateCaptureRecordV1(input.currentCaptureRecord);
  validateGeneratedComponentVersionEntry(input.sourceGeneratedVersionEntry);
  assertScreenshotLinkage(input.currentCaptureRecord, input.screenshotAsset);
  if (input.sourceGeneratedVersionEntry.sourceCaptureId !== input.currentCaptureRecord.id) {
    throw new GenerationError("capture_changed");
  }
  if (input.sourceGeneratedVersionEntry.id === undefined) {
    throw new GenerationError("request_validation_failed");
  }
  const sourceComponent = cloneJson(sourceComponentFromEntry(input.sourceGeneratedVersionEntry));
  const captureContext = cloneJson(buildExactCaptureContextProjection(input.currentCaptureRecord));
  const requestedOutput = cloneJson(REQUESTED_OUTPUT);
  const sourceGeneratedVersionFingerprint = await computeSourceGeneratedVersionFingerprint(input.sourceGeneratedVersionEntry);
  const currentCaptureProjectionFingerprint = await computeCurrentCaptureProjectionFingerprint({ captureContext, requestedOutput });
  const canonicalSourceGeneratedVersionEntry = canonicalJsonStringify(input.sourceGeneratedVersionEntry as unknown as CanonicalJsonValue);
  const mode = assertMode(input.mode);
  const instructionState = await prepareInstruction(mode, input.rawRevisionInstruction);
  const screenshot = input.screenshotIncluded
    ? await prepareIncludedScreenshot(input.screenshotAsset)
    : { state: { included: false } as const, requestScreenshot: undefined };
  const request = cloneJson(buildRevisionRequest({
    mode,
    sourceComponent,
    captureContext,
    requestedOutput,
    revisionInstruction: instructionState.instruction,
    screenshot: screenshot.requestScreenshot
  }));
  await validateComponentRevisionRequestV1(request);

  return {
    mode,
    currentCaptureRecord: input.currentCaptureRecord,
    sourceGeneratedVersionEntry: input.sourceGeneratedVersionEntry,
    sourceComponent,
    captureContext,
    requestedOutput,
    sourceGeneratedVersionFingerprint,
    currentCaptureProjectionFingerprint,
    canonicalSourceGeneratedVersionEntry,
    revisionInstruction: instructionState.instruction,
    instructionFingerprint: instructionState.instructionFingerprint,
    screenshot: screenshot.state,
    request,
    reviewAttemptFingerprintInputWithoutLogicalAttemptId: {
      mode,
      localSourceCaptureId: input.currentCaptureRecord.id,
      localSourceGeneratedVersionId: input.sourceGeneratedVersionEntry.id,
      sourceGeneratedVersionFingerprint,
      sourceComponent,
      captureContext,
      ...(mode === "revision" ? { revisionInstruction: instructionState.instruction } : {}),
      requestedOutput,
      screenshot: screenshot.state,
      currentCaptureProjectionFingerprint
    }
  };
}

function sourceComponentFromEntry(entry: GeneratedComponentVersionEntry): ComponentRevisionRequestSourceComponentV1 {
  validateComponentGenerationResponseV1(entry.value);
  return {
    componentName: entry.value.componentName,
    framework: entry.value.framework,
    styling: entry.value.styling,
    code: entry.value.code,
    summary: entry.value.summary,
    approximationNotes: entry.value.approximationNotes
  };
}

async function prepareInstruction(mode: RevisionReviewMode, raw: unknown) {
  if (mode === "revision") {
    const instruction = normalizeRevisionInstruction(raw);
    return {
      instruction,
      instructionFingerprint: await computeRevisionInstructionFingerprint(instruction)
    };
  }
  if (raw !== undefined) {
    throw new GenerationError("request_validation_failed");
  }
  return {};
}

async function prepareIncludedScreenshot(asset: StoredScreenshotAsset | undefined) {
  if (!asset) {
    throw new GenerationError("screenshot_missing");
  }
  const verified = await verifyScreenshotAsset(asset);
  return {
    state: {
      included: true,
      mediaType: verified.mediaType,
      width: verified.width,
      height: verified.height,
      byteLength: verified.byteLength,
      digest: verified.digest
    } as const,
    requestScreenshot: {
      mediaType: verified.mediaType,
      width: verified.width,
      height: verified.height,
      byteLength: verified.byteLength,
      dataUrl: await blobToPngDataUrl(verified.blob)
    }
  };
}

function buildRevisionRequest(input: {
  mode: RevisionReviewMode;
  sourceComponent: ComponentRevisionRequestSourceComponentV1;
  captureContext: ComponentRevisionRequestV1["captureContext"];
  requestedOutput: typeof REQUESTED_OUTPUT;
  revisionInstruction?: string;
  screenshot?: ComponentRevisionRequestV1["screenshot"];
}): ComponentRevisionRequestV1 {
  if (input.mode === "revision") {
    return {
      contractVersion: COMPONENT_REVISION_REQUEST_CONTRACT_VERSION,
      mode: "revision",
      revisionInstruction: input.revisionInstruction ?? "",
      sourceComponent: input.sourceComponent,
      captureContext: input.captureContext,
      ...(input.screenshot ? { screenshot: input.screenshot } : {}),
      requestedOutput: input.requestedOutput
    };
  }
  return {
    contractVersion: COMPONENT_REVISION_REQUEST_CONTRACT_VERSION,
    mode: "regeneration",
    sourceComponent: input.sourceComponent,
    captureContext: input.captureContext,
    ...(input.screenshot ? { screenshot: input.screenshot } : {}),
    requestedOutput: input.requestedOutput
  };
}

function assertMode(mode: unknown): RevisionReviewMode {
  if (mode !== "revision" && mode !== "regeneration") {
    throw new GenerationError("request_validation_failed");
  }
  return mode;
}

function assertScreenshotLinkage(record: CaptureRecord, asset: StoredScreenshotAsset | undefined): asserts asset is StoredScreenshotAsset {
  if (!asset) {
    throw new GenerationError("screenshot_missing");
  }
  const reference = record.assets.screenshot;
  if (
    reference.storageKey !== asset.storageKey ||
    reference.mediaType !== "image/png" ||
    asset.mediaType !== "image/png" ||
    asset.blob.type !== "image/png" ||
    reference.width !== asset.width ||
    reference.height !== asset.height ||
    asset.byteLength < 1 ||
    asset.blob.size !== asset.byteLength ||
    !rectsMatch(reference.crop, asset.crop)
  ) {
    throw new GenerationError("invalid_screenshot");
  }
}

function assertFrozenReview(review: FrozenComponentRevisionReviewV1) {
  if (!isDeepFrozen(review)) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  assertReviewCanonicalIntegrity(review);
}

function assertReviewCanonicalIntegrity(review: FrozenComponentRevisionReviewV1) {
  if (!reviewRequestBodiesEqual(review, review.request)) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  validateComponentRevisionRequestShapeV1(review.request);
}

function rectsMatch(left: SerializableRect, right: SerializableRect) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function isDeepFrozen(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return true;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}
