import {
  GITHUB_EXPORT_CONTRACT_VERSION,
  GITHUB_EXPORT_LIMITS,
  githubSafeErrorResponse,
  safeMessageForGitHubError,
  validateGitHubExportApprovedWriteRequest,
  validateGitHubGatewayBranchListRequest,
  validateGitHubGatewayRemoteInspectRequest,
  validateGitHubGatewayRepositoryListRequest,
  validateGitHubGatewaySessionStatusRequest,
  type GitHubExportErrorCode,
  type GitHubExportGatewayBranchListResponseV1,
  type GitHubExportGatewayRemoteInspectResponseV1,
  type GitHubExportGatewayRepositoryListResponseV1,
  type GitHubExportGatewaySessionStatusResponseV1
} from "../../../extension/src/github/github-export-contract.js";

export const GITHUB_GATEWAY_SESSION_STATUS_ROUTE = "/v1/github-export/session";
export const GITHUB_GATEWAY_REPOSITORY_LIST_ROUTE = "/v1/github-export/repositories";
export const GITHUB_GATEWAY_BRANCH_LIST_ROUTE = "/v1/github-export/branches";
export const GITHUB_GATEWAY_REMOTE_INSPECT_ROUTE = "/v1/github-export/inspect";
export const GITHUB_GATEWAY_WRITE_ROUTE = "/v1/github-export/write";
export const GITHUB_GATEWAY_ROUTES = Object.freeze([
  GITHUB_GATEWAY_SESSION_STATUS_ROUTE,
  GITHUB_GATEWAY_REPOSITORY_LIST_ROUTE,
  GITHUB_GATEWAY_BRANCH_LIST_ROUTE,
  GITHUB_GATEWAY_REMOTE_INSPECT_ROUTE,
  GITHUB_GATEWAY_WRITE_ROUTE
]);
export const GITHUB_GATEWAY_ALLOWED_HEADERS = "Content-Type, X-Element-Catcher-Contract-Version";

export type GitHubGatewayRoute =
  | typeof GITHUB_GATEWAY_SESSION_STATUS_ROUTE
  | typeof GITHUB_GATEWAY_REPOSITORY_LIST_ROUTE
  | typeof GITHUB_GATEWAY_BRANCH_LIST_ROUTE
  | typeof GITHUB_GATEWAY_REMOTE_INSPECT_ROUTE
  | typeof GITHUB_GATEWAY_WRITE_ROUTE;

export type GitHubGatewayResponse =
  | GitHubExportGatewaySessionStatusResponseV1
  | GitHubExportGatewayRepositoryListResponseV1
  | GitHubExportGatewayBranchListResponseV1
  | GitHubExportGatewayRemoteInspectResponseV1
  | import("../../../extension/src/github/github-export-contract.js").GitHubExportSuccessResultV1;

export type GitHubGatewayTransport = {
  getSessionStatus(parsed: unknown): GitHubExportGatewaySessionStatusResponseV1;
  listRepositories(parsed: unknown): GitHubExportGatewayRepositoryListResponseV1;
  listBranches(parsed: unknown): GitHubExportGatewayBranchListResponseV1;
  inspectRemote(parsed: unknown): GitHubExportGatewayRemoteInspectResponseV1;
  writeFile(parsed: unknown): import("../../../extension/src/github/github-export-contract.js").GitHubExportSuccessResultV1;
};

export class GitHubGatewaySafeError extends Error {
  constructor(readonly code: GitHubExportErrorCode, readonly status: number) {
    super(safeMessageForGitHubError(code));
    this.name = "GitHubGatewaySafeError";
  }
}

export const githubGatewayNotConfiguredTransport: GitHubGatewayTransport = Object.freeze({
  getSessionStatus: handleGitHubGatewaySessionStatusRequest,
  listRepositories(parsed: unknown) {
    validateGitHubGatewayRepositoryListRequest(parsed);
    throw new GitHubGatewaySafeError("gateway_not_configured", statusForGitHubGatewayCode("gateway_not_configured"));
  },
  listBranches(parsed: unknown) {
    validateGitHubGatewayBranchListRequest(parsed);
    throw new GitHubGatewaySafeError("gateway_not_configured", statusForGitHubGatewayCode("gateway_not_configured"));
  },
  inspectRemote(parsed: unknown) {
    validateGitHubGatewayRemoteInspectRequest(parsed);
    throw new GitHubGatewaySafeError("gateway_not_configured", statusForGitHubGatewayCode("gateway_not_configured"));
  },
  writeFile(parsed: unknown) {
    validateGitHubExportApprovedWriteRequest(parsed);
    throw new GitHubGatewaySafeError("gateway_not_configured", statusForGitHubGatewayCode("gateway_not_configured"));
  }
});

export function handleGitHubGatewayRequest(
  route: GitHubGatewayRoute,
  parsed: unknown,
  transport: GitHubGatewayTransport = githubGatewayNotConfiguredTransport
): GitHubGatewayResponse {
  switch (route) {
    case GITHUB_GATEWAY_SESSION_STATUS_ROUTE:
      return transport.getSessionStatus(parsed);
    case GITHUB_GATEWAY_REPOSITORY_LIST_ROUTE:
      return transport.listRepositories(parsed);
    case GITHUB_GATEWAY_BRANCH_LIST_ROUTE:
      return transport.listBranches(parsed);
    case GITHUB_GATEWAY_REMOTE_INSPECT_ROUTE:
      return transport.inspectRemote(parsed);
    case GITHUB_GATEWAY_WRITE_ROUTE:
      return transport.writeFile(parsed);
  }
}

export function handleGitHubGatewaySessionStatusRequest(parsed: unknown): GitHubExportGatewaySessionStatusResponseV1 {
  validateGitHubGatewaySessionStatusRequest(parsed);
  return Object.freeze({
    contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
    kind: "github.session.status.v1",
    session: Object.freeze({
      state: "authorization_required"
    })
  });
}

export function githubGatewaySafeErrorResponse(code: GitHubExportErrorCode) {
  return githubSafeErrorResponse(code);
}

export function statusForGitHubGatewayCode(code: GitHubExportErrorCode) {
  switch (code) {
    case "invalid_request":
      return 400;
    case "authorization_required":
    case "authorization_expired":
      return 401;
    case "access_denied":
      return 403;
    case "repository_unavailable":
    case "branch_unavailable":
      return 404;
    case "remote_conflict":
    case "ambiguous_write":
    case "local_stale":
      return 409;
    case "rate_limited":
      return 429;
    case "gateway_not_configured":
      return 501;
    case "internal_error":
      return 500;
  }
}

export function validateGitHubGatewayContentLength(value: string | string[]) {
  if (Array.isArray(value) || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new GitHubGatewaySafeError("invalid_request", 400);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new GitHubGatewaySafeError("invalid_request", 400);
  }
  if (parsed > GITHUB_EXPORT_LIMITS.serializedGatewayRequestBytes) {
    throw new GitHubGatewaySafeError("invalid_request", 413);
  }
}
