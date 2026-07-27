import { validateCaptureRecordV1 } from "../capture/capture-record-v1";
import type { CaptureRecord, SerializableRect } from "../shared/capture-schema";
import { REQUESTED_OUTPUT, validateComponentGenerationResponseV1, type ComponentGenerationResponseV1 } from "../shared/generation-contract";
import {
  isValidCaptureId,
  isValidGeneratedComponentVersionId,
  isValidLogicalAttemptId,
  isValidSha256Hex,
  validateGeneratedComponentVersionEntry,
  type GeneratedComponentVersionEntry,
  type GeneratedComponentVersionEntryV2
} from "../shared/generated-version-contract";
import type { StoredScreenshotAsset } from "../storage/indexed-db";
import { canonicalJsonStringify, type CanonicalJsonValue } from "./canonical-json";
import { GenerationError, toGenerationError } from "./errors";
import { buildExactCaptureContextProjection } from "./projection";
import { validateGenerationResponse, validateRequestWithoutDataUrl } from "./request-validation";
import {
  COMPONENT_REVISION_REQUEST_CONTRACT_VERSION,
  buildPendingRegenerationGeneratedVersionEntryV2,
  buildPendingRevisionGeneratedVersionEntryV2,
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
  signal: AbortSignal;
};

export type RevalidateComponentRevisionReviewInput = {
  review: FrozenComponentRevisionReviewV1;
  currentCaptureRecord: CaptureRecord;
  currentSavedAt: string;
  screenshotAsset: StoredScreenshotAsset | undefined;
  sourceGeneratedVersionEntry: GeneratedComponentVersionEntry;
  signal: AbortSignal;
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
  pendingEntry: GeneratedComponentVersionEntryV2;
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

export async function prepareComponentRevisionReview(input: PrepareComponentRevisionReviewInput): Promise<FrozenComponentRevisionReviewV1> {
  try {
    throwIfAborted(input.signal);
    const finalized = await finalizeReviewInputs(input);
    throwIfAborted(input.signal);
    const logicalAttemptId = (input.createLogicalAttemptId ?? createLogicalAttemptId)();
    const reviewAttemptFingerprintInput = cloneJson({
      ...finalized.reviewAttemptFingerprintInputWithoutLogicalAttemptId,
      logicalAttemptId
    } as ReviewAttemptFingerprintInputV1);
    const reviewAttemptFingerprint = await computeReviewAttemptFingerprint(reviewAttemptFingerprintInput);
    throwIfAborted(input.signal);
    const targetGeneratedVersionId = await deriveRevisionGeneratedVersionId(logicalAttemptId);
    throwIfAborted(input.signal);
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
    throwIfAborted(input.signal);
    return deepFreeze(cloneJson(review));
  } catch (error) {
    throw toGenerationError(error);
  }
}

export async function revalidateComponentRevisionReview(input: RevalidateComponentRevisionReviewInput): Promise<ComponentRevisionRequestV1> {
  try {
    throwIfAborted(input.signal);
    validateFrozenComponentRevisionReviewV1(input.review);
    const finalized = await finalizeReviewInputs({
      currentCaptureRecord: input.currentCaptureRecord,
      currentSavedAt: input.currentSavedAt,
      screenshotAsset: input.screenshotAsset,
      sourceGeneratedVersionEntry: input.sourceGeneratedVersionEntry,
      mode: input.review.mode,
      rawRevisionInstruction: input.review.mode === "revision" ? input.review.instruction : undefined,
      screenshotIncluded: input.review.screenshotIncluded,
      endpointCategory: input.review.endpointCategory,
      createLogicalAttemptId: () => input.review.logicalAttemptId,
      signal: input.signal
    });
    throwIfAborted(input.signal);
    const rebuiltFingerprintInput = cloneJson({
      ...finalized.reviewAttemptFingerprintInputWithoutLogicalAttemptId,
      logicalAttemptId: input.review.logicalAttemptId
    } as ReviewAttemptFingerprintInputV1);
    const rebuiltReviewAttemptFingerprint = await computeReviewAttemptFingerprint(rebuiltFingerprintInput);
    throwIfAborted(input.signal);
    const rebuiltTargetGeneratedVersionId = await deriveRevisionGeneratedVersionId(input.review.logicalAttemptId);
    throwIfAborted(input.signal);
    const instructionMismatch = input.review.mode === "revision"
      ? input.review.instruction !== finalized.revisionInstruction ||
        input.review.instructionFingerprint !== finalized.instructionFingerprint
      : "instruction" in input.review || "instructionFingerprint" in input.review;

    if (
      input.review.contractVersion !== 1 ||
      input.review.mode !== finalized.mode ||
      input.review.sourceCaptureId !== finalized.currentCaptureRecord.id ||
      input.review.sourceCaptureSavedAt !== input.currentSavedAt ||
      !isCanonicalIsoTimestamp(input.review.sourceCaptureSavedAt) ||
      input.review.endpointCategory !== finalized.endpointCategory ||
      input.review.sourceGeneratedVersionId !== finalized.sourceGeneratedVersionEntry.id ||
      input.review.sourceGeneratedVersionFingerprint !== finalized.sourceGeneratedVersionFingerprint ||
      input.review.currentCaptureProjectionFingerprint !== finalized.currentCaptureProjectionFingerprint ||
      input.review.logicalAttemptId !== input.review.reviewAttemptFingerprintInput.logicalAttemptId ||
      input.review.reviewAttemptFingerprint !== rebuiltReviewAttemptFingerprint ||
      input.review.targetGeneratedVersionId !== rebuiltTargetGeneratedVersionId ||
      instructionMismatch ||
      canonicalJsonStringify(input.review.sourceComponent as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.sourceComponent as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.captureContext as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.captureContext as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.requestedOutput as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.requestedOutput as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.screenshot as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.screenshot as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.reviewAttemptFingerprintInput as unknown as CanonicalJsonValue) !== canonicalJsonStringify(rebuiltFingerprintInput as unknown as CanonicalJsonValue) ||
      canonicalJsonStringify(input.review.request as unknown as CanonicalJsonValue) !== canonicalJsonStringify(finalized.request as unknown as CanonicalJsonValue) ||
      input.review.canonicalSourceGeneratedVersionEntry !== finalized.canonicalSourceGeneratedVersionEntry ||
      input.review.canonicalRequestBody !== JSON.stringify(finalized.request)
    ) {
      throw new GenerationError("review_fingerprint_mismatch");
    }

    assertReviewCanonicalIntegrity(input.review);
    throwIfAborted(input.signal);
    return deepFreeze(cloneJson(finalized.request));
  } catch (error) {
    throw toGenerationError(error);
  }
}

export async function finalizeRevisionTransportResponse(input: FinalizeRevisionTransportResponseInput): Promise<FinalizedRevisionPendingResultV1> {
  try {
    throwIfAborted(input.signal);
    validateFrozenComponentRevisionReviewV1(input.review);
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
      ? await buildPendingRevisionGeneratedVersionEntryV2({
          ...base,
          instruction: input.review.instruction ?? "",
          instructionFingerprint: input.review.instructionFingerprint ?? ""
        })
      : await buildPendingRegenerationGeneratedVersionEntryV2(base);
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
  throwIfAborted(input.signal);
  validateCaptureRecordV1(input.currentCaptureRecord);
  validateGeneratedComponentVersionEntry(input.sourceGeneratedVersionEntry);
  validateCurrentSavedAt(input.currentSavedAt);
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
  throwIfAborted(input.signal);
  const currentCaptureProjectionFingerprint = await computeCurrentCaptureProjectionFingerprint({ captureContext, requestedOutput });
  throwIfAborted(input.signal);
  const canonicalSourceGeneratedVersionEntry = canonicalJsonStringify(input.sourceGeneratedVersionEntry as unknown as CanonicalJsonValue);
  const mode = assertMode(input.mode);
  const instructionState = await prepareInstruction(mode, input.rawRevisionInstruction, input.signal);
  throwIfAborted(input.signal);
  const screenshot = input.screenshotIncluded
    ? await prepareIncludedScreenshot(input.screenshotAsset, input.signal)
    : { state: { included: false } as const, requestScreenshot: undefined };
  throwIfAborted(input.signal);
  const request = cloneJson(buildRevisionRequest({
    mode,
    sourceComponent,
    captureContext,
    requestedOutput,
    revisionInstruction: instructionState.instruction,
    screenshot: screenshot.requestScreenshot
  }));
  await validateComponentRevisionRequestV1(request);
  throwIfAborted(input.signal);

  return {
    mode,
    endpointCategory: input.endpointCategory ?? "backend-unconfigured",
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

async function prepareInstruction(mode: RevisionReviewMode, raw: unknown, signal: AbortSignal) {
  if (mode === "revision") {
    const instruction = normalizeRevisionInstruction(raw);
    const instructionFingerprint = await computeRevisionInstructionFingerprint(instruction);
    throwIfAborted(signal);
    return {
      instruction,
      instructionFingerprint
    };
  }
  if (raw !== undefined) {
    throw new GenerationError("request_validation_failed");
  }
  return {};
}

async function prepareIncludedScreenshot(asset: StoredScreenshotAsset | undefined, signal: AbortSignal) {
  if (!asset) {
    throw new GenerationError("screenshot_missing");
  }
  throwIfAborted(signal);
  const verified = await verifyScreenshotAsset(asset);
  throwIfAborted(signal);
  const dataUrl = await blobToPngDataUrl(verified.blob);
  throwIfAborted(signal);
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
      dataUrl
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

export function validateFrozenComponentRevisionReviewV1(review: unknown): asserts review is FrozenComponentRevisionReviewV1 {
  if (!isDeepFrozen(review)) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  const value = review as FrozenComponentRevisionReviewV1;
  const commonKeys = [
    "contractVersion",
    "mode",
    "sourceCaptureId",
    "sourceCaptureSavedAt",
    "sourceGeneratedVersionId",
    "sourceGeneratedVersionFingerprint",
    "currentCaptureProjectionFingerprint",
    "screenshotIncluded",
    "logicalAttemptId",
    "reviewAttemptFingerprint",
    "targetGeneratedVersionId",
    "endpointCategory",
    "sourceComponent",
    "captureContext",
    "requestedOutput",
    "screenshot",
    "request",
    "reviewAttemptFingerprintInput",
    "canonicalRequestBody",
    "canonicalSourceGeneratedVersionEntry"
  ];
  if (value.mode === "revision") {
    assertExactOwnKeys(value, [...commonKeys, "instruction", "instructionFingerprint"]);
  } else if (value.mode === "regeneration") {
    assertExactOwnKeys(value, commonKeys);
    if ("instruction" in value || "instructionFingerprint" in value) {
      throw new GenerationError("review_fingerprint_mismatch");
    }
  } else {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  if (
    value.contractVersion !== 1 ||
    !["backend-unconfigured", "deterministic-mock", "local-development-proxy"].includes(value.endpointCategory) ||
    !isValidCaptureId(value.sourceCaptureId) ||
    !isValidGeneratedComponentVersionId(value.sourceGeneratedVersionId) ||
    !isValidGeneratedComponentVersionId(value.targetGeneratedVersionId) ||
    !isValidLogicalAttemptId(value.logicalAttemptId) ||
    !isValidSha256Hex(value.sourceGeneratedVersionFingerprint) ||
    !isValidSha256Hex(value.currentCaptureProjectionFingerprint) ||
    !isValidSha256Hex(value.reviewAttemptFingerprint) ||
    !isCanonicalIsoTimestamp(value.sourceCaptureSavedAt) ||
    typeof value.screenshotIncluded !== "boolean" ||
    typeof value.canonicalRequestBody !== "string" ||
    typeof value.canonicalSourceGeneratedVersionEntry !== "string"
  ) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  if (value.mode === "revision") {
    if (
      normalizeRevisionInstruction(value.instruction) !== value.instruction ||
      !isValidSha256Hex(value.instructionFingerprint)
    ) {
      throw new GenerationError("review_fingerprint_mismatch");
    }
  }
  validateComponentRevisionRequestShapeV1({
    contractVersion: 1,
    mode: value.mode,
    ...(value.mode === "revision" ? { revisionInstruction: value.instruction } : {}),
    sourceComponent: value.sourceComponent,
    captureContext: value.captureContext,
    ...(value.request && "screenshot" in value.request ? { screenshot: value.request.screenshot } : {}),
    requestedOutput: value.requestedOutput
  });
  validateComponentRevisionRequestShapeV1(value.request);
  validateRequestWithoutDataUrl({
    contractVersion: 1,
    screenshot: { mediaType: "image/png", width: 1, height: 1, byteLength: 1 },
    captureContext: value.reviewAttemptFingerprintInput.captureContext,
    requestedOutput: value.reviewAttemptFingerprintInput.requestedOutput
  });
  validateReviewAttemptFingerprintInputShape(value.reviewAttemptFingerprintInput);
  validateScreenshotState(value.screenshot);
  assertReviewCanonicalIntegrity(value);
}

function validateCurrentSavedAt(value: unknown) {
  if (!isCanonicalIsoTimestamp(value)) {
    throw new GenerationError("capture_changed");
  }
}

function isCanonicalIsoTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function assertExactOwnKeys(value: object, expected: string[]) {
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new GenerationError("review_fingerprint_mismatch");
    }
  }
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
}

function assertReviewCanonicalIntegrity(review: FrozenComponentRevisionReviewV1) {
  if (!reviewRequestBodiesEqual(review, review.request)) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  validateComponentRevisionRequestShapeV1(review.request);
}

function validateReviewAttemptFingerprintInputShape(input: ReviewAttemptFingerprintInputV1) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  const keys = [
    "mode",
    "localSourceCaptureId",
    "localSourceGeneratedVersionId",
    "sourceGeneratedVersionFingerprint",
    "sourceComponent",
    "captureContext",
    ...(input.mode === "revision" ? ["revisionInstruction"] : []),
    "requestedOutput",
    "screenshot",
    "currentCaptureProjectionFingerprint",
    "logicalAttemptId"
  ];
  assertExactOwnKeys(input, keys);
  if (
    (input.mode !== "revision" && input.mode !== "regeneration") ||
    !isValidCaptureId(input.localSourceCaptureId) ||
    !isValidGeneratedComponentVersionId(input.localSourceGeneratedVersionId) ||
    !isValidSha256Hex(input.sourceGeneratedVersionFingerprint) ||
    !isValidSha256Hex(input.currentCaptureProjectionFingerprint) ||
    !isValidLogicalAttemptId(input.logicalAttemptId)
  ) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  if (input.mode === "revision") {
    if (normalizeRevisionInstruction(input.revisionInstruction) !== input.revisionInstruction) {
      throw new GenerationError("review_fingerprint_mismatch");
    }
  } else if ("revisionInstruction" in input) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  validateComponentRevisionRequestShapeV1({
    contractVersion: 1,
    mode: input.mode,
    ...(input.mode === "revision" ? { revisionInstruction: input.revisionInstruction } : {}),
    sourceComponent: input.sourceComponent,
    captureContext: input.captureContext,
    requestedOutput: input.requestedOutput
  });
  validateScreenshotState(input.screenshot);
}

function validateScreenshotState(value: ReviewAttemptScreenshotStateV1) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
  if (value.included === false) {
    assertExactOwnKeys(value, ["included"]);
    return;
  }
  assertExactOwnKeys(value, ["included", "mediaType", "width", "height", "byteLength", "digest"]);
  if (
    value.included !== true ||
    value.mediaType !== "image/png" ||
    !Number.isSafeInteger(value.width) ||
    !Number.isSafeInteger(value.height) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.width < 1 ||
    value.height < 1 ||
    value.byteLength < 1 ||
    !isValidSha256Hex(value.digest)
  ) {
    throw new GenerationError("review_fingerprint_mismatch");
  }
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
    for (const child of ownEnumerableValues(value)) {
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
  return ownEnumerableValues(value).every(isDeepFrozen);
}

function ownEnumerableValues(value: object): unknown[] {
  return Object.keys(value).map((key) => (value as { [key: string]: unknown })[key]);
}
