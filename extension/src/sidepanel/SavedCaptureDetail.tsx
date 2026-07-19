import { useEffect, useRef, useState } from "react";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import {
  createLibraryMetadataInput,
  LibraryMetadataValidationError,
  normalizeLibraryMetadataInput,
  type LibraryMetadataField,
  type LibraryMetadataInput
} from "../library/library-metadata";
import { getSafePersistenceMessage } from "../storage/persistence-errors";
import { boundText, getCaptureDisplayTitle, normalizedOptionalText } from "./display-format";
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
  onRetry,
  onSaveMetadata
}: {
  detailState: Exclude<SavedCaptureDetailState, { status: "closed" }>;
  onBack: () => void;
  onRetry: (recordId: string) => void;
  onSaveMetadata: (
    recordId: string,
    input: LibraryMetadataInput,
    expectedSavedAt: string
  ) => Promise<SavedCaptureReadModel | undefined>;
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
      onSaveMetadata={onSaveMetadata}
    />
  );
}

function SavedCaptureDetailContent({
  savedCapture,
  onBack,
  onSaveMetadata
}: {
  savedCapture: SavedCaptureReadModel;
  onBack: () => void;
  onSaveMetadata: (
    recordId: string,
    input: LibraryMetadataInput,
    expectedSavedAt: string
  ) => Promise<SavedCaptureReadModel | undefined>;
}) {
  const currentBlob = savedCapture.asset.blob;
  const [objectUrlState, setObjectUrlState] = useState<DetailObjectUrlState>({
    status: "preparing",
    blob: currentBlob
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<LibraryMetadataInput>(() => createLibraryMetadataInput(savedCapture.record.library));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LibraryMetadataField, string>>>({});
  const [saveState, setSaveState] = useState<MetadataSaveState>({ status: "idle" });
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    setDraft(createLibraryMetadataInput(savedCapture.record.library));
  }, [savedCapture.record.id, savedCapture.record.library]);

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

  const startEditing = () => {
    setDraft(createLibraryMetadataInput(savedCapture.record.library));
    setFieldErrors({});
    setSaveState({ status: "idle" });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(createLibraryMetadataInput(savedCapture.record.library));
    setFieldErrors({});
    setSaveState({ status: "idle" });
    setIsEditing(false);
  };

  const handleSaveChanges = async () => {
    if (saveInFlightRef.current) {
      return;
    }

    try {
      normalizeLibraryMetadataInput(draft);
    } catch (error) {
      if (error instanceof LibraryMetadataValidationError) {
        setFieldErrors({ [error.field]: error.message });
        setSaveState({ status: "idle" });
        return;
      }

      throw error;
    }

    saveInFlightRef.current = true;
    setFieldErrors({});
    setSaveState({ status: "saving" });

    try {
      const updatedCapture = await onSaveMetadata(savedCapture.record.id, draft, savedCapture.savedAt);
      if (!updatedCapture) {
        return;
      }

      setDraft(createLibraryMetadataInput(updatedCapture.record.library));
      setIsEditing(false);
      setSaveState({ status: "success" });
    } catch (error) {
      if (error instanceof LibraryMetadataValidationError) {
        setFieldErrors({ [error.field]: error.message });
        setSaveState({ status: "idle" });
        return;
      }

      setSaveState({
        status: "failed",
        message: getSafePersistenceMessage(error)
      });
    } finally {
      saveInFlightRef.current = false;
    }
  };

  return (
    <section className="saved-capture-detail" aria-label="Saved capture detail">
      <DetailHeader onBack={onBack} />
      {currentObjectUrlState.status === "preparing" ? (
        <p className="empty-note">Preparing saved screenshot preview...</p>
      ) : null}
      {isEditing ? (
        <>
          <h2>{displayTitle}</h2>
          <LibraryMetadataEditor
            draft={draft}
            fieldErrors={fieldErrors}
            saveState={saveState}
            disabled={saveState.status === "saving"}
            onDraftChange={setDraft}
            onSave={() => void handleSaveChanges()}
            onCancel={cancelEditing}
          />
        </>
      ) : (
        <>
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
          <LibraryMetadataView
            savedCapture={savedCapture}
            saveState={saveState}
            onEdit={startEditing}
          />
        </>
      )}
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

type MetadataSaveState =
  | {
      status: "idle";
    }
  | {
      status: "saving";
    }
  | {
      status: "success";
    }
  | {
      status: "failed";
      message: string;
    };

function LibraryMetadataView({
  savedCapture,
  saveState,
  onEdit
}: {
  savedCapture: SavedCaptureReadModel;
  saveState: MetadataSaveState;
  onEdit: () => void;
}) {
  const metadata = savedCapture.record.library;
  const componentType = normalizedOptionalText(metadata.componentType);
  const notes = normalizedOptionalText(metadata.notes);

  return (
    <section className="library-metadata-panel" aria-labelledby="library-metadata-heading">
      <div className="library-metadata-header">
        <h3 id="library-metadata-heading">Library metadata</h3>
        <button className="secondary-action compact-action" type="button" onClick={onEdit}>
          Edit metadata
        </button>
      </div>
      {saveState.status === "success" ? (
        <p className="save-state save-state-saved" role="status">
          Metadata saved locally.
        </p>
      ) : null}
      <dl className="preview-metadata">
        <MetadataItem label="Component type" value={componentType ? boundText(componentType, 96) : "Not set"} />
        <MetadataItem label="Tags" value={metadata.tags.length ? metadata.tags.map((tag) => boundText(tag, 48)).join(", ") : "No tags"} />
        <MetadataItem label="Notes" value={notes ? boundText(notes, 240) : "No notes"} multiline />
      </dl>
    </section>
  );
}

function LibraryMetadataEditor({
  draft,
  fieldErrors,
  saveState,
  disabled,
  onDraftChange,
  onSave,
  onCancel
}: {
  draft: LibraryMetadataInput;
  fieldErrors: Partial<Record<LibraryMetadataField, string>>;
  saveState: MetadataSaveState;
  disabled: boolean;
  onDraftChange: (draft: LibraryMetadataInput) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="library-metadata-panel" aria-labelledby="metadata-editor-heading">
      <h3 id="metadata-editor-heading">Edit library metadata</h3>
      <div className="metadata-form">
        <MetadataField
          id="metadata-title"
          label="Title"
          value={draft.title}
          error={fieldErrors.title}
          disabled={disabled}
          onChange={(value) => onDraftChange({ ...draft, title: value })}
        />
        <MetadataField
          id="metadata-component-type"
          label="Component type"
          value={draft.componentType}
          error={fieldErrors.componentType}
          disabled={disabled}
          onChange={(value) => onDraftChange({ ...draft, componentType: value })}
        />
        <MetadataTextArea
          id="metadata-tags"
          label="Tags"
          value={draft.tags}
          helpText="Separate tags with commas or new lines."
          error={fieldErrors.tags}
          disabled={disabled}
          onChange={(value) => onDraftChange({ ...draft, tags: value })}
        />
        <MetadataTextArea
          id="metadata-notes"
          label="Notes"
          value={draft.notes}
          error={fieldErrors.notes}
          disabled={disabled}
          onChange={(value) => onDraftChange({ ...draft, notes: value })}
        />
      </div>
      <div className="metadata-actions">
        <button className="primary-action" type="button" onClick={onSave} disabled={disabled}>
          {saveState.status === "saving" ? "Saving changes..." : "Save changes"}
        </button>
        <button className="secondary-action" type="button" onClick={onCancel} disabled={disabled}>
          Cancel editing
        </button>
      </div>
      <MetadataSaveStatus saveState={saveState} onRetry={onSave} />
    </section>
  );
}

function MetadataField({
  id,
  label,
  value,
  error,
  disabled,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="metadata-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={1}
        value={value}
        disabled={disabled}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="metadata-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MetadataTextArea({
  id,
  label,
  value,
  helpText,
  error,
  disabled,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  helpText?: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const descriptionIds = [helpText ? `${id}-help` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="metadata-field">
      <label htmlFor={id}>{label}</label>
      {helpText ? (
        <p id={`${id}-help`} className="metadata-help">
          {helpText}
        </p>
      ) : null}
      <textarea
        id={id}
        value={value}
        rows={id === "metadata-notes" ? 5 : 3}
        disabled={disabled}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={descriptionIds || undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="metadata-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MetadataSaveStatus({
  saveState,
  onRetry
}: {
  saveState: MetadataSaveState;
  onRetry: () => void;
}) {
  if (saveState.status === "saving") {
    return (
      <p className="save-state save-state-saving" role="status">
        Saving changes...
      </p>
    );
  }

  if (saveState.status === "failed") {
    return (
      <div className="save-state save-state-failed" role="alert">
        <p>Could not save metadata. {saveState.message}</p>
        <button className="secondary-action compact-action" type="button" onClick={onRetry}>
          Retry save
        </button>
      </div>
    );
  }

  return null;
}

function MetadataItem({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={multiline ? "metadata-notes-value" : undefined}>{value}</dd>
    </div>
  );
}
