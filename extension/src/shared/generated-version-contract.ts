import {
  type ComponentGenerationResponseV1,
  assertExactObjectKeys,
  validateComponentGenerationResponseV1
} from "./generation-contract";
import { normalizeRevisionInstruction } from "./revision-instruction";

export const GENERATED_COMPONENT_VERSION_STORE_NAME = "generatedComponentVersions";
export const GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME = "sourceCaptureId";

const CAPTURE_ID_PATTERN =
  /^capture-[0-9a-f]{32}$|^capture-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERATED_VERSION_ID_PATTERN =
  /^generated-version-[0-9a-f]{32}$|^generated-version-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA_256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const LOGICAL_ATTEMPT_ID_PATTERN = /^revision-attempt-[0-9a-f]{32}$/;

export type GeneratedComponentVersionEntryV1 = {
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceReviewFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
};

export type GeneratedComponentVersionEntryV2RevisionOperation = {
  kind: "revision";
  logicalAttemptId: string;
  reviewAttemptFingerprint: string;
  sourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  instruction: string;
  instructionFingerprint: string;
  screenshotIncluded: boolean;
};

export type GeneratedComponentVersionEntryV2RegenerationOperation = {
  kind: "regeneration";
  logicalAttemptId: string;
  reviewAttemptFingerprint: string;
  sourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  screenshotIncluded: boolean;
};

export type GeneratedComponentVersionEntryV2 = {
  contractVersion: 2;
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceReviewFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
  operation: GeneratedComponentVersionEntryV2RevisionOperation | GeneratedComponentVersionEntryV2RegenerationOperation;
};

export type GeneratedComponentVersionEntry = GeneratedComponentVersionEntryV1 | GeneratedComponentVersionEntryV2;

export function createGeneratedComponentVersionId() {
  const randomId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackRandomId();
  return `generated-version-${randomId}`;
}

export function createGeneratedComponentVersionTimestamp() {
  return new Date().toISOString();
}

export function validateGeneratedComponentVersionEntryV1(value: unknown): asserts value is GeneratedComponentVersionEntryV1 {
  assertExactObjectKeys(value, ["id", "sourceCaptureId", "sourceCaptureSavedAt", "sourceReviewFingerprint", "createdAt", "value"]);
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    !GENERATED_VERSION_ID_PATTERN.test(entry.id) ||
    typeof entry.sourceCaptureId !== "string" ||
    !CAPTURE_ID_PATTERN.test(entry.sourceCaptureId) ||
    !isNormalizedIsoTimestamp(entry.sourceCaptureSavedAt) ||
    typeof entry.sourceReviewFingerprint !== "string" ||
    !SHA_256_HEX_PATTERN.test(entry.sourceReviewFingerprint) ||
    !isNormalizedIsoTimestamp(entry.createdAt)
  ) {
    throw new Error("invalid generated version entry");
  }
  validateComponentGenerationResponseV1(entry.value);
}

export function validateGeneratedComponentVersionEntryV2(value: unknown): asserts value is GeneratedComponentVersionEntryV2 {
  assertExactObjectKeys(value, [
    "contractVersion",
    "id",
    "sourceCaptureId",
    "sourceCaptureSavedAt",
    "sourceReviewFingerprint",
    "createdAt",
    "value",
    "operation"
  ]);
  const entry = value as Record<string, unknown>;
  if (
    entry.contractVersion !== 2 ||
    !isValidGeneratedComponentVersionId(entry.id) ||
    !isValidCaptureId(entry.sourceCaptureId) ||
    !isNormalizedIsoTimestamp(entry.sourceCaptureSavedAt) ||
    !isValidSha256Hex(entry.sourceReviewFingerprint) ||
    !isNormalizedIsoTimestamp(entry.createdAt)
  ) {
    throw new Error("invalid generated version entry");
  }
  validateComponentGenerationResponseV1(entry.value);
  validateGeneratedComponentVersionEntryV2Operation(entry.operation);
}

export function validateGeneratedComponentVersionEntry(value: unknown): asserts value is GeneratedComponentVersionEntry {
  if (isPlainRecord(value) && value.contractVersion === 2) {
    validateGeneratedComponentVersionEntryV2(value);
    return;
  }
  validateGeneratedComponentVersionEntryV1(value);
}

export function isValidCaptureId(value: unknown): value is string {
  return typeof value === "string" && CAPTURE_ID_PATTERN.test(value);
}

export function isValidGeneratedComponentVersionId(value: unknown): value is string {
  return typeof value === "string" && GENERATED_VERSION_ID_PATTERN.test(value);
}

export function isValidSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA_256_HEX_PATTERN.test(value);
}

export function isValidLogicalAttemptId(value: unknown): value is string {
  return typeof value === "string" && LOGICAL_ATTEMPT_ID_PATTERN.test(value);
}

export function generatedComponentVersionEntriesEqual(left: GeneratedComponentVersionEntryV1, right: GeneratedComponentVersionEntryV1) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateGeneratedComponentVersionEntryV2Operation(value: unknown) {
  if (!isPlainRecord(value) || typeof value.kind !== "string") {
    throw new Error("invalid generated version entry");
  }

  if (value.kind === "revision") {
    assertExactObjectKeys(value, [
      "kind",
      "logicalAttemptId",
      "reviewAttemptFingerprint",
      "sourceGeneratedVersionId",
      "sourceGeneratedVersionFingerprint",
      "instruction",
      "instructionFingerprint",
      "screenshotIncluded"
    ]);
    const operation = value as Record<string, unknown>;
    if (
      !isValidLogicalAttemptId(operation.logicalAttemptId) ||
      !isValidSha256Hex(operation.reviewAttemptFingerprint) ||
      !isValidGeneratedComponentVersionId(operation.sourceGeneratedVersionId) ||
      !isValidSha256Hex(operation.sourceGeneratedVersionFingerprint) ||
      typeof operation.instruction !== "string" ||
      normalizeRevisionInstruction(operation.instruction) !== operation.instruction ||
      !isValidSha256Hex(operation.instructionFingerprint) ||
      typeof operation.screenshotIncluded !== "boolean"
    ) {
      throw new Error("invalid generated version entry");
    }
    return;
  }

  if (value.kind === "regeneration") {
    assertExactObjectKeys(value, [
      "kind",
      "logicalAttemptId",
      "reviewAttemptFingerprint",
      "sourceGeneratedVersionId",
      "sourceGeneratedVersionFingerprint",
      "screenshotIncluded"
    ]);
    const operation = value as Record<string, unknown>;
    if (
      !isValidLogicalAttemptId(operation.logicalAttemptId) ||
      !isValidSha256Hex(operation.reviewAttemptFingerprint) ||
      !isValidGeneratedComponentVersionId(operation.sourceGeneratedVersionId) ||
      !isValidSha256Hex(operation.sourceGeneratedVersionFingerprint) ||
      typeof operation.screenshotIncluded !== "boolean"
    ) {
      throw new Error("invalid generated version entry");
    }
    return;
  }

  throw new Error("invalid generated version entry");
}

function isNormalizedIsoTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function fallbackRandomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
