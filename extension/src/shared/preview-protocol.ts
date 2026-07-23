export const PREVIEW_PROTOCOL_VERSION = 1;
export const PREVIEW_MESSAGE_MAX_BYTES = 4096;
export const PREVIEW_TIMEOUT_MS = 3_000;

const REQUEST_ID_PATTERN = /^preview-[0-9a-f]{32}$/;
const SESSION_NONCE_PATTERN = /^[0-9a-f]{32}$/;
const FIXTURE_IDS = ["trusted-6b-fixture"] as const;

export type PreviewFixtureId = (typeof FIXTURE_IDS)[number];

export type PreviewHostInitV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.host.init";
  requestId: string;
  sessionNonce: string;
  fixtureId: PreviewFixtureId;
};

export type PreviewRenderInitV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.render.init";
  requestId: string;
  sessionNonce: string;
  fixtureId: PreviewFixtureId;
};

export type PreviewHostStartV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.host.start";
  requestId: string;
  sessionNonce: string;
};

export type PreviewHostReadyV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.host.ready";
  requestId: string;
  sessionNonce: string;
};

export type PreviewRenderReadyV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.render.ready";
  requestId: string;
  sessionNonce: string;
};

export type PreviewRenderRequestV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.render.request";
  requestId: string;
  sessionNonce: string;
  fixtureId: PreviewFixtureId;
};

export type PreviewRenderSuccessV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.render.success";
  requestId: string;
  sessionNonce: string;
  width: number;
  height: number;
  warnings: string[];
};

export type PreviewRenderFailureV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.render.failure";
  requestId: string;
  sessionNonce: string;
  category: "blocked_unsafe" | "runtime_failed" | "timed_out" | "disposed";
  message: string;
};

export type PreviewResizeV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.resize";
  requestId: string;
  sessionNonce: string;
  width: number;
  height: number;
};

export type PreviewHostSuccessV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.host.success";
  requestId: string;
  sessionNonce: string;
  width: number;
  height: number;
  warnings: string[];
};

export type PreviewHostFailureV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.host.failure";
  requestId: string;
  sessionNonce: string;
  category: PreviewRenderFailureV1["category"];
  message: string;
};

export type PreviewDisposeV1 = {
  contractVersion: typeof PREVIEW_PROTOCOL_VERSION;
  type: "preview.dispose";
  requestId: string;
  sessionNonce: string;
  reason: "back" | "close" | "version-switch" | "timeout" | "error";
};

export type PreviewSidePanelToHostMessageV1 = PreviewHostInitV1 | PreviewHostStartV1 | PreviewRenderSuccessV1 | PreviewRenderFailureV1 | PreviewResizeV1 | PreviewDisposeV1;
export type PreviewHostToSidePanelMessageV1 = PreviewHostReadyV1 | PreviewRenderRequestV1 | PreviewHostSuccessV1 | PreviewHostFailureV1;
export type PreviewSidePanelToRenderMessageV1 = PreviewRenderInitV1 | PreviewRenderRequestV1 | PreviewDisposeV1;
export type PreviewRenderToSidePanelMessageV1 = PreviewRenderReadyV1 | PreviewRenderSuccessV1 | PreviewRenderFailureV1 | PreviewResizeV1;

export function createPreviewRequestId() {
  return `preview-${createHexToken()}`;
}

export function createPreviewSessionNonce() {
  return createHexToken();
}

export function isPreviewSidePanelToHostMessageV1(value: unknown): value is PreviewSidePanelToHostMessageV1 {
  if (!isPlainObject(value)) {
    return false;
  }

  if (value.type === "preview.host.init") {
    return isPreviewHostInitV1(value);
  }

  if (value.type === "preview.host.start") {
    return isPreviewHostStartV1(value);
  }

  if (value.type === "preview.render.success") {
    return isPreviewRenderSuccessV1(value);
  }

  if (value.type === "preview.render.failure") {
    return isPreviewRenderFailureV1(value);
  }

  if (value.type === "preview.resize") {
    return isPreviewResizeV1(value);
  }

  return isPreviewDisposeV1(value);
}

export function isPreviewHostToSidePanelMessageV1(value: unknown): value is PreviewHostToSidePanelMessageV1 {
  if (!isPlainObject(value)) {
    return false;
  }

  if (value.type === "preview.host.ready") {
    return isPreviewHostReadyV1(value);
  }

  if (value.type === "preview.render.request") {
    return isPreviewRenderRequestV1(value);
  }

  if (value.type === "preview.host.success") {
    return isPreviewHostSuccessV1(value);
  }

  if (value.type === "preview.host.failure") {
    return isPreviewHostFailureV1(value);
  }

  return false;
}

export function isPreviewSidePanelToRenderMessageV1(value: unknown): value is PreviewSidePanelToRenderMessageV1 {
  if (!isPlainObject(value)) {
    return false;
  }

  if (value.type === "preview.render.init") {
    return isPreviewRenderInitV1(value);
  }

  if (value.type === "preview.render.request") {
    return isPreviewRenderRequestV1(value);
  }

  return isPreviewDisposeV1(value);
}

export function isPreviewRenderToSidePanelMessageV1(value: unknown): value is PreviewRenderToSidePanelMessageV1 {
  if (!isPlainObject(value)) {
    return false;
  }

  if (value.type === "preview.render.ready") {
    return isPreviewRenderReadyV1(value);
  }

  if (value.type === "preview.render.success") {
    return isPreviewRenderSuccessV1(value);
  }

  if (value.type === "preview.render.failure") {
    return isPreviewRenderFailureV1(value);
  }

  if (value.type === "preview.resize") {
    return isPreviewResizeV1(value);
  }

  return false;
}

export function isPreviewMessageWithinLimit(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= PREVIEW_MESSAGE_MAX_BYTES;
  } catch {
    return false;
  }
}

export function isTrustedPreviewFixtureId(value: unknown): value is PreviewFixtureId {
  return FIXTURE_IDS.includes(value as PreviewFixtureId);
}

function isPreviewHostInitV1(value: Record<string, unknown>): value is PreviewHostInitV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "fixtureId"]) && hasValidSession(value) && value.type === "preview.host.init" && isTrustedPreviewFixtureId(value.fixtureId);
}

function isPreviewRenderInitV1(value: Record<string, unknown>): value is PreviewRenderInitV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "fixtureId"]) && hasValidSession(value) && value.type === "preview.render.init" && isTrustedPreviewFixtureId(value.fixtureId);
}

function isPreviewHostStartV1(value: Record<string, unknown>): value is PreviewHostStartV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce"]) && hasValidSession(value) && value.type === "preview.host.start";
}

function isPreviewHostReadyV1(value: Record<string, unknown>): value is PreviewHostReadyV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce"]) && hasValidSession(value) && value.type === "preview.host.ready";
}

function isPreviewRenderReadyV1(value: Record<string, unknown>): value is PreviewRenderReadyV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce"]) && hasValidSession(value) && value.type === "preview.render.ready";
}

function isPreviewRenderRequestV1(value: Record<string, unknown>): value is PreviewRenderRequestV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "fixtureId"]) && hasValidSession(value) && value.type === "preview.render.request" && isTrustedPreviewFixtureId(value.fixtureId);
}

function isPreviewRenderSuccessV1(value: Record<string, unknown>): value is PreviewRenderSuccessV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "width", "height", "warnings"]) && hasValidSession(value) && value.type === "preview.render.success" && hasValidDimensionsAndWarnings(value);
}

function isPreviewRenderFailureV1(value: Record<string, unknown>): value is PreviewRenderFailureV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "category", "message"]) && hasValidSession(value) && value.type === "preview.render.failure" && isFailureCategory(value.category) && isBoundedMessage(value.message);
}

function isPreviewResizeV1(value: Record<string, unknown>): value is PreviewResizeV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "width", "height"]) && hasValidSession(value) && value.type === "preview.resize" && isBoundedDimension(value.width) && isBoundedDimension(value.height);
}

function isPreviewHostSuccessV1(value: Record<string, unknown>): value is PreviewHostSuccessV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "width", "height", "warnings"]) && hasValidSession(value) && value.type === "preview.host.success" && hasValidDimensionsAndWarnings(value);
}

function isPreviewHostFailureV1(value: Record<string, unknown>): value is PreviewHostFailureV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "category", "message"]) && hasValidSession(value) && value.type === "preview.host.failure" && isFailureCategory(value.category) && isBoundedMessage(value.message);
}

function isPreviewDisposeV1(value: Record<string, unknown>): value is PreviewDisposeV1 {
  return hasExactKeys(value, ["contractVersion", "type", "requestId", "sessionNonce", "reason"]) && hasValidSession(value) && value.type === "preview.dispose" && (value.reason === "back" || value.reason === "close" || value.reason === "version-switch" || value.reason === "timeout" || value.reason === "error");
}

function hasValidSession(value: Record<string, unknown>) {
  return value.contractVersion === PREVIEW_PROTOCOL_VERSION && typeof value.requestId === "string" && REQUEST_ID_PATTERN.test(value.requestId) && typeof value.sessionNonce === "string" && SESSION_NONCE_PATTERN.test(value.sessionNonce);
}

function hasValidDimensionsAndWarnings(value: Record<string, unknown>) {
  return isBoundedDimension(value.width) && isBoundedDimension(value.height) && Array.isArray(value.warnings) && value.warnings.length <= 8 && value.warnings.every((warning) => typeof warning === "string" && warning.length <= 240);
}

function isFailureCategory(value: unknown): value is PreviewRenderFailureV1["category"] {
  return value === "blocked_unsafe" || value === "runtime_failed" || value === "timed_out" || value === "disposed";
}

function isBoundedMessage(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 240;
}

function isBoundedDimension(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 4096;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.prototype.toString.call(value) === "[object Object]";
}

function createHexToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
