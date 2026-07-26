import {
  assertMatchesPreviewSession,
  assertPreviewSidePanelToHostMessageV2,
  isPreviewMessageWithinLimit,
  type PreviewDisposeV2,
  type PreviewHostInitV2,
  type PreviewPlanFailureV2,
  type PreviewPlanSuccessV2,
  type PreviewSourceRequestV2
} from "../shared/preview-protocol";
import { canonicalStringify, normalizeDiagnostics, sha256Hex, validatePreviewRenderPlan, type PlanFailureCategory } from "../shared/preview-policy";
import { buildPreviewRenderPlanFromSource } from "./previewable-subset";
import "./host.css";

type HostLifecycle = "boot" | "ready" | "planning" | "succeeded" | "failed" | "disposed";
type HostSession = PreviewHostInitV2 & {
  parentWindow: WindowProxy;
  lifecycle: HostLifecycle;
  sourceRequestsReceived: number;
  operationToken: number;
};

let activeSession: HostSession | null = null;
let nextOperationToken = 1;

window.addEventListener("message", (event) => {
  void handleMessage(event);
});

async function handleMessage(event: MessageEvent) {
  if (event.source !== window.parent || !isPreviewMessageWithinLimit(event.data)) {
    return;
  }

  try {
    assertPreviewSidePanelToHostMessageV2(event.data);
    if (!activeSession) {
      if (event.data.type !== "preview.host.init.v2") return;
      startSession(event.data, event.source);
      return;
    }

    if (event.source !== activeSession.parentWindow) return;
    assertMatchesPreviewSession(event.data, activeSession.requestId, activeSession.sessionNonce);

    if (event.data.type === "preview.dispose.v2") {
      dispose(event.data);
      return;
    }

    if (event.data.type !== "preview.source.request.v2") return;
    await handleSourceRequest(event.data);
  } catch (error) {
    postPlanFailure("policy", error);
  }
}

function startSession(init: PreviewHostInitV2, parentWindow: WindowProxy) {
  activeSession = { ...init, parentWindow, lifecycle: "ready", sourceRequestsReceived: 0, operationToken: 0 };
  parentWindow.postMessage(
    {
      contractVersion: 2,
      type: "preview.host.ready.v2",
      requestId: init.requestId,
      sessionNonce: init.sessionNonce
    },
    "*"
  );
}

async function handleSourceRequest(message: PreviewSourceRequestV2) {
  if (!activeSession || activeSession.lifecycle !== "ready") {
    postPlanFailure("policy", new Error("Host is not ready for another source request."));
    return;
  }

  const session = activeSession;
  session.sourceRequestsReceived += 1;
  if (session.sourceRequestsReceived > 1) {
    postPlanFailure("limit", new Error("Only one preview source request is allowed per host session."));
    return;
  }

  session.lifecycle = "planning";
  session.operationToken = nextOperationToken;
  nextOperationToken += 1;
  const operationToken = session.operationToken;
  try {
    const candidatePlan = await buildPreviewRenderPlanFromSource({
      source: message.source,
      expectedComponentName: message.expectedComponentName,
      sourceSha256: message.sourceSha256
    });
    if (!isCurrentPlanningOperation(session, operationToken)) return;
    const renderPlan = validatePreviewRenderPlan(candidatePlan, message.expectedComponentName);
    const planSha256 = await sha256Hex(canonicalStringify(renderPlan));
    if (!isCurrentPlanningOperation(session, operationToken)) return;
    session.lifecycle = "succeeded";
    const success: PreviewPlanSuccessV2 = {
      contractVersion: 2,
      type: "preview.plan.success.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      sourceSha256: message.sourceSha256,
      planSha256,
      renderPlan
    };
    session.parentWindow.postMessage(success, "*");
  } catch (error) {
    if (isCurrentPlanningOperation(session, operationToken)) {
      postPlanFailure(errorCategory(error), error);
    }
  }
}

function postPlanFailure(category: PlanFailureCategory, error: unknown) {
  if (!activeSession || activeSession.lifecycle === "disposed" || activeSession.lifecycle === "failed" || activeSession.lifecycle === "succeeded") {
    return;
  }
  activeSession.lifecycle = "failed";
  const failure: PreviewPlanFailureV2 = {
    contractVersion: 2,
    type: "preview.plan.failure.v2",
    requestId: activeSession.requestId,
    sessionNonce: activeSession.sessionNonce,
    category,
    diagnostics: normalizeDiagnostics(error)
  };
  activeSession.parentWindow.postMessage(failure, "*");
}

function dispose(message: PreviewDisposeV2) {
  if (!activeSession || message.requestId !== activeSession.requestId || message.sessionNonce !== activeSession.sessionNonce) {
    return;
  }
  activeSession.lifecycle = "disposed";
  activeSession.operationToken += 1;
  activeSession = null;
}

function isCurrentPlanningOperation(session: HostSession, operationToken: number) {
  return activeSession === session && session.lifecycle === "planning" && session.operationToken === operationToken;
}

function errorCategory(error: unknown): PlanFailureCategory {
  const category = (error as { category?: unknown })?.category;
  if (category === "syntax" || category === "program-envelope" || category === "component-name" || category === "policy" || category === "limit") {
    return category;
  }
  return "internal";
}
