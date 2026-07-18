import { useEffect, useState } from "react";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import {
  boundText,
  formatSourceLocation,
  formatTimestamp,
  MAX_LIBRARY_TEXT_LENGTH,
  normalizedOptionalText
} from "./display-format";

export type CaptureLibraryState =
  | {
      status: "loading";
    }
  | {
      status: "empty";
    }
  | {
      status: "loaded";
      savedCaptures: SavedCaptureReadModel[];
    }
  | {
      status: "failed";
      message: string;
    };

export function CaptureLibrary({
  libraryState,
  onRetry
}: {
  libraryState: CaptureLibraryState;
  onRetry: () => void;
}) {
  const loadedCount = libraryState.status === "loaded" ? libraryState.savedCaptures.length : 0;

  return (
    <section className="capture-library" aria-labelledby="capture-library-heading">
      <div className="capture-library-header">
        <div>
          <p className="eyebrow">Local Library</p>
          <h2 id="capture-library-heading">Capture Library</h2>
        </div>
        {libraryState.status === "loaded" ? <p className="library-count">{loadedCount}</p> : null}
        {libraryState.status === "failed" ? (
          <button className="secondary-action compact-action" type="button" onClick={onRetry}>
            Retry loading
          </button>
        ) : null}
      </div>

      {libraryState.status === "loading" ? <p className="empty-note">Loading local captures...</p> : null}
      {libraryState.status === "empty" ? <p className="empty-note">No explicitly saved captures yet.</p> : null}
      {libraryState.status === "failed" ? (
        <p className="save-state save-state-failed" role="alert">
          Could not load the Capture Library. {libraryState.message}
        </p>
      ) : null}
      {libraryState.status === "loaded" ? (
        <ul className="capture-library-list" aria-label="Saved captures">
          {libraryState.savedCaptures.map((savedCapture) => (
            <CaptureLibraryItem key={savedCapture.record.id} savedCapture={savedCapture} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CaptureLibraryItem({ savedCapture }: { savedCapture: SavedCaptureReadModel }) {
  const currentBlob = savedCapture.asset.blob;
  const [objectUrlState, setObjectUrlState] = useState<ObjectUrlState>({
    status: "preparing",
    blob: currentBlob
  });

  useEffect(() => {
    let nextObjectUrl: string | null = null;

    try {
      nextObjectUrl = URL.createObjectURL(currentBlob);
      setObjectUrlState({ status: "ready", blob: currentBlob, objectUrl: nextObjectUrl });
    } catch {
      setObjectUrlState({ status: "failed", blob: currentBlob });
    }

    return () => {
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [currentBlob]);

  const displayTitle = getLibraryDisplayTitle(savedCapture);
  const componentType =
    normalizedOptionalText(savedCapture.record.library.componentType) ??
    normalizedOptionalText(savedCapture.record.summaries.componentType);
  const currentObjectUrlState: ObjectUrlRenderState =
    objectUrlState.blob === currentBlob ? objectUrlState : { status: "preparing" };

  return (
    <li className="capture-library-item">
      <div className="library-thumbnail-frame">
        {currentObjectUrlState.status === "ready" ? (
          <img
            className="library-thumbnail"
            src={currentObjectUrlState.objectUrl}
            alt={`Saved screenshot preview for ${displayTitle}`}
          />
        ) : null}
        {currentObjectUrlState.status === "preparing" ? (
          <span className="library-thumbnail-note">Preparing preview...</span>
        ) : null}
        {currentObjectUrlState.status === "failed" ? (
          <span className="library-thumbnail-note">Preview unavailable</span>
        ) : null}
      </div>

      <div className="library-item-body">
        <h3>{displayTitle}</h3>
        {componentType ? <p className="library-component-type">{boundText(componentType, 48)}</p> : null}
        <p>{formatSourceLocation(savedCapture.record.source.url)}</p>
        <p>Saved {formatTimestamp(savedCapture.savedAt)}</p>
      </div>
    </li>
  );
}

type ObjectUrlState =
  | {
      status: "preparing";
      blob: Blob;
    }
  | {
      status: "ready";
      blob: Blob;
      objectUrl: string;
    }
  | {
      status: "failed";
      blob: Blob;
    };

type ObjectUrlRenderState = ObjectUrlState | { status: "preparing" };

function getLibraryDisplayTitle(savedCapture: SavedCaptureReadModel) {
  const record = savedCapture.record;
  const fallbackTitle =
    normalizedOptionalText(record.library.title) ??
    normalizedOptionalText(record.library.componentType) ??
    normalizedOptionalText(record.summaries.componentType) ??
    `${record.element.tagName.toLowerCase()} capture`;

  return boundText(fallbackTitle, MAX_LIBRARY_TEXT_LENGTH);
}
