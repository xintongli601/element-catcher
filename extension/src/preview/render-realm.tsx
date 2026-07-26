import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  assertMatchesPreviewSession,
  assertPreviewSidePanelToRenderMessageV2,
  isPreviewMessageWithinLimit,
  type PreviewDisposeV2,
  type PreviewRenderFailureV2,
  type PreviewRenderInitV2,
  type PreviewRenderPlanV2,
  type PreviewRenderSuccessV2
} from "../shared/preview-protocol";
import { canonicalStringify, normalizeDiagnostics, sha256Hex, validatePreviewRenderPlan, type PreviewRenderNodeV1, type RenderFailureCategory } from "../shared/preview-policy";
import "./render-realm.css";
import "./preview-utilities.css";

type RenderLifecycle = "boot" | "ready" | "rendering" | "succeeded" | "failed" | "disposed";
type RenderSession = PreviewRenderInitV2 & {
  lifecycle: RenderLifecycle;
  renderPlansReceived: number;
  operationToken: number;
};

let activeSession: RenderSession | null = null;
let root: Root | null = null;
let nextOperationToken = 1;

window.addEventListener("message", (event) => {
  void handleMessage(event);
});

async function handleMessage(event: MessageEvent) {
  if (event.source !== window.parent || !isPreviewMessageWithinLimit(event.data)) {
    return;
  }

  try {
    assertPreviewSidePanelToRenderMessageV2(event.data);
    if (!activeSession) {
      if (event.data.type !== "preview.render.init.v2") return;
      activeSession = { ...event.data, lifecycle: "ready", renderPlansReceived: 0, operationToken: 0 };
      window.parent.postMessage(
        {
          contractVersion: 2,
          type: "preview.render.ready.v2",
          requestId: activeSession.requestId,
          sessionNonce: activeSession.sessionNonce
        },
        "*"
      );
      return;
    }

    assertMatchesPreviewSession(event.data, activeSession.requestId, activeSession.sessionNonce);
    if (event.data.type === "preview.dispose.v2") {
      dispose(event.data);
      return;
    }
    if (event.data.type !== "preview.render.plan.v2") return;
    await renderPlan(event.data);
  } catch (error) {
    postFailure("policy", error);
  }
}

async function renderPlan(message: PreviewRenderPlanV2) {
  if (!activeSession || activeSession.lifecycle !== "ready") {
    postFailure("lifecycle", new Error("Render realm is not ready for another plan."));
    return;
  }
  const session = activeSession;
  session.renderPlansReceived += 1;
  if (session.renderPlansReceived > 1) {
    postFailure("limit", new Error("Only one render plan is allowed per render session."));
    return;
  }
  session.lifecycle = "rendering";
  session.operationToken = nextOperationToken;
  nextOperationToken += 1;
  const operationToken = session.operationToken;
  try {
    const plan = validatePreviewRenderPlan(message.renderPlan);
    if (plan.sourceSha256 !== message.sourceSha256) throw new Error("Render source hash mismatch.");
    const expectedHash = await sha256Hex(canonicalStringify(plan));
    if (!isCurrentRenderingOperation(session, operationToken)) return;
    if (expectedHash !== message.planSha256) throw new Error("Render plan hash mismatch.");
    const container = document.getElementById("fixture-root");
    if (!container) throw new Error("Preview render root is missing.");
    root = createRoot(container);
    flushSync(() => {
      root?.render(renderNode(plan.root));
    });
    if (!isCurrentRenderingOperation(session, operationToken)) {
      root?.unmount();
      root = null;
      return;
    }
    session.lifecycle = "succeeded";
    const success: PreviewRenderSuccessV2 = {
      contractVersion: 2,
      type: "preview.render.success.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce
    };
    window.parent.postMessage(success, "*");
  } catch (error) {
    if (isCurrentRenderingOperation(session, operationToken)) {
      postFailure(errorCategory(error), error);
    }
  }
}

function renderNode(node: PreviewRenderNodeV1): React.ReactNode {
  if (node.kind === "text") return node.value;
  if (node.kind === "fragment") return <React.Fragment>{node.children.map((child, index) => <React.Fragment key={index}>{renderNode(child)}</React.Fragment>)}</React.Fragment>;
  return React.createElement(node.tag, node.props, ...node.children.map(renderNode));
}

function postFailure(category: RenderFailureCategory, error: unknown) {
  if (!activeSession || activeSession.lifecycle === "disposed" || activeSession.lifecycle === "failed" || activeSession.lifecycle === "succeeded") {
    return;
  }
  activeSession.lifecycle = "failed";
  const failure: PreviewRenderFailureV2 = {
    contractVersion: 2,
    type: "preview.render.failure.v2",
    requestId: activeSession.requestId,
    sessionNonce: activeSession.sessionNonce,
    category,
    diagnostics: normalizeDiagnostics(error)
  };
  window.parent.postMessage(failure, "*");
}

function dispose(message: PreviewDisposeV2) {
  if (!activeSession || message.requestId !== activeSession.requestId || message.sessionNonce !== activeSession.sessionNonce) {
    return;
  }
  activeSession.lifecycle = "disposed";
  activeSession.operationToken += 1;
  root?.unmount();
  root = null;
  activeSession = null;
}

function isCurrentRenderingOperation(session: RenderSession, operationToken: number) {
  return activeSession === session && session.lifecycle === "rendering" && session.operationToken === operationToken;
}

function errorCategory(error: unknown): RenderFailureCategory {
  const category = (error as { category?: unknown })?.category;
  if (category === "schema" || category === "policy" || category === "limit" || category === "lifecycle") {
    return category;
  }
  return "internal";
}
