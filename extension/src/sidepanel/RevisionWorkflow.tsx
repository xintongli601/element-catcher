import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { canonicalJsonStringify, type CanonicalJsonValue } from "../generation/canonical-json";
import { getSafeGenerationMessage } from "../generation/errors";
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
import { getSafePersistenceMessage } from "../storage/persistence-errors";
import { loadSavedCaptureById, type SavedCaptureReadModel } from "../storage/capture-save";
import {
  getGeneratedComponentVersionUnionById,
  persistPendingGeneratedComponentVersionV2,
  recoverGeneratedComponentVersionV2
} from "../storage/indexed-db";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract";

const REVISION_ENDPOINT = "http://127.0.0.1:8787/v1/revise-component";
const MAX_REVISION_INSTRUCTION_CODE_POINTS = 1000;
const MAX_REVISION_INSTRUCTION_BYTES = 4000;
const CONSENT_TEXT = "I understand this displayed data will leave my device and may use paid AI capacity.";

type WorkflowBase = {
  token: number;
  sourceCaptureId: string;
  sourceGeneratedVersionId: string;
  mode: RevisionReviewMode;
};

type EditingState = WorkflowBase & {
  status: "editing";
  draftInstruction: string;
  normalizedInstruction?: string;
  includeScreenshot: boolean;
};

type InvalidState = WorkflowBase & {
  status: "invalid";
  draftInstruction: string;
  includeScreenshot: boolean;
  message: string;
};

type ReviewState = WorkflowBase & {
  status: "review";
  draftInstruction: string;
  includeScreenshot: boolean;
  review: FrozenComponentRevisionReviewV1;
  consent: boolean;
};

type SubmittingState = WorkflowBase & {
  status: "submitting" | "saving";
  draftInstruction: string;
  includeScreenshot: boolean;
  review: FrozenComponentRevisionReviewV1;
  pending?: FinalizedRevisionPendingResultV1;
};

type FailureState = WorkflowBase & {
  status: "transport-failed" | "invalid-response-failed" | "persistence-failed" | "retry-unavailable";
  draftInstruction: string;
  includeScreenshot: boolean;
  review?: FrozenComponentRevisionReviewV1;
  pending?: FinalizedRevisionPendingResultV1;
  message: string;
};

type RevisionWorkflowState =
  | { status: "idle" }
  | EditingState
  | InvalidState
  | (WorkflowBase & { status: "preparing-review"; draftInstruction: string; includeScreenshot: boolean })
  | ReviewState
  | SubmittingState
  | (WorkflowBase & { status: "cancelling"; message: string })
  | (WorkflowBase & { status: "cancelled"; message: string })
  | (WorkflowBase & {
      status: "response-received";
      draftInstruction: string;
      includeScreenshot: boolean;
      review: FrozenComponentRevisionReviewV1;
      pending: FinalizedRevisionPendingResultV1;
    })
  | (WorkflowBase & { status: "success"; savedEntry: GeneratedComponentVersionEntry; message: string })
  | FailureState
  | (WorkflowBase & { status: "stale-ignored"; message: string });

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
  const controllerRef = useRef<AbortController | null>(null);
  const successHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const alertRef = useRef<HTMLParagraphElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const instructionId = useId();
  const consentId = useId();
  const [state, setState] = useState<RevisionWorkflowState>({ status: "idle" });

  useEffect(() => {
    return () => {
      retireController();
      workflowTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      successHeadingRef.current?.focus();
    }
    if (state.status === "invalid" || state.status.endsWith("failed") || state.status === "retry-unavailable") {
      alertRef.current?.focus();
    }
  }, [state.status]);

  const startWorkflow = (mode: RevisionReviewMode) => {
    retireController();
    const token = nextToken();
    setState({
      status: "editing",
      token,
      sourceCaptureId: savedCapture.record.id,
      sourceGeneratedVersionId: sourceEntry.id,
      mode,
      draftInstruction: "",
      includeScreenshot: false
    });
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const cancelWorkflow = () => {
    retireController();
    const base = currentBase(state, savedCapture.record.id, sourceEntry.id);
    workflowTokenRef.current += 1;
    setState({
      ...base,
      token: workflowTokenRef.current,
      status: "cancelled",
      message: "Revision workflow cancelled. No request is active."
    });
    onCancelSelection();
  };

  const prepareReview = async (candidate: EditingState | InvalidState) => {
    const normalized = validateDraft(candidate);
    if (!normalized.ok) {
      setState({ ...candidate, status: "invalid", message: normalized.message });
      return;
    }

    retireController();
    const token = nextToken();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({
      sourceCaptureId: candidate.sourceCaptureId,
      sourceGeneratedVersionId: candidate.sourceGeneratedVersionId,
      mode: candidate.mode,
      draftInstruction: candidate.draftInstruction,
      includeScreenshot: candidate.includeScreenshot,
      token,
      status: "preparing-review"
    });

    try {
      const latestCapture = await loadSavedCaptureById(savedCapture.record.id);
      const latestSource = await getGeneratedComponentVersionUnionById(sourceEntry.id);
      if (!latestSource || latestSource.sourceCaptureId !== latestCapture.record.id) {
        throw new Error("source generated version changed");
      }
      const review = await prepareComponentRevisionReview({
        currentCaptureRecord: latestCapture.record,
        currentSavedAt: latestCapture.savedAt,
        screenshotAsset: latestCapture.asset,
        sourceGeneratedVersionEntry: latestSource,
        mode: candidate.mode,
        rawRevisionInstruction: candidate.mode === "revision" ? normalized.instruction : undefined,
        screenshotIncluded: candidate.includeScreenshot,
        endpointCategory: "local-development-proxy",
        signal: controller.signal
      });
      if (!isCurrent(token, latestCapture.record.id, latestSource.id)) {
        setState({ ...candidate, token, status: "stale-ignored", message: "A newer revision workflow is active." });
        return;
      }
      setState({
        ...candidate,
        token,
        status: "review",
        draftInstruction: normalized.rawDraft,
        includeScreenshot: candidate.includeScreenshot,
        review,
        consent: false
      });
    } catch (error) {
      if (controller.signal.aborted) {
        setState({ ...candidate, token, status: "cancelled", message: "Revision workflow cancelled." });
        return;
      }
      setState({
        ...candidate,
        token,
        status: "retry-unavailable",
        message: getSafeGenerationMessage(error)
      });
    }
  };

  const sendReview = async (candidate: ReviewState | FailureState) => {
    if (!candidate.review || (candidate.status === "review" && !candidate.consent)) {
      return;
    }
    const recovered = await recoverIfCommitted(candidate.review);
    if (recovered) {
      setState({ ...candidate, status: "success", savedEntry: recovered, message: "Recovered saved revision result." });
      onSaved(recovered.id);
      return;
    }

    retireController();
    const token = nextToken();
    const controller = new AbortController();
    controllerRef.current = controller;
    const review = candidate.review;
    setState({ ...candidate, token, status: "submitting", review });

    try {
      const request = await revalidateFrozenReview(review, controller.signal);
      if (JSON.stringify(request) !== review.canonicalRequestBody) {
        throw new Error("review request changed");
      }
      const response = await createHttpRevisionTransport(REVISION_ENDPOINT).revise(request, review.logicalAttemptId, controller.signal);
      if (!isCurrent(token, review.sourceCaptureId, review.sourceGeneratedVersionId)) {
        setState({ ...candidate, token, status: "stale-ignored", message: "A newer revision workflow is active." });
        return;
      }
      const pending = await finalizeRevisionTransportResponse({ review, response, signal: controller.signal });
      setState({ ...candidate, token, status: "response-received", review, pending });
      await savePending(candidate, review, pending, token, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        setState({ ...candidate, token, status: "cancelled", message: "Revision workflow cancelled." });
        return;
      }
      setState({
        ...candidate,
        token,
        status: classifyFailure(error),
        review,
        message: getSafeGenerationMessage(error)
      });
    }
  };

  const retryPersistence = async (candidate: FailureState) => {
    if (!candidate.review || !candidate.pending) {
      return;
    }
    const recovered = await recoverIfCommitted(candidate.review);
    if (recovered) {
      setState({ ...candidate, status: "success", savedEntry: recovered, message: "Recovered saved revision result." });
      onSaved(recovered.id);
      return;
    }
    retireController();
    const token = nextToken();
    const controller = new AbortController();
    controllerRef.current = controller;
    const review = candidate.review;
    const pending = candidate.pending;
    setState({ ...candidate, token, status: "saving", review, pending });
    await savePending(candidate, review, pending, token, controller.signal);
  };

  const savePending = async (
    candidate: RevisionWorkflowState,
    review: FrozenComponentRevisionReviewV1,
    pending: FinalizedRevisionPendingResultV1,
    token: number,
    signal: AbortSignal
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
        signal
      });
      if (!isCurrent(token, review.sourceCaptureId, review.sourceGeneratedVersionId)) {
        setState({ ...currentBase(candidate, review.sourceCaptureId, review.sourceGeneratedVersionId), token, status: "stale-ignored", message: "Saved result committed after cancellation and was left unselected." });
        return;
      }
      setState({
        ...currentBase(candidate, review.sourceCaptureId, review.sourceGeneratedVersionId),
        token,
        status: "success",
        savedEntry: saved,
        message: "Revision result saved locally."
      });
      onSaved(saved.id);
    } catch (error) {
      if (signal.aborted) {
        setState({ ...currentBase(candidate, review.sourceCaptureId, review.sourceGeneratedVersionId), token, status: "cancelled", message: "Revision workflow cancelled." });
        return;
      }
      setState({
        ...currentBase(candidate, review.sourceCaptureId, review.sourceGeneratedVersionId),
        token,
        status: "persistence-failed",
        draftInstruction: "draftInstruction" in candidate ? candidate.draftInstruction : "",
        includeScreenshot: "includeScreenshot" in candidate ? candidate.includeScreenshot : review.screenshotIncluded,
        review,
        pending,
        message: getSafePersistenceMessage(error)
      });
    }
  };

  const updateDraft = (draftInstruction: string) => {
    if (state.status !== "editing" && state.status !== "invalid") {
      return;
    }
    setState({
      ...state,
      status: "editing",
      draftInstruction
    });
  };

  const updateScreenshot = (includeScreenshot: boolean) => {
    if (state.status !== "editing" && state.status !== "invalid") {
      return;
    }
    setState({
      ...state,
      status: "editing",
      includeScreenshot
    });
  };

  const backToEdit = (reviewState: ReviewState | FailureState) => {
    retireController();
    workflowTokenRef.current += 1;
    setState({
      status: "editing",
      token: workflowTokenRef.current,
      sourceCaptureId: reviewState.sourceCaptureId,
      sourceGeneratedVersionId: reviewState.sourceGeneratedVersionId,
      mode: reviewState.mode,
      draftInstruction: reviewState.draftInstruction,
      includeScreenshot: reviewState.includeScreenshot
    });
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
      <BusyStatus state={state} />
      {state.status === "review" ? (
        <ReviewPanel
          state={state}
          consentId={consentId}
          setConsent={(consent) => setState({ ...state, consent })}
          onSend={() => void sendReview(state)}
          onBack={() => backToEdit(state)}
          onCancel={cancelWorkflow}
        />
      ) : null}
      {state.status === "transport-failed" || state.status === "invalid-response-failed" || state.status === "persistence-failed" || state.status === "retry-unavailable" ? (
        <div className="save-state save-state-failed" role="alert">
          <p ref={alertRef} tabIndex={-1}>{state.message}</p>
          <div className="revision-actions">
            {state.review && state.status !== "persistence-failed" ? (
              <button className="secondary-action compact-action" type="button" onClick={() => void sendReview(state)}>
                Retry
              </button>
            ) : null}
            {state.review && state.pending && state.status === "persistence-failed" ? (
              <button className="secondary-action compact-action" type="button" onClick={() => void retryPersistence(state)}>
                Retry saving
              </button>
            ) : null}
            <button className="secondary-action compact-action" type="button" onClick={() => backToEdit(state)}>
              New review
            </button>
            <button className="secondary-action compact-action" type="button" onClick={cancelWorkflow}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {state.status === "cancelled" || state.status === "stale-ignored" ? (
        <p className="save-state save-state-saving" role="status">{state.message}</p>
      ) : null}
      {state.status === "success" ? (
        <div className="save-state save-state-saved" role="status">
          <h4 ref={successHeadingRef} tabIndex={-1}>Revision saved</h4>
          <p>{state.message} New saved version: {state.savedEntry.value.componentName}</p>
        </div>
      ) : null}
    </section>
  );

  function nextToken() {
    workflowTokenRef.current += 1;
    return workflowTokenRef.current;
  }

  function retireController() {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }

  function isCurrent(token: number, captureId: string, sourceId: string) {
    return workflowTokenRef.current === token && captureId === savedCapture.record.id && sourceId === sourceEntry.id;
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
  state: ReviewState;
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
      <ReviewGroup heading="Instruction">
        <p>{review.mode === "revision" ? review.instruction : "No instruction will be sent for regeneration."}</p>
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
      <ReviewGroup heading="Optional screenshot">
        {review.screenshot.included ? (
          <dl className="preview-metadata">
            <MetadataRow label="State" value="Included. Image data will be sent." />
            <MetadataRow label="Media type" value={review.screenshot.mediaType} />
            <MetadataRow label="Dimensions" value={`${review.screenshot.width} x ${review.screenshot.height}`} />
            <MetadataRow label="Byte length" value={String(review.screenshot.byteLength)} />
          </dl>
        ) : (
          <p>Not included. No screenshot data, digest, or metadata will be sent.</p>
        )}
      </ReviewGroup>
      <ReviewGroup heading="Excluded data">
        <ul className="revision-excluded-list">
          <li>Source URL and page title are not shown as provider-visible local identifiers.</li>
          <li>Local capture IDs, local version IDs, screenshot storage keys, notes, cookies, browser storage, prior provider metadata, and local fingerprints are excluded from the request body.</li>
        </ul>
      </ReviewGroup>
      <label className="generation-consent" htmlFor={consentId}>
        <input id={consentId} type="checkbox" checked={state.consent} onChange={(event) => setConsent(event.currentTarget.checked)} />
        <span>{CONSENT_TEXT}</span>
      </label>
      <div className="revision-actions">
        <button className="primary-action" type="button" onClick={onSend} disabled={!state.consent}>
          Send revision
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

function ReviewGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="revision-review-group" aria-labelledby={`${heading.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h5 id={`${heading.toLowerCase().replaceAll(" ", "-")}-heading`}>{heading}</h5>
      {children}
    </section>
  );
}

function BusyStatus({ state }: { state: RevisionWorkflowState }) {
  if (state.status === "preparing-review") {
    return <p className="save-state save-state-saving" role="status">Preparing frozen Review...</p>;
  }
  if (state.status === "submitting") {
    return <p className="save-state save-state-saving" role="status">Submitting revision request...</p>;
  }
  if (state.status === "response-received") {
    return <p className="save-state save-state-saving" role="status">Response received. Preparing local save...</p>;
  }
  if (state.status === "saving") {
    return <p className="save-state save-state-saving" role="status">Saving revision result locally...</p>;
  }
  if (state.status === "cancelling") {
    return <p className="save-state save-state-saving" role="status">Cancelling revision workflow...</p>;
  }
  return null;
}

function validateDraft(state: EditingState | InvalidState) {
  if (state.mode === "regeneration") {
    return { ok: true as const, rawDraft: "", instruction: undefined };
  }
  const instruction = normalizeRevisionInstruction(state.draftInstruction);
  const codePoints = countCodePoints(instruction);
  if (codePoints < 4) {
    return { ok: false as const, message: "Instruction must be at least 4 code points." };
  }
  if (codePoints > MAX_REVISION_INSTRUCTION_CODE_POINTS) {
    return { ok: false as const, message: "Instruction must be 1000 code points or fewer." };
  }
  if (new TextEncoder().encode(instruction).byteLength > MAX_REVISION_INSTRUCTION_BYTES) {
    return { ok: false as const, message: "Instruction is too large in UTF-8 bytes." };
  }
  return { ok: true as const, rawDraft: state.draftInstruction, instruction };
}

async function revalidateFrozenReview(review: FrozenComponentRevisionReviewV1, signal: AbortSignal) {
  const latestCapture = await loadSavedCaptureById(review.sourceCaptureId);
  const latestSource = await getGeneratedComponentVersionUnionById(review.sourceGeneratedVersionId);
  if (!latestSource || latestSource.sourceCaptureId !== latestCapture.record.id) {
    throw new Error("source generated version changed");
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

function classifyFailure(error: unknown): FailureState["status"] {
  const message = getSafeGenerationMessage(error);
  if (message.includes("malformed")) {
    return "invalid-response-failed";
  }
  return "transport-failed";
}

function currentBase(state: RevisionWorkflowState, sourceCaptureId: string, sourceGeneratedVersionId: string): WorkflowBase {
  if ("mode" in state) {
    return {
      token: state.token,
      sourceCaptureId: state.sourceCaptureId,
      sourceGeneratedVersionId: state.sourceGeneratedVersionId,
      mode: state.mode
    };
  }
  return {
    token: 0,
    sourceCaptureId,
    sourceGeneratedVersionId,
    mode: "revision"
  };
}

function isBusy(state: RevisionWorkflowState) {
  return ["preparing-review", "submitting", "response-received", "saving", "cancelling"].includes(state.status);
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

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
