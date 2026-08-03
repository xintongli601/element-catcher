import {
  generatedSourceExportEntriesEqual,
  prepareGeneratedSourceExport
} from "../export/generated-source-export.js";
import { getUtf8ByteLength } from "../shared/generation-contract.js";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract.js";
import {
  GITHUB_EXPORT_LIMITS,
  validateGitHubCommitMessage,
  validateGitHubPublicAttemptId,
  validateGitHubTargetPath
} from "./github-export-contract.js";
import { getGeneratedComponentVersionUnionById } from "../storage/indexed-db.js";

export type GitHubPreparedSourceModelV1 = Readonly<{
  generatedVersionId: string;
  sourceCaptureId: string;
  sourceKind: "initial" | "revision" | "regeneration";
  filename: string;
  targetPath: string;
  commitMessage: string;
  publicAttemptId: string;
  source: string;
  sourceByteCount: number;
}>;

export type GitHubLocalPreparationErrorCode = "invalid_request" | "local_stale";

export type GitHubLocalPreparationResult =
  | { ok: true; value: GitHubPreparedSourceModelV1 }
  | { ok: false; code: GitHubLocalPreparationErrorCode; message: string };

export type GitHubLocalSourceInput = Readonly<{
  entry: GeneratedComponentVersionEntry;
  targetPath: string;
  commitMessage: string;
  publicAttemptId: string;
}>;

export type GitHubLocalOwnershipInput = Readonly<{
  displayedEntry: GeneratedComponentVersionEntry;
  sourceCaptureId: string;
  targetPath: string;
  commitMessage: string;
  publicAttemptId: string;
  readGeneratedVersionById?: (id: string) => Promise<GeneratedComponentVersionEntry | undefined>;
}>;

export function prepareGitHubGeneratedSourceExport(input: GitHubLocalSourceInput): GitHubLocalPreparationResult {
  const targetPath = validateGitHubTargetPath(input.targetPath);
  if (!targetPath.ok) {
    return localInvalid(targetPath.message);
  }
  const commitMessage = validateGitHubCommitMessage(input.commitMessage);
  if (!commitMessage.ok) {
    return localInvalid(commitMessage.message);
  }
  const publicAttemptId = validateGitHubPublicAttemptId(input.publicAttemptId);
  if (!publicAttemptId.ok) {
    return localInvalid(publicAttemptId.message);
  }
  const localExport = prepareGeneratedSourceExport(input.entry);
  if (!localExport.ok) {
    return localInvalid(localExport.message);
  }
  const sourceByteCount = getUtf8ByteLength(input.entry.value.code);
  if (sourceByteCount > GITHUB_EXPORT_LIMITS.sourceBytes) {
    return localInvalid("Generated source is too large for GitHub export.");
  }

  return {
    ok: true,
    value: deepFreeze({
      generatedVersionId: input.entry.id,
      sourceCaptureId: input.entry.sourceCaptureId,
      sourceKind: getSourceKind(input.entry),
      filename: localExport.value.filename,
      targetPath: targetPath.value,
      commitMessage: commitMessage.value,
      publicAttemptId: publicAttemptId.value,
      source: input.entry.value.code,
      sourceByteCount
    })
  };
}

export async function prepareGitHubGeneratedSourceExportAfterReread(input: GitHubLocalOwnershipInput): Promise<GitHubLocalPreparationResult> {
  const snapshot = cloneGeneratedVersionEntry(input.displayedEntry);
  const read = input.readGeneratedVersionById ?? getGeneratedComponentVersionUnionById;
  let reread: GeneratedComponentVersionEntry | undefined;
  try {
    reread = await read(snapshot.id);
  } catch {
    return localStale();
  }
  if (
    !reread ||
    reread.id !== snapshot.id ||
    reread.sourceCaptureId !== input.sourceCaptureId ||
    reread.sourceCaptureId !== snapshot.sourceCaptureId ||
    !generatedSourceExportEntriesEqual(reread, snapshot)
  ) {
    return localStale();
  }
  return prepareGitHubGeneratedSourceExport({
    entry: reread,
    targetPath: input.targetPath,
    commitMessage: input.commitMessage,
    publicAttemptId: input.publicAttemptId
  });
}

function getSourceKind(entry: GeneratedComponentVersionEntry): GitHubPreparedSourceModelV1["sourceKind"] {
  return "contractVersion" in entry && entry.contractVersion === 2 ? entry.operation.kind : "initial";
}

function localInvalid(message: string): GitHubLocalPreparationResult {
  return { ok: false, code: "invalid_request", message };
}

function localStale(): GitHubLocalPreparationResult {
  return { ok: false, code: "local_stale", message: "The selected local generated version changed." };
}

function cloneGeneratedVersionEntry(entry: GeneratedComponentVersionEntry): GeneratedComponentVersionEntry {
  return JSON.parse(JSON.stringify(entry)) as GeneratedComponentVersionEntry;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
