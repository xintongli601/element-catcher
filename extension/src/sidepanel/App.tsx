import { useEffect, useState } from "react";
import type {
  ElementSelection,
  ExtensionMessage,
  SelectionCommandResponse,
  SidePanelStatus
} from "../shared/messages";
import { isExtensionMessage } from "../shared/messages";

const activeInstruction = "Hover over an element and click to select it. Press Esc to cancel.";

export function App() {
  const [status, setStatus] = useState<SidePanelStatus>("idle");
  const [message, setMessage] = useState("Ready to select an element on the active webpage.");
  const [selection, setSelection] = useState<ElementSelection | null>(null);

  useEffect(() => {
    const handleRuntimeMessage = (runtimeMessage: unknown) => {
      if (!isExtensionMessage(runtimeMessage)) {
        return;
      }

      if (runtimeMessage.type === "EC_SELECTION_STARTED") {
        setStatus("active");
        setSelection(null);
        setMessage(activeInstruction);
      }

      if (runtimeMessage.type === "EC_SELECTION_COMPLETED") {
        setStatus("selected");
        setSelection(runtimeMessage.selection);
        setMessage("Element selected. Screenshot capture will be implemented in Milestone 3.");
      }

      if (runtimeMessage.type === "EC_SELECTION_CANCELLED") {
        setStatus("cancelled");
        setSelection(null);
        setMessage("Selection cancelled. Normal page interaction has been restored.");
      }

      if (runtimeMessage.type === "EC_SELECTION_ERROR") {
        setStatus("error");
        setSelection(null);
        setMessage(runtimeMessage.message);
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    return () => chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  }, []);

  const handleStartCapture = async () => {
    setStatus("starting");
    setSelection(null);
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
            disabled={status === "starting" || status === "active"}
          >
            {status === "starting" ? "Starting..." : "Start Capture"}
          </button>
          {status === "active" ? (
            <button className="secondary-action" type="button" onClick={handleCancelSelection}>
              Cancel
            </button>
          ) : null}
        </div>
        <p className={`notice notice-${status}`}>{message}</p>
      </section>

      {selection ? <SelectionSummary selection={selection} /> : null}

      <section className="saved-captures" aria-labelledby="saved-captures-heading">
        <div>
          <h2 id="saved-captures-heading">Saved captures</h2>
          <p>No captures yet. Local capture storage is planned for a later milestone.</p>
        </div>
      </section>
    </main>
  );
}

function SelectionSummary({ selection }: { selection: ElementSelection }) {
  return (
    <section className="selection-summary" aria-labelledby="selection-summary-heading">
      <h2 id="selection-summary-heading">Selected element</h2>
      <dl>
        <div>
          <dt>Tag</dt>
          <dd>{selection.tagName}</dd>
        </div>
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
      <p className="next-step-note">Screenshot capture will be implemented in Milestone 3.</p>
    </section>
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
