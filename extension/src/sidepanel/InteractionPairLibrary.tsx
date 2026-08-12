import { useEffect, useMemo, useState } from "react";
import { INTERACTION_PAIR_TRIGGERS, type InteractionPairCreateInput, type InteractionPairTrigger } from "../shared/interaction-pair-contract";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import type { InteractionPairReadModel } from "../storage/interaction-pair";
import { boundText, formatTimestamp, getCaptureDisplayTitle } from "./display-format";

type PairSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; message: string }
  | { status: "failed"; message: string };

type PairDeleteState =
  | { status: "idle" }
  | { status: "deleting"; id: string }
  | { status: "failed"; id: string; message: string };

export function InteractionPairLibrary({
  savedCaptures,
  interactionPairs,
  onSaveInteractionPair,
  onDeleteInteractionPair
}: {
  savedCaptures: SavedCaptureReadModel[];
  interactionPairs: InteractionPairReadModel[];
  onSaveInteractionPair: (input: InteractionPairCreateInput) => Promise<void>;
  onDeleteInteractionPair: (id: string) => Promise<void>;
}) {
  const initialBaseId = savedCaptures[0]?.record.id ?? "";
  const [baseCaptureId, setBaseCaptureId] = useState(initialBaseId);
  const [alternateCaptureId, setAlternateCaptureId] = useState(savedCaptures.find((capture) => capture.record.id !== initialBaseId)?.record.id ?? "");
  const [additionalReactionCaptureIds, setAdditionalReactionCaptureIds] = useState<string[]>([]);
  const [trigger, setTrigger] = useState<InteractionPairTrigger>("click");
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<PairSaveState>({ status: "idle" });
  const [deleteState, setDeleteState] = useState<PairDeleteState>({ status: "idle" });
  const [openPairId, setOpenPairId] = useState<string | null>(interactionPairs[0]?.pair.id ?? null);
  const captureOptions = useMemo(
    () =>
      savedCaptures.map((savedCapture) => ({
        id: savedCapture.record.id,
        label: getCaptureDisplayTitle(savedCapture.record)
      })),
    [savedCaptures]
  );

  useEffect(() => {
    const captureIds = new Set(savedCaptures.map((capture) => capture.record.id));
    const effectiveBaseId = baseCaptureId && captureIds.has(baseCaptureId) ? baseCaptureId : initialBaseId;

    setBaseCaptureId((currentBaseId) => (!currentBaseId || !captureIds.has(currentBaseId) ? initialBaseId : currentBaseId));
    setAlternateCaptureId((currentAlternateId) => {
      if (currentAlternateId && captureIds.has(currentAlternateId) && currentAlternateId !== effectiveBaseId) {
        return currentAlternateId;
      }
      return savedCaptures.find((capture) => capture.record.id !== effectiveBaseId)?.record.id ?? "";
    });
    setAdditionalReactionCaptureIds((currentIds) =>
      currentIds.filter((captureId, index, allIds) => {
        return captureIds.has(captureId) && captureId !== effectiveBaseId && captureId !== alternateCaptureId && allIds.indexOf(captureId) === index;
      })
    );
  }, [alternateCaptureId, baseCaptureId, initialBaseId, savedCaptures]);

  useEffect(() => {
    if (openPairId && interactionPairs.some((readModel) => readModel.pair.id === openPairId)) {
      return;
    }
    setOpenPairId(interactionPairs[0]?.pair.id ?? null);
  }, [interactionPairs, openPairId]);

  const canSave = Boolean(
    savedCaptures.length >= 2 &&
      baseCaptureId &&
      alternateCaptureId &&
      baseCaptureId !== alternateCaptureId &&
      additionalReactionCaptureIds.every((captureId, index, allIds) => {
        return captureId !== baseCaptureId && captureId !== alternateCaptureId && allIds.indexOf(captureId) === index;
      }) &&
      saveState.status !== "saving"
  );

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setSaveState({ status: "saving" });
    try {
      await onSaveInteractionPair({
        title,
        baseCaptureId,
        alternateCaptureId,
        additionalReactionCaptureIds,
        trigger
      });
      setTitle("");
      setAdditionalReactionCaptureIds([]);
      setSaveState({ status: "saved", message: "Interaction Pair saved locally." });
    } catch (error) {
      setSaveState({
        status: "failed",
        message: error instanceof Error ? error.message : "Interaction Pair could not be saved."
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteState.status === "deleting") {
      return;
    }
    setDeleteState({ status: "deleting", id });
    try {
      await onDeleteInteractionPair(id);
      setDeleteState({ status: "idle" });
    } catch (error) {
      setDeleteState({
        status: "failed",
        id,
        message: error instanceof Error ? error.message : "Interaction Pair could not be deleted."
      });
    }
  };

  return (
    <section className="interaction-pairs" aria-labelledby="interaction-pairs-heading">
      <div className="interaction-pairs-header">
        <div>
          <p className="eyebrow">Two-State V1</p>
          <h3 id="interaction-pairs-heading">Interaction Pairs</h3>
        </div>
        <p className="library-count">{interactionPairs.length}</p>
      </div>

      <section className="interaction-pair-builder" aria-labelledby="interaction-pair-builder-heading">
        <h4 id="interaction-pair-builder-heading">Create Interaction Pair</h4>
        <div className="interaction-pair-grid">
          <label className="library-query-field">
            <span>Trigger / Before</span>
            <select value={baseCaptureId} onChange={(event) => setBaseCaptureId(event.currentTarget.value)}>
              {captureOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="library-query-field">
            <span>Primary Reaction</span>
            <select value={alternateCaptureId} onChange={(event) => setAlternateCaptureId(event.currentTarget.value)}>
              {captureOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="library-query-field">
            <span>Interaction</span>
            <select aria-label="Interaction trigger" value={trigger} onChange={(event) => setTrigger(event.currentTarget.value as InteractionPairTrigger)}>
              {INTERACTION_PAIR_TRIGGERS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="library-query-field">
            <span>Additional Reactions</span>
            <select
              multiple
              value={additionalReactionCaptureIds}
              onChange={(event) =>
                setAdditionalReactionCaptureIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))
              }
            >
              {captureOptions
                .filter((option) => option.id !== baseCaptureId && option.id !== alternateCaptureId)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="library-query-field">
            <span>Interaction title</span>
            <input value={title} maxLength={80} onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Optional" />
          </label>
        </div>
        <button className="primary-action compact-action" type="button" onClick={() => void handleSave()} disabled={!canSave}>
          Save Interaction Pair
        </button>
        {savedCaptures.length < 2 ? (
          <p className="empty-note">Save at least two captures to create an Interaction Pair.</p>
        ) : null}
        {baseCaptureId === alternateCaptureId && savedCaptures.length >= 2 ? (
          <p className="save-state save-state-failed" role="alert">
            Trigger / Before and Primary Reaction must be different saved captures.
          </p>
        ) : null}
        {saveState.status === "saving" ? <p className="save-state save-state-saving">Saving Interaction Pair...</p> : null}
        {saveState.status === "saved" ? (
          <p className="save-state save-state-saved" role="status">
            {saveState.message}
          </p>
        ) : null}
        {saveState.status === "failed" ? (
          <p className="save-state save-state-failed" role="alert">
            {saveState.message}
          </p>
        ) : null}
      </section>

      {interactionPairs.length ? (
        <ul className="interaction-pair-list" aria-label="Saved interaction pairs">
          {interactionPairs.map((readModel) => (
            <InteractionPairItem
              key={readModel.pair.id}
              readModel={readModel}
              isOpen={readModel.pair.id === openPairId}
              deleteState={deleteState}
              onOpen={() => setOpenPairId(readModel.pair.id)}
              onDelete={() => void handleDelete(readModel.pair.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="empty-note">No saved Interaction Pairs yet.</p>
      )}
    </section>
  );
}

function InteractionPairItem({
  readModel,
  isOpen,
  deleteState,
  onOpen,
  onDelete
}: {
  readModel: InteractionPairReadModel;
  isOpen: boolean;
  deleteState: PairDeleteState;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const title = getInteractionPairTitle(readModel);
  const transitionText = `${readModel.baseCapture ? getCaptureDisplayTitle(readModel.baseCapture.record) : "Missing trigger / before"} --${readModel.pair.trigger}--> ${readModel.alternateCapture ? getCaptureDisplayTitle(readModel.alternateCapture.record) : "Missing primary reaction"}`;
  const isDeleting = deleteState.status === "deleting" && deleteState.id === readModel.pair.id;
  const deleteFailed = deleteState.status === "failed" && deleteState.id === readModel.pair.id;

  return (
    <li className="interaction-pair-item">
      <button className="library-open-button" type="button" onClick={onOpen} aria-label={`Open interaction pair: ${title}`}>
        <span className="library-item-body">
          <span className="library-item-title">{title}</span>
          <span>{transitionText}</span>
          <span>Saved {formatTimestamp(readModel.pair.createdAt)}</span>
        </span>
      </button>
      {isOpen ? (
        <section className="interaction-pair-detail" aria-label={`Interaction Pair detail: ${title}`}>
          <h4>{title}</h4>
          <p className="interaction-transition">{transitionText}</p>
          {readModel.missingCaptureIds.length ? (
            <p className="save-state save-state-failed" role="alert">
              This Interaction Pair is incomplete because one or more referenced captures are missing. Delete the pair or recreate it from available captures.
            </p>
          ) : null}
          <dl className="preview-metadata">
            <MetadataItem label="Interaction" value={readModel.pair.trigger} />
            <MetadataItem label="Trigger / Before" value={readModel.baseCapture ? getCaptureDisplayTitle(readModel.baseCapture.record) : "Missing"} />
            <MetadataItem label="Primary Reaction" value={readModel.alternateCapture ? getCaptureDisplayTitle(readModel.alternateCapture.record) : "Missing"} />
            <MetadataItem label="Additional Reactions" value={String(readModel.additionalReactionCaptures.length)} />
          </dl>
          <div className="interaction-state-grid">
            <InteractionStatePreview label="Trigger / Before" savedCapture={readModel.baseCapture} />
            <InteractionStatePreview label="Primary Reaction" savedCapture={readModel.alternateCapture} />
            {readModel.additionalReactionCaptures.map((reaction, index) => (
              <InteractionStatePreview key={reaction.id} label={`Additional Reaction ${index + 1}`} savedCapture={reaction.capture} />
            ))}
          </div>
          <button className="danger-action compact-action" type="button" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete Interaction Pair"}
          </button>
          {deleteFailed ? (
            <p className="save-state save-state-failed" role="alert">
              {deleteState.message}
            </p>
          ) : null}
        </section>
      ) : null}
    </li>
  );
}

function InteractionStatePreview({ label, savedCapture }: { label: string; savedCapture?: SavedCaptureReadModel }) {
  const blob = savedCapture?.asset.blob;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null);
      return;
    }
    const nextObjectUrl = URL.createObjectURL(blob);
    setObjectUrl(nextObjectUrl);
    return () => URL.revokeObjectURL(nextObjectUrl);
  }, [blob]);

  return (
    <article className="interaction-state-preview">
      <h5>{label}</h5>
      {savedCapture && objectUrl ? (
        <img src={objectUrl} alt={`${label} screenshot for ${getCaptureDisplayTitle(savedCapture.record)}`} />
      ) : (
        <p className="preview-image-placeholder">Referenced capture unavailable.</p>
      )}
      <p>{savedCapture ? boundText(getCaptureDisplayTitle(savedCapture.record), 80) : "Missing capture"}</p>
    </article>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getInteractionPairTitle(readModel: InteractionPairReadModel) {
  if (readModel.pair.title) {
    return readModel.pair.title;
  }
  return `${readModel.baseCapture ? getCaptureDisplayTitle(readModel.baseCapture.record) : "Base"} ${readModel.pair.trigger} interaction`;
}
