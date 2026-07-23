import {
  PREVIEW_TIMEOUT_MS,
  isPreviewMessageWithinLimit,
  isPreviewSidePanelToHostMessageV1,
  type PreviewDisposeV1,
  type PreviewHostFailureV1,
  type PreviewHostInitV1,
  type PreviewHostSuccessV1,
  type PreviewRenderFailureV1,
  type PreviewRenderRequestV1,
  type PreviewRenderSuccessV1
} from "../shared/preview-protocol";
import "./host.css";

type HostSession = PreviewHostInitV1 & {
  parentWindow: WindowProxy;
  started: boolean;
  pendingRender: boolean;
  terminal: boolean;
};

let activeSession: HostSession | null = null;
let timeoutId: number | null = null;
let disposed = false;

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !isPreviewMessageWithinLimit(event.data) || !isPreviewSidePanelToHostMessageV1(event.data)) {
    return;
  }

  if (!activeSession) {
    if (disposed || event.data.type !== "preview.host.init") {
      return;
    }

    startSession(event.data, event.source);
    return;
  }

  if (!matchesSession(event.data) || event.source !== activeSession.parentWindow || activeSession.terminal) {
    return;
  }

  if (event.data.type === "preview.dispose") {
    dispose(event.data);
    return;
  }

  if (event.data.type === "preview.host.start") {
    requestTrustedFixtureRender();
    return;
  }

  if ((event.data.type === "preview.render.success" || event.data.type === "preview.render.failure") && activeSession.pendingRender) {
    acceptRenderTerminal(event.data);
  }
});

function startSession(initMessage: PreviewHostInitV1, parentWindow: WindowProxy) {
  activeSession = {
    ...initMessage,
    parentWindow,
    started: false,
    pendingRender: false,
    terminal: false
  };
  disposed = false;
  parentWindow.postMessage(
    {
      contractVersion: 1,
      type: "preview.host.ready",
      requestId: initMessage.requestId,
      sessionNonce: initMessage.sessionNonce
    },
    "*"
  );
  timeoutId = window.setTimeout(() => {
    if (!activeSession || disposed || activeSession.terminal) {
      return;
    }

    postHostFailure({
      contractVersion: 1,
      type: "preview.render.failure",
      requestId: activeSession.requestId,
      sessionNonce: activeSession.sessionNonce,
      category: "timed_out",
      message: "Trusted preview fixture timed out."
    });
  }, PREVIEW_TIMEOUT_MS);
}

function requestTrustedFixtureRender() {
  if (!activeSession || disposed || activeSession.started) {
    return;
  }

  activeSession.started = true;
  activeSession.pendingRender = true;
  const request: PreviewRenderRequestV1 = {
    contractVersion: 1,
    type: "preview.render.request",
    requestId: activeSession.requestId,
    sessionNonce: activeSession.sessionNonce,
    fixtureId: activeSession.fixtureId
  };
  activeSession.parentWindow.postMessage(request, "*");
}

function acceptRenderTerminal(message: PreviewRenderSuccessV1 | PreviewRenderFailureV1) {
  if (!activeSession || disposed || activeSession.terminal) {
    return;
  }

  if (message.type === "preview.render.success") {
    clearPreviewTimeout();
    activeSession.terminal = true;
    activeSession.pendingRender = false;
    const success: PreviewHostSuccessV1 = {
      contractVersion: 1,
      type: "preview.host.success",
      requestId: message.requestId,
      sessionNonce: message.sessionNonce,
      width: message.width,
      height: message.height,
      warnings: message.warnings
    };
    activeSession.parentWindow.postMessage(success, "*");
    return;
  }

  postHostFailure(message);
}

function postHostFailure(message: PreviewRenderFailureV1) {
  if (!activeSession || disposed || activeSession.terminal) {
    return;
  }

  clearPreviewTimeout();
  activeSession.terminal = true;
  activeSession.pendingRender = false;
  const failure: PreviewHostFailureV1 = {
    contractVersion: 1,
    type: "preview.host.failure",
    requestId: message.requestId,
    sessionNonce: message.sessionNonce,
    category: message.category,
    message: message.message
  };
  activeSession.parentWindow.postMessage(failure, "*");
}

function dispose(message: PreviewDisposeV1) {
  if (!matchesSession(message)) {
    return;
  }

  disposed = true;
  clearPreviewTimeout();
  activeSession = null;
}

function clearPreviewTimeout() {
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function matchesSession(message: { requestId: string; sessionNonce: string }) {
  return activeSession?.requestId === message.requestId && activeSession.sessionNonce === message.sessionNonce;
}
