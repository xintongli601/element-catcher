import { useEffect, useMemo, useRef, useState } from "react";
import {
  PREVIEW_TIMEOUT_MS,
  createPreviewRequestId,
  createPreviewSessionNonce,
  isPreviewHostToSidePanelMessageV1,
  isPreviewMessageWithinLimit,
  isPreviewRenderToSidePanelMessageV1,
  type PreviewDisposeV1,
  type PreviewFixtureId,
  type PreviewHostToSidePanelMessageV1,
  type PreviewRenderToSidePanelMessageV1
} from "../shared/preview-protocol";

type PreviewSandboxState =
  | { status: "loading" }
  | { status: "ready"; width: number; height: number; warnings: string[] }
  | { status: "failed"; message: string };

type LifecycleState = "loading" | "readying" | "rendering" | "terminal" | "disposed";

const PREVIEW_TIMEOUT_MESSAGE = "Trusted preview fixture timed out.";

export function PreviewSandbox({ fixtureId = "trusted-6b-fixture" }: { fixtureId?: PreviewFixtureId }) {
  const [state, setState] = useState<PreviewSandboxState>({ status: "loading" });
  const [framesMounted, setFramesMounted] = useState(true);
  const hostFrameRef = useRef<HTMLIFrameElement | null>(null);
  const renderFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lifecycleRef = useRef<LifecycleState>("loading");
  const hostReadyRef = useRef(false);
  const renderReadyRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const session = useMemo(
    () => ({
      requestId: createPreviewRequestId(),
      sessionNonce: createPreviewSessionNonce(),
      fixtureId
    }),
    [fixtureId]
  );
  const hostUrl = chrome.runtime.getURL("src/preview/host.html");
  const renderUrl = chrome.runtime.getURL("src/preview/render-realm.html");

  useEffect(() => {
    lifecycleRef.current = "readying";
    hostReadyRef.current = false;
    renderReadyRef.current = false;

    timeoutRef.current = window.setTimeout(() => {
      if (lifecycleRef.current === "disposed" || lifecycleRef.current === "terminal") {
        return;
      }

      dispose("timeout", true);
      setState({ status: "failed", message: PREVIEW_TIMEOUT_MESSAGE });
    }, PREVIEW_TIMEOUT_MS + 1_000);

    const handleMessage = (event: MessageEvent) => {
      if (lifecycleRef.current === "disposed" || !isPreviewMessageWithinLimit(event.data)) {
        return;
      }

      const hostWindow = hostFrameRef.current?.contentWindow;
      const renderWindow = renderFrameRef.current?.contentWindow;

      if (event.source === hostWindow) {
        handleHostMessage(event.data);
        return;
      }

      if (event.source === renderWindow) {
        handleRenderMessage(event.data);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      dispose("close", false);
      window.removeEventListener("message", handleMessage);
    };
  }, [session]);

  const postInitToHost = () => {
    if (lifecycleRef.current === "disposed") {
      return;
    }

    hostFrameRef.current?.contentWindow?.postMessage(
      {
        contractVersion: 1,
        type: "preview.host.init",
        requestId: session.requestId,
        sessionNonce: session.sessionNonce,
        fixtureId: session.fixtureId
      },
      "*"
    );
  };

  const postInitToRender = () => {
    if (lifecycleRef.current === "disposed") {
      return;
    }

    renderFrameRef.current?.contentWindow?.postMessage(
      {
        contractVersion: 1,
        type: "preview.render.init",
        requestId: session.requestId,
        sessionNonce: session.sessionNonce,
        fixtureId: session.fixtureId
      },
      "*"
    );
  };

  const maybeStartHost = () => {
    if (lifecycleRef.current !== "readying" || !hostReadyRef.current || !renderReadyRef.current) {
      return;
    }

    lifecycleRef.current = "rendering";
    hostFrameRef.current?.contentWindow?.postMessage(
      {
        contractVersion: 1,
        type: "preview.host.start",
        requestId: session.requestId,
        sessionNonce: session.sessionNonce
      },
      "*"
    );
  };

  const handleHostMessage = (message: unknown) => {
    if (!isPreviewHostToSidePanelMessageV1(message) || !matchesSession(message) || lifecycleRef.current === "terminal") {
      return;
    }

    if (message.type === "preview.host.ready") {
      if (lifecycleRef.current !== "readying") {
        return;
      }
      hostReadyRef.current = true;
      maybeStartHost();
      return;
    }

    if (message.type === "preview.render.request") {
      if (lifecycleRef.current !== "rendering" || message.fixtureId !== session.fixtureId) {
        return;
      }
      renderFrameRef.current?.contentWindow?.postMessage(
        {
          contractVersion: 1,
          type: "preview.render.request",
          requestId: message.requestId,
          sessionNonce: message.sessionNonce,
          fixtureId: message.fixtureId
        },
        "*"
      );
      return;
    }

    if (message.type === "preview.host.success") {
      finishWithReady(message);
      return;
    }

    if (message.type === "preview.host.failure") {
      finishWithFailure(message);
    }
  };

  const handleRenderMessage = (message: unknown) => {
    if (!isPreviewRenderToSidePanelMessageV1(message) || !matchesSession(message) || lifecycleRef.current === "terminal") {
      return;
    }

    if (message.type === "preview.render.ready") {
      if (lifecycleRef.current !== "readying") {
        return;
      }
      renderReadyRef.current = true;
      maybeStartHost();
      return;
    }

    if (message.type === "preview.render.success") {
      if (lifecycleRef.current !== "rendering") {
        return;
      }
      postCleanRenderSuccess(message);
      return;
    }

    if (message.type === "preview.render.failure") {
      if (lifecycleRef.current !== "rendering") {
        return;
      }
      postCleanRenderFailure(message);
    }
  };

  const postCleanRenderSuccess = (message: Extract<PreviewRenderToSidePanelMessageV1, { type: "preview.render.success" }>) => {
    hostFrameRef.current?.contentWindow?.postMessage(
      {
        contractVersion: 1,
        type: "preview.render.success",
        requestId: message.requestId,
        sessionNonce: message.sessionNonce,
        width: message.width,
        height: message.height,
        warnings: message.warnings.slice(0, 8)
      },
      "*"
    );
  };

  const postCleanRenderFailure = (message: Extract<PreviewRenderToSidePanelMessageV1, { type: "preview.render.failure" }>) => {
    hostFrameRef.current?.contentWindow?.postMessage(
      {
        contractVersion: 1,
        type: "preview.render.failure",
        requestId: message.requestId,
        sessionNonce: message.sessionNonce,
        category: message.category,
        message: message.message
      },
      "*"
    );
  };

  const finishWithReady = (message: Extract<PreviewHostToSidePanelMessageV1, { type: "preview.host.success" }>) => {
    if (lifecycleRef.current === "terminal" || lifecycleRef.current === "disposed") {
      return;
    }

    lifecycleRef.current = "terminal";
    clearPreviewTimeout();
    setState({
      status: "ready",
      width: message.width,
      height: message.height,
      warnings: message.warnings
    });
  };

  const finishWithFailure = (message: Extract<PreviewHostToSidePanelMessageV1, { type: "preview.host.failure" }>) => {
    if (lifecycleRef.current === "terminal" || lifecycleRef.current === "disposed") {
      return;
    }

    dispose(message.category === "timed_out" ? "timeout" : "error", true);
    setState({ status: "failed", message: message.message });
  };

  const dispose = (reason: PreviewDisposeV1["reason"], unmountFrames: boolean) => {
    if (lifecycleRef.current === "disposed") {
      return;
    }

    lifecycleRef.current = "disposed";
    clearPreviewTimeout();
    const disposeMessage: PreviewDisposeV1 = {
      contractVersion: 1,
      type: "preview.dispose",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      reason
    };
    hostFrameRef.current?.contentWindow?.postMessage(disposeMessage, "*");
    renderFrameRef.current?.contentWindow?.postMessage(disposeMessage, "*");
    hostReadyRef.current = false;
    renderReadyRef.current = false;
    if (unmountFrames) {
      setFramesMounted(false);
    }
  };

  const clearPreviewTimeout = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const matchesSession = (message: { requestId: string; sessionNonce: string }) => {
    return message.requestId === session.requestId && message.sessionNonce === session.sessionNonce;
  };

  return (
    <section
      className="preview-sandbox-panel"
      aria-labelledby="preview-sandbox-heading"
    >
      <div className="preview-sandbox-header">
        <h4 id="preview-sandbox-heading">Isolated preview</h4>
        <p className={`preview-sandbox-status preview-sandbox-status-${state.status}`}>
          {state.status === "ready" ? "Ready" : state.status === "failed" ? "Failed" : "Loading"}
        </p>
      </div>
      <p className="preview-sandbox-note">
        This isolated foundation renders a packaged trusted fixture only. Generated AI code is not previewed.
      </p>
      {framesMounted ? (
        <div className="preview-sandbox-frame-row">
          <iframe
            ref={hostFrameRef}
            className="preview-sandbox-frame preview-sandbox-host-frame"
            title="Element Catcher isolated preview host"
            src={hostUrl}
            onLoad={postInitToHost}
          />
          <iframe
            ref={renderFrameRef}
            className="preview-sandbox-frame preview-sandbox-render-frame"
            title="Element Catcher isolated trusted fixture render realm"
            src={renderUrl}
            onLoad={postInitToRender}
          />
        </div>
      ) : null}
      {state.status === "ready" ? (
        <p className="preview-sandbox-note" role="status">
          Trusted fixture rendered in an isolated sandbox realm ({state.width}x{state.height}).
        </p>
      ) : null}
      {state.status === "failed" ? (
        <p className="save-state save-state-failed" role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
