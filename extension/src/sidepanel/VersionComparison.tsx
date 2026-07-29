import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  compareGeneratedVersions,
  describeComparisonVersion,
  type VersionCodeDiffRow,
  type VersionComparisonModel
} from "../comparison/version-comparison";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract";

type VersionComparisonProps = {
  versions: GeneratedComponentVersionEntry[];
  sourceCaptureId: string;
};

type ComparisonState =
  | { status: "closed" }
  | { status: "selecting"; message?: string }
  | { status: "result"; model: VersionComparisonModel; liveMessage?: string };

export function VersionComparison({ versions, sourceCaptureId }: VersionComparisonProps) {
  const [state, setState] = useState<ComparisonState>({ status: "closed" });
  const [baselineId, setBaselineId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const compareButtonRef = useRef<HTMLButtonElement | null>(null);
  const baselineSelectRef = useRef<HTMLSelectElement | null>(null);
  const candidateSelectRef = useRef<HTMLSelectElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const sourceCaptureIdRef = useRef(sourceCaptureId);

  const versionsById = useMemo(() => new Map(versions.map((entry) => [entry.id, entry])), [versions]);
  const hasEnoughVersions = versions.length >= 2;
  const hasDuplicateSelection = Boolean(baselineId && candidateId && baselineId === candidateId);
  const canCompare = hasEnoughVersions && Boolean(baselineId && candidateId) && !hasDuplicateSelection;
  const statusMessage = state.status === "selecting" ? state.message : undefined;

  useEffect(() => {
    if (sourceCaptureIdRef.current !== sourceCaptureId) {
      sourceCaptureIdRef.current = sourceCaptureId;
      setState({ status: "closed" });
      setBaselineId("");
      setCandidateId("");
    }
  }, [sourceCaptureId]);

  useEffect(() => {
    setBaselineId((current) => (current && !versionsById.has(current) ? "" : current));
    setCandidateId((current) => (current && !versionsById.has(current) ? "" : current));
    setState((current) => {
      if (current.status !== "result") {
        return current;
      }
      const baseline = versionsById.get(current.model.baseline.id);
      const candidate = versionsById.get(current.model.candidate.id);
      if (!baseline || !candidate) {
        return { status: "selecting", message: "The selected version is no longer available. Choose two versions again." };
      }
      return { status: "result", model: compareGeneratedVersions({ baseline, candidate, versions }) };
    });
  }, [versions, versionsById]);

  useEffect(() => {
    if (state.status === "result") {
      requestAnimationFrame(() => headingRef.current?.focus());
    }
  }, [state.status]);

  const openComparison = () => {
    setState(
      hasEnoughVersions
        ? { status: "selecting" }
        : { status: "selecting", message: "At least two generated versions are required to compare." }
    );
  };

  const closeComparison = () => {
    setState({ status: "closed" });
    setBaselineId("");
    setCandidateId("");
    requestAnimationFrame(() => compareButtonRef.current?.focus());
  };

  const handleBaselineChange = (nextId: string) => {
    setBaselineId(nextId);
    if (nextId && candidateId && nextId === candidateId) {
      setState({ status: "selecting", message: "A version cannot be both Baseline and Candidate." });
      requestAnimationFrame(() => baselineSelectRef.current?.focus());
    } else if (state.status !== "result") {
      setState({ status: "selecting" });
    }
  };

  const handleCandidateChange = (nextId: string) => {
    setCandidateId(nextId);
    if (baselineId && nextId && baselineId === nextId) {
      setState({ status: "selecting", message: "A version cannot be both Baseline and Candidate." });
      requestAnimationFrame(() => candidateSelectRef.current?.focus());
    } else if (state.status !== "result") {
      setState({ status: "selecting" });
    }
  };

  const runComparison = () => {
    if (!canCompare) {
      setState({ status: "selecting", message: "Choose two different generated versions before comparing." });
      requestAnimationFrame(() => (hasDuplicateSelection ? candidateSelectRef.current : baselineSelectRef.current)?.focus());
      return;
    }

    const baseline = versionsById.get(baselineId);
    const candidate = versionsById.get(candidateId);
    if (!baseline || !candidate) {
      setState({ status: "selecting", message: "The selected version is no longer available. Choose two versions again." });
      return;
    }

    setState({ status: "result", model: compareGeneratedVersions({ baseline, candidate, versions }) });
  };

  const swapComparison = () => {
    if (state.status !== "result") {
      return;
    }
    const nextBaseline = state.model.candidate;
    const nextCandidate = state.model.baseline;
    setBaselineId(nextBaseline.id);
    setCandidateId(nextCandidate.id);
    setState({
      status: "result",
      model: compareGeneratedVersions({ baseline: nextBaseline, candidate: nextCandidate, versions }),
      liveMessage: "Baseline and Candidate swapped."
    });
  };

  const changeSelections = () => {
    setState({ status: "selecting" });
    requestAnimationFrame(() => baselineSelectRef.current?.focus());
  };

  return (
    <div className="version-comparison">
      {state.status === "closed" ? (
        <button ref={compareButtonRef} className="secondary-action compact-action" type="button" onClick={openComparison}>
          Compare versions
        </button>
      ) : (
        <section className="version-comparison-panel" aria-labelledby="version-comparison-controls-heading">
          <div className="version-comparison-header">
            <h4 id="version-comparison-controls-heading">Compare generated versions</h4>
            <button className="secondary-action compact-action" type="button" onClick={closeComparison}>
              Close comparison
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            {state.status === "result" ? state.liveMessage ?? "" : statusMessage ?? ""}
          </p>
          {statusMessage ? (
            <p className="save-state save-state-failed" role={hasEnoughVersions ? "alert" : "status"}>
              {statusMessage}
            </p>
          ) : null}
          {hasEnoughVersions ? (
            <>
              <div className="version-comparison-controls">
                <label>
                  Baseline version
                  <select
                    ref={baselineSelectRef}
                    value={baselineId}
                    onChange={(event) => handleBaselineChange(event.target.value)}
                    aria-invalid={hasDuplicateSelection}
                  >
                    <option value="">Choose baseline version</option>
                    {versions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {describeComparisonVersion(entry)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Candidate version
                  <select
                    ref={candidateSelectRef}
                    value={candidateId}
                    onChange={(event) => handleCandidateChange(event.target.value)}
                    aria-invalid={hasDuplicateSelection}
                  >
                    <option value="">Choose candidate version</option>
                    {versions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {describeComparisonVersion(entry)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-action compact-action" type="button" disabled={!canCompare} onClick={runComparison}>
                  Compare
                </button>
              </div>
              {state.status === "result" ? (
                <ComparisonResult
                  model={state.model}
                  headingRef={headingRef}
                  onSwap={swapComparison}
                  onChangeSelections={changeSelections}
                  onClose={closeComparison}
                />
              ) : null}
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

function ComparisonResult({
  model,
  headingRef,
  onSwap,
  onChangeSelections,
  onClose
}: {
  model: VersionComparisonModel;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSwap: () => void;
  onChangeSelections: () => void;
  onClose: () => void;
}) {
  return (
    <section className="version-comparison-result" aria-labelledby="version-comparison-result-heading">
      <div className="version-comparison-result-header">
        <h4 id="version-comparison-result-heading" ref={headingRef} tabIndex={-1}>
          Comparison overview
        </h4>
        <div className="version-comparison-actions">
          <button className="secondary-action compact-action" type="button" onClick={onSwap}>
            Swap
          </button>
          <button className="secondary-action compact-action" type="button" onClick={onChangeSelections}>
            Change selections
          </button>
          <button className="secondary-action compact-action" type="button" onClick={onClose}>
            Close comparison
          </button>
        </div>
      </div>
      <dl className="preview-metadata">
        <MetadataItem label="Baseline version" value={describeComparisonVersion(model.baseline)} />
        <MetadataItem label="Candidate version" value={describeComparisonVersion(model.candidate)} />
        <MetadataItem label="Metadata changed" value={String(model.changeSummary.metadataChanged)} />
        <MetadataItem label="Baseline-only metadata" value={String(model.changeSummary.metadataBaselineOnly)} />
        <MetadataItem label="Candidate-only metadata" value={String(model.changeSummary.metadataCandidateOnly)} />
        <MetadataItem label="Code lines added" value={String(model.changeSummary.codeAddedLines)} />
        <MetadataItem label="Code lines removed" value={String(model.changeSummary.codeRemovedLines)} />
      </dl>

      <section aria-labelledby="version-comparison-relationship-heading">
        <h5 id="version-comparison-relationship-heading">Relationship</h5>
        <p className="version-comparison-relationship">{model.relationship}</p>
      </section>

      <section aria-labelledby="version-comparison-metadata-heading">
        <h5 id="version-comparison-metadata-heading">Metadata changes</h5>
        <div className="version-comparison-table-scroll">
          <table className="version-comparison-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Baseline</th>
                <th scope="col">Candidate</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {model.metadataRows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td>{row.baselineValue ?? "Not present"}</td>
                  <td>{row.candidateValue ?? "Not present"}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="version-comparison-code-heading">
        <h5 id="version-comparison-code-heading">Code changes</h5>
        <CodeDiffView codeDiff={model.codeDiff} />
      </section>

      <section aria-labelledby="version-comparison-baseline-code-heading">
        <h5 id="version-comparison-baseline-code-heading">Complete Baseline code</h5>
        <pre className="generated-code comparison-complete-code"><code>{model.baseline.value.code}</code></pre>
      </section>

      <section aria-labelledby="version-comparison-candidate-code-heading">
        <h5 id="version-comparison-candidate-code-heading">Complete Candidate code</h5>
        <pre className="generated-code comparison-complete-code"><code>{model.candidate.value.code}</code></pre>
      </section>
    </section>
  );
}

function CodeDiffView({ codeDiff }: { codeDiff: VersionComparisonModel["codeDiff"] }) {
  if (codeDiff.status === "equal" || codeDiff.status === "unavailable") {
    return <p className="empty-note">{codeDiff.message}</p>;
  }

  return (
    <div className="version-code-diff" role="table" aria-label="Code changes">
      {codeDiff.rows.map((row, index) => (
        <DiffRow row={row} index={index} key={`${row.kind}:${row.baselineLineNumber ?? "-"}:${row.candidateLineNumber ?? "-"}:${index}`} />
      ))}
    </div>
  );
}

function DiffRow({ row, index }: { row: VersionCodeDiffRow; index: number }) {
  return (
    <div className={`version-code-diff-row version-code-diff-row-${row.kind}`} role="row">
      <span className="version-code-diff-line" role="cell" aria-label={`Baseline line ${row.baselineLineNumber ?? "none"}`}>
        {row.baselineLineNumber ?? ""}
      </span>
      <span className="version-code-diff-line" role="cell" aria-label={`Candidate line ${row.candidateLineNumber ?? "none"}`}>
        {row.candidateLineNumber ?? ""}
      </span>
      <span className="version-code-diff-marker" role="cell" aria-hidden="true">
        {row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " "}
      </span>
      <code className="version-code-diff-text" role="cell">
        {row.text || " "}
      </code>
      <span className="sr-only">Diff row {index + 1}</span>
    </div>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
