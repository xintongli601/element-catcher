import { useEffect, useRef, useState, type RefObject } from "react";
import type { DeletedSavedCaptureResult, SavedCaptureReadModel } from "../storage/capture-save";
import {
  createLibraryMetadataInput,
  LibraryMetadataValidationError,
  normalizeLibraryMetadataInput,
  type LibraryMetadataField,
  type LibraryMetadataInput
} from "../library/library-metadata";
import { getSafePersistenceMessage } from "../storage/persistence-errors";
import { listGeneratedComponentVersionUnionBySourceCaptureId } from "../storage/indexed-db";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract";
import { boundText, getCaptureDisplayTitle, normalizedOptionalText } from "./display-format";
import { CapturePreview } from "./CapturePreview";
import { GenerationWorkflow } from "./GenerationWorkflow";
import { PreviewSandbox } from "./PreviewSandbox";
import { RevisionWorkflow } from "./RevisionWorkflow";
import { VersionComparison } from "./VersionComparison";
import { GeneratedVersionExport } from "./GeneratedVersionExport";
import { GeneratedVersionBundleExport } from "./GeneratedVersionBundleExport";
import { GitHubVersionExport } from "./GitHubVersionExport";

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
  onSaveMetadata,
  onDeleteCapture
}: {
  detailState: Exclude<SavedCaptureDetailState, { status: "closed" }>;
  onBack: () => void;
  onRetry: (recordId: string) => void;
  onSaveMetadata: (
    recordId: string,
    input: LibraryMetadataInput,
    expectedSavedAt: string
  ) => Promise<SavedCaptureReadModel | undefined>;
  onDeleteCapture: (recordId: string, expectedSavedAt: string) => Promise<DeletedSavedCaptureResult | undefined>;
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
      onDeleteCapture={onDeleteCapture}
    />
  );
}

function SavedCaptureDetailContent({
  savedCapture,
  onBack,
  onSaveMetadata,
  onDeleteCapture
}: {
  savedCapture: SavedCaptureReadModel;
  onBack: () => void;
  onSaveMetadata: (
    recordId: string,
    input: LibraryMetadataInput,
    expectedSavedAt: string
  ) => Promise<SavedCaptureReadModel | undefined>;
  onDeleteCapture: (recordId: string, expectedSavedAt: string) => Promise<DeletedSavedCaptureResult | undefined>;
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
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: "idle" });
  const [versionsRefreshKey, setVersionsRefreshKey] = useState(0);
  const saveInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setDraft(createLibraryMetadataInput(savedCapture.record.library));
    setDeleteState({ status: "idle" });
  }, [savedCapture.record.id, savedCapture.record.library]);

  useEffect(() => {
    if (deleteState.status === "confirming" || deleteState.status === "failed") {
      deleteConfirmButtonRef.current?.focus();
    }
  }, [deleteState.status]);

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
    setDeleteState({ status: "idle" });
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

  const startDeletion = () => {
    setDeleteState({ status: "confirming" });
  };

  const cancelDeletion = () => {
    if (deleteInFlightRef.current) {
      return;
    }

    setDeleteState({ status: "idle" });
    requestAnimationFrame(() => deleteButtonRef.current?.focus());
  };

  const handleDeleteCapture = async () => {
    if (deleteInFlightRef.current) {
      return;
    }

    deleteInFlightRef.current = true;
    setDeleteState({ status: "deleting" });

    try {
      const deletedCapture = await onDeleteCapture(savedCapture.record.id, savedCapture.savedAt);
      if (!deletedCapture) {
        setDeleteState({ status: "confirming" });
      }
    } catch (error) {
      setDeleteState({
        status: "failed",
        message: getSafePersistenceMessage(error)
      });
    } finally {
      deleteInFlightRef.current = false;
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
      ) : deleteState.status !== "idle" ? (
        <>
          <h2>{displayTitle}</h2>
          <DeleteCaptureConfirmation
            deleteState={deleteState}
            confirmButtonRef={deleteConfirmButtonRef}
            onConfirm={() => void handleDeleteCapture()}
            onCancel={cancelDeletion}
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
          <GenerationWorkflow
            savedCapture={savedCapture}
            onGeneratedVersionSaved={() => setVersionsRefreshKey((current) => current + 1)}
          />
          <GeneratedVersionsSection
            savedCapture={savedCapture}
            sourceCaptureId={savedCapture.record.id}
            refreshKey={versionsRefreshKey}
            onGeneratedVersionSaved={() => setVersionsRefreshKey((current) => current + 1)}
          />
          <DeleteCapturePanel onDelete={startDeletion} deleteButtonRef={deleteButtonRef} />
        </>
      )}
    </section>
  );
}

function GeneratedVersionsSection({
  savedCapture,
  sourceCaptureId,
  refreshKey,
  onGeneratedVersionSaved
}: {
  savedCapture: SavedCaptureReadModel;
  sourceCaptureId: string;
  refreshKey: number;
  onGeneratedVersionSaved: () => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; versions: GeneratedComponentVersionEntry[] }
    | { status: "failed"; message: string }
  >({ status: "loading" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewOpenId, setPreviewOpenId] = useState<string | null>(null);
  const [revisionSourceId, setRevisionSourceId] = useState<string | null>(null);
  const previousSourceCaptureIdRef = useRef(sourceCaptureId);

  useEffect(() => {
    let cancelled = false;
    const sourceChanged = previousSourceCaptureIdRef.current !== sourceCaptureId;
    previousSourceCaptureIdRef.current = sourceCaptureId;
    if (sourceChanged) {
      setExpandedId(null);
      setPreviewOpenId(null);
      setRevisionSourceId(null);
      setState({ status: "loading" });
    } else {
      setState((current) => (current.status === "loaded" ? current : { status: "loading" }));
    }
    listGeneratedComponentVersionUnionBySourceCaptureId(sourceCaptureId)
      .then((versions) => {
        if (!cancelled) {
          setState({ status: "loaded", versions });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: "failed", message: getSafePersistenceMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceCaptureId, refreshKey]);

  return (
    <section className="generated-versions" aria-labelledby="generated-versions-heading">
      <h3 id="generated-versions-heading">Generated versions</h3>
      {state.status === "loading" ? <p className="empty-note">Loading generated versions...</p> : null}
      {state.status === "failed" ? (
        <p className="save-state save-state-failed" role="alert">
          Could not load generated versions. {state.message}
        </p>
      ) : null}
      {state.status === "loaded" ? (
        <>
          <p className="empty-note">{state.versions.length} generated version{state.versions.length === 1 ? "" : "s"} saved locally.</p>
          {state.versions.length === 0 ? <p className="empty-note">No generated versions saved yet.</p> : null}
          {state.versions.length > 0 ? (
            <VersionComparison key={sourceCaptureId} versions={state.versions} sourceCaptureId={sourceCaptureId} />
          ) : null}
          {state.versions.map((entry) => {
            const expanded = expandedId === entry.id;
            const revisionOpen = revisionSourceId === entry.id;
            return (
              <article className="generated-version-item" key={entry.id}>
                <button
                  className="secondary-action compact-action"
                  type="button"
                  onClick={() => {
                    setExpandedId(expanded ? null : entry.id);
                    setPreviewOpenId(null);
                  }}
                >
                  {entry.value.componentName} - {entry.createdAt}
                </button>
                {expanded ? (
                  <div className="generated-version-details">
                    <dl className="preview-metadata">
                      <MetadataItem label="Version kind" value={describeGeneratedVersionKind(entry)} />
                      <MetadataItem label="Source generated version" value={getSourceGeneratedVersionLabel(entry, state.versions)} />
                      <MetadataItem label="Screenshot state" value={getGeneratedVersionScreenshotState(entry)} />
                      <MetadataItem label="Summary" value={entry.value.summary} multiline />
                      <MetadataItem label="Approximation notes" value={entry.value.approximationNotes || "No notes"} multiline />
                      {getRevisionInstruction(entry) ? (
                        <MetadataItem label="Revision instruction" value={getRevisionInstruction(entry) ?? ""} multiline />
                      ) : null}
                    </dl>
                    <pre className="generated-code"><code>{entry.value.code}</code></pre>
                    <GeneratedVersionExport entry={entry} sourceCaptureId={sourceCaptureId} />
                    <GeneratedVersionBundleExport
                      key={`${sourceCaptureId}:${entry.id}:${entry.createdAt}:${entry.value.componentName}`}
                      entry={entry}
                      sourceCaptureId={sourceCaptureId}
                    />
                    <GitHubVersionExport entry={entry} sourceCaptureId={sourceCaptureId} />
                    <button
                      className="secondary-action compact-action"
                      type="button"
                      onClick={() => setPreviewOpenId(previewOpenId === entry.id ? null : entry.id)}
                    >
                      {previewOpenId === entry.id ? "Close preview" : "Preview"}
                    </button>
                    {previewOpenId === entry.id ? <PreviewSandbox entry={entry} onClose={() => setPreviewOpenId(null)} /> : null}
                    <button
                      className="secondary-action compact-action"
                      type="button"
                      onClick={() => {
                        setPreviewOpenId(null);
                        setRevisionSourceId(revisionOpen ? null : entry.id);
                      }}
                    >
                      {revisionOpen ? "Close revision tools" : "Revise or regenerate"}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
          {revisionSourceId ? (
            <SelectedRevisionWorkflow
              savedCapture={savedCapture}
              versions={state.versions}
              revisionSourceId={revisionSourceId}
              onSaved={onGeneratedVersionSaved}
              onCancelSelection={() => setRevisionSourceId(null)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function SelectedRevisionWorkflow({
  savedCapture,
  versions,
  revisionSourceId,
  onSaved,
  onCancelSelection
}: {
  savedCapture: SavedCaptureReadModel;
  versions: GeneratedComponentVersionEntry[];
  revisionSourceId: string;
  onSaved: () => void;
  onCancelSelection: () => void;
}) {
  const sourceEntry = versions.find((entry) => entry.id === revisionSourceId);
  if (!sourceEntry) {
    return (
      <p className="save-state save-state-failed" role="alert">
        Selected source generated version is no longer available. Choose another saved version.
      </p>
    );
  }
  return (
    <RevisionWorkflow
      key={`${savedCapture.record.id}:${sourceEntry.id}`}
      savedCapture={savedCapture}
      sourceEntry={sourceEntry}
      onSaved={onSaved}
      onCancelSelection={onCancelSelection}
    />
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

function describeGeneratedVersionKind(entry: GeneratedComponentVersionEntry) {
  if ("contractVersion" in entry && entry.contractVersion === 2) {
    return entry.operation.kind === "revision" ? "Revision" : "Regeneration";
  }
  return "Initial generation";
}

function getSourceGeneratedVersionLabel(entry: GeneratedComponentVersionEntry, versions: GeneratedComponentVersionEntry[]) {
  if (!("contractVersion" in entry) || entry.contractVersion !== 2) {
    return "None";
  }
  const ancestor = versions.find((candidate) => candidate.id === entry.operation.sourceGeneratedVersionId);
  return ancestor ? `${ancestor.value.componentName} - ${ancestor.createdAt}` : `${entry.operation.sourceGeneratedVersionId} (missing ancestor)`;
}

function getGeneratedVersionScreenshotState(entry: GeneratedComponentVersionEntry) {
  if ("contractVersion" in entry && entry.contractVersion === 2) {
    return entry.operation.screenshotIncluded ? "Included in revision request" : "Not included in revision request";
  }
  return "Initial generation screenshot policy";
}

function getRevisionInstruction(entry: GeneratedComponentVersionEntry) {
  if ("contractVersion" in entry && entry.contractVersion === 2 && entry.operation.kind === "revision") {
    return entry.operation.instruction;
  }
  return undefined;
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

type DeleteState =
  | {
      status: "idle";
    }
  | {
      status: "confirming";
    }
  | {
      status: "deleting";
    }
  | {
      status: "failed";
      message: string;
    };

function DeleteCapturePanel({
  onDelete,
  deleteButtonRef
}: {
  onDelete: () => void;
  deleteButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section className="delete-panel" aria-labelledby="delete-capture-panel-heading">
      <div>
        <h3 id="delete-capture-panel-heading">Delete capture</h3>
        <p>This removes the saved capture and screenshot asset from local browser storage.</p>
      </div>
      <button ref={deleteButtonRef} className="danger-action compact-action" type="button" onClick={onDelete}>
        Delete capture
      </button>
    </section>
  );
}

function DeleteCaptureConfirmation({
  deleteState,
  confirmButtonRef,
  onConfirm,
  onCancel
}: {
  deleteState: Exclude<DeleteState, { status: "idle" }>;
  confirmButtonRef: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDeleting = deleteState.status === "deleting";

  return (
    <section
      className="delete-confirmation"
      role="alertdialog"
      aria-labelledby="delete-capture-heading"
      aria-describedby="delete-capture-description"
    >
      <h3 id="delete-capture-heading">Delete this capture?</h3>
      <p id="delete-capture-description" className="delete-warning">
        This capture and its screenshot will be permanently removed from this browser and cannot be undone.
      </p>
      {isDeleting ? (
        <p className="save-state save-state-saving" role="status">
          Deleting capture...
        </p>
      ) : null}
      {deleteState.status === "failed" ? (
        <p className="save-state save-state-failed" role="alert">
          Could not delete capture. {deleteState.message}
        </p>
      ) : null}
      <div className="delete-actions">
        <button
          ref={confirmButtonRef}
          className="danger-action"
          type="button"
          onClick={onConfirm}
          disabled={isDeleting}
        >
          {deleteState.status === "failed" ? "Retry deletion" : "Delete permanently"}
        </button>
        <button className="secondary-action" type="button" onClick={onCancel} disabled={isDeleting}>
          Cancel deletion
        </button>
      </div>
    </section>
  );
}

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
