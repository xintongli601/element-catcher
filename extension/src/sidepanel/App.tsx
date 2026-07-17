import { useEffect, useState } from "react";
import type { StructuredCaptureExtraction } from "../shared/capture-schema";
import type {
  ElementSelection,
  ExtensionMessage,
  LockedSelectionState,
  SelectionCommandResponse,
  SidePanelStatus
} from "../shared/messages";
import { isExtensionMessage } from "../shared/messages";

const activeInstruction = "Hover over an element and click to lock it. Press Esc to cancel.";

export function App() {
  const [status, setStatus] = useState<SidePanelStatus>("idle");
  const [message, setMessage] = useState("Ready to select an element on the active webpage.");
  const [selection, setSelection] = useState<ElementSelection | null>(null);
  const [lockedSelection, setLockedSelection] = useState<LockedSelectionState | null>(null);
  const [structuredExtraction, setStructuredExtraction] = useState<StructuredCaptureExtraction | null>(null);

  useEffect(() => {
    const handleRuntimeMessage = (runtimeMessage: unknown) => {
      if (!isExtensionMessage(runtimeMessage)) {
        return;
      }

      if (runtimeMessage.type === "EC_SELECTION_STARTED") {
        setStatus("active");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setMessage(activeInstruction);
      }

      if (runtimeMessage.type === "EC_SELECTION_LOCKED") {
        setStatus("locked");
        setSelection(null);
        setLockedSelection(runtimeMessage.lockedSelection);
        setStructuredExtraction(null);
        setMessage("Element locked. Refine with Parent or Child, then confirm the final element.");
      }

      if (runtimeMessage.type === "EC_SELECTION_COMPLETED") {
        setStatus("selected");
        setSelection(runtimeMessage.selection);
        setLockedSelection(null);
        setStructuredExtraction(runtimeMessage.extraction);
        setMessage("Element selected. Structured DOM and style extraction is ready for the next capture stage.");
      }

      if (runtimeMessage.type === "EC_SELECTION_CANCELLED") {
        setStatus("cancelled");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setMessage("Selection cancelled. Normal page interaction has been restored.");
      }

      if (runtimeMessage.type === "EC_SELECTION_ERROR") {
        setStatus("error");
        setSelection(null);
        setLockedSelection(null);
        setStructuredExtraction(null);
        setMessage(runtimeMessage.message);
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
    setStatus("starting");
    setSelection(null);
    setLockedSelection(null);
    setStructuredExtraction(null);
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
    const response = await sendCommand({ type: "EC_CONFIRM_SELECTION" });
    if (!response.ok) {
      setStatus("error");
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
            disabled={status === "starting" || status === "active" || status === "locked"}
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

      {selection ? <SelectionSummary selection={selection} hasStructuredExtraction={Boolean(structuredExtraction)} /> : null}

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
          ? "Structured DOM and style extraction is ready. Screenshot capture will be implemented in a later Milestone 3 stage."
          : "Screenshot capture will be implemented in Milestone 3."}
      </p>
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
