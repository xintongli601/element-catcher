import { useEffect, useRef, useState } from "react";
import type { CaptureRecord, ScreenshotCaptureResult, StructuredCaptureExtraction } from "../shared/capture-schema";
import type {
  ElementSelection,
  ExtensionMessage,
  LockedSelectionState,
  SelectionCommandResponse,
  SidePanelStatus
} from "../shared/messages";
import { isExtensionMessage } from "../shared/messages";
import {
  assembleCaptureRecordV1,
  createCaptureRecordId,
  createCaptureRecordTimestamp
} from "../capture/capture-record-v1";
import {
  loadSavedCaptureLibrary,
  saveCaptureRecordV1,
  type SavedCaptureReadModel
} from "../storage/capture-save";
import { getSafePersistenceMessage } from "../storage/persistence-errors";
import { CaptureLibrary, type CaptureLibraryState } from "./CaptureLibrary";
import { CapturePreview } from "./CapturePreview";
import { cropScreenshotDataUrl } from "./crop-screenshot";

const activeInstruction = "Hover over an element and click to lock it. Press Esc to cancel.";

export function App() {
  const [status, setStatus] = useState<SidePanelStatus>("idle");
  const [message, setMessage] = useState("Ready to select an element on the active webpage.");
  const [selection, setSelection] = useState<ElementSelection | null>(null);
  const [lockedSelection, setLockedSelection] = useState<LockedSelectionState | null>(null);
  const [structuredExtraction, setStructuredExtraction] = useState<StructuredCaptureExtraction | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotCaptureResult | null>(null);
  const [captureRecordCandidate, setCaptureRecordCandidate] = useState<CaptureRecord | null>(null);
  const [captureLibrary, setCaptureLibrary] = useState<CaptureLibraryState>({ status: "loading" });
  const captureRequestInFlightRef = useRef(false);
  const libraryLoadSequenceRef = useRef(0);

  const loadLibrary = async () => {
    const sequence = libraryLoadSequenceRef.current + 1;
    libraryLoadSequenceRef.current = sequence;
    setCaptureLibrary({ status: "loading" });

    try {
      const savedCaptures = await loadSavedCaptureLibrary();
      if (libraryLoadSequenceRef.current !== sequence) {
        return;
      }

      setCaptureLibrary(savedCaptures.length ? { status: "loaded", savedCaptures } : { status: "empty" });
    } catch (error) {
      if (libraryLoadSequenceRef.current !== sequence) {
        return;
      }

      setCaptureLibrary({
        status: "failed",
        message: getSafePersistenceMessage(error)
      });
    }
  };

  useEffect(() => {
    void loadLibrary();
  }, []);

  useEffect(() => {
    const handleRuntimeMessage = (runtimeMessage: unknown) => {
      if (!isExtensionMessage(runtimeMessage)) {
        return;
      }

      if (runtimeMessage.type === "EC_SELECTION_STARTED") {
        captureRequestInFlightRef.current = false;
        setStatus("active");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setScreenshotCapture(null);
        setCaptureRecordCandidate(null);
        setMessage(activeInstruction);
      }

      if (runtimeMessage.type === "EC_SELECTION_LOCKED") {
        setStatus("locked");
        setSelection(null);
        setLockedSelection(runtimeMessage.lockedSelection);
        setStructuredExtraction(null);
        setScreenshotCapture(null);
        setCaptureRecordCandidate(null);
        setMessage("Element locked. Refine with Parent or Child, then confirm the final element.");
      }

      if (runtimeMessage.type === "EC_SELECTION_COMPLETED") {
        void handleSelectionCompleted(runtimeMessage);
      }

      if (runtimeMessage.type === "EC_SELECTION_CANCELLED") {
        captureRequestInFlightRef.current = false;
        setStatus("cancelled");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setScreenshotCapture(null);
        setCaptureRecordCandidate(null);
        setMessage("Selection cancelled. Normal page interaction has been restored.");
      }

      if (runtimeMessage.type === "EC_SELECTION_ERROR") {
        captureRequestInFlightRef.current = false;
        setStatus("error");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setScreenshotCapture(null);
        setCaptureRecordCandidate(null);
        setMessage(runtimeMessage.message);
      }
    };

    const handleSelectionCompleted = async (
      runtimeMessage: Extract<ExtensionMessage, { type: "EC_SELECTION_COMPLETED" }>
    ) => {
      setStatus("capturing");
      setSelection(null);
      setLockedSelection(null);
      setStructuredExtraction(null);
      setScreenshotCapture(null);
      setCaptureRecordCandidate(null);
      setMessage("Capturing and cropping the visible element screenshot...");

      try {
        const croppedScreenshot = await cropScreenshotDataUrl(
          runtimeMessage.screenshotDataUrl,
          runtimeMessage.extraction,
          runtimeMessage.screenshotCropRect
        );
        const candidate = assembleCaptureRecordV1({
          extraction: runtimeMessage.extraction,
          screenshotCapture: croppedScreenshot,
          id: createCaptureRecordId(),
          createdAt: createCaptureRecordTimestamp()
        });
        setStatus("selected");
        setSelection(runtimeMessage.selection);
        setLockedSelection(null);
        setStructuredExtraction(runtimeMessage.extraction);
        setScreenshotCapture(croppedScreenshot);
        setCaptureRecordCandidate(candidate);
        captureRequestInFlightRef.current = false;
        setMessage("Element selected. Review the Capture Preview, then save it locally when ready.");
      } catch (error) {
        captureRequestInFlightRef.current = false;
        setStatus("error");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setScreenshotCapture(null);
        setCaptureRecordCandidate(null);
        setMessage(error instanceof Error ? error.message : "Element Catcher could not crop the screenshot.");
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    return () => chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  }, []);

  useEffect(() => {
    if (status !== "active" && status !== "locked") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      void sendCommand({ type: "EC_CANCEL_SELECTION" }).then((response) => {
        if (!response.ok) {
          setStatus("error");
          setMessage(response.message);
        }
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status]);

  const handleStartCapture = async () => {
    captureRequestInFlightRef.current = false;
    setStatus("starting");
    setSelection(null);
    setLockedSelection(null);
    setStructuredExtraction(null);
    setScreenshotCapture(null);
    setCaptureRecordCandidate(null);
    setMessage("Starting selection mode on the active webpage...");

    const response = await sendCommand({ type: "EC_START_SELECTION" });
    if (!response.ok) {
      setStatus("error");
      setMessage(response.message);
    }
  };

  const handleCancelSelection = async () => {
    const response = await sendCommand({ type: "EC_CANCEL_SELECTION" });
    if (!response.ok) {
      setStatus("error");
      setMessage(response.message);
    }
  };

  const handleParent = async () => {
    const response = await sendCommand({ type: "EC_REFINE_PARENT" });
    if (!response.ok) {
      setStatus("error");
      setMessage(response.message);
    }
  };

  const handleChild = async () => {
    const response = await sendCommand({ type: "EC_REFINE_CHILD" });
    if (!response.ok) {
      setStatus("error");
      setMessage(response.message);
    }
  };

  const handleConfirmSelection = async () => {
    if (captureRequestInFlightRef.current) {
      return;
    }

    captureRequestInFlightRef.current = true;
    setStatus("capturing");
    setLockedSelection(null);
    setMessage("Capturing and cropping the visible element screenshot...");

    const response = await sendCommand({ type: "EC_CONFIRM_SELECTION" });
    if (!response.ok) {
      captureRequestInFlightRef.current = false;
      setStatus("error");
      setScreenshotCapture(null);
      setCaptureRecordCandidate(null);
      setMessage(response.message);
    }
  };

  return (
    <main className="app-shell">
      <section className="intro">
        <p className="eyebrow">Chrome Extension MVP</p>
        <h1>Element Catcher</h1>
        <p className="description">
          Capture visible UI inspiration from webpages and prepare it for reusable component generation.
        </p>
        <div className="actions">
          <button
            className="primary-action"
            type="button"
            onClick={handleStartCapture}
            disabled={status === "starting" || status === "active" || status === "locked" || status === "capturing"}
          >
            {status === "starting" ? "Starting..." : "Start Capture"}
          </button>
          {status === "active" || status === "locked" ? (
            <button className="secondary-action" type="button" onClick={handleCancelSelection}>
              Cancel
            </button>
          ) : null}
        </div>
        <p className={`notice notice-${status}`}>{message}</p>
      </section>

      {lockedSelection ? (
        <LockedSelectionSummary
          lockedSelection={lockedSelection}
          onParent={handleParent}
          onChild={handleChild}
          onConfirm={handleConfirmSelection}
          onCancel={handleCancelSelection}
        />
      ) : null}

      {selection && screenshotCapture && captureRecordCandidate ? (
        <CurrentCaptureWorkflow
          selection={selection}
          screenshotCapture={screenshotCapture}
          captureRecordCandidate={captureRecordCandidate}
          onSaved={() => void loadLibrary()}
        />
      ) : selection ? (
        <SelectedElementPending selection={selection} hasStructuredExtraction={Boolean(structuredExtraction)} />
      ) : null}

      <CaptureLibrary libraryState={captureLibrary} onRetry={loadLibrary} />
    </main>
  );
}

function LockedSelectionSummary({
  lockedSelection,
  onParent,
  onChild,
  onConfirm,
  onCancel
}: {
  lockedSelection: LockedSelectionState;
  onParent: () => void;
  onChild: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="selection-summary locked-summary" aria-labelledby="locked-selection-heading">
      <h2 id="locked-selection-heading">Locked element</h2>
      <SelectionDetails selection={lockedSelection.selection} />
      <div className="refinement-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={onParent}
          disabled={!lockedSelection.canSelectParent}
        >
          Parent
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={onChild}
          disabled={!lockedSelection.canSelectChild}
        >
          Child
        </button>
        <button className="primary-action" type="button" onClick={onConfirm}>
          Confirm
        </button>
        <button className="secondary-action" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function SelectedElementPending({
  selection,
  hasStructuredExtraction
}: {
  selection: ElementSelection;
  hasStructuredExtraction: boolean;
}) {
  return (
    <section className="selection-summary" aria-labelledby="selection-summary-heading">
      <h2 id="selection-summary-heading">Selected element</h2>
      <SelectionDetails selection={selection} />
      <p className="next-step-note">
        {hasStructuredExtraction
          ? "Preparing the Capture Preview..."
          : "Screenshot capture is being prepared for this selection."}
      </p>
    </section>
  );
}

type SaveState =
  | {
      status: "idle";
    }
  | {
      status: "saving";
    }
  | {
      status: "saved";
      savedAt: string;
    }
  | {
      status: "failed";
      message: string;
    };

function CurrentCaptureWorkflow({
  selection,
  screenshotCapture,
  captureRecordCandidate,
  onSaved
}: {
  selection: ElementSelection;
  screenshotCapture: ScreenshotCaptureResult;
  captureRecordCandidate: CaptureRecord;
  onSaved: (savedCapture: SavedCaptureReadModel) => void;
}) {
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    saveInFlightRef.current = false;
    setSaveState({ status: "idle" });
  }, [captureRecordCandidate.id]);

  const handleSaveCapture = async () => {
    if (saveInFlightRef.current || saveState.status === "saved") {
      return;
    }

    saveInFlightRef.current = true;
    setSaveState({ status: "saving" });

    try {
      const savedCapture = await saveCaptureRecordV1(captureRecordCandidate, screenshotCapture);
      onSaved(savedCapture);
      setSaveState({ status: "saved", savedAt: savedCapture.savedAt });
    } catch (error) {
      setSaveState({
        status: "failed",
        message: getSafePersistenceMessage(error)
      });
    } finally {
      saveInFlightRef.current = false;
    }
  };

  return (
    <section className="current-capture" aria-labelledby="current-capture-heading">
      <h2 id="current-capture-heading">Current capture</h2>
      <SelectionDetails selection={selection} />
      <CapturePreview
        record={captureRecordCandidate}
        imageSrc={screenshotCapture.dataUrl}
        heading={saveState.status === "saved" ? "Saved capture" : "Unsaved capture"}
        statusText={saveState.status === "saved" ? "Saved locally" : "Previewed but unsaved"}
      />
      {screenshotCapture.wasClipped ? (
        <p className="clip-note">Only the visible viewport portion of this element was captured.</p>
      ) : null}
      <section className="save-panel" aria-labelledby="save-capture-heading">
        <h3 id="save-capture-heading">Local save</h3>
        <p>
          {saveState.status === "saved"
            ? "This capture and its screenshot asset are stored locally."
            : "This preview is not saved yet. Use Save capture to store one CaptureRecord and one referenced screenshot asset locally."}
        </p>
        <button
          className="primary-action"
          type="button"
          onClick={handleSaveCapture}
          disabled={saveState.status === "saving" || saveState.status === "saved"}
        >
          {getSaveButtonLabel(saveState)}
        </button>
        {saveState.status === "idle" ? (
          <p className="save-state save-state-idle">Previewed but unsaved.</p>
        ) : null}
        {saveState.status === "saving" ? (
          <p className="save-state save-state-saving">Saving and verifying local read-back...</p>
        ) : null}
        {saveState.status === "saved" ? (
          <p className="save-state save-state-saved" role="status">
            Saved locally. The CaptureRecord and screenshot asset were verified after read-back.
          </p>
        ) : null}
        {saveState.status === "failed" ? (
          <p className="save-state save-state-failed" role="alert">
            Save failed. {saveState.message}
          </p>
        ) : null}
      </section>
    </section>
  );
}

function getSaveButtonLabel(saveState: SaveState) {
  if (saveState.status === "saving") {
    return "Saving...";
  }

  if (saveState.status === "saved") {
    return "Saved locally";
  }

  if (saveState.status === "failed") {
    return "Retry Save";
  }

  return "Save capture";
}

function SelectionDetails({ selection }: { selection: ElementSelection }) {
  return (
    <dl>
      <div>
        <dt>Tag</dt>
        <dd>{selection.tagName}</dd>
      </div>
      {selection.semanticRole ? (
        <div>
          <dt>Role</dt>
          <dd>{selection.semanticRole}</dd>
        </div>
      ) : null}
      <div>
        <dt>Size</dt>
        <dd>
          {selection.rect.width} x {selection.rect.height}
        </dd>
      </div>
      {selection.id ? (
        <div>
          <dt>ID</dt>
          <dd>{selection.id}</dd>
        </div>
      ) : null}
      {selection.classNames?.length ? (
        <div>
          <dt>Classes</dt>
          <dd>{selection.classNames.join(" ")}</dd>
        </div>
      ) : null}
      {selection.textPreview ? (
        <div>
          <dt>Text</dt>
          <dd>{selection.textPreview}</dd>
        </div>
      ) : null}
    </dl>
  );
}

async function sendCommand(message: ExtensionMessage): Promise<SelectionCommandResponse> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return {
      ok: false,
      message: "Element Catcher could not communicate with the active tab."
    };
  }
}
