import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  isPreviewMessageWithinLimit,
  isPreviewSidePanelToRenderMessageV1,
  type PreviewDisposeV1,
  type PreviewRenderFailureV1,
  type PreviewRenderInitV1,
  type PreviewRenderRequestV1,
  type PreviewRenderSuccessV1
} from "../shared/preview-protocol";
import "./render-realm.css";

type RenderSession = PreviewRenderInitV1 & {
  rendered: boolean;
  disposed: boolean;
};

let activeSession: RenderSession | null = null;
let root: Root | null = null;

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !isPreviewMessageWithinLimit(event.data) || !isPreviewSidePanelToRenderMessageV1(event.data)) {
    return;
  }

  if (!activeSession) {
    if (event.data.type !== "preview.render.init") {
      return;
    }

    activeSession = { ...event.data, rendered: false, disposed: false };
    window.parent.postMessage(
      {
        contractVersion: 1,
        type: "preview.render.ready",
        requestId: activeSession.requestId,
        sessionNonce: activeSession.sessionNonce
      },
      "*"
    );
    return;
  }

  if (!matchesSession(event.data) || activeSession.disposed) {
    return;
  }

  if (event.data.type === "preview.dispose") {
    dispose(event.data);
    return;
  }

  if (event.data.type !== "preview.render.request" || activeSession.rendered) {
    return;
  }

  activeSession.rendered = true;
  try {
    renderTrustedFixture(event.data);
  } catch (error) {
    postFailure(event.data, error);
  }
});

function renderTrustedFixture(request: PreviewRenderRequestV1) {
  if (request.fixtureId !== "trusted-6b-fixture") {
    throw new Error("Unknown trusted preview fixture.");
  }

  const container = document.getElementById("fixture-root");
  if (!container) {
    throw new Error("Trusted preview root is missing.");
  }

  root = createRoot(container);
  flushSync(() => {
    root?.render(<TrustedPreviewFixture />);
  });

  const rect = container.getBoundingClientRect();
  const success: PreviewRenderSuccessV1 = {
    contractVersion: 1,
    type: "preview.render.success",
    requestId: request.requestId,
    sessionNonce: request.sessionNonce,
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
    warnings: []
  };
  window.parent.postMessage(success, "*");
}

function TrustedPreviewFixture() {
  return (
    <article className="fixture-card" data-fixture="trusted-6b-fixture" data-renderer="react-create-root">
      <p className="fixture-eyebrow">Trusted packaged fixture</p>
      <h1>Preview sandbox boundary</h1>
      <p>This preview is rendered from packaged React fixture code only.</p>
    </article>
  );
}

function dispose(message: PreviewDisposeV1) {
  if (!matchesSession(message) || !activeSession) {
    return;
  }

  activeSession.disposed = true;
  root?.unmount();
  root = null;
  activeSession = null;
}

function postFailure(request: PreviewRenderRequestV1, error: unknown) {
  const failure: PreviewRenderFailureV1 = {
    contractVersion: 1,
    type: "preview.render.failure",
    requestId: request.requestId,
    sessionNonce: request.sessionNonce,
    category: "runtime_failed",
    message: error instanceof Error ? error.message : "Trusted preview fixture failed."
  };
  window.parent.postMessage(failure, "*");
}

function matchesSession(message: { requestId: string; sessionNonce: string }) {
  return activeSession?.requestId === message.requestId && activeSession.sessionNonce === message.sessionNonce;
}
