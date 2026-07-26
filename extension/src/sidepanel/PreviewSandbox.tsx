import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedComponentVersionEntryV1 } from "../shared/generated-version-contract";
import {
  PREVIEW_PROTOCOL_VERSION,
  PREVIEW_TIMEOUT_MS,
  assertMatchesPreviewSession,
  assertPreviewHostToSidePanelMessageV2,
  assertPreviewRenderToSidePanelMessageV2,
  createPreviewRequestId,
  createPreviewSessionNonce,
  isPreviewMessageWithinLimit,
  type PreviewDisposeV2,
  type PreviewPlanFailureV2,
  type PreviewPlanSuccessV2,
  type PreviewSourceRequestV2,
  type PreviewRenderFailureV2,
  type PreviewRenderPlanV2,
  type PreviewRenderSuccessV2
} from "../shared/preview-protocol";
import { assertSourceWithinLimit, canonicalStringify, normalizeDiagnostics, sha256Hex, validatePreviewRenderPlan, type PreviewRenderPlanV1 } from "../shared/preview-policy";

type PreviewSandboxState =
  | { status: "loading"; message: string }
  | { status: "ready"; warnings: string[] }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string }
  | { status: "timed-out"; message: string };

type LifecycleState = "boot" | "awaiting_ready" | "ready" | "planning" | "validating" | "rendering" | "succeeded" | "failed" | "timed_out" | "disposed";

type Session = {
  requestId: string;
  sessionNonce: string;
  sourceSha256: string;
  componentName: string;
  versionId: string;
  operationToken: number;
  hostWindow: WindowProxy | null;
  renderWindow: WindowProxy | null;
};

export function PreviewSandbox({ entry, onClose }: { entry: GeneratedComponentVersionEntryV1; onClose: () => void }) {
  const [state, setState] = useState<PreviewSandboxState>({ status: "loading", message: "Loading preview" });
  const [framesMounted, setFramesMounted] = useState(false);
  const hostFrameRef = useRef<HTMLIFrameElement | null>(null);
  const renderFrameRef = useRef<HTMLIFrameElement | null>(null);
  const framesMountedRef = useRef(false);
  const lifecycleRef = useRef<LifecycleState>("boot");
  const hostReadyRef = useRef(false);
  const renderReadyRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const activeSessionRef = useRef<Session | null>(null);
  const planSha256Ref = useRef<string | null>(null);
  const sourceSentToHostRef = useRef(false);
  const renderPlanSentRef = useRef(false);
  const operationCounterRef = useRef(1);
  const hostUrl = chrome.runtime.getURL("src/preview/host.html");
  const renderUrl = chrome.runtime.getURL("src/preview/render-realm.html");

  const sessionSeed = useMemo(() => ({ versionId: entry.id, code: entry.value.code, componentName: entry.value.componentName }), [entry.id, entry.value.code, entry.value.componentName]);

  useEffect(() => {
    let cancelled = false;
    lifecycleRef.current = "boot";
    hostReadyRef.current = false;
    renderReadyRef.current = false;
    planSha256Ref.current = null;
    sourceSentToHostRef.current = false;
    renderPlanSentRef.current = false;
    setFramesMountedState(false);
    setState({ status: "loading", message: "Loading preview" });

    void Promise.resolve()
      .then(() => {
        assertSourceWithinLimit(sessionSeed.code);
        return sha256Hex(sessionSeed.code);
      })
      .then((sourceSha256) => {
        if (cancelled) return;
        activeSessionRef.current = {
          requestId: createPreviewRequestId(),
          sessionNonce: createPreviewSessionNonce(),
          sourceSha256,
          componentName: sessionSeed.componentName,
          versionId: sessionSeed.versionId,
          operationToken: operationCounterRef.current,
          hostWindow: null,
          renderWindow: null
        };
        operationCounterRef.current += 1;
        lifecycleRef.current = "awaiting_ready";
        setFramesMountedState(true);
        startTimeout();
      })
      .catch((error) => {
        if (!cancelled) {
          lifecycleRef.current = "failed";
          setState({ status: "unavailable", message: normalizeDiagnostics(error)[0] });
        }
      });

    const handleMessage = (event: MessageEvent) => {
      const session = activeSessionRef.current;
      if (!session || lifecycleRef.current === "disposed") return;
      const hostWindow = session.hostWindow ?? hostFrameRef.current?.contentWindow;
      const renderWindow = session.renderWindow ?? renderFrameRef.current?.contentWindow;
      if (event.source === hostWindow) {
        if (!isPreviewMessageWithinLimit(event.data)) return;
        void handleHostMessage(event.data);
        return;
      }
      if (event.source === renderWindow) {
        if (!isPreviewMessageWithinLimit(event.data)) return;
        void handleRenderMessage(event.data);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      cancelled = true;
      dispose("close", false);
      window.removeEventListener("message", handleMessage);
    };
  }, [sessionSeed]);

  const postInitToHost = () => {
    const session = activeSessionRef.current;
    if (!session || lifecycleRef.current === "disposed") return;
    const hostWindow = hostFrameRef.current?.contentWindow;
    if (!hostWindow) return;
    session.hostWindow = hostWindow;
    hostWindow.postMessage(
      {
        contractVersion: PREVIEW_PROTOCOL_VERSION,
        type: "preview.host.init.v2",
        requestId: session.requestId,
        sessionNonce: session.sessionNonce
      },
      "*"
    );
  };

  const postInitToRender = () => {
    const session = activeSessionRef.current;
    if (!session || lifecycleRef.current === "disposed") return;
    const renderWindow = renderFrameRef.current?.contentWindow;
    if (!renderWindow) return;
    session.renderWindow = renderWindow;
    renderWindow.postMessage(
      {
        contractVersion: PREVIEW_PROTOCOL_VERSION,
        type: "preview.render.init.v2",
        requestId: session.requestId,
        sessionNonce: session.sessionNonce
      },
      "*"
    );
  };

  const maybeRequestPlan = () => {
    const session = activeSessionRef.current;
    if (!session || lifecycleRef.current !== "awaiting_ready" || !hostReadyRef.current || !renderReadyRef.current || sourceSentToHostRef.current) return;
    const sourceRequest: PreviewSourceRequestV2 = {
      contractVersion: PREVIEW_PROTOCOL_VERSION,
      type: "preview.source.request.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      expectedComponentName: session.componentName,
      source: sessionSeed.code,
      sourceSha256: session.sourceSha256
    };
    if (!isPreviewMessageWithinLimit(sourceRequest)) {
      finishWithFailure("Preview unavailable", new Error("Preview source request exceeds the message size limit."));
      return;
    }
    sourceSentToHostRef.current = true;
    lifecycleRef.current = "planning";
    setState({ status: "loading", message: "Loading preview" });
    session.hostWindow?.postMessage(sourceRequest, "*");
  };

  const handleHostMessage = async (rawMessage: unknown) => {
    const session = activeSessionRef.current;
    if (!session || lifecycleRef.current === "disposed") return;
    try {
      assertPreviewHostToSidePanelMessageV2(rawMessage);
    } catch {
      return;
    }
    try {
      if (!matchesSession(rawMessage, session)) return;
      if (rawMessage.type === "preview.host.ready.v2") {
        if (lifecycleRef.current !== "awaiting_ready") return;
        hostReadyRef.current = true;
        maybeRequestPlan();
        return;
      }
      if (rawMessage.type === "preview.plan.failure.v2") {
        if (lifecycleRef.current !== "planning") return;
        finishWithPlanFailure(rawMessage);
        return;
      }
      if (rawMessage.type === "preview.plan.success.v2") {
        if (lifecycleRef.current !== "planning") return;
        lifecycleRef.current = "validating";
        const cleanPlan = await validatePlanSuccess(rawMessage, session);
        await postRenderPlan(cleanPlan, rawMessage.planSha256, session);
      }
    } catch (error) {
      finishWithFailure("Preview failed", error);
    }
  };

  const handleRenderMessage = async (rawMessage: unknown) => {
    const session = activeSessionRef.current;
    if (!session || lifecycleRef.current === "disposed") return;
    try {
      assertPreviewRenderToSidePanelMessageV2(rawMessage);
    } catch {
      return;
    }
    try {
      if (!matchesSession(rawMessage, session)) return;
      if (rawMessage.type === "preview.render.ready.v2") {
        if (lifecycleRef.current !== "awaiting_ready") return;
        renderReadyRef.current = true;
        maybeRequestPlan();
        return;
      }
      if (rawMessage.type === "preview.render.success.v2") {
        if (lifecycleRef.current !== "rendering") return;
        finishWithRenderSuccess(rawMessage);
        return;
      }
      if (rawMessage.type === "preview.render.failure.v2") {
        if (lifecycleRef.current !== "rendering") return;
        finishWithRenderFailure(rawMessage);
      }
    } catch (error) {
      finishWithFailure("Preview failed", error);
    }
  };

  const validatePlanSuccess = async (message: PreviewPlanSuccessV2, session: Session): Promise<PreviewRenderPlanV1> => {
    if (message.sourceSha256 !== session.sourceSha256) throw new Error("Preview source hash mismatch.");
    const cleanPlan = validatePreviewRenderPlan(message.renderPlan, session.componentName);
    if (cleanPlan.sourceSha256 !== session.sourceSha256) throw new Error("Preview plan source hash mismatch.");
    const planSha256 = await sha256Hex(canonicalStringify(cleanPlan));
    assertCurrentTrustedOperation(session, "validating");
    if (planSha256 !== message.planSha256) throw new Error("Preview plan hash mismatch.");
    planSha256Ref.current = planSha256;
    return cleanPlan;
  };

  const postRenderPlan = async (cleanPlan: PreviewRenderPlanV1, planSha256: string, session: Session) => {
    assertCurrentTrustedOperation(session, "validating");
    if (renderPlanSentRef.current || !session.renderWindow) return;
    renderPlanSentRef.current = true;
    lifecycleRef.current = "rendering";
    const renderPlanMessage: PreviewRenderPlanV2 = {
      contractVersion: PREVIEW_PROTOCOL_VERSION,
      type: "preview.render.plan.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      sourceSha256: session.sourceSha256,
      planSha256,
      renderPlan: validatePreviewRenderPlan(cleanPlan, session.componentName)
    };
    session.renderWindow.postMessage(renderPlanMessage, "*");
  };

  const finishWithRenderSuccess = (_message: PreviewRenderSuccessV2) => {
    lifecycleRef.current = "succeeded";
    clearPreviewTimeout();
    setState({ status: "ready", warnings: [] });
  };

  const finishWithPlanFailure = (message: PreviewPlanFailureV2) => {
    finishWithFailure("Preview unavailable", new Error(message.diagnostics[0] ?? "Generated source is outside Previewable Subset V1."));
  };

  const finishWithRenderFailure = (message: PreviewRenderFailureV2) => {
    finishWithFailure("Preview failed", new Error(message.diagnostics[0] ?? "Preview render failed."));
  };

  const finishWithFailure = (label: "Preview unavailable" | "Preview failed", error: unknown) => {
    if (lifecycleRef.current === "disposed") return;
    lifecycleRef.current = "failed";
    clearPreviewTimeout();
    dispose("terminal-failure", true);
    setState({ status: label === "Preview unavailable" ? "unavailable" : "failed", message: normalizeDiagnostics(error)[0] });
  };

  const startTimeout = () => {
    clearPreviewTimeout();
    const boundSession = activeSessionRef.current;
    timeoutRef.current = window.setTimeout(() => {
      const current = activeSessionRef.current;
      if (!boundSession || !current || current.requestId !== boundSession.requestId || current.sessionNonce !== boundSession.sessionNonce || lifecycleRef.current === "succeeded" || lifecycleRef.current === "failed" || lifecycleRef.current === "disposed") {
        return;
      }
      lifecycleRef.current = "timed_out";
      dispose("timeout", true);
      setState({ status: "timed-out", message: "Preview timed out." });
    }, PREVIEW_TIMEOUT_MS);
  };

  const dispose = (reason: PreviewDisposeV2["reason"], unmountFrames: boolean) => {
    if (lifecycleRef.current === "disposed" && reason !== "timeout") return;
    const session = activeSessionRef.current;
    lifecycleRef.current = "disposed";
    clearPreviewTimeout();
    if (session) {
      const disposeMessage: PreviewDisposeV2 = {
        contractVersion: PREVIEW_PROTOCOL_VERSION,
        type: "preview.dispose.v2",
        requestId: session.requestId,
        sessionNonce: session.sessionNonce,
        reason
      };
      hostFrameRef.current?.contentWindow?.postMessage(disposeMessage, "*");
      renderFrameRef.current?.contentWindow?.postMessage(disposeMessage, "*");
    }
    activeSessionRef.current = null;
    hostReadyRef.current = false;
    renderReadyRef.current = false;
    if (unmountFrames) setFramesMountedState(false);
  };

  const setFramesMountedState = (value: boolean) => {
    framesMountedRef.current = value;
    setFramesMounted(value);
  };

  const assertCurrentTrustedOperation = (session: Session, lifecycle: LifecycleState) => {
    const current = activeSessionRef.current;
    if (
      current !== session ||
      current.operationToken !== session.operationToken ||
      lifecycleRef.current !== lifecycle ||
      !framesMountedRef.current ||
      hostFrameRef.current?.contentWindow !== session.hostWindow ||
      renderFrameRef.current?.contentWindow !== session.renderWindow
    ) {
      throw new Error("Preview session is no longer current.");
    }
  };

  const matchesSession = (message: { requestId: string; sessionNonce: string }, session: Session) => {
    try {
      assertMatchesPreviewSession(message, session.requestId, session.sessionNonce);
      return true;
    } catch {
      return false;
    }
  };

  const clearPreviewTimeout = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const statusText =
    state.status === "ready"
      ? "Preview ready"
      : state.status === "failed"
        ? "Preview failed"
        : state.status === "unavailable"
          ? "Preview unavailable"
          : state.status === "timed-out"
            ? "Preview timed out"
            : "Loading preview";

  return (
    <section className="preview-sandbox-panel" aria-labelledby={`preview-sandbox-heading-${entry.id}`}>
      <div className="preview-sandbox-header">
        <h4 id={`preview-sandbox-heading-${entry.id}`}>Preview</h4>
        <p className={`preview-sandbox-status preview-sandbox-status-${state.status === "ready" ? "ready" : state.status === "loading" ? "loading" : "failed"}`}>
          {statusText}
        </p>
      </div>
      {framesMounted ? (
        <div className="preview-sandbox-frame-row">
          <iframe ref={hostFrameRef} className="preview-sandbox-frame preview-sandbox-host-frame" title="Element Catcher preview host" src={hostUrl} onLoad={postInitToHost} />
          <iframe ref={renderFrameRef} className="preview-sandbox-frame preview-sandbox-render-frame" title="Element Catcher preview render realm" src={renderUrl} onLoad={postInitToRender} />
        </div>
      ) : null}
      {state.status === "ready" ? (
        <p className="preview-sandbox-note" role="status">
          Preview ready. Generated source stayed source-only; the render realm received a declarative plan.
        </p>
      ) : null}
      {state.status !== "ready" && state.status !== "loading" ? (
        <div className="save-state save-state-failed" role="alert">
          <p>{state.message}</p>
          <button className="secondary-action compact-action" type="button" onClick={onClose}>
            Close preview
          </button>
        </div>
      ) : null}
      {state.status === "loading" ? <p className="save-state save-state-saving">{state.message}</p> : null}
    </section>
  );
}
