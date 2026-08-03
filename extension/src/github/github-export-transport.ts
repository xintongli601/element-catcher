import {
  GITHUB_EXPORT_CONTRACT_VERSION,
  safeMessageForGitHubError,
  validateGitHubExportSuccessResult,
  validateGitHubGatewayBranchListResponse,
  validateGitHubGatewayRemoteInspectResponse,
  validateGitHubGatewayRepositoryListResponse,
  validateGitHubGatewaySessionStatusResponse,
  type GitHubExportApprovedWriteRequestV1,
  type GitHubExportErrorCode,
  type GitHubExportGatewayBranchListRequestV1,
  type GitHubExportGatewayBranchListResponseV1,
  type GitHubExportGatewayRemoteInspectRequestV1,
  type GitHubExportGatewayRemoteInspectResponseV1,
  type GitHubExportGatewayRepositoryListRequestV1,
  type GitHubExportGatewayRepositoryListResponseV1,
  type GitHubExportGatewaySessionStatusRequestV1,
  type GitHubExportGatewaySessionStatusResponseV1,
  type GitHubExportSuccessResultV1
} from "./github-export-contract";

export type GitHubTransportResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: GitHubExportErrorCode; message: string };

export type GitHubExportTransport = {
  getSessionStatus(sessionRef?: string, signal?: AbortSignal): Promise<GitHubTransportResult<GitHubExportGatewaySessionStatusResponseV1>>;
  listRepositories(sessionRef: string, signal?: AbortSignal): Promise<GitHubTransportResult<GitHubExportGatewayRepositoryListResponseV1>>;
  listBranches(request: GitHubExportGatewayBranchListRequestV1, signal?: AbortSignal): Promise<GitHubTransportResult<GitHubExportGatewayBranchListResponseV1>>;
  inspectRemote(request: GitHubExportGatewayRemoteInspectRequestV1, signal?: AbortSignal): Promise<GitHubTransportResult<GitHubExportGatewayRemoteInspectResponseV1>>;
  writeFile(request: GitHubExportApprovedWriteRequestV1, signal?: AbortSignal): Promise<GitHubTransportResult<GitHubExportSuccessResultV1>>;
};

const GITHUB_ENDPOINTS = Object.freeze({
  session: "/v1/github-export/session",
  repositories: "/v1/github-export/repositories",
  branches: "/v1/github-export/branches",
  inspect: "/v1/github-export/inspect",
  write: "/v1/github-export/write"
});

export function createHttpGitHubExportTransport(origin: string): GitHubExportTransport {
  return Object.freeze({
    getSessionStatus(sessionRef?: string, signal?: AbortSignal) {
      return postGitHubJson(
        `${origin}${GITHUB_ENDPOINTS.session}`,
        {
          contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
          kind: "github.session.status.v1",
          ...(sessionRef ? { sessionRef } : {})
        } satisfies GitHubExportGatewaySessionStatusRequestV1,
        validateGitHubGatewaySessionStatusResponse,
        signal
      );
    },
    listRepositories(sessionRef: string, signal?: AbortSignal) {
      return postGitHubJson(
        `${origin}${GITHUB_ENDPOINTS.repositories}`,
        {
          contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
          kind: "github.repositories.list.v1",
          sessionRef
        } satisfies GitHubExportGatewayRepositoryListRequestV1,
        validateGitHubGatewayRepositoryListResponse,
        signal
      );
    },
    listBranches(request: GitHubExportGatewayBranchListRequestV1, signal?: AbortSignal) {
      return postGitHubJson(`${origin}${GITHUB_ENDPOINTS.branches}`, request, validateGitHubGatewayBranchListResponse, signal);
    },
    inspectRemote(request: GitHubExportGatewayRemoteInspectRequestV1, signal?: AbortSignal) {
      return postGitHubJson(`${origin}${GITHUB_ENDPOINTS.inspect}`, request, validateGitHubGatewayRemoteInspectResponse, signal);
    },
    writeFile(request: GitHubExportApprovedWriteRequestV1, signal?: AbortSignal) {
      return postGitHubJson(`${origin}${GITHUB_ENDPOINTS.write}`, request, validateGitHubExportSuccessResult, signal);
    }
  });
}

async function postGitHubJson<T>(
  url: string,
  body: unknown,
  validate: (value: unknown) => asserts value is T,
  signal: AbortSignal | undefined
): Promise<GitHubTransportResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Element-Catcher-Contract-Version": String(GITHUB_EXPORT_CONTRACT_VERSION)
      },
      body: JSON.stringify(body),
      signal
    });
    const parsed = await response.json();
    if (!response.ok) {
      return normalizeGitHubError(parsed);
    }
    validate(parsed);
    return { ok: true, value: parsed };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, code: "internal_error", message: safeMessageForGitHubError("internal_error") };
    }
    return { ok: false, code: "internal_error", message: safeMessageForGitHubError("internal_error") };
  }
}

function normalizeGitHubError(value: unknown): GitHubTransportResult<never> {
  if (
    value &&
    typeof value === "object" &&
    (value as { contractVersion?: unknown }).contractVersion === GITHUB_EXPORT_CONTRACT_VERSION &&
    (value as { ok?: unknown }).ok === false
  ) {
    const error = (value as { error?: { code?: unknown } }).error;
    if (typeof error?.code === "string" && isKnownGitHubErrorCode(error.code)) {
      return { ok: false, code: error.code, message: safeMessageForGitHubError(error.code) };
    }
  }
  return { ok: false, code: "internal_error", message: safeMessageForGitHubError("internal_error") };
}

function isKnownGitHubErrorCode(value: string): value is GitHubExportErrorCode {
  return [
    "invalid_request",
    "authorization_required",
    "authorization_expired",
    "access_denied",
    "repository_unavailable",
    "branch_unavailable",
    "remote_conflict",
    "rate_limited",
    "ambiguous_write",
    "local_stale",
    "gateway_not_configured",
    "internal_error"
  ].includes(value);
}
