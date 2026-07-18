import { useEffect, useRef, useState } from "react";
import type { ScreenshotCaptureResult, StructuredCaptureExtraction } from "../shared/capture-schema";
import type {
  ElementSelection,
  ExtensionMessage,
  LockedSelectionState,
  SelectionCommandResponse,
  SidePanelStatus
} from "../shared/messages";
import { isExtensionMessage } from "../shared/messages";
import {
  runPersistenceFoundationCheck,
  type PersistenceFoundationCheckResult
} from "../storage/persistence-foundation-check";
import { getSafePersistenceMessage } from "../storage/persistence-errors";
import { cropScreenshotDataUrl } from "./crop-screenshot";

const activeInstruction = "Hover over an element and click to lock it. Press Esc to cancel.";

export function App() {
  const [status, setStatus] = useState<SidePanelStatus>("idle");
  const [message, setMessage] = useState("Ready to select an element on the active webpage.");
  const [selection, setSelection] = useState<ElementSelection | null>(null);
  const [lockedSelection, setLockedSelection] = useState<LockedSelectionState | null>(null);
  const [structuredExtraction, setStructuredExtraction] = useState<StructuredCaptureExtraction | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotCaptureResult | null>(null);
  const captureRequestInFlightRef = useRef(false);

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
        setMessage(activeInstruction);
      }

      if (runtimeMessage.type === "EC_SELECTION_LOCKED") {
        setStatus("locked");
        setSelection(null);
        setLockedSelection(runtimeMessage.lockedSelection);
        setStructuredExtraction(null);
        setScreenshotCapture(null);
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
        setMessage("Selection cancelled. Normal page interaction has been restored.");
      }

      if (runtimeMessage.type === "EC_SELECTION_ERROR") {
        captureRequestInFlightRef.current = false;
        setStatus("error");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setScreenshotCapture(null);
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
      setMessage("Capturing and cropping the visible element screenshot...");

      try {
        const croppedScreenshot = await cropScreenshotDataUrl(
          runtimeMessage.screenshotDataUrl,
          runtimeMessage.extraction,
          runtimeMessage.screenshotCropRect
        );
        setStatus("selected");
        setSelection(runtimeMessage.selection);
        setLockedSelection(null);
        setStructuredExtraction(runtimeMessage.extraction);
        setScreenshotCapture(croppedScreenshot);
        captureRequestInFlightRef.current = false;
        setMessage("Element selected. Structured extraction and cropped screenshot are ready for the next capture stage.");
      } catch (error) {
        captureRequestInFlightRef.current = false;
        setStatus("error");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setScreenshotCapture(null);
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

      {selection ? (
        <SelectionSummary
          selection={selection}
          hasStructuredExtraction={Boolean(structuredExtraction)}
          screenshotCapture={screenshotCapture}
        />
      ) : null}

      <section className="saved-captures" aria-labelledby="saved-captures-heading">
        <div>
          <h2 id="saved-captures-heading">Saved captures</h2>
          <p>No captures yet. Local capture storage is planned for a later milestone.</p>
        </div>
      </section>
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

function SelectionSummary({
  selection,
  hasStructuredExtraction,
  screenshotCapture
}: {
  selection: ElementSelection;
  hasStructuredExtraction: boolean;
  screenshotCapture: ScreenshotCaptureResult | null;
}) {
  return (
    <section className="selection-summary" aria-labelledby="selection-summary-heading">
      <h2 id="selection-summary-heading">Selected element</h2>
      <SelectionDetails selection={selection} />
      <p className="next-step-note">
        {hasStructuredExtraction
          ? "Structured DOM, style extraction, and cropped screenshot are ready. Save and Capture Preview will be implemented in a later Milestone 3 stage."
          : "Screenshot capture will be implemented in Milestone 3."}
      </p>
      {screenshotCapture ? <ScreenshotResult screenshotCapture={screenshotCapture} /> : null}
    </section>
  );
}

type PersistenceDiagnosticState =
  | {
      status: "idle";
    }
  | {
      status: "checking";
    }
  | {
      status: "passed";
      result: PersistenceFoundationCheckResult;
    }
  | {
      status: "failed";
      message: string;
    };

function ScreenshotResult({ screenshotCapture }: { screenshotCapture: ScreenshotCaptureResult }) {
  const [diagnostic, setDiagnostic] = useState<PersistenceDiagnosticState>({ status: "idle" });

  const handlePersistenceDiagnostic = async () => {
    if (diagnostic.status === "checking") {
      return;
    }

    setDiagnostic({ status: "checking" });

    try {
      const result = await runPersistenceFoundationCheck(screenshotCapture);
      setDiagnostic({ status: "passed", result });
    } catch (error) {
      setDiagnostic({
        status: "failed",
        message: getSafePersistenceMessage(error)
      });
    }
  };

  return (
    <section className="screenshot-result" aria-labelledby="screenshot-result-heading">
      <h3 id="screenshot-result-heading">Cropped screenshot</h3>
      <img
        src={screenshotCapture.dataUrl}
        alt="Cropped screenshot of the selected visible webpage element"
        className="screenshot-thumbnail"
      />
      <dl>
        <div>
          <dt>Image size</dt>
          <dd>
            {screenshotCapture.width} x {screenshotCapture.height} px
          </dd>
        </div>
        <div>
          <dt>Crop size</dt>
          <dd>
            {Math.round(screenshotCapture.crop.width)} x {Math.round(screenshotCapture.crop.height)} CSS px
          </dd>
        </div>
      </dl>
      {screenshotCapture.wasClipped ? (
        <p className="clip-note">Only the visible viewport portion of this element was captured.</p>
      ) : null}
      <section className="persistence-diagnostic" aria-labelledby="persistence-diagnostic-heading">
        <div>
          <h4 id="persistence-diagnostic-heading">Local persistence foundation check</h4>
          <p>
            This verifies the local IndexedDB foundation only. It does not save the current capture, and temporary
            probe data is removed after the check.
          </p>
        </div>
        <button
          className="secondary-action"
          type="button"
          onClick={handlePersistenceDiagnostic}
          disabled={diagnostic.status === "checking"}
        >
          {diagnostic.status === "checking" ? "Checking..." : "Verify local persistence"}
        </button>
        {diagnostic.status === "passed" ? (
          <div className="diagnostic-result diagnostic-result-passed" role="status">
            <p>Local persistence check passed. The current capture was not saved.</p>
            <ul>
              <li>Database opened: {diagnostic.result.databaseName} v{diagnostic.result.databaseVersion}</li>
              <li>Object stores exist: {diagnostic.result.stores.join(", ")}.</li>
              <li>PNG asset integrity passed.</li>
              <li>JSON record read-back passed.</li>
              <li>Atomic rollback passed.</li>
              <li>Temporary probe cleanup passed.</li>
            </ul>
          </div>
        ) : null}
        {diagnostic.status === "failed" ? (
          <p className="diagnostic-result diagnostic-result-failed" role="alert">
            Local persistence check failed. {diagnostic.message}
          </p>
        ) : null}
      </section>
    </section>
  );
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
