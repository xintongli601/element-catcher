import {
  GITHUB_EXPORT_CONTRACT_VERSION,
  GITHUB_EXPORT_LIMITS,
  githubSafeErrorResponse,
  safeMessageForGitHubError,
  validateGitHubGatewaySessionStatusRequest,
  type GitHubExportErrorCode,
  type GitHubExportGatewaySessionStatusResponseV1
} from "../../../extension/src/github/github-export-contract.js";

export const GITHUB_GATEWAY_SESSION_STATUS_ROUTE = "/v1/github-export/session";
export const GITHUB_GATEWAY_ALLOWED_HEADERS = "Content-Type, X-Element-Catcher-Contract-Version";

export class GitHubGatewaySafeError extends Error {
  constructor(readonly code: GitHubExportErrorCode, readonly status: number) {
    super(safeMessageForGitHubError(code));
    this.name = "GitHubGatewaySafeError";
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
