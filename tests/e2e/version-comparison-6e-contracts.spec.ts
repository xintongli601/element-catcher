import { expect, test } from "@playwright/test";
import {
  CODE_DIFF_LIMITS,
  compareGeneratedVersions
} from "../../extension/src/comparison/version-comparison";
import type {
  GeneratedComponentVersionEntry,
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";

test.describe("Milestone 6E Slice 2 version comparison contracts", () => {
  test("rejects same-entry and cross-capture comparisons without mutating inputs", () => {
    const baseline = v1("version-baseline", "capture-a");
    const candidate = v1("version-candidate", "capture-a", { code: "const next = 1;" });
    const before = JSON.stringify([baseline, candidate]);

    expect(() => compareGeneratedVersions({ baseline, candidate: baseline, versions: [baseline, candidate] })).toThrow(
      "Cannot compare a generated version with itself."
    );
    expect(() =>
      compareGeneratedVersions({ baseline, candidate: v1("version-other-capture", "capture-b"), versions: [baseline] })
    ).toThrow("Generated versions must belong to the same source capture.");
    compareGeneratedVersions({ baseline, candidate, versions: [baseline, candidate] });
    expect(JSON.stringify([baseline, candidate])).toBe(before);
  });

  test("classifies V1/V2/V2 lineage relationships with missing ancestors and cycles", () => {
    const root = v1("root");
    const child = v2("child", "root");
    const grandchild = v2("grandchild", "child");
    const sibling = v2("sibling", "root");
    const unrelatedRoot = v1("unrelated-root");
    const missingParent = v2("missing-parent", "not-loaded");
    const cycleA = v2("cycle-a", "cycle-b");
    const cycleB = v2("cycle-b", "cycle-a");

    expect(compareGeneratedVersions({ baseline: root, candidate: child, versions: [root, child] }).relationship).toBe("direct-child");
    expect(compareGeneratedVersions({ baseline: child, candidate: root, versions: [root, child] }).relationship).toBe("direct-parent");
    expect(compareGeneratedVersions({ baseline: root, candidate: grandchild, versions: [root, child, grandchild] }).relationship).toBe("descendant");
    expect(compareGeneratedVersions({ baseline: grandchild, candidate: root, versions: [root, child, grandchild] }).relationship).toBe("ancestor");
    expect(compareGeneratedVersions({ baseline: child, candidate: sibling, versions: [root, child, sibling] }).relationship).toBe("sibling");
    expect(compareGeneratedVersions({ baseline: root, candidate: unrelatedRoot, versions: [root, unrelatedRoot] }).relationship).toBe("unrelated-lineage");
    expect(compareGeneratedVersions({ baseline: root, candidate: missingParent, versions: [root, missingParent] }).relationship).toBe("incomplete-lineage");
    expect(compareGeneratedVersions({ baseline: root, candidate: cycleA, versions: [root, cycleA, cycleB] }).relationship).toBe("incomplete-lineage");
  });

  test("reports allowlisted metadata statuses without storage or provider fields", () => {
    const baseline = v1("metadata-root", "capture-a", {
      approximationNotes: "",
      createdAt: "2026-07-18T12:00:00.000Z"
    });
    const candidate = v2("metadata-child", "metadata-root", "capture-a", {
      componentName: "CandidateCard",
      summary: "Updated summary.",
      approximationNotes: "Candidate-only notes.",
      instruction: "Make the card denser.",
      screenshotIncluded: false,
      createdAt: "2026-07-18T12:01:00.000Z"
    });

    const model = compareGeneratedVersions({ baseline, candidate, versions: [baseline, candidate] });
    const byKey = new Map(model.metadataRows.map((row) => [row.key, row]));
    expect(byKey.get("componentName")?.status).toBe("changed");
    expect(byKey.get("framework")?.status).toBe("unchanged");
    expect(byKey.get("approximationNotes")?.status).toBe("candidate-only");
    expect(byKey.get("revisionInstruction")?.status).toBe("candidate-only");
    expect(model.metadataRows.map((row) => row.key)).toEqual([
      "componentName",
      "framework",
      "styling",
      "summary",
      "approximationNotes",
      "createdAt",
      "versionKind",
      "sourceGeneratedVersion",
      "screenshotState",
      "revisionInstruction",
      "technicalVersionId"
    ]);
    expect(JSON.stringify(model.metadataRows)).not.toContain("sourceReviewFingerprint");
    expect(JSON.stringify(model.metadataRows)).not.toContain("logicalAttemptId");
    expect(JSON.stringify(model.metadataRows)).not.toContain("reviewAttemptFingerprint");
  });

  test("diffs additions, removals, replacements, blanks, whitespace, line endings, final newline, repeated lines, and equal code", () => {
    const base = v1("diff-base", "capture-a", { code: "alpha\nsame\nsame\nremove me\n\nspace \nend" });
    const candidate = v1("diff-candidate", "capture-a", { code: "alpha\nsame\nadd me\nsame\n\nspace\t\nend\n" });
    const changed = compareGeneratedVersions({ baseline: base, candidate, versions: [base, candidate] }).codeDiff;
    expect(changed.status).toBe("changed");
    if (changed.status !== "changed") {
      return;
    }
    expect(changed.rows.filter((row) => row.kind === "added").map((row) => row.text)).toContain("add me");
    expect(changed.rows.filter((row) => row.kind === "removed").map((row) => row.text)).toContain("remove me");
    expect(changed.rows.some((row) => row.kind === "added" && row.text === "[Final newline added]")).toBe(true);
    expect(changed.rows.find((row) => row.text === "same")?.kind).toBe("context");
    expect(changed.rows.some((row) => row.kind === "removed" && row.text === "space ")).toBe(true);
    expect(changed.rows.some((row) => row.kind === "added" && row.text === "space\t")).toBe(true);

    const lineEndingEqual = compareGeneratedVersions({
      baseline: v1("crlf-base", "capture-a", { code: "one\r\ntwo\r" }),
      candidate: v1("crlf-candidate", "capture-a", { code: "one\ntwo\n" }),
      versions: []
    }).codeDiff;
    expect(lineEndingEqual.status).toBe("equal");

    const exactEqual = compareGeneratedVersions({
      baseline: v1("equal-base", "capture-a", { code: "" }),
      candidate: v1("equal-candidate", "capture-a", { code: "" }),
      versions: []
    }).codeDiff;
    expect(exactEqual).toEqual({ status: "equal", message: "No code changes.", rows: [] });
  });

  test("uses deterministic repeated-line tie-breaking by skipping Candidate first", () => {
    const model = compareGeneratedVersions({
      baseline: v1("tie-base", "capture-a", { code: "a\nb\na" }),
      candidate: v1("tie-candidate", "capture-a", { code: "b\na\nb" }),
      versions: []
    });
    expect(model.codeDiff.status).toBe("changed");
    if (model.codeDiff.status !== "changed") {
      return;
    }
    expect(model.codeDiff.rows.slice(0, 2).map((row) => row.kind)).toEqual(["added", "context"]);
    expect(model.codeDiff.rows[0]).toMatchObject({ kind: "added", candidateLineNumber: 1, text: "b" });
  });

  test("falls back safely for oversized line count and LCS work while keeping complete source on the model", () => {
    const tooManyLines = Array.from({ length: CODE_DIFF_LIMITS.maxLinesPerSide + 1 }, (_, index) => `line ${index}`).join("\n");
    const lineCount = compareGeneratedVersions({
      baseline: v1("too-many-base", "capture-a", { code: tooManyLines }),
      candidate: v1("too-many-candidate", "capture-a", { code: "small" }),
      versions: []
    });
    expect(lineCount.codeDiff).toMatchObject({ status: "unavailable", message: "Diff unavailable at this size.", reason: "line-count" });
    expect(lineCount.baseline.value.code).toBe(tooManyLines);

    const workBase = Array.from({ length: 1200 }, (_, index) => `base ${index}`).join("\n");
    const workCandidate = Array.from({ length: 1200 }, (_, index) => `candidate ${index}`).join("\n");
    expect(
      compareGeneratedVersions({
        baseline: v1("work-base", "capture-a", { code: workBase }),
        candidate: v1("work-candidate", "capture-a", { code: workCandidate }),
        versions: []
      }).codeDiff
    ).toMatchObject({ status: "unavailable", reason: "lcs-cells" });

    expect(CODE_DIFF_LIMITS.maxDiffRows).toBe(2500);
  });
});

type EntryOptions = {
  componentName?: string;
  framework?: string;
  styling?: string;
  code?: string;
  summary?: string;
  approximationNotes?: string;
  createdAt?: string;
};

function v1(id: string, sourceCaptureId = "capture-a", options: EntryOptions = {}): GeneratedComponentVersionEntryV1 {
  return {
    id,
    sourceCaptureId,
    sourceCaptureSavedAt: "2026-07-18T09:00:00.000Z",
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: options.createdAt ?? "2026-07-18T12:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName: options.componentName ?? "BaselineCard",
      framework: options.framework ?? "react",
      styling: options.styling ?? "tailwind",
      code: options.code ?? "export function BaselineCard() { return <button>Save</button>; }",
      summary: options.summary ?? "Baseline summary.",
      approximationNotes: options.approximationNotes ?? "Baseline notes."
    }
  };
}

type VersionTwoOptions = EntryOptions & {
  instruction?: string;
  screenshotIncluded?: boolean;
  operationKind?: "revision" | "regeneration";
};

function v2(
  id: string,
  parentId: string,
  sourceCaptureId = "capture-a",
  options: VersionTwoOptions = {}
): GeneratedComponentVersionEntryV2 {
  const operationKind = options.operationKind ?? "revision";
  return {
    ...v1(id, sourceCaptureId, {
      componentName: options.componentName ?? "CandidateCard",
      code: options.code ?? "export function CandidateCard() { return <button>Buy</button>; }",
      summary: options.summary ?? "Candidate summary.",
      approximationNotes: options.approximationNotes ?? "Candidate notes.",
      createdAt: options.createdAt ?? "2026-07-18T12:01:00.000Z"
    }),
    contractVersion: 2,
    operation:
      operationKind === "revision"
        ? {
            kind: "revision",
            logicalAttemptId: "revision-attempt-" + "1".repeat(32),
            reviewAttemptFingerprint: "b".repeat(64),
            sourceGeneratedVersionId: parentId,
            sourceGeneratedVersionFingerprint: "c".repeat(64),
            instruction: options.instruction ?? "Revise the generated component.",
            instructionFingerprint: "d".repeat(64),
            screenshotIncluded: options.screenshotIncluded ?? true
          }
        : {
            kind: "regeneration",
            logicalAttemptId: "revision-attempt-" + "1".repeat(32),
            reviewAttemptFingerprint: "b".repeat(64),
            sourceGeneratedVersionId: parentId,
            sourceGeneratedVersionFingerprint: "c".repeat(64),
            screenshotIncluded: options.screenshotIncluded ?? true
          }
  };
}
