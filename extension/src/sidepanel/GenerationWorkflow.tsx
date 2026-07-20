import { useEffect, useRef, useState } from "react";
import { GenerationError, getSafeGenerationMessage } from "../generation/errors";
import { prepareGenerationReviewById, generateFromReview } from "../generation/workflow";
import { createGenerationTransport } from "../generation/transport";
import type { ComponentGenerationResponseV1, GenerationReviewModel, TransmittedDomNodeV1 } from "../generation/types";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import { predictCompleteRequestBytes } from "../generation/request-size";

type GenerationState =
  | { status: "closed" }
  | { status: "preparing" }
  | { status: "review"; review: GenerationReviewModel; consent: boolean; message?: string }
  | { status: "generating"; review: GenerationReviewModel }
  | { status: "succeeded"; review: GenerationReviewModel; response: ComponentGenerationResponseV1 }
  | { status: "failed"; review?: GenerationReviewModel; message: string }
  | { status: "cancelled"; review?: GenerationReviewModel; message: string };

export function GenerationWorkflow({
  savedCapture
}: {
  savedCapture: SavedCaptureReadModel;
}) {
  const [state, setState] = useState<GenerationState>({ status: "closed" });
  const sequenceRef = useRef(0);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const transportConfig = createGenerationTransport();

  useEffect(() => {
    sequenceRef.current += 1;
    inFlightRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "closed" });
  }, [savedCapture.record.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const prepareFreshReview = async (message?: string) => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "preparing" });

    try {
      const review = await prepareGenerationReviewById(savedCapture.record.id, transportConfig.endpointCategory);
      if (sequenceRef.current !== sequence) {
        return;
      }
      setState({ status: "review", review, consent: false, message });
    } catch (error) {
      if (sequenceRef.current !== sequence) {
        return;
      }
      setState({ status: "failed", message: getSafeGenerationMessage(error) });
    }
  };

  const openReview = async () => {
    await prepareFreshReview();
  };

  const closeFlow = () => {
    sequenceRef.current += 1;
    inFlightRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "closed" });
  };

  const cancelGeneration = () => {
    sequenceRef.current += 1;
    inFlightRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setState({
      status: "cancelled",
      review: "review" in state ? state.review : undefined,
      message: state.status === "generating" ? "Generation cancelled." : "Generation cancelled before sending."
    });
  };

  const submitGeneration = async (review: GenerationReviewModel) => {
    if (inFlightRef.current || (state.status === "review" && !state.consent)) {
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    inFlightRef.current = true;
    const abortController = new AbortController();
    abortRef.current = abortController;
    setState({ status: "generating", review });

    try {
      const response = await generateFromReview({
        localContext: review.localContext,
        transport: transportConfig.transport,
        signal: abortController.signal
      });
      if (sequenceRef.current !== sequence) {
        return;
      }
      setState({ status: "succeeded", review, response });
    } catch (error) {
      if (sequenceRef.current !== sequence) {
        return;
      }
      if (error instanceof GenerationError && (error.code === "review_fingerprint_mismatch" || error.code === "capture_changed")) {
        inFlightRef.current = false;
        abortRef.current = null;
        await prepareFreshReview(getSafeGenerationMessage(error));
        return;
      }
      const message = getSafeGenerationMessage(error);
      const nextStatus = message === "Generation was cancelled." ? "cancelled" : "failed";
      setState({ status: nextStatus, review, message });
    } finally {
      if (sequenceRef.current === sequence) {
        inFlightRef.current = false;
        abortRef.current = null;
      }
    }
  };

  return (
    <section className="generation-panel" aria-labelledby="generation-heading">
      <div className="generation-header">
        <div>
          <h3 id="generation-heading">AI generation</h3>
          <p>Generate a temporary React + Tailwind reconstruction from this saved capture.</p>
        </div>
        {state.status === "closed" ? (
          <button className="primary-action compact-action" type="button" onClick={() => void openReview()}>
            Generate component
          </button>
        ) : null}
      </div>

      {state.status === "preparing" ? <p className="save-state save-state-saving">Preparing Review data...</p> : null}
      {state.status === "review" ? (
        <ReviewDataView
          review={state.review}
          consent={state.consent}
          message={state.message}
          onConsentChange={(consent) => setState({ ...state, consent })}
          onSubmit={() => void submitGeneration(state.review)}
          onCancel={cancelGeneration}
        />
      ) : null}
      {state.status === "generating" ? (
        <div className="generation-status">
          <p className="save-state save-state-saving" role="status">
            Generating with the configured transport...
          </p>
          <button className="secondary-action compact-action" type="button" onClick={cancelGeneration}>
            Cancel
          </button>
        </div>
      ) : null}
      {state.status === "succeeded" ? (
        <GeneratedResult response={state.response} onClose={closeFlow} onRetry={() => void prepareFreshReview("Review again before retrying.")} />
      ) : null}
      {state.status === "failed" ? (
        <GenerationFailure
          message={state.message}
          review={state.review}
          onClose={closeFlow}
          onRetry={() => void prepareFreshReview("Review again before retrying.")}
        />
      ) : null}
      {state.status === "cancelled" ? (
        <GenerationFailure
          message={state.message}
          review={state.review}
          onClose={closeFlow}
          onRetry={() => void prepareFreshReview("Review again before retrying.")}
        />
      ) : null}
    </section>
  );
}

function ReviewDataView({
  review,
  consent,
  message,
  onConsentChange,
  onSubmit,
  onCancel
}: {
  review: GenerationReviewModel;
  consent: boolean;
  message?: string;
  onConsentChange: (consent: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [previewState, setPreviewState] = useState<
    | { status: "preparing" }
    | { status: "ready"; objectUrl: string; blob: Blob }
    | { status: "failed" }
  >({ status: "preparing" });
  const requestWithoutDataUrl = review.localContext.reviewedRequestWithoutDataUrl;
  const estimatedBytes = predictCompleteRequestBytes(requestWithoutDataUrl);
  const context = requestWithoutDataUrl.captureContext;

  useEffect(() => {
    let objectUrl: string | null = null;
    let revoked = false;
    const revokePreviewUrl = () => {
      if (objectUrl && !revoked) {
        URL.revokeObjectURL(objectUrl);
        revoked = true;
      }
    };

    try {
      objectUrl = URL.createObjectURL(review.screenshot.blob);
      setPreviewState({ status: "ready", objectUrl, blob: review.screenshot.blob });
      window.addEventListener("pagehide", revokePreviewUrl, { once: true });
    } catch {
      setPreviewState({ status: "failed" });
    }

    return () => {
      window.removeEventListener("pagehide", revokePreviewUrl);
      revokePreviewUrl();
    };
  }, [review.screenshot.blob]);

  const currentPreview =
    previewState.status === "ready" && previewState.blob === review.screenshot.blob ? previewState : previewState.status === "failed" ? previewState : { status: "preparing" as const };

  return (
    <section className="generation-review" aria-labelledby="generation-review-heading">
      <h4 id="generation-review-heading">Review data being sent</h4>
      <p className="generation-note">Displayed values are the exact outbound projection. Excluded content is not sent.</p>
      {message ? (
        <p className="save-state save-state-failed" role="alert">
          {message}
        </p>
      ) : null}
      {currentPreview.status === "ready" ? (
        <img src={currentPreview.objectUrl} alt="Screenshot that will be sent after consent" className="generation-review-image" />
      ) : (
        <p className="preview-image-placeholder">
          {currentPreview.status === "failed" ? "Screenshot preview unavailable." : "Preparing generation screenshot preview..."}
        </p>
      )}
      <dl className="preview-metadata">
        <MetadataItem label="Decoded image size" value={`${review.screenshot.width} x ${review.screenshot.height} px`} />
        <MetadataItem label="Decoded image bytes" value={String(review.screenshot.byteLength)} />
        <MetadataItem label="Estimated complete request size" value={`${estimatedBytes} UTF-8 bytes`} />
        <MetadataItem label="Endpoint category" value={formatEndpoint(review.endpointCategory)} />
        <MetadataItem label="Contract version" value={String(requestWithoutDataUrl.contractVersion)} />
        <MetadataItem label="Requested framework" value={requestWithoutDataUrl.requestedOutput.framework} />
        <MetadataItem label="Requested styling" value={requestWithoutDataUrl.requestedOutput.styling} />
        <MetadataItem label="Requested fields" value={requestWithoutDataUrl.requestedOutput.fields.join(", ")} />
        <MetadataItem label="Library title" value={context.library.title ?? "Not included"} />
        <MetadataItem label="Component type" value={context.library.componentType ?? "Not included"} />
        <MetadataItem label="Summary component type" value={context.summaries.componentType ?? "Not included"} />
        <MetadataItem label="Tags" value={context.library.tags.length ? context.library.tags.join(", ") : "No tags transmitted"} />
        <MetadataItem label="Element tag name" value={context.element.tagName} />
        <MetadataItem label="Element semantic role" value={context.element.semanticRole ?? "Not included"} />
        <MetadataItem label="Element width" value={`${context.element.rect.width} CSS px`} />
        <MetadataItem label="Element height" value={`${context.element.rect.height} CSS px`} />
        <MetadataItem label="Page title exclusion" value={`${context.pageTitlePolicy.included ? "Included" : "Excluded"}: ${context.pageTitlePolicy.reason}`} />
        <MetadataItem label="Source URL exclusion" value={`${context.sourceUrlPolicy.included ? "Included" : "Excluded"}: ${context.sourceUrlPolicy.reason}`} />
      </dl>
      <ReviewList title="DOM node tag names" values={collectDomTags(context.dom.sanitizedSnapshot)} />
      <ReviewList title="DOM text previews" values={collectDomText(context.dom.sanitizedSnapshot)} />
      <ReviewList title="Transmitted attributes" values={collectAttributes(context.dom.sanitizedSnapshot)} />
      <ReviewList title="Child summary" values={context.dom.childSummary.map(formatChildSummary)} />
      <ReviewList title="Computed styles" values={summarizeObject(context.styles.computed)} />
      <ReviewList title="Before pseudo styles" values={context.styles.before ? summarizeObject(context.styles.before) : []} />
      <ReviewList title="After pseudo styles" values={context.styles.after ? summarizeObject(context.styles.after) : []} />
      <ReviewList title="Typography" values={summarizeObject(context.summaries.typography)} />
      <ReviewList title="Colors" values={summarizeObject(context.summaries.colors)} />
      <ReviewList title="Layout" values={summarizeObject(context.summaries.layout)} />
      <ReviewList title="Spacing" values={summarizeObject(context.summaries.spacing)} />
      <ReviewList
        title="Excluded categories"
        values={[
          "library notes",
          "source URL",
          "page title",
          "favicon URL",
          "capture identifiers",
          "savedAt",
          "screenshot storage key",
          "IndexedDB wrapper",
          "generated versions",
          "browser storage",
          "cookies",
          "hidden DOM",
          "raw outerHTML"
        ]}
      />
      <label className="generation-consent">
        <input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.currentTarget.checked)} />
        <span>
          Data is leaving your device. Element Catcher will send the screenshot and the displayed structured fields to the configured AI backend. Do not send passwords, payment data, private messages, confidential business content, personal identifiers, or protected material. Generated output is approximate and may use paid API capacity. Provider data handling depends on the configured backend and provider settings; do not assume the provider immediately deletes all submitted data.
        </span>
      </label>
      <div className="generation-actions">
        <button className="primary-action" type="button" onClick={onSubmit} disabled={!consent}>
          Send to AI and generate
        </button>
        <button className="secondary-action" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function GeneratedResult({
  response,
  onClose,
  onRetry
}: {
  response: ComponentGenerationResponseV1;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="generation-result" aria-labelledby="generation-result-heading">
      <h4 id="generation-result-heading">Temporary generated result</h4>
      <p className="generation-note">This result is temporary and is not saved in Milestone 5B.</p>
      <dl className="preview-metadata">
        <MetadataItem label="Component name" value={response.componentName} />
        <MetadataItem label="Framework" value={response.framework} />
        <MetadataItem label="Styling" value={response.styling} />
        <MetadataItem label="Summary" value={response.summary} multiline />
        <MetadataItem label="Approximation notes" value={response.approximationNotes || "No notes"} multiline />
      </dl>
      <pre className="generated-code"><code>{response.code}</code></pre>
      <div className="generation-actions">
        <button className="secondary-action" type="button" onClick={onRetry}>
          Generate again
        </button>
        <button className="secondary-action" type="button" onClick={onClose}>
          Close result
        </button>
      </div>
    </section>
  );
}

function GenerationFailure({
  message,
  review,
  onClose,
  onRetry
}: {
  message: string;
  review?: GenerationReviewModel;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="save-state save-state-failed" role="alert">
      <p>{message}</p>
      <div className="generation-actions">
        {review ? (
          <button className="secondary-action compact-action" type="button" onClick={onRetry}>
            Retry after review
          </button>
        ) : null}
        <button className="secondary-action compact-action" type="button" onClick={onClose}>
          Close generation
        </button>
      </div>
    </div>
  );
}

function MetadataItem({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={multiline ? "metadata-notes-value" : undefined}>{value}</dd>
    </div>
  );
}

function ReviewList({ title, values }: { title: string; values: string[] }) {
  return (
    <section className="generation-review-list" aria-label={title}>
      <h5>{title}</h5>
      {values.length ? (
        <ul>
          {values.map((value, index) => (
            <li key={`${title}-${index}`}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">No values transmitted.</p>
      )}
    </section>
  );
}

function collectDomTags(node: TransmittedDomNodeV1): string[] {
  const values: string[] = [];
  const visit = (current: TransmittedDomNodeV1) => {
    values.push(current.tagName);
    current.children.forEach(visit);
  };
  visit(node);
  return values;
}

function collectDomText(node: TransmittedDomNodeV1): string[] {
  const values: string[] = [];
  const visit = (current: TransmittedDomNodeV1) => {
    if (current.textPreview) {
      values.push(current.textPreview);
    }
    current.children.forEach(visit);
  };
  visit(node);
  return values;
}

function collectAttributes(node: TransmittedDomNodeV1): string[] {
  const values: string[] = [];
  const visit = (current: TransmittedDomNodeV1) => {
    for (const [key, value] of Object.entries(current.attributes)) {
      values.push(`${current.tagName}.${key}: ${value}`);
    }
    current.children.forEach(visit);
  };
  visit(node);
  return values;
}

function formatChildSummary(child: GenerationReviewModel["localContext"]["reviewedRequestWithoutDataUrl"]["captureContext"]["dom"]["childSummary"][number]) {
  return [
    `tag: ${child.tagName}`,
    `role: ${child.semanticRole ?? "Not included"}`,
    `text: ${child.textPreview ?? "Not included"}`,
    `childCount: ${child.childCount}`
  ].join("; ");
}

function summarizeObject(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    if (Array.isArray(child)) {
      return child.map((item, index) => `${key}[${index}]: ${formatReviewValue(item)}`);
    }
    if (child && typeof child === "object") {
      return Object.entries(child).map(([innerKey, innerValue]) => `${key}.${innerKey}: ${formatReviewValue(innerValue)}`);
    }
    return [`${key}: ${formatReviewValue(child)}`];
  });
}

function formatReviewValue(value: unknown): string {
  if (value === undefined) {
    return "Not included";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => `${key}=${formatReviewValue(child)}`)
      .join(", ");
  }
  return String(value);
}

function formatEndpoint(value: GenerationReviewModel["endpointCategory"]) {
  if (value === "deterministic-mock") {
    return "Local deterministic mock transport";
  }
  if (value === "local-development-proxy") {
    return "Local development proxy at 127.0.0.1";
  }
  return "Backend not configured";
}
