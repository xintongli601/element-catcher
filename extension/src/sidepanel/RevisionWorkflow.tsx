import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { canonicalJsonStringify, type CanonicalJsonValue } from "../generation/canonical-json";
import { GenerationError, getSafeGenerationMessage, toGenerationError, type GenerationErrorCode } from "../generation/errors";
import {
  finalizeRevisionTransportResponse,
  prepareComponentRevisionReview,
  revalidateComponentRevisionReview,
  type FinalizedRevisionPendingResultV1,
  type FrozenComponentRevisionReviewV1,
  type RevisionReviewMode
} from "../generation/revision-review";
import { createHttpRevisionTransport } from "../generation/revision-transport";
import { normalizeRevisionInstruction } from "../generation/revision-contract";
import { getSafePersistenceMessage, PersistenceError, toPersistenceError, type PersistenceErrorCode } from "../storage/persistence-errors";
import { loadSavedCaptureById, type SavedCaptureReadModel } from "../storage/capture-save";
import {
  getGeneratedComponentVersionUnionById,
  persistPendingGeneratedComponentVersionV2,
  recoverGeneratedComponentVersionV2
} from "../storage/indexed-db";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract";

declare global {
  interface Window {
    __EC_REVISION_WORKFLOW_TEST_LOOPBACK__?: true;
  }
}

const LOOPBACK_ORIGIN = "http://127.0.0.1:8787";
const REVISION_ENDPOINT_PATH = "/v1/revise-component";
const MAX_REVISION_INSTRUCTION_CODE_POINTS = 1000;
const CONSENT_TEXT = "I understand this displayed data will leave my device and may use paid AI capacity.";

type TransportConfig =
  | { endpointCategory: "backend-unconfigured"; endpoint?: undefined }
  | { endpointCategory: "local-development-proxy"; endpoint: string };

type WorkflowBase = {
  token: number;
  sourceCaptureId: string;
  sourceGeneratedVersionId: string;
  mode: RevisionReviewMode;
  draftInstruction: string;
  includeScreenshot: boolean;
};

type ReviewBound = {
  review: FrozenComponentRevisionReviewV1;
};

type PendingBound = ReviewBound & {
  pending: FinalizedRevisionPendingResultV1;
};

type FailureKind =
  | "transport-failed"
  | "invalid-response-failed"
  | "persistence-failed"
  | "retry-unavailable";

type RevisionWorkflowState =
  | { status: "idle" }
  | (WorkflowBase & { status: "editing" })
  | (WorkflowBase & { status: "invalid"; message: string })
  | (WorkflowBase & { status: "preparing-review" | "recovering" | "submitting" | "finalizing" | "saving"; review?: FrozenComponentRevisionReviewV1; pending?: FinalizedRevisionPendingResultV1 })
  | (WorkflowBase & ReviewBound & { status: "review"; consent: boolean })
  | (WorkflowBase & { status: "cancelled"; message: string })
  | (WorkflowBase & { status: "success"; savedEntry: GeneratedComponentVersionEntry; message: string })
  | (WorkflowBase & Partial<PendingBound> & { status: FailureKind; message: string; retryTransport: boolean; retryPersistence: boolean });

type OperationOwner = {
  token: number;
  sourceCaptureId: string;
  sourceGeneratedVersionId: string;
  mode: RevisionReviewMode;
  controller: AbortController;
  logicalAttemptId?: string;
  reviewAttemptFingerprint?: string;
  targetGeneratedVersionId?: string;
};

export function RevisionWorkflow({
  savedCapture,
  sourceEntry,
  onSaved,
  onCancelSelection
}: {
  savedCapture: SavedCaptureReadModel;
  sourceEntry: GeneratedComponentVersionEntry;
  onSaved: (entryId: string) => void;
  onCancelSelection: () => void;
}) {
  const workflowTokenRef = useRef(0);
  const ownerRef = useRef<OperationOwner | null>(null);
  const deliveredTargetsRef = useRef(new Set<string>());
  const successHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const alertRef = useRef<HTMLParagraphElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const instructionId = useId();
  const consentId = useId();
  const [state, setState] = useState<RevisionWorkflowState>({ status: "idle" });

  useEffect(() => {
    retireActiveOperation();
    workflowTokenRef.current += 1;
    setState({ status: "idle" });
    return () => {
      retireActiveOperation();
      workflowTokenRef.current += 1;
    };
  }, [savedCapture.record.id, sourceEntry.id]);

  useEffect(() => {
    if (state.status === "success") {
      successHeadingRef.current?.focus();
    }
    if (state.status === "invalid") {
      textareaRef.current?.focus();
    }
    if (state.status.endsWith("failed") || state.status === "retry-unavailable") {
      alertRef.current?.focus();
    }
  }, [state.status]);

  const startWorkflow = (mode: RevisionReviewMode) => {
    retireActiveOperation();
    workflowTokenRef.current += 1;
    setState({
      status: "editing",
      token: workflowTokenRef.current,
      sourceCaptureId: savedCapture.record.id,
      sourceGeneratedVersionId: sourceEntry.id,
      mode,
      draftInstruction: "",
      includeScreenshot: false
    });
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const cancelWorkflow = () => {
    const current = state;
    const base = stateBase(current, savedCapture.record.id, sourceEntry.id);
    retireActiveOperation();
    workflowTokenRef.current += 1;
    setState({
      ...base,
      token: workflowTokenRef.current,
      status: "cancelled",
      message: `${modeLabel(base.mode)} cancelled.`
    });
  };

  const closeWorkflow = () => {
    retireActiveOperation();
    workflowTokenRef.current += 1;
    onCancelSelection();
  };

  const reviewAgain = () => {
    const base = stateBase(state, savedCapture.record.id, sourceEntry.id);
    retireActiveOperation();
    workflowTokenRef.current += 1;
    setState({
      ...base,
      token: workflowTokenRef.current,
      status: "editing"
    });
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const prepareReview = async (candidate: Extract<RevisionWorkflowState, { status: "editing" | "invalid" }>) => {
    const normalized = validateDraft(candidate);
    if (!normalized.ok) {
      setState({ ...candidate, status: "invalid", message: normalized.message });
      window.setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }

    const owner = acquireOwner(candidate);
    setState({ ...candidate, token: owner.token, status: "preparing-review", draftInstruction: normalized.rawDraft });

    try {
      const latestCapture = await loadSavedCaptureById(savedCapture.record.id);
      if (!owns(owner)) {
        return;
      }
      const latestSource = await getGeneratedComponentVersionUnionById(sourceEntry.id);
      if (!owns(owner)) {
        return;
      }
      if (!latestSource || latestSource.sourceCaptureId !== latestCapture.record.id) {
        throw new GenerationError("capture_changed");
      }
      const config = resolveRevisionTransportConfig();
      const review = await prepareComponentRevisionReview({
        currentCaptureRecord: latestCapture.record,
        currentSavedAt: latestCapture.savedAt,
        screenshotAsset: latestCapture.asset,
        sourceGeneratedVersionEntry: latestSource,
        mode: candidate.mode,
        rawRevisionInstruction: candidate.mode === "revision" ? normalized.instruction : undefined,
        screenshotIncluded: candidate.includeScreenshot,
        endpointCategory: config.endpointCategory,
        signal: owner.controller.signal
      });
      if (!owns(owner)) {
        return;
      }
      bindReviewOwner(owner, review);
      if (!owns(owner, review)) {
        return;
      }
      clearOwner(owner);
      setState({
        ...candidate,
        token: owner.token,
        status: "review",
        draftInstruction: normalized.rawDraft,
        review,
        consent: false
      });
    } catch (error) {
      if (!owns(owner)) {
        return;
      }
      clearOwner(owner);
      setState({
        ...candidate,
        token: owner.token,
        status: "retry-unavailable",
        message: getSafeGenerationMessage(error),
        retryTransport: false,
        retryPersistence: false
      });
    }
  };

  const sendReview = async (candidate: Extract<RevisionWorkflowState, { status: "review" }> | Extract<RevisionWorkflowState, { status: FailureKind }>) => {
    if (!candidate.review || (candidate.status === "review" && !candidate.consent)) {
      return;
    }
    if (ownerRef.current) {
      return;
    }
    const review = candidate.review;
    const owner = acquireOwner(candidate, review);
    setState({ ...candidate, token: owner.token, status: "recovering", review });

    try {
      const recovered = await recoverIfCommitted(review);
      if (!owns(owner, review)) {
        return;
      }
      if (recovered) {
        deliverSuccess(owner, candidate, recovered, `Recovered saved ${modeNoun(review.mode)} result.`);
        return;
      }
      const config = resolveRevisionTransportConfig();
      if (config.endpointCategory !== "local-development-proxy") {
        throw new GenerationError("configuration_unavailable");
      }
      setState({ ...candidate, token: owner.token, status: "submitting", review });
      const request = await revalidateFrozenReview(review, owner.controller.signal);
      if (!owns(owner, review)) {
        return;
      }
      if (JSON.stringify(request) !== review.canonicalRequestBody) {
        throw new GenerationError("review_fingerprint_mismatch");
      }
      const response = await createHttpRevisionTransport(config.endpoint).revise(request, review.logicalAttemptId, owner.controller.signal);
      if (!owns(owner, review)) {
        return;
      }
      setState({ ...candidate, token: owner.token, status: "finalizing", review });
      const pending = await finalizeRevisionTransportResponse({ review, response, signal: owner.controller.signal });
      if (!owns(owner, review)) {
        return;
      }
      setState({ ...candidate, token: owner.token, status: "saving", review, pending });
      await savePending(candidate, owner, review, pending);
    } catch (error) {
      if (!owns(owner, review)) {
        return;
      }
      clearOwner(owner);
      const failure = classifyRevisionFailure(error);
      setState({
        ...candidate,
        token: owner.token,
        status: failure.status,
        review,
        message: failure.message,
        retryTransport: failure.retryTransport,
        retryPersistence: false
      });
    }
  };

  const retryPersistence = async (candidate: Extract<RevisionWorkflowState, { status: FailureKind }>) => {
    if (!candidate.review || !candidate.pending || !candidate.retryPersistence || ownerRef.current) {
      return;
    }
    const owner = acquireOwner(candidate, candidate.review);
    setState({ ...candidate, token: owner.token, status: "recovering", review: candidate.review, pending: candidate.pending });
    try {
      const recovered = await recoverIfCommitted(candidate.review);
      if (!owns(owner, candidate.review)) {
        return;
      }
      if (recovered) {
        deliverSuccess(owner, candidate, recovered, `Recovered saved ${modeNoun(candidate.review.mode)} result.`);
        return;
      }
      setState({ ...candidate, token: owner.token, status: "saving", review: candidate.review, pending: candidate.pending });
      await savePending(candidate, owner, candidate.review, candidate.pending);
    } catch (error) {
      if (!owns(owner, candidate.review)) {
        return;
      }
      clearOwner(owner);
      const persistenceError = toPersistenceError(error, "persistence-conflict");
      setState({
        ...candidate,
        token: owner.token,
        status: "persistence-failed",
        message: persistenceError.userMessage,
        retryTransport: false,
        retryPersistence: persistenceError.code !== "persistence-conflict",
        review: candidate.review,
        pending: candidate.pending
      });
    }
  };

  const savePending = async (
    candidate: RevisionWorkflowState,
    owner: OperationOwner,
    review: FrozenComponentRevisionReviewV1,
    pending: FinalizedRevisionPendingResultV1
  ) => {
    try {
      const saved = await persistPendingGeneratedComponentVersionV2({
        pendingEntry: pending.pendingEntry,
        sourceCaptureId: review.sourceCaptureId,
        sourceCaptureSavedAt: review.sourceCaptureSavedAt,
        sourceGeneratedVersionId: review.sourceGeneratedVersionId,
        canonicalSourceGeneratedVersionEntry: review.canonicalSourceGeneratedVersionEntry,
        canonicalCurrentCaptureProjection: canonicalJsonStringify({
          captureContext: review.captureContext,
          requestedOutput: review.requestedOutput
        } as CanonicalJsonValue),
        screenshotIncluded: review.screenshotIncluded,
        expectedScreenshotStorageKey: savedCapture.record.assets.screenshot.storageKey,
        ...(review.screenshotIncluded && review.screenshot.included
          ? {
              screenshot: {
                mediaType: review.screenshot.mediaType,
                width: review.screenshot.width,
                height: review.screenshot.height,
                byteLength: review.screenshot.byteLength
              }
            }
          : {}),
        targetGeneratedVersionId: review.targetGeneratedVersionId,
        signal: owner.controller.signal
      });
      if (!owns(owner, review)) {
        return;
      }
      deliverSuccess(owner, candidate, saved, `${modeLabel(review.mode)} result saved locally.`);
    } catch (error) {
      if (!owns(owner, review)) {
        return;
      }
      clearOwner(owner);
      const persistenceError = toPersistenceError(error, "persistence-failed");
      setState({
        ...stateBase(candidate, review.sourceCaptureId, review.sourceGeneratedVersionId),
        token: owner.token,
        status: "persistence-failed",
        review,
        pending,
        message: persistenceError.userMessage,
        retryTransport: false,
        retryPersistence: persistenceError.code !== "persistence-conflict"
      });
    }
  };

  const updateDraft = (draftInstruction: string) => {
    if (state.status !== "editing" && state.status !== "invalid") {
      return;
    }
    setState({ ...state, status: "editing", draftInstruction });
  };

  const updateScreenshot = (includeScreenshot: boolean) => {
    if (state.status !== "editing" && state.status !== "invalid") {
      return;
    }
    setState({ ...state, status: "editing", includeScreenshot });
  };

  return (
    <section className="revision-panel" aria-labelledby="revision-workflow-heading">
      <div className="revision-header">
        <div>
          <h3 id="revision-workflow-heading">Trusted revision workflow</h3>
          <p>Revise or regenerate a selected saved generated version. Preview remains an explicit separate action.</p>
        </div>
        <div className="revision-actions">
          <button className="secondary-action compact-action" type="button" onClick={() => startWorkflow("revision")} disabled={isBusy(state)}>
            Revise
          </button>
          <button className="secondary-action compact-action" type="button" onClick={() => startWorkflow("regeneration")} disabled={isBusy(state)}>
            Regenerate
          </button>
        </div>
      </div>
      <SourceVersionSummary entry={sourceEntry} />
      {state.status === "idle" ? <p className="empty-note">Choose Revise or Regenerate to start from this saved version.</p> : null}
      {state.status === "editing" || state.status === "invalid" ? (
        <div className="revision-editor">
          {state.mode === "revision" ? (
            <div className="metadata-field">
              <label htmlFor={instructionId}>Instruction</label>
              <p id={`${instructionId}-help`} className="metadata-help">
                Describe one change to make to this saved generated version. Do not include private data.
              </p>
              <textarea
                ref={textareaRef}
                id={instructionId}
                rows={5}
                value={state.draftInstruction}
                aria-describedby={`${instructionId}-help ${instructionId}-count ${state.status === "invalid" ? `${instructionId}-error` : ""}`}
                aria-invalid={state.status === "invalid" ? "true" : "false"}
                onChange={(event) => updateDraft(event.currentTarget.value)}
              />
              <p id={`${instructionId}-count`} className="metadata-help">
                {countCodePoints(state.draftInstruction)}/1000
              </p>
              {state.status === "invalid" ? (
                <p ref={alertRef} id={`${instructionId}-error`} className="save-state save-state-failed" role="alert" tabIndex={-1}>
                  {state.message}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="empty-note">Regeneration sends no revision instruction.</p>
          )}
          <label className="generation-consent">
            <input type="checkbox" checked={state.includeScreenshot} onChange={(event) => updateScreenshot(event.currentTarget.checked)} />
            <span>Include the saved screenshot in the outbound request.</span>
          </label>
          <div className="revision-actions">
            <button className="primary-action" type="button" onClick={() => void prepareReview(state)}>
              Review data
            </button>
            <button className="secondary-action" type="button" onClick={cancelWorkflow}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <BusyStatus state={state} onCancel={cancelWorkflow} />
      {state.status === "review" ? (
        <ReviewPanel
          state={state}
          consentId={consentId}
          setConsent={(consent) => setState({ ...state, consent })}
          onSend={() => void sendReview(state)}
          onBack={reviewAgain}
          onCancel={cancelWorkflow}
        />
      ) : null}
      {state.status === "transport-failed" || state.status === "invalid-response-failed" || state.status === "persistence-failed" || state.status === "retry-unavailable" ? (
        <div className="save-state save-state-failed" role="alert">
          <p ref={alertRef} tabIndex={-1}>{state.message}</p>
          <div className="revision-actions">
            {state.review && state.retryTransport ? (
              <button className="secondary-action compact-action" type="button" onClick={() => void sendReview(state)}>
                Retry
              </button>
            ) : null}
            {state.review && state.pending && state.retryPersistence ? (
              <button className="secondary-action compact-action" type="button" onClick={() => void retryPersistence(state)}>
                Retry saving
              </button>
            ) : null}
            <button className="secondary-action compact-action" type="button" onClick={reviewAgain}>
              New review
            </button>
            <button className="secondary-action compact-action" type="button" onClick={cancelWorkflow}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {state.status === "cancelled" ? (
        <div className="save-state save-state-saving" role="status">
          <p>{state.message}</p>
          <div className="revision-actions">
            <button className="secondary-action compact-action" type="button" onClick={reviewAgain}>
              Review again
            </button>
            <button className="secondary-action compact-action" type="button" onClick={closeWorkflow}>
              Close
            </button>
          </div>
        </div>
      ) : null}
      {state.status === "success" ? (
        <div className="save-state save-state-saved" role="status">
          <h4 ref={successHeadingRef} tabIndex={-1}>{modeLabel(state.mode)} saved</h4>
          <p>{state.message} New saved version: {state.savedEntry.value.componentName}</p>
        </div>
      ) : null}
    </section>
  );

  function acquireOwner(base: WorkflowBase, review?: FrozenComponentRevisionReviewV1): OperationOwner {
    retireActiveOperation();
    workflowTokenRef.current += 1;
    const controller = new AbortController();
    const owner: OperationOwner = {
      token: workflowTokenRef.current,
      sourceCaptureId: base.sourceCaptureId,
      sourceGeneratedVersionId: base.sourceGeneratedVersionId,
      mode: base.mode,
      controller,
      ...(review
        ? {
            logicalAttemptId: review.logicalAttemptId,
            reviewAttemptFingerprint: review.reviewAttemptFingerprint,
            targetGeneratedVersionId: review.targetGeneratedVersionId
          }
        : {})
    };
    ownerRef.current = owner;
    return owner;
  }

  function retireActiveOperation() {
    const owner = ownerRef.current;
    ownerRef.current = null;
    owner?.controller.abort();
  }

  function clearOwner(owner: OperationOwner) {
    if (ownerRef.current === owner) {
      ownerRef.current = null;
    }
  }

  function owns(owner: OperationOwner, review?: FrozenComponentRevisionReviewV1) {
    const current = ownerRef.current;
    return (
      current === owner &&
      workflowTokenRef.current === owner.token &&
      !owner.controller.signal.aborted &&
      owner.sourceCaptureId === savedCapture.record.id &&
      owner.sourceGeneratedVersionId === sourceEntry.id &&
      (!review ||
        (
          owner.logicalAttemptId === review.logicalAttemptId &&
          owner.reviewAttemptFingerprint === review.reviewAttemptFingerprint &&
          owner.targetGeneratedVersionId === review.targetGeneratedVersionId
        ))
    );
  }

  function bindReviewOwner(owner: OperationOwner, review: FrozenComponentRevisionReviewV1) {
    owner.logicalAttemptId = review.logicalAttemptId;
    owner.reviewAttemptFingerprint = review.reviewAttemptFingerprint;
    owner.targetGeneratedVersionId = review.targetGeneratedVersionId;
  }

  function deliverSuccess(owner: OperationOwner, candidate: RevisionWorkflowState, saved: GeneratedComponentVersionEntry, message: string) {
    if (!owner.targetGeneratedVersionId || deliveredTargetsRef.current.has(owner.targetGeneratedVersionId)) {
      clearOwner(owner);
      return;
    }
    deliveredTargetsRef.current.add(owner.targetGeneratedVersionId);
    clearOwner(owner);
    setState({
      ...stateBase(candidate, owner.sourceCaptureId, owner.sourceGeneratedVersionId),
      token: owner.token,
      status: "success",
      savedEntry: saved,
      message
    });
    onSaved(saved.id);
  }
}

function SourceVersionSummary({ entry }: { entry: GeneratedComponentVersionEntry }) {
  return (
    <section className="revision-source-summary" aria-labelledby="revision-source-heading">
      <h4 id="revision-source-heading">Source version</h4>
      <dl className="preview-metadata">
        <MetadataRow label="Component" value={entry.value.componentName} />
        <MetadataRow label="Created" value={entry.createdAt} />
        <MetadataRow label="Kind" value={describeVersionKind(entry)} />
        <MetadataRow label="Framework" value={`${entry.value.framework} / ${entry.value.styling}`} />
      </dl>
    </section>
  );
}

function ReviewPanel({
  state,
  consentId,
  setConsent,
  onSend,
  onBack,
  onCancel
}: {
  state: Extract<RevisionWorkflowState, { status: "review" }>;
  consentId: string;
  setConsent: (value: boolean) => void;
  onSend: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const review = state.review;
  return (
    <section className="revision-review" aria-labelledby="revision-review-heading">
      <h4 id="revision-review-heading">Review outbound request</h4>
      <ReviewGroup heading="Mode">
        <p>{modeLabel(review.mode)}</p>
      </ReviewGroup>
      <ReviewGroup heading="Instruction">
        <p>{review.mode === "revision" ? review.instruction : "Regeneration sends no instruction."}</p>
      </ReviewGroup>
      <ReviewGroup heading="Source version">
        <dl className="preview-metadata">
          <MetadataRow label="Component" value={review.sourceComponent.componentName} />
          <MetadataRow label="Framework" value={review.sourceComponent.framework} />
          <MetadataRow label="Styling" value={review.sourceComponent.styling} />
          <MetadataRow label="Summary" value={review.sourceComponent.summary} />
          <MetadataRow label="Approximation notes" value={review.sourceComponent.approximationNotes || "No notes"} />
        </dl>
        <pre className="generated-code"><code>{review.sourceComponent.code}</code></pre>
      </ReviewGroup>
      <ReviewGroup heading="Approved capture context">
        <pre className="revision-json"><code>{JSON.stringify(review.captureContext, null, 2)}</code></pre>
      </ReviewGroup>
      <ReviewGroup heading="Requested output">
        <pre className="revision-json"><code>{JSON.stringify(review.requestedOutput, null, 2)}</code></pre>
      </ReviewGroup>
      <ReviewGroup heading="Optional screenshot">
        <ReviewScreenshot review={review} />
      </ReviewGroup>
      <ReviewGroup heading="Excluded data">
        <ul className="revision-excluded-list">
          <li>Source URL and page title are not provider-visible local identifiers in the request body.</li>
          <li>Local capture IDs, local version IDs, screenshot storage keys, notes, cookies, browser storage, prior provider metadata, and local fingerprints are excluded from the request body.</li>
        </ul>
      </ReviewGroup>
      <ReviewGroup heading="Consent">
        <label className="generation-consent" htmlFor={consentId}>
          <input id={consentId} type="checkbox" checked={state.consent} onChange={(event) => setConsent(event.currentTarget.checked)} />
          <span>{CONSENT_TEXT}</span>
        </label>
      </ReviewGroup>
      <div className="revision-actions">
        <button className="primary-action" type="button" onClick={onSend} disabled={!state.consent}>
          Send {modeNoun(review.mode)}
        </button>
        <button className="secondary-action" type="button" onClick={onBack}>
          Back to edit
        </button>
        <button className="secondary-action" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function ReviewScreenshot({ review }: { review: FrozenComponentRevisionReviewV1 }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!review.screenshot.included || !("screenshot" in review.request) || !review.request.screenshot) {
      setObjectUrl(null);
      return;
    }
    const blob = dataUrlToBlob(review.request.screenshot.dataUrl, review.request.screenshot.mediaType);
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [review]);

  if (!review.screenshot.included) {
    return <p>Not included. No screenshot data, digest, or metadata will be sent.</p>;
  }

  return (
    <div className="revision-screenshot-review">
      {objectUrl ? <img className="generation-review-image" src={objectUrl} alt="Reviewed screenshot to be sent" /> : null}
      <dl className="preview-metadata">
        <MetadataRow label="State" value="Included. Image data will be sent." />
        <MetadataRow label="Media type" value={review.screenshot.mediaType} />
        <MetadataRow label="Dimensions" value={`${review.screenshot.width} x ${review.screenshot.height}`} />
        <MetadataRow label="Byte length" value={String(review.screenshot.byteLength)} />
      </dl>
    </div>
  );
}

function ReviewGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="revision-review-group" aria-labelledby={`${heading.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h5 id={`${heading.toLowerCase().replaceAll(" ", "-")}-heading`}>{heading}</h5>
      {children}
    </section>
  );
}

function BusyStatus({ state, onCancel }: { state: RevisionWorkflowState; onCancel: () => void }) {
  const label = busyLabel(state);
  if (!label) {
    return null;
  }
  return (
    <div className="save-state save-state-saving" role="status">
      <p>{label}</p>
      <button className="secondary-action compact-action" type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function busyLabel(state: RevisionWorkflowState) {
  switch (state.status) {
    case "preparing-review":
      return "Preparing frozen Review...";
    case "recovering":
      return "Checking for an already saved result...";
    case "submitting":
      return `Submitting ${modeNoun(state.mode)} request...`;
    case "finalizing":
      return "Validating response...";
    case "saving":
      return `Saving ${modeNoun(state.mode)} result locally...`;
    default:
      return undefined;
  }
}

function validateDraft(state: WorkflowBase) {
  if (state.mode === "regeneration") {
    return { ok: true as const, rawDraft: "", instruction: undefined };
  }
  try {
    const instruction = normalizeRevisionInstruction(state.draftInstruction);
    return { ok: true as const, rawDraft: state.draftInstruction, instruction };
  } catch {
    return { ok: false as const, message: "Instruction must be 4 to 1000 Unicode code points, 4096 UTF-8 bytes or fewer, and contain no control or bidi characters." };
  }
}

async function revalidateFrozenReview(review: FrozenComponentRevisionReviewV1, signal: AbortSignal) {
  const latestCapture = await loadSavedCaptureById(review.sourceCaptureId);
  const latestSource = await getGeneratedComponentVersionUnionById(review.sourceGeneratedVersionId);
  if (!latestSource || latestSource.sourceCaptureId !== latestCapture.record.id) {
    throw new GenerationError("capture_changed");
  }
  return revalidateComponentRevisionReview({
    review,
    currentCaptureRecord: latestCapture.record,
    currentSavedAt: latestCapture.savedAt,
    screenshotAsset: latestCapture.asset,
    sourceGeneratedVersionEntry: latestSource,
    endpointCategory: review.endpointCategory,
    signal
  });
}

async function recoverIfCommitted(review: FrozenComponentRevisionReviewV1) {
  return recoverGeneratedComponentVersionV2({
    targetGeneratedVersionId: review.targetGeneratedVersionId,
    expectedSourceCaptureId: review.sourceCaptureId,
    expectedSourceGeneratedVersionId: review.sourceGeneratedVersionId,
    expectedLogicalAttemptId: review.logicalAttemptId,
    expectedReviewAttemptFingerprint: review.reviewAttemptFingerprint
  });
}

function classifyRevisionFailure(error: unknown) {
  if (error instanceof PersistenceError) {
    return classifyPersistenceFailure(error.code, error.userMessage);
  }
  const generationError = toGenerationError(error, "request_validation_failed");
  return classifyGenerationFailure(generationError.code, getSafeGenerationMessage(generationError));
}

function classifyGenerationFailure(code: GenerationErrorCode, message: string) {
  const retryTransport = ["network_unavailable", "timeout", "rate_limited", "provider_rejected"].includes(code);
  return {
    status: code === "malformed_response" ? "invalid-response-failed" as const : retryTransport ? "transport-failed" as const : "retry-unavailable" as const,
    message,
    retryTransport
  };
}

function classifyPersistenceFailure(code: PersistenceErrorCode, message: string) {
  return {
    status: "persistence-failed" as const,
    message,
    retryTransport: false,
    retryPersistence: code !== "persistence-conflict"
  };
}

function resolveRevisionTransportConfig(): TransportConfig {
  const configured = import.meta.env.VITE_ELEMENT_CATCHER_BACKEND_URL;
  const testLoopback = window.navigator.webdriver === true && window.__EC_REVISION_WORKFLOW_TEST_LOOPBACK__ === true;
  if (configured === LOOPBACK_ORIGIN || testLoopback) {
    return {
      endpointCategory: "local-development-proxy",
      endpoint: `${LOOPBACK_ORIGIN}${REVISION_ENDPOINT_PATH}`
    };
  }
  return { endpointCategory: "backend-unconfigured" };
}

function stateBase(state: RevisionWorkflowState, sourceCaptureId: string, sourceGeneratedVersionId: string): WorkflowBase {
  if ("mode" in state) {
    return {
      token: state.token,
      sourceCaptureId: state.sourceCaptureId,
      sourceGeneratedVersionId: state.sourceGeneratedVersionId,
      mode: state.mode,
      draftInstruction: state.draftInstruction,
      includeScreenshot: state.includeScreenshot
    };
  }
  return {
    token: 0,
    sourceCaptureId,
    sourceGeneratedVersionId,
    mode: "revision",
    draftInstruction: "",
    includeScreenshot: false
  };
}

function isBusy(state: RevisionWorkflowState) {
  return ["preparing-review", "recovering", "submitting", "finalizing", "saving"].includes(state.status);
}

function countCodePoints(value: string) {
  return Array.from(value).length;
}

function describeVersionKind(entry: GeneratedComponentVersionEntry) {
  if ("contractVersion" in entry && entry.contractVersion === 2) {
    return entry.operation.kind;
  }
  return "initial";
}

function modeLabel(mode: RevisionReviewMode) {
  return mode === "revision" ? "Revision" : "Regeneration";
}

function modeNoun(mode: RevisionReviewMode) {
  return mode === "revision" ? "revision" : "regeneration";
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function dataUrlToBlob(dataUrl: string, mediaType: string) {
  const prefix = `data:${mediaType};base64,`;
  if (!dataUrl.startsWith(prefix)) {
    return new Blob([], { type: mediaType });
  }
  const binary = window.atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mediaType });
}
