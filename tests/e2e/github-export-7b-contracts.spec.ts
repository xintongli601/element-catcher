import { expect, test } from "@playwright/test";
import {
  GITHUB_EXPORT_LIMITS,
  validateGitHubCommitMessage,
  validateGitHubExportApprovedWriteRequest,
  validateGitHubExportReview,
  validateGitHubGatewaySessionStatusRequest,
  validateGitHubPublicAttemptId,
  validateGitHubSessionRef,
  validateGitHubTargetPath
} from "../../extension/src/github/github-export-contract";
import {
  prepareGitHubGeneratedSourceExport,
  prepareGitHubGeneratedSourceExportAfterReread
} from "../../extension/src/github/github-export-local";
import type {
  GeneratedComponentVersionEntry,
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";

const PUBLIC_ATTEMPT_ID = "github-export-attempt-0123456789abcdef0123456789abcdef";

test.describe("Milestone 7B Slice 2 GitHub export contracts and local ownership", () => {
  test("validates repository-relative .tsx target paths deterministically", () => {
    for (const path of [
      "ExportCard.tsx",
      "components/ExportCard.tsx",
      "src/components/cards/ExportCard.tsx"
    ]) {
      expect(validateGitHubTargetPath(path)).toEqual({ ok: true, value: path });
      expect(validateGitHubTargetPath(path)).toEqual(validateGitHubTargetPath(path));
    }

    const maxSegment = "A".repeat(GITHUB_EXPORT_LIMITS.targetPathSegmentBytes - ".tsx".length);
    const maxPath = `${maxSegment}.tsx`;
    expect(validateGitHubTargetPath(maxPath)).toEqual({ ok: true, value: maxPath });

    for (const unsafe of [
      "",
      "/ExportCard.tsx",
      "ExportCard.tsx/",
      "components\\ExportCard.tsx",
      "components//ExportCard.tsx",
      "./ExportCard.tsx",
      "../ExportCard.tsx",
      "components/../ExportCard.tsx",
      "components/%2e%2e/ExportCard.tsx",
      "components/%2F/ExportCard.tsx",
      "components/%5c/ExportCard.tsx",
      "components/Export\u0000Card.tsx",
      "components/ExportCard.tsx?raw=1",
      "components/ExportCard.tsx#hash",
      " components/ExportCard.tsx",
      "components /ExportCard.tsx",
      "components/ExportCard .tsx",
      "components/ExportCard..tsx",
      "components/ExportCard.",
      "components/ExportCard.ts",
      ".github/workflows/ExportCard.tsx",
      ".GitHub/Workflows/ExportCard.tsx",
      "components∕ExportCard.tsx",
      "a/".repeat(GITHUB_EXPORT_LIMITS.targetPathSegments) + "ExportCard.tsx",
      `${"A".repeat(GITHUB_EXPORT_LIMITS.targetPathSegmentBytes + 1)}.tsx`
    ]) {
      const result = validateGitHubTargetPath(unsafe);
      expect(result.ok, unsafe).toBe(false);
      if (!result.ok) {
        expect(result.value).toBeUndefined();
      }
    }
  });

  test("validates bounded single-line commit messages without silent normalization", () => {
    expect(validateGitHubCommitMessage("Export generated component")).toEqual({ ok: true, value: "Export generated component" });
    expect(validateGitHubCommitMessage("Export generated component")).toEqual(validateGitHubCommitMessage("Export generated component"));
    expect(validateGitHubCommitMessage("导出组件")).toEqual({ ok: true, value: "导出组件" });
    const max = "A".repeat(GITHUB_EXPORT_LIMITS.commitMessageBytes);
    expect(validateGitHubCommitMessage(max)).toEqual({ ok: true, value: max });

    for (const unsafe of [
      "",
      "   ",
      " Export generated component",
      "Export generated component ",
      "Export generated\ncomponent",
      "Export generated\rcomponent",
      "Export\u0000component",
      `${max}B`,
      "Export with ghp_abcdefghijklmnopqrstuvwxyz123456",
      "Export with Bearer abcdefghijklmnopqrstuvwxyz"
    ]) {
      const result = validateGitHubCommitMessage(unsafe);
      expect(result.ok, unsafe).toBe(false);
    }
  });

  test("prepares exact GitHub source payloads for V1, V2 Revision, and V2 Regeneration without metadata leakage", () => {
    const cases = [
      createV1("GitHubBaseCard", "export function GitHubBaseCard() {\r\n  return <div />;\r\n}"),
      createV2("GitHubRevisionCard", "revision", "export function GitHubRevisionCard() {\n  return <button>保存</button>;\n}"),
      createV2("GitHubRegenerationCard", "regeneration", "export function GitHubRegenerationCard() {\n  alert(\"not previewable\");\n  return <section />;\n}")
    ];

    for (const entry of cases) {
      const result = prepareGitHubGeneratedSourceExport({
        entry,
        targetPath: `components/${entry.value.componentName}.tsx`,
        commitMessage: "Export generated component",
        publicAttemptId: PUBLIC_ATTEMPT_ID
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(result.value).toMatchObject({
        generatedVersionId: entry.id,
        sourceCaptureId: entry.sourceCaptureId,
        filename: `${entry.value.componentName}.tsx`,
        targetPath: `components/${entry.value.componentName}.tsx`,
        commitMessage: "Export generated component",
        publicAttemptId: PUBLIC_ATTEMPT_ID,
        source: entry.value.code,
        sourceByteCount: new TextEncoder().encode(entry.value.code).byteLength
      });
      expect(result.value.source).toBe(entry.value.code);
      expect(JSON.stringify(result.value)).not.toContain("sourceReviewFingerprint");
      expect(JSON.stringify(result.value)).not.toContain("logicalAttemptId");
      expect(JSON.stringify(result.value)).not.toContain("sourceGeneratedVersionId");
      expect(JSON.stringify(result.value)).not.toContain("sourceUrl");
      expect(JSON.stringify(result.value)).not.toContain("pageTitle");
      expect(JSON.stringify(result.value)).not.toContain("provider");
      expect(JSON.stringify(result.value)).not.toContain("backend");
    }

    const noFinal = createV1("NoFinalGitHubCard", "export function NoFinalGitHubCard() {\n  return <div />;\n}");
    const oneFinal = createV1("OneFinalGitHubCard", "export function OneFinalGitHubCard() {\n  return <div />;\n}\n");
    expect(prepareGitHubGeneratedSourceExport(validLocalInput(noFinal))).toMatchObject({ ok: true, value: { source: noFinal.value.code } });
    expect(prepareGitHubGeneratedSourceExport(validLocalInput(oneFinal))).toMatchObject({ ok: true, value: { source: oneFinal.value.code } });
  });

  test("rereads local generated-version ownership and fails stale without writes or network", async () => {
    const entry = createV1("GitHubOwnershipCard", "export function GitHubOwnershipCard() {\n  return <div />;\n}");
    const valid = await prepareGitHubGeneratedSourceExportAfterReread({
      displayedEntry: entry,
      sourceCaptureId: entry.sourceCaptureId,
      targetPath: "components/GitHubOwnershipCard.tsx",
      commitMessage: "Export generated component",
      publicAttemptId: PUBLIC_ATTEMPT_ID,
      readGeneratedVersionById: async (id) => id === entry.id ? clone(entry) : undefined
    });
    expect(valid.ok).toBe(true);

    for (const [name, reread] of [
      ["missing", undefined],
      ["altered", { ...entry, value: { ...entry.value, code: "export function GitHubOwnershipCard() { return null; }" } }],
      ["wrong capture", { ...entry, sourceCaptureId: "capture-00000000000000000000000000000002" }]
    ] satisfies Array<[string, GeneratedComponentVersionEntry | undefined]>) {
      const result = await prepareGitHubGeneratedSourceExportAfterReread({
        displayedEntry: entry,
        sourceCaptureId: entry.sourceCaptureId,
        targetPath: "components/GitHubOwnershipCard.tsx",
        commitMessage: "Export generated component",
        publicAttemptId: PUBLIC_ATTEMPT_ID,
        readGeneratedVersionById: async () => reread ? clone(reread) : undefined
      });
      expect(result, name).toEqual({ ok: false, code: "local_stale", message: "The selected local generated version changed." });
    }

    expect(entry.value.code).toBe("export function GitHubOwnershipCard() {\n  return <div />;\n}");
  });

  test("validates frozen Review, approved request, session, and forbidden secret fields", () => {
    const review = validReview();
    expect(() => validateGitHubExportReview(review)).not.toThrow();
    expect(() => validateGitHubExportApprovedWriteRequest({
      contractVersion: 1,
      sessionRef: "github-session-abcdefghijklmnopqrstuvwx12345678",
      review,
      source: "export function GitHubBaseCard() {\n  return <div />;\n}"
    })).not.toThrow();
    expect(validateGitHubSessionRef("github-session-abcdefghijklmnopqrstuvwx12345678")).toMatchObject({ ok: true });
    expect(validateGitHubPublicAttemptId(PUBLIC_ATTEMPT_ID)).toMatchObject({ ok: true });
    expect(() => validateGitHubGatewaySessionStatusRequest({
      contractVersion: 1,
      kind: "github.session.status.v1",
      sessionRef: undefined
    })).not.toThrow();

    for (const malformed of [
      { ...review, token: "ghp_abcdefghijklmnopqrstuvwxyz123456" },
      { ...review, sourceUrl: "https://example.test" },
      { ...review, pageTitle: "Secret page" },
      { ...review, remoteFile: { status: "existing", blobSha: "a".repeat(40), byteSize: 1, branchHeadCommitSha: "b".repeat(40) } },
      { ...review, operation: "update" },
      { ...review, extra: true }
    ]) {
      expect(() => validateGitHubExportReview(malformed)).toThrow();
    }
    expect(() => validateGitHubGatewaySessionStatusRequest({
      contractVersion: 1,
      kind: "github.session.status.v1",
      accessToken: "ghp_abcdefghijklmnopqrstuvwxyz123456"
    })).toThrow();
  });
});

function validLocalInput(entry: GeneratedComponentVersionEntry) {
  return {
    entry,
    targetPath: `${entry.value.componentName}.tsx`,
    commitMessage: "Export generated component",
    publicAttemptId: PUBLIC_ATTEMPT_ID
  };
}

function validReview() {
  return {
    contractVersion: 1,
    account: {
      accountId: "123456",
      login: "octocat",
      displayName: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231"
    },
    repository: {
      repositoryId: "987654",
      owner: "octocat",
      name: "hello-world",
      fullName: "octocat/hello-world",
      visibility: "public"
    },
    branch: {
      name: "main",
      headCommitSha: "a".repeat(40)
    },
    targetPath: "components/GitHubBaseCard.tsx",
    operation: "create",
    commitMessage: "Export generated component",
    sourceFilename: "GitHubBaseCard.tsx",
    sourceByteCount: 58,
    publicAttemptId: PUBLIC_ATTEMPT_ID,
    remoteFile: {
      status: "missing",
      branchHeadCommitSha: "a".repeat(40)
    }
  };
}

function createV1(componentName: string, code: string): GeneratedComponentVersionEntryV1 {
  return {
    id: `generated-version-${componentName.padEnd(32, "0").slice(0, 32).toLowerCase()}`,
    sourceCaptureId: "capture-00000000000000000000000000000001",
    sourceCaptureSavedAt: "2026-07-18T09:00:00.000Z",
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: "2026-07-18T12:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName,
      framework: "react",
      styling: "tailwind",
      code,
      summary: `${componentName} summary.`,
      approximationNotes: `${componentName} notes.`
    }
  };
}

function createV2(componentName: string, kind: "revision" | "regeneration", code: string): GeneratedComponentVersionEntryV2 {
  const base = createV1(componentName, code);
  const operation: GeneratedComponentVersionEntryV2["operation"] =
    kind === "revision"
      ? {
          kind,
          logicalAttemptId: "revision-attempt-00000000000000000000000000000001",
          reviewAttemptFingerprint: "b".repeat(64),
          sourceGeneratedVersionId: "generated-version-00000000000000000000000000000000",
          sourceGeneratedVersionFingerprint: "c".repeat(64),
          instruction: "Make the export deterministic.",
          instructionFingerprint: "d".repeat(64),
          screenshotIncluded: false
        }
      : {
          kind,
          logicalAttemptId: "revision-attempt-00000000000000000000000000000002",
          reviewAttemptFingerprint: "b".repeat(64),
          sourceGeneratedVersionId: "generated-version-00000000000000000000000000000000",
          sourceGeneratedVersionFingerprint: "c".repeat(64),
          screenshotIncluded: false
        };
  return {
    ...base,
    contractVersion: 2,
    operation
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
