import type { GeneratedComponentVersionEntry, GeneratedComponentVersionEntryV2 } from "../shared/generated-version-contract";

export const CODE_DIFF_LIMITS = {
  maxLinesPerSide: 1200,
  maxLcsCells: 1440000,
  maxDiffRows: 2500
} as const;

export type VersionLineageRelationship =
  | "direct-child"
  | "direct-parent"
  | "descendant"
  | "ancestor"
  | "sibling"
  | "unrelated-lineage"
  | "incomplete-lineage";

export type MetadataComparisonStatus = "unchanged" | "changed" | "baseline-only" | "candidate-only";

export type VersionMetadataComparisonRow = {
  key: string;
  label: string;
  baselineValue: string | null;
  candidateValue: string | null;
  status: MetadataComparisonStatus;
};

export type VersionCodeDiffRow = {
  kind: "context" | "removed" | "added";
  baselineLineNumber: number | null;
  candidateLineNumber: number | null;
  text: string;
};

export type VersionCodeDiffResult =
  | {
      status: "equal";
      message: "No code changes.";
      rows: [];
    }
  | {
      status: "changed";
      rows: VersionCodeDiffRow[];
    }
  | {
      status: "unavailable";
      message: "Diff unavailable at this size.";
      reason: "line-count" | "lcs-cells" | "diff-rows";
      rows: [];
    };

export type VersionComparisonChangeSummary = {
  metadataChanged: number;
  metadataBaselineOnly: number;
  metadataCandidateOnly: number;
  codeAddedLines: number;
  codeRemovedLines: number;
};

export type VersionComparisonModel = {
  baseline: GeneratedComponentVersionEntry;
  candidate: GeneratedComponentVersionEntry;
  relationship: VersionLineageRelationship;
  metadataRows: VersionMetadataComparisonRow[];
  codeDiff: VersionCodeDiffResult;
  changeSummary: VersionComparisonChangeSummary;
};

type CompareGeneratedVersionsInput = {
  baseline: GeneratedComponentVersionEntry;
  candidate: GeneratedComponentVersionEntry;
  versions: readonly GeneratedComponentVersionEntry[];
};

type TraversalResult = "found" | "missing" | "cycle" | "not-found";

export function compareGeneratedVersions({
  baseline,
  candidate,
  versions
}: CompareGeneratedVersionsInput): VersionComparisonModel {
  if (baseline.id === candidate.id) {
    throw new Error("Cannot compare a generated version with itself.");
  }
  if (baseline.sourceCaptureId !== candidate.sourceCaptureId) {
    throw new Error("Generated versions must belong to the same source capture.");
  }

  const loadedVersions = versions.slice();
  const relationship = classifyLineage(baseline, candidate, loadedVersions);
  const metadataRows = compareMetadataRows(baseline, candidate, loadedVersions);
  const codeDiff = diffCode(baseline.value.code, candidate.value.code);
  const changeSummary = summarizeChanges(metadataRows, codeDiff);

  return {
    baseline,
    candidate,
    relationship,
    metadataRows,
    codeDiff,
    changeSummary
  };
}

export function describeComparisonVersion(entry: GeneratedComponentVersionEntry) {
  return `${entry.value.componentName} - ${entry.createdAt}`;
}

function classifyLineage(
  baseline: GeneratedComponentVersionEntry,
  candidate: GeneratedComponentVersionEntry,
  versions: readonly GeneratedComponentVersionEntry[]
): VersionLineageRelationship {
  const byId = new Map(versions.map((entry) => [entry.id, entry]));
  const baselineParentId = getParentGeneratedVersionId(baseline);
  const candidateParentId = getParentGeneratedVersionId(candidate);

  if (candidateParentId === baseline.id) {
    return "direct-child";
  }
  if (baselineParentId === candidate.id) {
    return "direct-parent";
  }

  const candidateToBaseline = traverseAncestors(candidate, baseline.id, byId);
  if (candidateToBaseline === "found") {
    return "descendant";
  }

  const baselineToCandidate = traverseAncestors(baseline, candidate.id, byId);
  if (baselineToCandidate === "found") {
    return "ancestor";
  }

  if (baselineParentId && baselineParentId === candidateParentId && byId.has(baselineParentId)) {
    return "sibling";
  }

  if (
    candidateToBaseline === "missing" ||
    candidateToBaseline === "cycle" ||
    baselineToCandidate === "missing" ||
    baselineToCandidate === "cycle"
  ) {
    return "incomplete-lineage";
  }

  return "unrelated-lineage";
}

function traverseAncestors(
  start: GeneratedComponentVersionEntry,
  targetId: string,
  byId: ReadonlyMap<string, GeneratedComponentVersionEntry>
): TraversalResult {
  const visited = new Set<string>();
  let current: GeneratedComponentVersionEntry | undefined = start;

  for (let depth = 0; depth <= byId.size; depth += 1) {
    const parentId = getParentGeneratedVersionId(current);
    if (!parentId) {
      return "not-found";
    }
    if (parentId === targetId) {
      return "found";
    }
    if (visited.has(parentId)) {
      return "cycle";
    }
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) {
      return "missing";
    }
    current = parent;
  }

  return "cycle";
}

function compareMetadataRows(
  baseline: GeneratedComponentVersionEntry,
  candidate: GeneratedComponentVersionEntry,
  versions: readonly GeneratedComponentVersionEntry[]
): VersionMetadataComparisonRow[] {
  const sourceLabel = (entry: GeneratedComponentVersionEntry) => getSourceGeneratedVersionLabel(entry, versions);
  return [
    createMetadataRow("componentName", "Component name", baseline.value.componentName, candidate.value.componentName),
    createMetadataRow("framework", "Framework", baseline.value.framework, candidate.value.framework),
    createMetadataRow("styling", "Styling", baseline.value.styling, candidate.value.styling),
    createMetadataRow("summary", "Summary", baseline.value.summary, candidate.value.summary),
    createMetadataRow(
      "approximationNotes",
      "Approximation notes",
      baseline.value.approximationNotes || null,
      candidate.value.approximationNotes || null
    ),
    createMetadataRow("createdAt", "Created time", baseline.createdAt, candidate.createdAt),
    createMetadataRow("versionKind", "Version kind", describeVersionKind(baseline), describeVersionKind(candidate)),
    createMetadataRow("sourceGeneratedVersion", "Source generated version", sourceLabel(baseline), sourceLabel(candidate)),
    createMetadataRow("screenshotState", "Screenshot inclusion state", describeScreenshotState(baseline), describeScreenshotState(candidate)),
    createMetadataRow("revisionInstruction", "Revision instruction", getRevisionInstruction(baseline), getRevisionInstruction(candidate)),
    createMetadataRow("technicalVersionId", "Technical version ID", baseline.id, candidate.id)
  ];
}

function createMetadataRow(
  key: string,
  label: string,
  baselineValue: string | null,
  candidateValue: string | null
): VersionMetadataComparisonRow {
  return {
    key,
    label,
    baselineValue,
    candidateValue,
    status: getMetadataStatus(baselineValue, candidateValue)
  };
}

function getMetadataStatus(baselineValue: string | null, candidateValue: string | null): MetadataComparisonStatus {
  if (baselineValue === null && candidateValue !== null) {
    return "candidate-only";
  }
  if (baselineValue !== null && candidateValue === null) {
    return "baseline-only";
  }
  return baselineValue === candidateValue ? "unchanged" : "changed";
}

function summarizeChanges(
  metadataRows: readonly VersionMetadataComparisonRow[],
  codeDiff: VersionCodeDiffResult
): VersionComparisonChangeSummary {
  return {
    metadataChanged: metadataRows.filter((row) => row.status === "changed").length,
    metadataBaselineOnly: metadataRows.filter((row) => row.status === "baseline-only").length,
    metadataCandidateOnly: metadataRows.filter((row) => row.status === "candidate-only").length,
    codeAddedLines: codeDiff.status === "changed" ? codeDiff.rows.filter((row) => row.kind === "added").length : 0,
    codeRemovedLines: codeDiff.status === "changed" ? codeDiff.rows.filter((row) => row.kind === "removed").length : 0
  };
}

function diffCode(baselineCode: string, candidateCode: string): VersionCodeDiffResult {
  const baseline = splitCodeLines(baselineCode);
  const candidate = splitCodeLines(candidateCode);

  if (baseline.lines.length > CODE_DIFF_LIMITS.maxLinesPerSide || candidate.lines.length > CODE_DIFF_LIMITS.maxLinesPerSide) {
    return { status: "unavailable", message: "Diff unavailable at this size.", reason: "line-count", rows: [] };
  }
  if ((baseline.lines.length + 1) * (candidate.lines.length + 1) > CODE_DIFF_LIMITS.maxLcsCells) {
    return { status: "unavailable", message: "Diff unavailable at this size.", reason: "lcs-cells", rows: [] };
  }

  const contentRows = buildLcsDiffRows(baseline.lines, candidate.lines);
  const rows = appendFinalNewlineMarker(contentRows, baseline, candidate);
  if (rows.length > CODE_DIFF_LIMITS.maxDiffRows) {
    return { status: "unavailable", message: "Diff unavailable at this size.", reason: "diff-rows", rows: [] };
  }
  if (rows.every((row) => row.kind === "context")) {
    return { status: "equal", message: "No code changes.", rows: [] };
  }
  return { status: "changed", rows };
}

function buildLcsDiffRows(baselineLines: readonly string[], candidateLines: readonly string[]): VersionCodeDiffRow[] {
  const baselineCount = baselineLines.length;
  const candidateCount = candidateLines.length;
  const width = candidateCount + 1;
  const scores = new Uint16Array((baselineCount + 1) * width);

  for (let i = baselineCount - 1; i >= 0; i -= 1) {
    for (let j = candidateCount - 1; j >= 0; j -= 1) {
      const index = i * width + j;
      if (baselineLines[i] === candidateLines[j]) {
        scores[index] = scores[(i + 1) * width + j + 1] + 1;
      } else {
        scores[index] = Math.max(scores[(i + 1) * width + j], scores[i * width + j + 1]);
      }
    }
  }

  const rows: VersionCodeDiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < baselineCount || j < candidateCount) {
    if (i < baselineCount && j < candidateCount && baselineLines[i] === candidateLines[j]) {
      rows.push({ kind: "context", baselineLineNumber: i + 1, candidateLineNumber: j + 1, text: baselineLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (i >= baselineCount) {
      rows.push({ kind: "added", baselineLineNumber: null, candidateLineNumber: j + 1, text: candidateLines[j] });
      j += 1;
      continue;
    }
    if (j >= candidateCount) {
      rows.push({ kind: "removed", baselineLineNumber: i + 1, candidateLineNumber: null, text: baselineLines[i] });
      i += 1;
      continue;
    }

    const skipBaselineScore = scores[(i + 1) * width + j];
    const skipCandidateScore = scores[i * width + j + 1];
    if (skipBaselineScore > skipCandidateScore) {
      rows.push({ kind: "removed", baselineLineNumber: i + 1, candidateLineNumber: null, text: baselineLines[i] });
      i += 1;
    } else {
      rows.push({ kind: "added", baselineLineNumber: null, candidateLineNumber: j + 1, text: candidateLines[j] });
      j += 1;
    }
  }

  return rows;
}

function appendFinalNewlineMarker(
  rows: readonly VersionCodeDiffRow[],
  baseline: SplitCodeLinesResult,
  candidate: SplitCodeLinesResult
): VersionCodeDiffRow[] {
  if (baseline.hasFinalNewline === candidate.hasFinalNewline) {
    return rows.slice();
  }
  const nextRows = rows.slice();
  if (baseline.hasFinalNewline) {
    nextRows.push({
      kind: "removed",
      baselineLineNumber: Math.max(baseline.lines.length, 1),
      candidateLineNumber: null,
      text: "[Final newline removed]"
    });
  } else {
    nextRows.push({
      kind: "added",
      baselineLineNumber: null,
      candidateLineNumber: Math.max(candidate.lines.length, 1),
      text: "[Final newline added]"
    });
  }
  return nextRows;
}

type SplitCodeLinesResult = {
  lines: string[];
  hasFinalNewline: boolean;
};

function splitCodeLines(code: string): SplitCodeLinesResult {
  const normalized = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const hasFinalNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hasFinalNewline) {
    lines.pop();
  }
  return { lines, hasFinalNewline };
}

function getParentGeneratedVersionId(entry: GeneratedComponentVersionEntry) {
  return isVersionTwo(entry) ? entry.operation.sourceGeneratedVersionId : null;
}

function isVersionTwo(entry: GeneratedComponentVersionEntry): entry is GeneratedComponentVersionEntryV2 {
  return "contractVersion" in entry && entry.contractVersion === 2;
}

function describeVersionKind(entry: GeneratedComponentVersionEntry) {
  if (isVersionTwo(entry)) {
    return entry.operation.kind === "revision" ? "Revision" : "Regeneration";
  }
  return "Initial generation";
}

function getSourceGeneratedVersionLabel(
  entry: GeneratedComponentVersionEntry,
  versions: readonly GeneratedComponentVersionEntry[]
) {
  if (!isVersionTwo(entry)) {
    return null;
  }
  const ancestor = versions.find((candidate) => candidate.id === entry.operation.sourceGeneratedVersionId);
  return ancestor ? describeComparisonVersion(ancestor) : `${entry.operation.sourceGeneratedVersionId} (missing ancestor)`;
}

function describeScreenshotState(entry: GeneratedComponentVersionEntry) {
  if (!isVersionTwo(entry)) {
    return "Initial generation screenshot policy";
  }
  return entry.operation.screenshotIncluded ? "Included in revision request" : "Not included in revision request";
}

function getRevisionInstruction(entry: GeneratedComponentVersionEntry) {
  if (isVersionTwo(entry) && entry.operation.kind === "revision") {
    return entry.operation.instruction;
  }
  return null;
}
