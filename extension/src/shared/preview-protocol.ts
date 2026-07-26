import {
  DISPOSE_REASONS,
  PLAN_FAILURE_CATEGORIES,
  PREVIEW_LIMITS,
  PREVIEW_PROTOCOL_VERSION,
  RENDER_FAILURE_CATEGORIES,
  assertExactObjectKeys,
  assertPlainData,
  type DisposeReason,
  type PlanFailureCategory,
  type PreviewRenderPlanV1,
  type RenderFailureCategory
} from "./preview-policy";

const requestIdPattern = /^preview-[0-9a-f]{32}$/;
const sessionNoncePattern = /^[0-9a-f]{32}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const componentNamePattern = /^[A-Z][A-Za-z0-9]{0,63}$/;

export { PREVIEW_PROTOCOL_VERSION, PREVIEW_TIMEOUT_MS } from "./preview-policy";

export type PreviewHostInitV2 = {
  contractVersion: 2;
  type: "preview.host.init.v2";
  requestId: string;
  sessionNonce: string;
};

export type PreviewRenderInitV2 = {
  contractVersion: 2;
  type: "preview.render.init.v2";
  requestId: string;
  sessionNonce: string;
};

export type PreviewHostReadyV2 = {
  contractVersion: 2;
  type: "preview.host.ready.v2";
  requestId: string;
  sessionNonce: string;
};

export type PreviewRenderReadyV2 = {
  contractVersion: 2;
  type: "preview.render.ready.v2";
  requestId: string;
  sessionNonce: string;
};

export type PreviewSourceRequestV2 = {
  contractVersion: 2;
  type: "preview.source.request.v2";
  requestId: string;
  sessionNonce: string;
  expectedComponentName: string;
  source: string;
  sourceSha256: string;
};

export type PreviewPlanSuccessV2 = {
  contractVersion: 2;
  type: "preview.plan.success.v2";
  requestId: string;
  sessionNonce: string;
  sourceSha256: string;
  planSha256: string;
  renderPlan: PreviewRenderPlanV1;
};

export type PreviewPlanFailureV2 = {
  contractVersion: 2;
  type: "preview.plan.failure.v2";
  requestId: string;
  sessionNonce: string;
  category: PlanFailureCategory;
  diagnostics: string[];
};

export type PreviewRenderPlanV2 = {
  contractVersion: 2;
  type: "preview.render.plan.v2";
  requestId: string;
  sessionNonce: string;
  sourceSha256: string;
  planSha256: string;
  renderPlan: PreviewRenderPlanV1;
};

export type PreviewRenderSuccessV2 = {
  contractVersion: 2;
  type: "preview.render.success.v2";
  requestId: string;
  sessionNonce: string;
};

export type PreviewRenderFailureV2 = {
  contractVersion: 2;
  type: "preview.render.failure.v2";
  requestId: string;
  sessionNonce: string;
  category: RenderFailureCategory;
  diagnostics: string[];
};

export type PreviewDisposeV2 = {
  contractVersion: 2;
  type: "preview.dispose.v2";
  requestId: string;
  sessionNonce: string;
  reason: DisposeReason;
};

export type PreviewSidePanelToHostMessageV2 = PreviewHostInitV2 | PreviewSourceRequestV2 | PreviewDisposeV2;
export type PreviewHostToSidePanelMessageV2 = PreviewHostReadyV2 | PreviewPlanSuccessV2 | PreviewPlanFailureV2;
export type PreviewSidePanelToRenderMessageV2 = PreviewRenderInitV2 | PreviewRenderPlanV2 | PreviewDisposeV2;
export type PreviewRenderToSidePanelMessageV2 = PreviewRenderReadyV2 | PreviewRenderSuccessV2 | PreviewRenderFailureV2;

export const HOST_TO_TRUSTED_TYPES = ["preview.host.ready.v2", "preview.plan.success.v2", "preview.plan.failure.v2"] as const;
export const RENDER_TO_TRUSTED_TYPES = ["preview.render.ready.v2", "preview.render.success.v2", "preview.render.failure.v2"] as const;

export function createPreviewRequestId() {
  return `preview-${createHexToken()}`;
}

export function createPreviewSessionNonce() {
  return createHexToken();
}

export function isPreviewMessageWithinLimit(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= PREVIEW_LIMITS.messageBytes;
  } catch {
    return false;
  }
}

export function assertPreviewSidePanelToHostMessageV2(value: unknown): asserts value is PreviewSidePanelToHostMessageV2 {
  assertPlainData(value);
  const type = getType(value);
  if (type === "preview.host.init.v2") return assertEnvelope(value, ["contractVersion", "requestId", "sessionNonce", "type"]);
  if (type === "preview.source.request.v2") {
    assertEnvelope(value, ["contractVersion", "expectedComponentName", "requestId", "sessionNonce", "source", "sourceSha256", "type"]);
    const message = value as PreviewSourceRequestV2;
    if (!componentNamePattern.test(message.expectedComponentName) || typeof message.source !== "string" || !shaPattern.test(message.sourceSha256)) {
      throw new Error("invalid source request");
    }
    return;
  }
  if (type === "preview.dispose.v2") return assertDispose(value);
  throw new Error("invalid host-bound preview message");
}

export function assertPreviewSidePanelToRenderMessageV2(value: unknown): asserts value is PreviewSidePanelToRenderMessageV2 {
  assertPlainData(value);
  const type = getType(value);
  if (type === "preview.render.init.v2") return assertEnvelope(value, ["contractVersion", "requestId", "sessionNonce", "type"]);
  if (type === "preview.render.plan.v2") {
    assertEnvelope(value, ["contractVersion", "planSha256", "renderPlan", "requestId", "sessionNonce", "sourceSha256", "type"]);
    const message = value as PreviewRenderPlanV2;
    if (!shaPattern.test(message.sourceSha256) || !shaPattern.test(message.planSha256)) {
      throw new Error("invalid render plan identity");
    }
    return;
  }
  if (type === "preview.dispose.v2") return assertDispose(value);
  throw new Error("invalid render-bound preview message");
}

export function assertPreviewHostToSidePanelMessageV2(value: unknown): asserts value is PreviewHostToSidePanelMessageV2 {
  assertPlainData(value);
  const type = getType(value);
  if (type === "preview.host.ready.v2") return assertEnvelope(value, ["contractVersion", "requestId", "sessionNonce", "type"]);
  if (type === "preview.plan.success.v2") {
    assertEnvelope(value, ["contractVersion", "planSha256", "renderPlan", "requestId", "sessionNonce", "sourceSha256", "type"]);
    const message = value as PreviewPlanSuccessV2;
    if (!shaPattern.test(message.sourceSha256) || !shaPattern.test(message.planSha256)) {
      throw new Error("invalid plan success identity");
    }
    return;
  }
  if (type === "preview.plan.failure.v2") return assertFailure(value, PLAN_FAILURE_CATEGORIES);
  throw new Error("invalid host preview message");
}

export function assertPreviewRenderToSidePanelMessageV2(value: unknown): asserts value is PreviewRenderToSidePanelMessageV2 {
  assertPlainData(value);
  const type = getType(value);
  if (type === "preview.render.ready.v2" || type === "preview.render.success.v2") return assertEnvelope(value, ["contractVersion", "requestId", "sessionNonce", "type"]);
  if (type === "preview.render.failure.v2") return assertFailure(value, RENDER_FAILURE_CATEGORIES);
  throw new Error("invalid render preview message");
}

export function assertMatchesPreviewSession(message: { requestId: string; sessionNonce: string }, requestId: string, sessionNonce: string) {
  if (message.requestId !== requestId || message.sessionNonce !== sessionNonce) {
    throw new Error("stale preview session");
  }
}

function assertFailure(value: unknown, categories: readonly string[]) {
  assertEnvelope(value, ["category", "contractVersion", "diagnostics", "requestId", "sessionNonce", "type"]);
  const message = value as { category: unknown; diagnostics: unknown };
  if (!categories.includes(String(message.category)) || !Array.isArray(message.diagnostics) || message.diagnostics.length > PREVIEW_LIMITS.diagnostics) {
    throw new Error("invalid preview failure");
  }
  for (const diagnostic of message.diagnostics) {
    if (typeof diagnostic !== "string" || diagnostic.length > PREVIEW_LIMITS.diagnosticCodePoints) {
      throw new Error("invalid preview diagnostic");
    }
  }
}

function assertDispose(value: unknown) {
  assertEnvelope(value, ["contractVersion", "reason", "requestId", "sessionNonce", "type"]);
  if (!DISPOSE_REASONS.includes((value as { reason?: DisposeReason }).reason as DisposeReason)) {
    throw new Error("invalid dispose reason");
  }
}

function assertEnvelope(value: unknown, keys: readonly string[]) {
  assertExactObjectKeys(value, keys);
  const message = value as { contractVersion?: unknown; requestId?: unknown; sessionNonce?: unknown };
  if (message.contractVersion !== PREVIEW_PROTOCOL_VERSION || typeof message.requestId !== "string" || !requestIdPattern.test(message.requestId) || typeof message.sessionNonce !== "string" || !sessionNoncePattern.test(message.sessionNonce)) {
    throw new Error("invalid preview identity");
  }
}

function getType(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as { type?: unknown }).type : undefined;
}

function createHexToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
