import {
  COMPONENT_NAME_PATTERN,
  GENERATION_CONTRACT_VERSION,
  GENERATION_LIMITS,
  type ComponentGenerationResponseV1,
  assertAllowedObjectKeys,
  assertExactObjectKeys,
  codePointLength
} from "./generation-contract";

export const GENERATED_COMPONENT_VERSION_STORE_NAME = "generatedComponentVersions";
export const GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME = "sourceCaptureId";

const CAPTURE_ID_PATTERN =
  /^capture-[0-9a-f]{32}$|^capture-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERATED_VERSION_ID_PATTERN =
  /^generated-version-[0-9a-f]{32}$|^generated-version-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA_256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export type GeneratedComponentVersionEntryV1 = {
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceReviewFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
};

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
  validateComponentGenerationResponse(entry.value);
  const serialized = JSON.stringify(value);
  for (const forbidden of ["dataUrl", "blob", "arrayBuffer", "screenshotStorageKey", "screenshotBlobDigest", "response_id", "resp_", "OPENAI_API_KEY", "sk-"]) {
    if (serialized.includes(forbidden)) {
      throw new Error("invalid generated version entry");
    }
  }
}

export function generatedComponentVersionEntriesEqual(left: GeneratedComponentVersionEntryV1, right: GeneratedComponentVersionEntryV1) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateComponentGenerationResponse(value: unknown): asserts value is ComponentGenerationResponseV1 {
  assertAllowedObjectKeys(value, ["contractVersion", "componentName", "framework", "styling", "code", "summary", "approximationNotes", "metadata"]);
  const response = value as Record<string, unknown>;
  if (
    response.contractVersion !== GENERATION_CONTRACT_VERSION ||
    response.framework !== "react" ||
    response.styling !== "tailwind" ||
    typeof response.componentName !== "string" ||
    !COMPONENT_NAME_PATTERN.test(response.componentName) ||
    codePointLength(response.componentName) > GENERATION_LIMITS.componentNameCodePoints ||
    typeof response.code !== "string" ||
    response.code.trim() === "" ||
    codePointLength(response.code) > GENERATION_LIMITS.codeCodePoints ||
    typeof response.summary !== "string" ||
    response.summary.trim() === "" ||
    codePointLength(response.summary) > GENERATION_LIMITS.summaryCodePoints ||
    typeof response.approximationNotes !== "string" ||
    codePointLength(response.approximationNotes) > GENERATION_LIMITS.approximationNotesCodePoints
  ) {
    throw new Error("invalid generated response");
  }
  if (response.metadata !== undefined) {
    assertAllowedObjectKeys(response.metadata, ["providerLabel", "providerModelLabel"]);
    for (const child of Object.values(response.metadata as Record<string, unknown>)) {
      if (typeof child !== "string" || codePointLength(child) > GENERATION_LIMITS.providerMetadataCodePoints) {
        throw new Error("invalid generated response metadata");
      }
    }
  }
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
