import { useEffect, useState } from "react";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import { getCaptureDisplayTitle } from "./display-format";
import { CapturePreview } from "./CapturePreview";

export type SavedCaptureDetailState =
  | {
      status: "closed";
    }
  | {
      status: "loading";
      recordId: string;
    }
  | {
      status: "loaded";
      recordId: string;
      savedCapture: SavedCaptureReadModel;
    }
  | {
      status: "failed";
      recordId: string;
      message: string;
    };

export function SavedCaptureDetail({
  detailState,
  onBack,
  onRetry
}: {
  detailState: Exclude<SavedCaptureDetailState, { status: "closed" }>;
  onBack: () => void;
  onRetry: (recordId: string) => void;
}) {
  if (detailState.status === "loading") {
    return (
      <section className="saved-capture-detail" aria-labelledby="saved-capture-detail-heading">
        <DetailHeader onBack={onBack} />
        <h2 id="saved-capture-detail-heading">Loading saved capture</h2>
        <p className="empty-note">Reading and verifying the saved capture from local persistence...</p>
      </section>
    );
  }

  if (detailState.status === "failed") {
    return (
      <section className="saved-capture-detail" aria-labelledby="saved-capture-detail-heading">
        <DetailHeader onBack={onBack} />
        <h2 id="saved-capture-detail-heading">Saved capture unavailable</h2>
        <p className="save-state save-state-failed" role="alert">
          Could not load the saved capture. {detailState.message}
        </p>
        <button className="secondary-action" type="button" onClick={() => onRetry(detailState.recordId)}>
          Retry loading
        </button>
      </section>
    );
  }

  return (
    <SavedCaptureDetailContent
      savedCapture={detailState.savedCapture}
      onBack={onBack}
    />
  );
}

function SavedCaptureDetailContent({
  savedCapture,
  onBack
}: {
  savedCapture: SavedCaptureReadModel;
  onBack: () => void;
}) {
  const currentBlob = savedCapture.asset.blob;
  const [objectUrlState, setObjectUrlState] = useState<DetailObjectUrlState>({
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

  const currentObjectUrlState: DetailObjectUrlRenderState =
    objectUrlState.blob === currentBlob ? objectUrlState : { status: "preparing" };
  const displayTitle = getCaptureDisplayTitle(savedCapture.record);

  return (
    <section className="saved-capture-detail" aria-label="Saved capture detail">
      <DetailHeader onBack={onBack} />
      {currentObjectUrlState.status === "preparing" ? (
        <p className="empty-note">Preparing saved screenshot preview...</p>
      ) : null}
      <CapturePreview
        record={savedCapture.record}
        imageSrc={currentObjectUrlState.status === "ready" ? currentObjectUrlState.objectUrl : null}
        heading={displayTitle}
        statusText="Stored locally"
        savedAt={savedCapture.savedAt}
        imageUnavailableText={
          currentObjectUrlState.status === "failed"
            ? "Saved screenshot preview unavailable."
            : "Preparing saved screenshot preview..."
        }
      />
    </section>
  );
}

function DetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="saved-detail-actions">
      <button className="secondary-action compact-action" type="button" onClick={onBack}>
        Back to Library
      </button>
    </div>
  );
}

type DetailObjectUrlState =
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

type DetailObjectUrlRenderState = DetailObjectUrlState | { status: "preparing" };
