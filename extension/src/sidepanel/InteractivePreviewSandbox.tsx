import { useEffect, useMemo, useRef, useState } from "react";
import type { InteractionReconstructionEntryV1 } from "../shared/interactive-reconstruction-contract";
import {
  PREVIEW_PROTOCOL_VERSION,
  PREVIEW_TIMEOUT_MS,
  assertMatchesPreviewSession,
  assertPreviewRenderToSidePanelMessageV2,
  createPreviewRequestId,
  createPreviewSessionNonce,
  type PreviewDisposeV2,
  type PreviewRenderFailureV2,
  type PreviewRenderPlanV2
} from "../shared/preview-protocol";
import {
  canonicalStringify,
  normalizeDiagnostics,
  sha256Hex,
  validateInteractivePreviewPlanV1
} from "../shared/preview-policy";

type InteractivePreviewState =
  | { status: "loading"; message: string }
  | { status: "ready" }
  | { status: "failed"; message: string };

export function InteractivePreviewSandbox({
  entry,
  onClose
}: {
  entry: InteractionReconstructionEntryV1;
  onClose: () => void;
}) {
  const [state, setState] = useState<InteractivePreviewState>({ status: "loading", message: "Loading interactive preview" });
  const [frameMounted, setFrameMounted] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const session = useMemo(
    () => ({
      requestId: createPreviewRequestId(),
      sessionNonce: createPreviewSessionNonce(),
      renderUrl: chrome.runtime.getURL("src/preview/render-realm.html")
    }),
    [entry.id]
  );

  useEffect(() => {
    let disposed = false;
    setState({ status: "loading", message: "Loading interactive preview" });
    setFrameMounted(true);
    timeoutRef.current = window.setTimeout(() => {
      if (!disposed) {
        setState({ status: "failed", message: "Interactive preview timed out." });
        setFrameMounted(false);
      }
    }, PREVIEW_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      if (disposed || event.source !== frameRef.current?.contentWindow) {
        return;
      }
      void handleRenderMessage(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => {
      disposed = true;
      clearTimer();
      postDispose("close");
      window.removeEventListener("message", onMessage);
    };
  }, [entry.id, session.requestId, session.sessionNonce]);

  const postInit = () => {
    frameRef.current?.contentWindow?.postMessage(
      {
        contractVersion: PREVIEW_PROTOCOL_VERSION,
        type: "preview.render.init.v2",
        requestId: session.requestId,
        sessionNonce: session.sessionNonce
      },
      "*"
    );
  };

  const handleRenderMessage = async (rawMessage: unknown) => {
    try {
      assertPreviewRenderToSidePanelMessageV2(rawMessage);
      assertMatchesPreviewSession(rawMessage, session.requestId, session.sessionNonce);
      if (rawMessage.type === "preview.render.ready.v2") {
        await sendPlan();
        return;
      }
      if (rawMessage.type === "preview.render.success.v2") {
        clearTimer();
        setState({ status: "ready" });
        return;
      }
      if (rawMessage.type === "preview.render.failure.v2") {
        finishWithFailure(rawMessage);
      }
    } catch (error) {
      setState({ status: "failed", message: normalizeDiagnostics(error)[0] });
      setFrameMounted(false);
    }
  };

  const sendPlan = async () => {
    const cleanPlan = validateInteractivePreviewPlanV1(entry.interactivePreviewPlan, entry.value.componentName);
    const planSha256 = await sha256Hex(canonicalStringify(cleanPlan));
    const message: PreviewRenderPlanV2 = {
      contractVersion: PREVIEW_PROTOCOL_VERSION,
      type: "preview.render.plan.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      sourceSha256: cleanPlan.sourceSha256,
      planSha256,
      renderPlan: cleanPlan
    };
    frameRef.current?.contentWindow?.postMessage(message, "*");
  };

  const finishWithFailure = (message: PreviewRenderFailureV2) => {
    clearTimer();
    setState({ status: "failed", message: message.diagnostics[0] ?? "Interactive preview failed." });
    setFrameMounted(false);
  };

  const postDispose = (reason: PreviewDisposeV2["reason"]) => {
    frameRef.current?.contentWindow?.postMessage(
      {
        contractVersion: PREVIEW_PROTOCOL_VERSION,
        type: "preview.dispose.v2",
        requestId: session.requestId,
        sessionNonce: session.sessionNonce,
        reason
      },
      "*"
    );
  };

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  return (
    <section className="preview-sandbox-panel" aria-labelledby={`interactive-preview-heading-${entry.id}`}>
      <div className="preview-sandbox-header">
        <h4 id={`interactive-preview-heading-${entry.id}`}>Interactive Preview</h4>
        <p className={`preview-sandbox-status preview-sandbox-status-${state.status === "ready" ? "ready" : state.status === "loading" ? "loading" : "failed"}`}>
          {state.status === "ready" ? "Preview ready" : state.status === "loading" ? "Loading preview" : "Preview failed"}
        </p>
      </div>
      {frameMounted ? (
        <div className="preview-sandbox-frame-row">
          <iframe ref={frameRef} className="preview-sandbox-frame preview-sandbox-render-frame" title="Element Catcher interactive preview render realm" src={session.renderUrl} onLoad={postInit} />
        </div>
      ) : null}
      {state.status === "ready" ? (
        <p className="preview-sandbox-note" role="status">
          Preview ready. Interactions are rendered from a validated declarative plan; generated source is not executed inside Element Catcher.
        </p>
      ) : null}
      {state.status === "loading" ? <p className="save-state save-state-saving">{state.message}</p> : null}
      {state.status === "failed" ? (
        <div className="save-state save-state-failed" role="alert">
          <p>{state.message}</p>
          <button className="secondary-action compact-action" type="button" onClick={onClose}>
            Close preview
          </button>
        </div>
      ) : null}
    </section>
  );
}
