import { validateComponentGenerationResponseV1, type ComponentGenerationResponseV1, type ExactCaptureContextProjectionV1 } from "./generation-contract";
import { INTERACTION_PAIR_TRIGGERS, type InteractionPairTrigger } from "./interaction-pair-contract";
import { validateInteractivePreviewPlanV1, type InteractivePreviewPlanV1 } from "./preview-policy";

export const INTERACTIVE_RECONSTRUCTION_CONTRACT_VERSION = 1;
export const INTERACTIVE_RECONSTRUCTION_STORE_NAME = "interactionReconstructions";

const RECONSTRUCTION_ID_PATTERN =
  /^interaction-reconstruction-[0-9a-f]{32}$|^interaction-reconstruction-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INTERACTION_PAIR_ID_PATTERN =
  /^interaction-[0-9a-f]{32}$|^interaction-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CAPTURE_ID_PATTERN = /^capture-[0-9a-f-]{36}$/;
const SHA_256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export type InteractionReconstructionSurfaceRole = "triggerBefore" | "primaryReaction" | "additionalReaction";

export type InteractionReconstructionSurfaceProjectionV1 = {
  role: InteractionReconstructionSurfaceRole;
  captureId: string;
  screenshot: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
    digest: string;
  };
  captureContext: ExactCaptureContextProjectionV1;
};

export type InteractionReconstructionRequestWithoutDataUrlsV1 = {
  contractVersion: 1;
  interaction: {
    pairId: string;
    trigger: InteractionPairTrigger;
    semantics: "bounded-visible-ui-only";
  };
  surfaces: [
    InteractionReconstructionSurfaceProjectionV1,
    InteractionReconstructionSurfaceProjectionV1,
    ...InteractionReconstructionSurfaceProjectionV1[]
  ];
  requestedOutput: {
    framework: "react";
    styling: "tailwind";
    behavior: "bounded-interactive";
    fields: ["componentName", "code", "summary", "approximationNotes", "interactivePreviewPlan"];
  };
  privacy: {
    excludesSourceUrl: true;
    excludesPageTitle: true;
    excludesCookies: true;
    excludesBrowserStorage: true;
    excludesCredentials: true;
    excludesSourceSession: true;
  };
};

export type InteractionReconstructionEntryV1 = {
  contractVersion: 1;
  id: string;
  sourceInteractionPairId: string;
  sourceInteractionPairFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
  interactivePreviewPlan: InteractivePreviewPlanV1;
};

export function createInteractionReconstructionId() {
  const randomId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackRandomId();
  return `interaction-reconstruction-${randomId}`;
}

export function createInteractionReconstructionTimestamp() {
  return new Date().toISOString();
}

export function validateInteractionReconstructionRequestWithoutDataUrlsV1(
  value: unknown
): asserts value is InteractionReconstructionRequestWithoutDataUrlsV1 {
  assertExactKeys(value, ["contractVersion", "interaction", "privacy", "requestedOutput", "surfaces"]);
  const request = value as InteractionReconstructionRequestWithoutDataUrlsV1;
  if (request.contractVersion !== INTERACTIVE_RECONSTRUCTION_CONTRACT_VERSION) {
    throw new Error("Interaction reconstruction request version is invalid.");
  }
  validateInteraction(request.interaction);
  validateRequestedOutput(request.requestedOutput);
  validatePrivacy(request.privacy);
  if (!Array.isArray(request.surfaces) || request.surfaces.length < 2 || request.surfaces.length > 6) {
    throw new Error("Interaction reconstruction surfaces are invalid.");
  }
  request.surfaces.forEach(validateSurface);
  if (request.surfaces[0].role !== "triggerBefore" || request.surfaces[1].role !== "primaryReaction") {
    throw new Error("Interaction reconstruction surfaces are out of order.");
  }
  for (const surface of request.surfaces.slice(2)) {
    if (surface.role !== "additionalReaction") {
      throw new Error("Additional reaction surface role is invalid.");
    }
  }
  const ids = request.surfaces.map((surface) => surface.captureId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Interaction reconstruction surfaces must be distinct.");
  }
}

export function validateInteractionReconstructionEntryV1(value: unknown): asserts value is InteractionReconstructionEntryV1 {
  assertExactKeys(value, [
    "contractVersion",
    "createdAt",
    "id",
    "interactivePreviewPlan",
    "sourceInteractionPairFingerprint",
    "sourceInteractionPairId",
    "value"
  ]);
  const entry = value as InteractionReconstructionEntryV1;
  const createdAt = typeof entry.createdAt === "string" ? new Date(entry.createdAt) : null;
  if (
    entry.contractVersion !== INTERACTIVE_RECONSTRUCTION_CONTRACT_VERSION ||
    typeof entry.id !== "string" ||
    !RECONSTRUCTION_ID_PATTERN.test(entry.id) ||
    typeof entry.sourceInteractionPairId !== "string" ||
    !INTERACTION_PAIR_ID_PATTERN.test(entry.sourceInteractionPairId) ||
    typeof entry.sourceInteractionPairFingerprint !== "string" ||
    !SHA_256_HEX_PATTERN.test(entry.sourceInteractionPairFingerprint) ||
    typeof entry.createdAt !== "string" ||
    !createdAt ||
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== entry.createdAt
  ) {
    throw new Error("Interaction reconstruction entry is invalid.");
  }
  validateComponentGenerationResponseV1(entry.value);
  validateInteractiveSourceEnvelope(entry.value.code);
  validateInteractivePreviewPlanV1(entry.interactivePreviewPlan);
}

function validateInteraction(value: unknown) {
  assertExactKeys(value, ["pairId", "semantics", "trigger"]);
  const interaction = value as { pairId?: unknown; semantics?: unknown; trigger?: unknown };
  if (
    typeof interaction.pairId !== "string" ||
    !INTERACTION_PAIR_ID_PATTERN.test(interaction.pairId) ||
    interaction.semantics !== "bounded-visible-ui-only" ||
    typeof interaction.trigger !== "string" ||
    !INTERACTION_PAIR_TRIGGERS.includes(interaction.trigger as never)
  ) {
    throw new Error("Interaction reconstruction interaction is invalid.");
  }
}

function validateRequestedOutput(value: unknown) {
  assertExactKeys(value, ["behavior", "fields", "framework", "styling"]);
  const output = value as InteractionReconstructionRequestWithoutDataUrlsV1["requestedOutput"];
  if (
    output.framework !== "react" ||
    output.styling !== "tailwind" ||
    output.behavior !== "bounded-interactive" ||
    JSON.stringify(output.fields) !== JSON.stringify(["componentName", "code", "summary", "approximationNotes", "interactivePreviewPlan"])
  ) {
    throw new Error("Interaction reconstruction requested output is invalid.");
  }
}

function validatePrivacy(value: unknown) {
  assertExactKeys(value, [
    "excludesBrowserStorage",
    "excludesCookies",
    "excludesCredentials",
    "excludesPageTitle",
    "excludesSourceSession",
    "excludesSourceUrl"
  ]);
  if (Object.values(value as Record<string, unknown>).some((flag) => flag !== true)) {
    throw new Error("Interaction reconstruction privacy policy is invalid.");
  }
}

function validateSurface(value: unknown) {
  assertExactKeys(value, ["captureContext", "captureId", "role", "screenshot"]);
  const surface = value as InteractionReconstructionSurfaceProjectionV1;
  if (!["triggerBefore", "primaryReaction", "additionalReaction"].includes(surface.role)) {
    throw new Error("Interaction reconstruction surface role is invalid.");
  }
  if (typeof surface.captureId !== "string" || !CAPTURE_ID_PATTERN.test(surface.captureId)) {
    throw new Error("Interaction reconstruction capture id is invalid.");
  }
  assertExactKeys(surface.screenshot, ["byteLength", "digest", "height", "mediaType", "width"]);
  if (
    surface.screenshot.mediaType !== "image/png" ||
    !Number.isSafeInteger(surface.screenshot.byteLength) ||
    surface.screenshot.byteLength <= 0 ||
    !Number.isFinite(surface.screenshot.width) ||
    surface.screenshot.width <= 0 ||
    !Number.isFinite(surface.screenshot.height) ||
    surface.screenshot.height <= 0 ||
    typeof surface.screenshot.digest !== "string" ||
    !SHA_256_HEX_PATTERN.test(surface.screenshot.digest)
  ) {
    throw new Error("Interaction reconstruction screenshot metadata is invalid.");
  }
  validateCaptureContextPrivacy(surface.captureContext);
}

function validateCaptureContextPrivacy(value: unknown) {
  assertExactKeys(value, ["dom", "element", "library", "pageTitlePolicy", "sourceUrlPolicy", "styles", "summaries"]);
  const context = value as ExactCaptureContextProjectionV1;
  assertExactKeys(context.pageTitlePolicy, ["included", "reason"]);
  assertExactKeys(context.sourceUrlPolicy, ["included", "reason"]);
  if (
    context.pageTitlePolicy.included !== false ||
    context.sourceUrlPolicy.included !== false ||
    hasForbiddenCaptureContextKey(value)
  ) {
    throw new Error("Interaction reconstruction capture context privacy policy is invalid.");
  }
}

function hasForbiddenCaptureContextKey(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasForbiddenCaptureContextKey);
  }
  return Object.entries(value).some(([key, nested]) => {
    if (key === "sourceUrl" || key === "pageTitle" || key === "cookies" || key === "browserStorage" || key === "credentials") {
      return true;
    }
    return hasForbiddenCaptureContextKey(nested);
  });
}

function validateInteractiveSourceEnvelope(source: string) {
  if (/\beval\s*\(/.test(source) || /\bnew\s+Function\b/.test(source) || /dangerouslySetInnerHTML/.test(source) || /<\s*script\b/i.test(source)) {
    throw new Error("Interaction reconstruction source envelope is unsafe.");
  }
}

function assertExactKeys(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected plain object.");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error("Unexpected object keys.");
  }
}

function fallbackRandomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
