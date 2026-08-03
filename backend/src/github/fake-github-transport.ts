import {
  GITHUB_EXPORT_CONTRACT_VERSION,
  validateGitHubExportApprovedWriteRequest,
  validateGitHubGatewayBranchListRequest,
  validateGitHubGatewayRemoteInspectRequest,
  validateGitHubGatewayRepositoryListRequest,
  validateGitHubGatewaySessionStatusRequest,
  type GitHubAccountSummaryV1,
  type GitHubBranchIdentityV1,
  type GitHubExportGatewayBranchListResponseV1,
  type GitHubExportGatewayRemoteInspectResponseV1,
  type GitHubExportGatewayRepositoryListResponseV1,
  type GitHubExportGatewaySessionStatusResponseV1,
  type GitHubExportSuccessResultV1,
  type GitHubRemoteFileStateV1,
  type GitHubRepositoryIdentityV1
} from "../../../extension/src/github/github-export-contract.js";
import { GitHubGatewaySafeError, statusForGitHubGatewayCode, type GitHubGatewayTransport } from "./github-gateway.js";

const FAKE_SESSION_REF = "github-session-abcdefghijklmnopqrstuvwx12345678";
const FAKE_ACCOUNT: GitHubAccountSummaryV1 = Object.freeze({
  accountId: "583231",
  login: "octocat",
  displayName: "The Octocat"
});
const FAKE_REPOSITORIES: readonly GitHubRepositoryIdentityV1[] = Object.freeze([
  Object.freeze({
    repositoryId: "987654",
    owner: "octocat",
    name: "hello-world",
    fullName: "octocat/hello-world",
    visibility: "public"
  }),
  Object.freeze({
    repositoryId: "987655",
    owner: "octocat",
    name: "private-components",
    fullName: "octocat/private-components",
    visibility: "private"
  })
]);
const FAKE_BRANCHES = Object.freeze({
  "octocat/hello-world": Object.freeze([
    Object.freeze({ name: "main", headCommitSha: "a".repeat(40) }),
    Object.freeze({ name: "release", headCommitSha: "b".repeat(40) })
  ]),
  "octocat/private-components": Object.freeze([
    Object.freeze({ name: "main", headCommitSha: "c".repeat(40) })
  ])
});

type FakeFile = {
  source: string;
  blobSha: string;
  byteSize: number;
};

export function createDeterministicFakeGitHubTransport(): GitHubGatewayTransport {
  const files = new Map<string, FakeFile>([
    [
      fileKey("octocat/hello-world", "main", "components/ExistingCard.tsx"),
      {
        source: "export function ExistingCard() {\n  return <div>Remote</div>;\n}",
        blobSha: "d".repeat(40),
        byteSize: 61
      }
    ],
    [
      fileKey("octocat/hello-world", "main", "components/ConflictCard.tsx"),
      {
        source: "export function ConflictCard() {\n  return <div>Remote</div>;\n}",
        blobSha: "e".repeat(40),
        byteSize: 61
      }
    ]
  ]);
  let commitCounter = 0;

  return Object.freeze({
    getSessionStatus(parsed: unknown): GitHubExportGatewaySessionStatusResponseV1 {
      validateGitHubGatewaySessionStatusRequest(parsed);
      return Object.freeze({
        contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
        kind: "github.session.status.v1",
        session: Object.freeze({
          state: "active",
          sessionRef: FAKE_SESSION_REF,
          account: FAKE_ACCOUNT,
          expiresAt: "2026-12-31T23:59:59.000Z"
        })
      });
    },
    listRepositories(parsed: unknown): GitHubExportGatewayRepositoryListResponseV1 {
      validateGitHubGatewayRepositoryListRequest(parsed);
      assertSession((parsed as { sessionRef: string }).sessionRef);
      return Object.freeze({
        contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
        kind: "github.repositories.list.v1",
        account: FAKE_ACCOUNT,
        repositories: FAKE_REPOSITORIES
      });
    },
    listBranches(parsed: unknown): GitHubExportGatewayBranchListResponseV1 {
      validateGitHubGatewayBranchListRequest(parsed);
      const request = parsed as { sessionRef: string; repository: GitHubRepositoryIdentityV1 };
      assertSession(request.sessionRef);
      assertRepository(request.repository);
      return Object.freeze({
        contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
        kind: "github.branches.list.v1",
        account: FAKE_ACCOUNT,
        repository: request.repository,
        branches: getBranches(request.repository)
      });
    },
    inspectRemote(parsed: unknown): GitHubExportGatewayRemoteInspectResponseV1 {
      validateGitHubGatewayRemoteInspectRequest(parsed);
      const request = parsed as { sessionRef: string; repository: GitHubRepositoryIdentityV1; branchName: string; targetPath: string };
      assertSession(request.sessionRef);
      assertRepository(request.repository);
      const branch = getBranch(request.repository, request.branchName);
      const remoteFile = readRemoteFile(files, request.repository.fullName, branch, request.targetPath);
      return Object.freeze({
        contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
        kind: "github.remote.inspect.v1",
        account: FAKE_ACCOUNT,
        repository: request.repository,
        branch,
        targetPath: request.targetPath,
        operation: remoteFile.status === "missing" ? "create" : "update",
        remoteFile
      });
    },
    writeFile(parsed: unknown): GitHubExportSuccessResultV1 {
      validateGitHubExportApprovedWriteRequest(parsed);
      const request = parsed as import("../../../extension/src/github/github-export-contract.js").GitHubExportApprovedWriteRequestV1;
      assertSession(request.sessionRef);
      assertRepository(request.review.repository);
      const branch = getBranch(request.review.repository, request.review.branch.name);
      if (branch.headCommitSha !== request.review.branch.headCommitSha) {
        throw new GitHubGatewaySafeError("remote_conflict", statusForGitHubGatewayCode("remote_conflict"));
      }
      const remoteFile = readRemoteFile(files, request.review.repository.fullName, branch, request.review.targetPath);
      if (JSON.stringify(remoteFile) !== JSON.stringify(request.review.remoteFile)) {
        throw new GitHubGatewaySafeError("remote_conflict", statusForGitHubGatewayCode("remote_conflict"));
      }
      if (request.review.operation === "create" && remoteFile.status !== "missing") {
        throw new GitHubGatewaySafeError("remote_conflict", statusForGitHubGatewayCode("remote_conflict"));
      }
      if (request.review.operation === "update" && remoteFile.status !== "existing") {
        throw new GitHubGatewaySafeError("remote_conflict", statusForGitHubGatewayCode("remote_conflict"));
      }
      if (request.review.targetPath.includes("RateLimited")) {
        throw new GitHubGatewaySafeError("rate_limited", statusForGitHubGatewayCode("rate_limited"));
      }
      if (request.review.targetPath.includes("Ambiguous")) {
        throw new GitHubGatewaySafeError("ambiguous_write", statusForGitHubGatewayCode("ambiguous_write"));
      }

      commitCounter += 1;
      const commitSha = deterministicSha("f", commitCounter);
      const blobSha = deterministicSha("1", commitCounter);
      files.set(fileKey(request.review.repository.fullName, branch.name, request.review.targetPath), {
        source: request.source,
        blobSha,
        byteSize: new TextEncoder().encode(request.source).byteLength
      });
      return Object.freeze({
        contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
        ok: true,
        repository: request.review.repository,
        branch,
        targetPath: request.review.targetPath,
        operation: request.review.operation,
        commitSha,
        commitUrl: `https://github.com/${request.review.repository.fullName}/commit/${commitSha}`
      });
    }
  });
}

function assertSession(sessionRef: string) {
  if (sessionRef !== FAKE_SESSION_REF) {
    throw new GitHubGatewaySafeError("authorization_expired", statusForGitHubGatewayCode("authorization_expired"));
  }
}

function assertRepository(repository: GitHubRepositoryIdentityV1) {
  if (!FAKE_REPOSITORIES.some((candidate) => JSON.stringify(candidate) === JSON.stringify(repository))) {
    throw new GitHubGatewaySafeError("repository_unavailable", statusForGitHubGatewayCode("repository_unavailable"));
  }
}

function getBranches(repository: GitHubRepositoryIdentityV1): readonly GitHubBranchIdentityV1[] {
  return FAKE_BRANCHES[repository.fullName as keyof typeof FAKE_BRANCHES] ?? [];
}

function getBranch(repository: GitHubRepositoryIdentityV1, branchName: string): GitHubBranchIdentityV1 {
  const branch = getBranches(repository).find((candidate) => candidate.name === branchName);
  if (!branch) {
    throw new GitHubGatewaySafeError("branch_unavailable", statusForGitHubGatewayCode("branch_unavailable"));
  }
  return branch;
}

function readRemoteFile(
  files: ReadonlyMap<string, FakeFile>,
  repositoryFullName: string,
  branch: GitHubBranchIdentityV1,
  targetPath: string
): GitHubRemoteFileStateV1 {
  const file = files.get(fileKey(repositoryFullName, branch.name, targetPath));
  if (!file) {
    return Object.freeze({
      status: "missing",
      branchHeadCommitSha: branch.headCommitSha
    });
  }
  return Object.freeze({
    status: "existing",
    blobSha: file.blobSha,
    byteSize: file.byteSize,
    branchHeadCommitSha: branch.headCommitSha
  });
}

function fileKey(repositoryFullName: string, branchName: string, targetPath: string) {
  return `${repositoryFullName}:${branchName}:${targetPath}`;
}

function deterministicSha(prefix: string, counter: number) {
  return `${prefix}${String(counter).padStart(39, "0")}`.slice(0, 40);
}
