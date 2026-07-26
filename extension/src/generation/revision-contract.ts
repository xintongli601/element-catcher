import {
  COMPONENT_NAME_PATTERN,
  GENERATION_CONTRACT_VERSION,
  GENERATION_LIMITS,
  REQUESTED_OUTPUT,
  assertExactObjectKeys,
  getUtf8ByteLength,
  validateComponentGenerationResponseV1,
  type ComponentGenerationResponseV1,
  type ExactCaptureContextProjectionV1
} from "../shared/generation-contract";
import {
  isValidCaptureId,
  isValidGeneratedComponentVersionId,
  isValidLogicalAttemptId,
  isValidSha256Hex,
  validateGeneratedComponentVersionEntry,
  validateGeneratedComponentVersionEntryV2,
  type GeneratedComponentVersionEntry,
  type GeneratedComponentVersionEntryV2
} from "../shared/generated-version-contract";
import { normalizeRevisionInstruction } from "../shared/revision-instruction";
import { canonicalJsonStringify, type CanonicalJsonValue, sha256HexText } from "./canonical-json";
import { validateRequestWithoutDataUrl } from "./request-validation";
import { validatePngDataUrl } from "./screenshot";

export const COMPONENT_REVISION_INPUT_CONTRACT_VERSION = 1;
export const COMPONENT_REVISION_REQUEST_CONTRACT_VERSION = 1;

export type ComponentRevisionInputV1Revision = {
  contractVersion: 1;
  mode: "revision";
  sourceCaptureId: string;
  sourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  currentCaptureProjectionFingerprint: string;
  screenshotIncluded: boolean;
  logicalAttemptId: string;
  reviewAttemptFingerprint: string;
  instruction: string;
  instructionFingerprint: string;
};

export type ComponentRevisionInputV1Regeneration = {
  contractVersion: 1;
  mode: "regeneration";
  sourceCaptureId: string;
  sourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  currentCaptureProjectionFingerprint: string;
  screenshotIncluded: boolean;
  logicalAttemptId: string;
  reviewAttemptFingerprint: string;
};

export type ComponentRevisionInputV1 = ComponentRevisionInputV1Revision | ComponentRevisionInputV1Regeneration;

export type ComponentRevisionRequestSourceComponentV1 = {
  componentName: string;
  framework: "react";
  styling: "tailwind";
  code: string;
  summary: string;
  approximationNotes: string;
};

export type ComponentRevisionRequestScreenshotV1 = {
  mediaType: "image/png";
  width: number;
  height: number;
  byteLength: number;
  dataUrl: string;
};

export type ComponentRevisionRequestV1Revision = {
  contractVersion: 1;
  mode: "revision";
  revisionInstruction: string;
  sourceComponent: ComponentRevisionRequestSourceComponentV1;
  captureContext: ExactCaptureContextProjectionV1;
  screenshot?: ComponentRevisionRequestScreenshotV1;
  requestedOutput: typeof REQUESTED_OUTPUT;
};

export type ComponentRevisionRequestV1Regeneration = {
  contractVersion: 1;
  mode: "regeneration";
  sourceComponent: ComponentRevisionRequestSourceComponentV1;
  captureContext: ExactCaptureContextProjectionV1;
  screenshot?: ComponentRevisionRequestScreenshotV1;
  requestedOutput: typeof REQUESTED_OUTPUT;
};

export type ComponentRevisionRequestV1 = ComponentRevisionRequestV1Revision | ComponentRevisionRequestV1Regeneration;

export type ReviewAttemptScreenshotStateV1 =
  | { included: false }
  | {
      included: true;
      mediaType: "image/png";
      width: number;
      height: number;
      byteLength: number;
      digest: string;
    };

export type ReviewAttemptFingerprintInputV1 = {
  mode: "revision" | "regeneration";
  localSourceCaptureId: string;
  localSourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  sourceComponent: ComponentRevisionRequestSourceComponentV1;
  captureContext: ExactCaptureContextProjectionV1;
  revisionInstruction?: string;
  requestedOutput: typeof REQUESTED_OUTPUT;
  screenshot: ReviewAttemptScreenshotStateV1;
  currentCaptureProjectionFingerprint: string;
  logicalAttemptId: string;
};

export { normalizeRevisionInstruction } from "../shared/revision-instruction";

export function validateComponentRevisionInputV1(value: unknown): asserts value is ComponentRevisionInputV1 {
  assertRevisionInputBase(value);
  const input = value as Record<string, unknown>;
  if (input.mode === "revision") {
    assertExactObjectKeys(value, [
      "contractVersion",
      "mode",
      "sourceCaptureId",
      "sourceGeneratedVersionId",
      "sourceGeneratedVersionFingerprint",
      "currentCaptureProjectionFingerprint",
      "screenshotIncluded",
      "logicalAttemptId",
      "reviewAttemptFingerprint",
      "instruction",
      "instructionFingerprint"
    ]);
    if (
      typeof input.instruction !== "string" ||
      normalizeRevisionInstruction(input.instruction) !== input.instruction ||
      !isValidSha256Hex(input.instructionFingerprint)
    ) {
      throw new Error("invalid revision input");
    }
    return;
  }

  if (input.mode === "regeneration") {
    assertExactObjectKeys(value, [
      "contractVersion",
      "mode",
      "sourceCaptureId",
      "sourceGeneratedVersionId",
      "sourceGeneratedVersionFingerprint",
      "currentCaptureProjectionFingerprint",
      "screenshotIncluded",
      "logicalAttemptId",
      "reviewAttemptFingerprint"
    ]);
    return;
  }

  throw new Error("invalid revision input");
}

export async function validateCompleteComponentRevisionInputV1(value: unknown): Promise<ComponentRevisionInputV1> {
  validateComponentRevisionInputV1(value);
  if (value.mode === "revision") {
    const expected = await computeRevisionInstructionFingerprint(value.instruction);
    if (expected !== value.instructionFingerprint) {
      throw new Error("invalid revision input");
    }
  }
  return value;
}

export function validateComponentRevisionRequestShapeV1(value: unknown): asserts value is ComponentRevisionRequestV1 {
  assertRequestBase(value);
  const request = value as Record<string, unknown>;
  const hasScreenshot = Object.prototype.hasOwnProperty.call(request, "screenshot");
  const keys = [
    "contractVersion",
    "mode",
    ...(request.mode === "revision" ? ["revisionInstruction"] : []),
    "sourceComponent",
    "captureContext",
    ...(hasScreenshot ? ["screenshot"] : []),
    "requestedOutput"
  ];
  assertExactObjectKeys(value, keys);

  if (request.mode === "revision") {
    if (normalizeRevisionInstruction(request.revisionInstruction) !== request.revisionInstruction) {
      throw new Error("invalid revision request");
    }
  } else if (request.mode !== "regeneration") {
    throw new Error("invalid revision request");
  }

  validateSourceComponent(request.sourceComponent);
  if (hasScreenshot) {
    validateScreenshotShape(request.screenshot);
  }
  validateRequestWithoutDataUrl({
    contractVersion: GENERATION_CONTRACT_VERSION,
    screenshot: hasScreenshot ? screenshotMetadata(request.screenshot) : minimalScreenshotMetadata(),
    captureContext: request.captureContext,
    requestedOutput: request.requestedOutput
  });
}

export async function validateComponentRevisionRequestV1(value: unknown): Promise<ComponentRevisionRequestV1> {
  validateComponentRevisionRequestShapeV1(value);
  const request = value as ComponentRevisionRequestV1;
  assertSerializedRevisionRequestSize(request);
  if (Object.prototype.hasOwnProperty.call(request, "screenshot")) {
    const screenshot = request.screenshot;
    if (!screenshot) {
      throw new Error("invalid revision request");
    }
    await validatePngDataUrl(screenshot.dataUrl, screenshot);
  }
  return request;
}

export async function computeSourceGeneratedVersionFingerprint(entry: GeneratedComponentVersionEntry) {
  validateGeneratedComponentVersionEntry(entry);
  return sha256HexText(
    "ElementCatcher.SourceGeneratedVersionFingerprint.V1\n" +
      canonicalJsonStringify(entry as unknown as CanonicalJsonValue)
  );
}

export async function computeRevisionInstructionFingerprint(normalizedInstruction: string) {
  if (normalizeRevisionInstruction(normalizedInstruction) !== normalizedInstruction) {
    throw new Error("invalid revision instruction");
  }
  return sha256HexText("ElementCatcher.RevisionInstructionFingerprint.V1\n" + normalizedInstruction);
}

export async function computeCurrentCaptureProjectionFingerprint(input: {
  captureContext: ExactCaptureContextProjectionV1;
  requestedOutput: typeof REQUESTED_OUTPUT;
}) {
  validateRequestWithoutDataUrl({
    contractVersion: GENERATION_CONTRACT_VERSION,
    screenshot: {
      mediaType: "image/png",
      width: 1,
      height: 1,
      byteLength: 1
    },
    captureContext: input.captureContext,
    requestedOutput: input.requestedOutput
  });
  return sha256HexText(
    "ElementCatcher.CurrentCaptureProjectionFingerprint.V1\n" +
      canonicalJsonStringify({
        captureContext: input.captureContext,
        requestedOutput: input.requestedOutput
      } as CanonicalJsonValue)
  );
}

export async function computeReviewAttemptFingerprint(input: ReviewAttemptFingerprintInputV1) {
  validateReviewAttemptFingerprintInput(input);
  return sha256HexText(
    "ElementCatcher.RevisionReviewAttemptFingerprint.V1\n" +
      canonicalJsonStringify(input as unknown as CanonicalJsonValue)
  );
}

export function createLogicalAttemptId() {
  if (typeof crypto.randomUUID === "function") {
    const candidate = `revision-attempt-${crypto.randomUUID().replaceAll("-", "").slice(0, 32).toLowerCase()}`;
    if (isValidLogicalAttemptId(candidate)) {
      return candidate;
    }
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `revision-attempt-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function deriveRevisionGeneratedVersionId(logicalAttemptId: string) {
  if (!isValidLogicalAttemptId(logicalAttemptId)) {
    throw new Error("invalid logical attempt id");
  }
  const digest = await sha256HexText("ElementCatcher.RevisionGeneratedVersionId.V1\n" + logicalAttemptId);
  const id = `generated-version-${digest.slice(0, 32)}`;
  if (!isValidGeneratedComponentVersionId(id)) {
    throw new Error("invalid generated version id");
  }
  return id;
}

export async function buildPendingRevisionGeneratedVersionEntryV2(input: {
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
}): Promise<GeneratedComponentVersionEntryV2> {
  assertBuilderBase(input);
  const expectedInstructionFingerprint = await computeRevisionInstructionFingerprint(input.instruction);
  if (
    input.id !== await deriveRevisionGeneratedVersionId(input.logicalAttemptId) ||
    expectedInstructionFingerprint !== input.instructionFingerprint
  ) {
    throw new Error("invalid revision generated version entry");
  }

  const entry: GeneratedComponentVersionEntryV2 = {
    contractVersion: 2,
    id: input.id,
    sourceCaptureId: input.sourceCaptureId,
    sourceCaptureSavedAt: input.sourceCaptureSavedAt,
    sourceReviewFingerprint: input.currentCaptureProjectionFingerprint,
    createdAt: input.createdAt,
    value: cloneResponse(input.value),
    operation: {
      kind: "revision",
      logicalAttemptId: input.logicalAttemptId,
      reviewAttemptFingerprint: input.reviewAttemptFingerprint,
      sourceGeneratedVersionId: input.sourceGeneratedVersionId,
      sourceGeneratedVersionFingerprint: input.sourceGeneratedVersionFingerprint,
      instruction: input.instruction,
      instructionFingerprint: input.instructionFingerprint,
      screenshotIncluded: input.screenshotIncluded
    }
  };
  validateGeneratedComponentVersionEntryV2(entry);
  return deepFreeze(entry);
}

export async function buildPendingRegenerationGeneratedVersionEntryV2(input: {
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
  screenshotIncluded: boolean;
}): Promise<GeneratedComponentVersionEntryV2> {
  assertBuilderBase(input);
  if (input.id !== await deriveRevisionGeneratedVersionId(input.logicalAttemptId)) {
    throw new Error("invalid regeneration generated version entry");
  }

  const entry: GeneratedComponentVersionEntryV2 = {
    contractVersion: 2,
    id: input.id,
    sourceCaptureId: input.sourceCaptureId,
    sourceCaptureSavedAt: input.sourceCaptureSavedAt,
    sourceReviewFingerprint: input.currentCaptureProjectionFingerprint,
    createdAt: input.createdAt,
    value: cloneResponse(input.value),
    operation: {
      kind: "regeneration",
      logicalAttemptId: input.logicalAttemptId,
      reviewAttemptFingerprint: input.reviewAttemptFingerprint,
      sourceGeneratedVersionId: input.sourceGeneratedVersionId,
      sourceGeneratedVersionFingerprint: input.sourceGeneratedVersionFingerprint,
      screenshotIncluded: input.screenshotIncluded
    }
  };
  validateGeneratedComponentVersionEntryV2(entry);
  return deepFreeze(entry);
}

function assertRevisionInputBase(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid revision input");
  }
  const input = value as Record<string, unknown>;
  if (
    input.contractVersion !== COMPONENT_REVISION_INPUT_CONTRACT_VERSION ||
    !isValidCaptureId(input.sourceCaptureId) ||
    !isValidGeneratedComponentVersionId(input.sourceGeneratedVersionId) ||
    !isValidSha256Hex(input.sourceGeneratedVersionFingerprint) ||
    !isValidSha256Hex(input.currentCaptureProjectionFingerprint) ||
    typeof input.screenshotIncluded !== "boolean" ||
    !isValidLogicalAttemptId(input.logicalAttemptId) ||
    !isValidSha256Hex(input.reviewAttemptFingerprint)
  ) {
    throw new Error("invalid revision input");
  }
}

function assertRequestBase(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid revision request");
  }
  const request = value as Record<string, unknown>;
  if (request.contractVersion !== COMPONENT_REVISION_REQUEST_CONTRACT_VERSION) {
    throw new Error("invalid revision request");
  }
}

function validateSourceComponent(value: unknown): asserts value is ComponentRevisionRequestSourceComponentV1 {
  assertExactObjectKeys(value, ["componentName", "framework", "styling", "code", "summary", "approximationNotes"]);
  const sourceComponent = value as Record<string, unknown>;
  validateComponentGenerationResponseV1({
    contractVersion: GENERATION_CONTRACT_VERSION,
    componentName: sourceComponent.componentName,
    framework: sourceComponent.framework,
    styling: sourceComponent.styling,
    code: sourceComponent.code,
    summary: sourceComponent.summary,
    approximationNotes: sourceComponent.approximationNotes
  });
}

function validateScreenshotShape(value: unknown): asserts value is ComponentRevisionRequestScreenshotV1 {
  assertExactObjectKeys(value, ["mediaType", "width", "height", "byteLength", "dataUrl"]);
  const screenshot = value as Record<string, unknown>;
  validateRequestWithoutDataUrl({
    contractVersion: GENERATION_CONTRACT_VERSION,
    screenshot: {
      mediaType: screenshot.mediaType,
      width: screenshot.width,
      height: screenshot.height,
      byteLength: screenshot.byteLength
    },
    captureContext: minimalCaptureContext(),
    requestedOutput: REQUESTED_OUTPUT
  });
  if (typeof screenshot.dataUrl !== "string" || !screenshot.dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("invalid revision request");
  }
}

function screenshotMetadata(value: unknown) {
  const screenshot = value as Record<string, unknown>;
  return {
    mediaType: screenshot.mediaType,
    width: screenshot.width,
    height: screenshot.height,
    byteLength: screenshot.byteLength
  };
}

function minimalScreenshotMetadata() {
  return {
    mediaType: "image/png" as const,
    width: 1,
    height: 1,
    byteLength: 1
  };
}

function validateReviewAttemptFingerprintInput(input: ReviewAttemptFingerprintInputV1) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("invalid review attempt fingerprint input");
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
  assertExactObjectKeys(input, keys);
  if (!isValidLogicalAttemptId(input.logicalAttemptId)) {
    throw new Error("invalid review attempt fingerprint input");
  }
  if (
    !["revision", "regeneration"].includes(input.mode) ||
    !isValidCaptureId(input.localSourceCaptureId) ||
    !isValidGeneratedComponentVersionId(input.localSourceGeneratedVersionId) ||
    !isValidSha256Hex(input.sourceGeneratedVersionFingerprint) ||
    !isValidSha256Hex(input.currentCaptureProjectionFingerprint)
  ) {
    throw new Error("invalid review attempt fingerprint input");
  }
  validateSourceComponent(input.sourceComponent);
  validateRequestWithoutDataUrl({
    contractVersion: GENERATION_CONTRACT_VERSION,
    screenshot: {
      mediaType: "image/png",
      width: 1,
      height: 1,
      byteLength: 1
    },
    captureContext: input.captureContext,
    requestedOutput: input.requestedOutput
  });
  if (input.mode === "revision") {
    if (normalizeRevisionInstruction(input.revisionInstruction) !== input.revisionInstruction) {
      throw new Error("invalid review attempt fingerprint input");
    }
  } else if ("revisionInstruction" in input) {
    throw new Error("invalid review attempt fingerprint input");
  }
  validateScreenshotState(input.screenshot);
}

function validateScreenshotState(value: unknown): asserts value is ReviewAttemptScreenshotStateV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid screenshot state");
  }
  const screenshot = value as Record<string, unknown>;
  if (screenshot.included === false) {
    assertExactObjectKeys(value, ["included"]);
    return;
  }
  assertExactObjectKeys(value, ["included", "mediaType", "width", "height", "byteLength", "digest"]);
  if (
    screenshot.included !== true ||
    screenshot.mediaType !== "image/png" ||
    !Number.isSafeInteger(screenshot.width) ||
    !Number.isSafeInteger(screenshot.height) ||
    !Number.isSafeInteger(screenshot.byteLength) ||
    (screenshot.width as number) < 1 ||
    (screenshot.height as number) < 1 ||
    (screenshot.byteLength as number) < 1 ||
    (screenshot.width as number) > GENERATION_LIMITS.screenshotMaxDimension ||
    (screenshot.height as number) > GENERATION_LIMITS.screenshotMaxDimension ||
    (screenshot.byteLength as number) > GENERATION_LIMITS.screenshotBytes ||
    !isValidSha256Hex(screenshot.digest)
  ) {
    throw new Error("invalid screenshot state");
  }
}

function assertBuilderBase(input: {
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
  screenshotIncluded: boolean;
}) {
  validateComponentGenerationResponseV1(input.value);
  if (
    !isValidGeneratedComponentVersionId(input.id) ||
    !isValidCaptureId(input.sourceCaptureId) ||
    !isIsoTimestamp(input.sourceCaptureSavedAt) ||
    !isValidSha256Hex(input.currentCaptureProjectionFingerprint) ||
    !isIsoTimestamp(input.createdAt) ||
    !COMPONENT_NAME_PATTERN.test(input.expectedSourceComponentName) ||
    input.value.componentName !== input.expectedSourceComponentName ||
    !isValidLogicalAttemptId(input.logicalAttemptId) ||
    !isValidSha256Hex(input.reviewAttemptFingerprint) ||
    !isValidGeneratedComponentVersionId(input.sourceGeneratedVersionId) ||
    !isValidSha256Hex(input.sourceGeneratedVersionFingerprint) ||
    typeof input.screenshotIncluded !== "boolean"
  ) {
    throw new Error("invalid generated version entry");
  }
}

function assertSerializedRevisionRequestSize(request: ComponentRevisionRequestV1) {
  if (getUtf8ByteLength(JSON.stringify(request)) > GENERATION_LIMITS.serializedRequestBytes) {
    throw new Error("invalid revision request");
  }
}

function cloneResponse(value: ComponentGenerationResponseV1): ComponentGenerationResponseV1 {
  return {
    contractVersion: value.contractVersion,
    componentName: value.componentName,
    framework: value.framework,
    styling: value.styling,
    code: value.code,
    summary: value.summary,
    approximationNotes: value.approximationNotes,
    ...(value.metadata ? { metadata: { ...value.metadata } } : {})
  };
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

function isIsoTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function minimalCaptureContext(): ExactCaptureContextProjectionV1 {
  return {
    library: { tags: [] },
    element: { tagName: "div", rect: { width: 1, height: 1 } },
    dom: { sanitizedSnapshot: { tagName: "div", attributes: {}, children: [] }, childSummary: [] },
    styles: { computed: {} },
    summaries: { typography: {}, colors: {}, layout: {}, spacing: {} },
    pageTitlePolicy: { included: false, reason: "Excluded by default; future explicit opt-in required." },
    sourceUrlPolicy: { included: false, reason: "Excluded by default." }
  };
}
