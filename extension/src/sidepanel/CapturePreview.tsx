import { useEffect, useState } from "react";
import type { CaptureRecord } from "../shared/capture-schema";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import { boundText, formatNumber, formatSourceLocation, formatTimestamp } from "./display-format";

const MAX_CHILDREN = 5;

export function CapturePreview({
  record,
  imageSrc,
  heading,
  statusText,
  savedAt
}: {
  record: CaptureRecord;
  imageSrc: string;
  heading: string;
  statusText: string;
  savedAt?: string;
}) {
  const screenshot = record.assets.screenshot;
  const childSummaries = record.dom.childSummary.slice(0, MAX_CHILDREN);

  return (
    <section className="capture-preview" aria-labelledby={`${record.id}-preview-heading`}>
      <div className="preview-header">
        <div>
          <p className="eyebrow">Capture Preview</p>
          <h2 id={`${record.id}-preview-heading`}>{heading}</h2>
        </div>
        <p className="preview-status">{statusText}</p>
      </div>

      <img src={imageSrc} alt="Cropped screenshot preview of the selected element" className="preview-image" />

      <dl className="preview-metadata">
        <PreviewItem label="Page title" value={boundText(record.source.pageTitle)} />
        <PreviewItem label="Source" value={formatSourceLocation(record.source.url)} />
        <PreviewItem label="Tag" value={record.element.tagName} />
        {record.element.semanticRole ? <PreviewItem label="Role" value={record.element.semanticRole} /> : null}
        {record.element.id ? <PreviewItem label="Element id" value={record.element.id} /> : null}
        {record.summaries.componentType ? (
          <PreviewItem label="Component type" value={record.summaries.componentType} />
        ) : null}
        <PreviewItem
          label="Element size"
          value={`${formatNumber(record.element.rect.width)} x ${formatNumber(record.element.rect.height)} CSS px`}
        />
        <PreviewItem label="Image size" value={`${screenshot.width} x ${screenshot.height} px`} />
        <PreviewItem
          label="Visible crop"
          value={`${formatNumber(screenshot.crop.width)} x ${formatNumber(screenshot.crop.height)} CSS px`}
        />
        {record.element.textPreview ? (
          <PreviewItem label="Text preview" value={boundText(record.element.textPreview)} />
        ) : null}
        {savedAt ? <PreviewItem label="Saved at" value={formatTimestamp(savedAt)} /> : null}
      </dl>

      <section className="preview-section" aria-label="Design summaries">
        <h3>Design summaries</h3>
        <SummaryGrid record={record} />
      </section>

      <section className="preview-section" aria-label="Sanitized structure">
        <h3>Sanitized structure</h3>
        <dl className="preview-metadata">
          <PreviewItem label="Root tag" value={record.dom.sanitizedSnapshot.tagName} />
          <PreviewItem label="Direct children" value={String(record.dom.sanitizedSnapshot.children.length)} />
        </dl>
        {childSummaries.length ? (
          <ul className="structure-list">
            {childSummaries.map((child, index) => (
              <li key={`${child.tagName}-${index}`}>
                <span>{child.tagName}</span>
                {child.semanticRole ? <span>{child.semanticRole}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-note">No child elements summarized.</p>
        )}
      </section>

      <details className="technical-details">
        <summary>Technical details</summary>
        <dl className="preview-metadata">
          <PreviewItem label="Record id" value={record.id} />
          <PreviewItem label="Created at" value={formatTimestamp(record.createdAt)} />
          <PreviewItem label="Storage key" value={record.assets.screenshot.storageKey} />
        </dl>
      </details>
    </section>
  );
}

export function SavedCapturePreview({ savedCapture }: { savedCapture: SavedCaptureReadModel }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextObjectUrl = URL.createObjectURL(savedCapture.asset.blob);
    setObjectUrl(nextObjectUrl);

    return () => {
      URL.revokeObjectURL(nextObjectUrl);
    };
  }, [savedCapture.asset.blob]);

  if (!objectUrl) {
    return <p className="empty-note">Preparing saved screenshot preview...</p>;
  }

  return (
    <CapturePreview
      record={savedCapture.record}
      imageSrc={objectUrl}
      heading="Latest saved capture"
      statusText="Stored locally"
      savedAt={savedCapture.savedAt}
    />
  );
}

function SummaryGrid({ record }: { record: CaptureRecord }) {
  return (
    <div className="summary-grid">
      <SummaryCard title="Typography" values={summarizeObject(record.summaries.typography)} />
      <SummaryCard title="Colors" values={summarizeObject(record.summaries.colors)} />
      <SummaryCard title="Layout" values={summarizeObject(record.summaries.layout)} />
      <SummaryCard title="Spacing" values={summarizeObject(record.summaries.spacing)} />
    </div>
  );
}

function SummaryCard({ title, values }: { title: string; values: string[] }) {
  return (
    <article className="summary-card">
      <h4>{title}</h4>
      {values.length ? (
        <ul>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p>No prominent values.</p>
      )}
    </article>
  );
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function summarizeObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value)
    .slice(0, 5)
    .map(([key, childValue]) => `${formatLabel(key)}: ${summarizeValue(childValue)}`)
    .filter((item) => item.length > 0);
}

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.slice(0, 4).map(summarizeValue).join(", ");
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .slice(0, 4)
      .map(([key, childValue]) => `${key} ${String(childValue)}`)
      .join(", ");
  }

  return String(value);
}

function formatLabel(value: string) {
  return value.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}
