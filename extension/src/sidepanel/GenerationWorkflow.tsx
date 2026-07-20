import { useEffect, useRef, useState } from "react";
import { getSafeGenerationMessage } from "../generation/errors";
import { prepareGenerationReview, generateFromReview } from "../generation/workflow";
import { createGenerationTransport } from "../generation/transport";
import type { ComponentGenerationResponseV1, GenerationReviewModel } from "../generation/types";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import { getUtf8ByteLength } from "../generation/canonical-json";
import { PNG_DATA_URL_PREFIX } from "../generation/limits";
import { boundText } from "./display-format";

type GenerationState =
  | { status: "closed" }
  | { status: "preparing" }
  | { status: "review"; review: GenerationReviewModel; consent: boolean; message?: string }
  | { status: "generating"; review: GenerationReviewModel }
  | { status: "succeeded"; review: GenerationReviewModel; response: ComponentGenerationResponseV1 }
  | { status: "failed"; review?: GenerationReviewModel; message: string }
  | { status: "cancelled"; review?: GenerationReviewModel; message: string };

export function GenerationWorkflow({
  savedCapture,
  imageSrc
}: {
  savedCapture: SavedCaptureReadModel;
  imageSrc: string | null;
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

  const openReview = async () => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "preparing" });

    try {
      const review = await prepareGenerationReview(savedCapture, transportConfig.endpointCategory);
      if (sequenceRef.current !== sequence) {
        return;
      }
      setState({ status: "review", review, consent: false });
    } catch (error) {
      if (sequenceRef.current !== sequence) {
        return;
      }
      setState({ status: "failed", message: getSafeGenerationMessage(error) });
    }
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
          imageSrc={imageSrc}
          consent={state.consent}
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
        <GeneratedResult response={state.response} onClose={closeFlow} onRetry={() => setState({ status: "review", review: state.review, consent: false })} />
      ) : null}
      {state.status === "failed" ? (
        <GenerationFailure
          message={state.message}
          review={state.review}
          onClose={closeFlow}
          onRetry={(review) => setState({ status: "review", review, consent: false, message: "Review again before retrying." })}
        />
      ) : null}
      {state.status === "cancelled" ? (
        <GenerationFailure
          message={state.message}
          review={state.review}
          onClose={closeFlow}
          onRetry={(review) => setState({ status: "review", review, consent: false, message: "Review again before retrying." })}
        />
      ) : null}
    </section>
  );
}

function ReviewDataView({
  review,
  imageSrc,
  consent,
  onConsentChange,
  onSubmit,
  onCancel
}: {
  review: GenerationReviewModel;
  imageSrc: string | null;
  consent: boolean;
  onConsentChange: (consent: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const requestWithoutDataUrl = review.localContext.reviewedRequestWithoutDataUrl;
  const approximateBytes = estimateRequestBytes(review);
  const context = requestWithoutDataUrl.captureContext;

  return (
    <section className="generation-review" aria-labelledby="generation-review-heading">
      <h4 id="generation-review-heading">Review data being sent</h4>
      <p className="generation-note">Displayed values are the exact outbound projection. Excluded content is not sent.</p>
      {imageSrc ? (
        <img src={imageSrc} alt="Screenshot that will be sent after consent" className="generation-review-image" />
      ) : (
        <p className="preview-image-placeholder">Screenshot preview unavailable.</p>
      )}
      <dl className="preview-metadata">
        <MetadataItem label="Decoded image size" value={`${review.screenshot.width} x ${review.screenshot.height} px`} />
        <MetadataItem label="Decoded image bytes" value={String(review.screenshot.byteLength)} />
        <MetadataItem label="Approximate request size" value={`${approximateBytes} UTF-8 bytes`} />
        <MetadataItem label="Endpoint category" value={formatEndpoint(review.endpointCategory)} />
        <MetadataItem label="Title" value={context.library.title ? boundText(context.library.title, 120) : "Not included"} />
        <MetadataItem label="Component type" value={context.library.componentType ?? "Not included"} />
        <MetadataItem label="Tags" value={context.library.tags.length ? context.library.tags.join(", ") : "No tags transmitted"} />
        <MetadataItem label="Element" value={`${context.element.tagName}${context.element.semanticRole ? ` (${context.element.semanticRole})` : ""}`} />
        <MetadataItem label="Element size" value={`${context.element.rect.width} x ${context.element.rect.height} CSS px`} />
        <MetadataItem label="Page title" value="Excluded" />
        <MetadataItem label="Source URL" value="Excluded" />
      </dl>
      <ReviewList title="DOM text previews" values={collectDomText(context.dom.sanitizedSnapshot)} />
      <ReviewList title="Transmitted attributes" values={collectAttributes(context.dom.sanitizedSnapshot)} />
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
  onRetry: (review: GenerationReviewModel) => void;
}) {
  return (
    <div className="save-state save-state-failed" role="alert">
      <p>{message}</p>
      <div className="generation-actions">
        {review ? (
          <button className="secondary-action compact-action" type="button" onClick={() => onRetry(review)}>
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
            <li key={`${title}-${index}`}>{boundText(value, 180)}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">No values transmitted.</p>
      )}
    </section>
  );
}

function collectDomText(node: GenerationReviewModel["localContext"]["reviewedRequestWithoutDataUrl"]["captureContext"]["dom"]["sanitizedSnapshot"]): string[] {
  const values: string[] = [];
  const visit = (current: typeof node) => {
    if (current.textPreview) {
      values.push(current.textPreview);
    }
    current.children.forEach(visit);
  };
  visit(node);
  return values;
}

function collectAttributes(node: GenerationReviewModel["localContext"]["reviewedRequestWithoutDataUrl"]["captureContext"]["dom"]["sanitizedSnapshot"]): string[] {
  const values: string[] = [];
  const visit = (current: typeof node) => {
    for (const [key, value] of Object.entries(current.attributes)) {
      values.push(`${key}: ${value}`);
    }
    current.children.forEach(visit);
  };
  visit(node);
  return values;
}

function summarizeObject(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    if (Array.isArray(child)) {
      return child.map((item) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`);
    }
    if (child && typeof child === "object") {
      return Object.entries(child).map(([innerKey, innerValue]) => `${key}.${innerKey}: ${String(innerValue)}`);
    }
    return [`${key}: ${String(child)}`];
  });
}

function estimateRequestBytes(review: GenerationReviewModel) {
  const placeholder = {
    ...review.localContext.reviewedRequestWithoutDataUrl,
    screenshot: {
      ...review.localContext.reviewedRequestWithoutDataUrl.screenshot,
      dataUrl: `${PNG_DATA_URL_PREFIX}<created-after-consent>`
    }
  };
  return getUtf8ByteLength(JSON.stringify(placeholder));
}

function formatEndpoint(value: GenerationReviewModel["endpointCategory"]) {
  return value === "deterministic-mock" ? "Local deterministic mock transport" : "Backend not configured";
}
