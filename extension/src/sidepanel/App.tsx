import { useState } from "react";
import { type CaptureStatus, milestoneTwoNotice } from "../shared/milestones";

export function App() {
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>("idle");

  const handleStartCapture = () => {
    setCaptureStatus("not-implemented");
  };

  return (
    <main className="app-shell">
      <section className="intro">
        <p className="eyebrow">Chrome Extension MVP</p>
        <h1>Element Catcher</h1>
        <p className="description">
          Capture visible UI inspiration from webpages and prepare it for reusable component generation.
        </p>
        <button className="primary-action" type="button" onClick={handleStartCapture}>
          Start Capture
        </button>
        {captureStatus === "not-implemented" ? <p className="notice">{milestoneTwoNotice}</p> : null}
      </section>

      <section className="saved-captures" aria-labelledby="saved-captures-heading">
        <div>
          <h2 id="saved-captures-heading">Saved captures</h2>
          <p>No captures yet.</p>
        </div>
      </section>
    </main>
  );
}
