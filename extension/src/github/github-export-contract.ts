import {
  assertExactObjectKeys,
  getUtf8ByteLength,
  isPlainObject
} from "../shared/generation-contract.js";

export const GITHUB_EXPORT_CONTRACT_VERSION = 1;
export const GITHUB_EXPORT_LIMITS = Object.freeze({
  targetPathBytes: 240,
  targetPathSegments: 8,
  targetPathSegmentBytes: 80,
  commitMessageBytes: 160,
  sessionReferenceBytes: 96,
  accountLoginBytes: 39,
  repositoryNameBytes: 100,
  branchNameBytes: 255,
  sourceBytes: 262_144,
  serializedGatewayRequestBytes: 65_536
});

export type GitHubExportValidationErrorCode =
  | "invalid_request"
  | "empty"
  | "too_long"
  | "too_many_segments"
  | "unsafe"
  | "wrong_extension"
  | "workflow_path"
  | "secret_like";

export type GitHubExportValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: GitHubExportValidationErrorCode; message: string };

export type GitHubExportErrorCode =
  | "invalid_request"
  | "authorization_required"
  | "authorization_expired"
  | "access_denied"
  | "repository_unavailable"
  | "branch_unavailable"
  | "remote_conflict"
  | "rate_limited"
  | "ambiguous_write"
  | "local_stale"
  | "gateway_not_configured"
  | "internal_error";

export type GitHubAccountSummaryV1 = Readonly<{
  accountId: string;
  login: string;
  displayName?: string;
  avatarUrl?: string;
}>;

export type GitHubRepositoryIdentityV1 = Readonly<{
  repositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  visibility: "private" | "public";
}>;

export type GitHubBranchIdentityV1 = Readonly<{
  name: string;
  headCommitSha: string;
}>;

export type GitHubRemoteFileStateV1 =
  | Readonly<{ status: "missing"; branchHeadCommitSha: string }>
  | Readonly<{ status: "existing"; blobSha: string; byteSize: number; branchHeadCommitSha: string }>;

export type GitHubExportOperationV1 = "create" | "update";
export type GitHubExportSessionStateV1 = "authorization_required" | "active" | "expired" | "revoked";

export type GitHubExportSessionSummaryV1 = Readonly<{
  state: GitHubExportSessionStateV1;
  sessionRef?: string;
  account?: GitHubAccountSummaryV1;
  expiresAt?: string;
}>;

export type GitHubExportReviewV1 = Readonly<{
  contractVersion: typeof GITHUB_EXPORT_CONTRACT_VERSION;
  account: GitHubAccountSummaryV1;
  repository: GitHubRepositoryIdentityV1;
  branch: GitHubBranchIdentityV1;
  targetPath: string;
  operation: GitHubExportOperationV1;
  commitMessage: string;
  sourceFilename: string;
  sourceByteCount: number;
  publicAttemptId: string;
  remoteFile: GitHubRemoteFileStateV1;
}>;

export type GitHubExportApprovedWriteRequestV1 = Readonly<{
  contractVersion: typeof GITHUB_EXPORT_CONTRACT_VERSION;
  sessionRef: string;
  review: GitHubExportReviewV1;
  source: string;
}>;

export type GitHubExportSuccessResultV1 = Readonly<{
  contractVersion: typeof GITHUB_EXPORT_CONTRACT_VERSION;
  ok: true;
  repository: GitHubRepositoryIdentityV1;
  branch: GitHubBranchIdentityV1;
  targetPath: string;
  operation: GitHubExportOperationV1;
  commitSha: string;
  commitUrl: string;
}>;

export type GitHubExportErrorResultV1 = Readonly<{
  contractVersion: typeof GITHUB_EXPORT_CONTRACT_VERSION;
  ok: false;
  error: {
    code: GitHubExportErrorCode;
    message: string;
  };
}>;

export type GitHubExportGatewaySessionStatusRequestV1 = Readonly<{
  contractVersion: typeof GITHUB_EXPORT_CONTRACT_VERSION;
  kind: "github.session.status.v1";
  sessionRef?: string;
}>;

export type GitHubExportGatewaySessionStatusResponseV1 = Readonly<{
  contractVersion: typeof GITHUB_EXPORT_CONTRACT_VERSION;
  kind: "github.session.status.v1";
  session: GitHubExportSessionSummaryV1;
}>;

const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SESSION_REF_PATTERN = /^github-session-[a-z0-9]{32,64}$/;
const PUBLIC_ATTEMPT_ID_PATTERN = /^github-export-attempt-[a-f0-9]{32}$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const UNICODE_SEPARATOR_LOOKALIKE_PATTERN = /[\u2044\u2215\u29f5\uff0f\uff3c]/u;
const SECRET_LIKE_PATTERN = /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{12,}|\b(?:bearer|token)\s+[A-Za-z0-9._~+/=-]{12,}/iu;
const PERCENT_ENCODED_UNSAFE_PATTERN = /%(?:2e|2f|5c)/iu;
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.tsx)?$/iu;

export function validateGitHubTargetPath(value: unknown): GitHubExportValidationResult<string> {
  if (typeof value !== "string") {
    return validationError("invalid_request", "Target path must be a string.");
  }
  if (value.length === 0) {
    return validationError("empty", "Target path is required.");
  }
  if (value.trim() !== value) {
    return validationError("unsafe", "Target path must not have leading or trailing whitespace.");
  }
  if (getUtf8ByteLength(value) > GITHUB_EXPORT_LIMITS.targetPathBytes) {
    return validationError("too_long", "Target path is too long.");
  }
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    CONTROL_PATTERN.test(value) ||
    UNICODE_SEPARATOR_LOOKALIKE_PATTERN.test(value) ||
    PERCENT_ENCODED_UNSAFE_PATTERN.test(value)
  ) {
    return validationError("unsafe", "Target path is not safe.");
  }

  const segments = value.split("/");
  if (segments.length > GITHUB_EXPORT_LIMITS.targetPathSegments) {
    return validationError("too_many_segments", "Target path has too many segments.");
  }
  if (isWorkflowPath(segments)) {
    return validationError("workflow_path", "GitHub workflow paths are not allowed.");
  }

  for (const segment of segments) {
    const segmentResult = validatePathSegment(segment);
    if (!segmentResult.ok) {
      return segmentResult;
    }
  }

  const filename = segments.at(-1) ?? "";
  if (!filename.endsWith(".tsx")) {
    return validationError("wrong_extension", "Target path must end in .tsx.");
  }
  const basename = filename.slice(0, -".tsx".length);
  const filenameResult = validateSafeFilenameBasename(basename, filename);
  if (!filenameResult.ok) {
    return filenameResult;
  }

  return { ok: true, value };
}

export function validateGitHubCommitMessage(value: unknown): GitHubExportValidationResult<string> {
  if (typeof value !== "string") {
    return validationError("invalid_request", "Commit message must be a string.");
  }
  if (value.length === 0 || value.trim().length === 0) {
    return validationError("empty", "Commit message is required.");
  }
  if (value.trim() !== value) {
    return validationError("unsafe", "Commit message must not have leading or trailing whitespace.");
  }
  if (CONTROL_PATTERN.test(value)) {
    return validationError("unsafe", "Commit message must be a single safe line.");
  }
  if (getUtf8ByteLength(value) > GITHUB_EXPORT_LIMITS.commitMessageBytes) {
    return validationError("too_long", "Commit message is too long.");
  }
  if (SECRET_LIKE_PATTERN.test(value)) {
    return validationError("secret_like", "Commit message must not contain credential-looking material.");
  }
  return { ok: true, value };
}

export function validateGitHubPublicAttemptId(value: unknown): GitHubExportValidationResult<string> {
  if (typeof value !== "string" || !PUBLIC_ATTEMPT_ID_PATTERN.test(value)) {
    return validationError("invalid_request", "GitHub export attempt id is invalid.");
  }
  return { ok: true, value };
}

export function validateGitHubSessionRef(value: unknown): GitHubExportValidationResult<string> {
  if (typeof value !== "string" || getUtf8ByteLength(value) > GITHUB_EXPORT_LIMITS.sessionReferenceBytes || !SESSION_REF_PATTERN.test(value)) {
    return validationError("invalid_request", "GitHub session reference is invalid.");
  }
  return { ok: true, value };
}

export function validateGitHubGatewaySessionStatusRequest(value: unknown): asserts value is GitHubExportGatewaySessionStatusRequestV1 {
  assertAllowedExactOrOptional(value, ["contractVersion", "kind"], ["sessionRef"]);
  const request = value as Record<string, unknown>;
  if (request.contractVersion !== GITHUB_EXPORT_CONTRACT_VERSION || request.kind !== "github.session.status.v1") {
    throw new Error("invalid_request");
  }
  rejectForbiddenCredentialFields(value);
  if (request.sessionRef !== undefined && !validateGitHubSessionRef(request.sessionRef).ok) {
    throw new Error("invalid_request");
  }
}

export function validateGitHubAccountSummary(value: unknown): asserts value is GitHubAccountSummaryV1 {
  assertAllowedExactOrOptional(value, ["accountId", "login"], ["displayName", "avatarUrl"]);
  const account = value as Record<string, unknown>;
  if (
    !isBoundedPlainString(account.accountId, 64) ||
    !isBoundedPlainString(account.login, GITHUB_EXPORT_LIMITS.accountLoginBytes) ||
    !GITHUB_LOGIN_PATTERN.test(account.login)
  ) {
    throw new Error("invalid_request");
  }
  if (account.displayName !== undefined && !isBoundedPlainString(account.displayName, 120)) {
    throw new Error("invalid_request");
  }
  if (account.avatarUrl !== undefined && !isSafeHttpsUrl(account.avatarUrl, 512)) {
    throw new Error("invalid_request");
  }
}

export function validateGitHubRepositoryIdentity(value: unknown): asserts value is GitHubRepositoryIdentityV1 {
  assertExactObjectKeys(value, ["repositoryId", "owner", "name", "fullName", "visibility"]);
  const repository = value as Record<string, unknown>;
  if (
    !isBoundedPlainString(repository.repositoryId, 64) ||
    !isBoundedPlainString(repository.owner, GITHUB_EXPORT_LIMITS.accountLoginBytes) ||
    !GITHUB_LOGIN_PATTERN.test(repository.owner) ||
    !isBoundedPlainString(repository.name, GITHUB_EXPORT_LIMITS.repositoryNameBytes) ||
    !GITHUB_REPOSITORY_NAME_PATTERN.test(repository.name) ||
    repository.fullName !== `${repository.owner}/${repository.name}` ||
    (repository.visibility !== "private" && repository.visibility !== "public")
  ) {
    throw new Error("invalid_request");
  }
}

export function validateGitHubBranchIdentity(value: unknown): asserts value is GitHubBranchIdentityV1 {
  assertExactObjectKeys(value, ["name", "headCommitSha"]);
  const branch = value as Record<string, unknown>;
  if (!isBoundedPlainString(branch.name, GITHUB_EXPORT_LIMITS.branchNameBytes) || !isGitSha(branch.headCommitSha)) {
    throw new Error("invalid_request");
  }
}

export function validateGitHubRemoteFileState(value: unknown): asserts value is GitHubRemoteFileStateV1 {
  if (!isPlainObject(value) || typeof value.status !== "string") {
    throw new Error("invalid_request");
  }
  const remoteFile = value as Record<string, unknown>;
  if (remoteFile.status === "missing") {
    assertExactObjectKeys(value, ["status", "branchHeadCommitSha"]);
    if (!isGitSha(remoteFile.branchHeadCommitSha)) {
      throw new Error("invalid_request");
    }
    return;
  }
  if (remoteFile.status === "existing") {
    assertExactObjectKeys(value, ["status", "blobSha", "byteSize", "branchHeadCommitSha"]);
    if (!isGitSha(remoteFile.blobSha) || !isGitSha(remoteFile.branchHeadCommitSha) || !isSafeNonNegativeInteger(remoteFile.byteSize, GITHUB_EXPORT_LIMITS.sourceBytes)) {
      throw new Error("invalid_request");
    }
    return;
  }
  throw new Error("invalid_request");
}

export function validateGitHubExportReview(value: unknown): asserts value is GitHubExportReviewV1 {
  assertExactObjectKeys(value, [
    "contractVersion",
    "account",
    "repository",
    "branch",
    "targetPath",
    "operation",
    "commitMessage",
    "sourceFilename",
    "sourceByteCount",
    "publicAttemptId",
    "remoteFile"
  ]);
  const review = value as Record<string, unknown>;
  if (review.contractVersion !== GITHUB_EXPORT_CONTRACT_VERSION || (review.operation !== "create" && review.operation !== "update")) {
    throw new Error("invalid_request");
  }
  validateGitHubAccountSummary(review.account);
  validateGitHubRepositoryIdentity(review.repository);
  validateGitHubBranchIdentity(review.branch);
  if (!validateGitHubTargetPath(review.targetPath).ok || !validateGitHubCommitMessage(review.commitMessage).ok) {
    throw new Error("invalid_request");
  }
  if (!isBoundedPlainString(review.sourceFilename, 100) || !String(review.sourceFilename).endsWith(".tsx")) {
    throw new Error("invalid_request");
  }
  if (!isSafeNonNegativeInteger(review.sourceByteCount, GITHUB_EXPORT_LIMITS.sourceBytes)) {
    throw new Error("invalid_request");
  }
  if (!validateGitHubPublicAttemptId(review.publicAttemptId).ok) {
    throw new Error("invalid_request");
  }
  validateGitHubRemoteFileState(review.remoteFile);
  if (review.operation === "create" && (review.remoteFile as GitHubRemoteFileStateV1).status !== "missing") {
    throw new Error("invalid_request");
  }
  if (review.operation === "update" && (review.remoteFile as GitHubRemoteFileStateV1).status !== "existing") {
    throw new Error("invalid_request");
  }
}

export function validateGitHubExportApprovedWriteRequest(value: unknown): asserts value is GitHubExportApprovedWriteRequestV1 {
  assertExactObjectKeys(value, ["contractVersion", "sessionRef", "review", "source"]);
  const request = value as Record<string, unknown>;
  if (request.contractVersion !== GITHUB_EXPORT_CONTRACT_VERSION || !validateGitHubSessionRef(request.sessionRef).ok) {
    throw new Error("invalid_request");
  }
  validateGitHubExportReview(request.review);
  if (typeof request.source !== "string" || getUtf8ByteLength(request.source) > GITHUB_EXPORT_LIMITS.sourceBytes) {
    throw new Error("invalid_request");
  }
  rejectForbiddenCredentialFields(value);
}

export function githubSafeErrorResponse(code: GitHubExportErrorCode): GitHubExportErrorResultV1 {
  return Object.freeze({
    contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
    ok: false,
    error: Object.freeze({
      code,
      message: safeMessageForGitHubError(code)
    })
  });
}

export function safeMessageForGitHubError(code: GitHubExportErrorCode) {
  switch (code) {
    case "invalid_request":
      return "The GitHub export request was invalid.";
    case "authorization_required":
      return "GitHub authorization is required.";
    case "authorization_expired":
      return "GitHub authorization has expired.";
    case "access_denied":
      return "GitHub access was denied.";
    case "repository_unavailable":
      return "The selected GitHub repository is unavailable.";
    case "branch_unavailable":
      return "The selected GitHub branch is unavailable.";
    case "remote_conflict":
      return "The remote GitHub file or branch changed.";
    case "rate_limited":
      return "GitHub export is rate limited.";
    case "ambiguous_write":
      return "The GitHub write result is ambiguous and requires reconciliation.";
    case "local_stale":
      return "The selected local generated version changed.";
    case "gateway_not_configured":
      return "GitHub export gateway is not configured.";
    case "internal_error":
      return "GitHub export failed safely.";
  }
}

export function rejectForbiddenCredentialFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    throw new Error("invalid_request");
  }
  if (/"(?:accessToken|refreshToken|token|authorization|authorizationHeader|oauthCode|clientSecret|cookie|cookies|screenshot|captureRecord|sourceUrl|pageTitle|notes|tags|providerMetadata|openAI|openai|storageKey)"\s*:/u.test(serialized)) {
    throw new Error("invalid_request");
  }
  if (SECRET_LIKE_PATTERN.test(serialized)) {
    throw new Error("invalid_request");
  }
}

function validatePathSegment(segment: string): GitHubExportValidationResult<string> {
  if (segment.length === 0) {
    return validationError("unsafe", "Target path must not contain empty segments.");
  }
  if (segment === "." || segment === ".." || segment.includes("..")) {
    return validationError("unsafe", "Target path must not contain traversal segments.");
  }
  if (segment.trim() !== segment || segment.startsWith(".") || segment.endsWith(".")) {
    return validationError("unsafe", "Target path segment is not safe.");
  }
  if (getUtf8ByteLength(segment) > GITHUB_EXPORT_LIMITS.targetPathSegmentBytes) {
    return validationError("too_long", "Target path segment is too long.");
  }
  if (WINDOWS_RESERVED_BASENAME_PATTERN.test(segment)) {
    return validationError("unsafe", "Target path segment is reserved.");
  }
  return { ok: true, value: segment };
}

function validateSafeFilenameBasename(basename: string, filename: string): GitHubExportValidationResult<string> {
  if (basename.length === 0 || basename.trim() !== basename || basename.startsWith(".") || basename.endsWith(".")) {
    return validationError("unsafe", "Target filename is not safe.");
  }
  if (basename.includes("..") || WINDOWS_RESERVED_BASENAME_PATTERN.test(basename) || filename.includes("%")) {
    return validationError("unsafe", "Target filename is not safe.");
  }
  return { ok: true, value: filename };
}

function isWorkflowPath(segments: readonly string[]) {
  return segments.length >= 2 && segments[0].toLowerCase() === ".github" && segments[1].toLowerCase() === "workflows";
}

function validationError(code: GitHubExportValidationErrorCode, message: string): GitHubExportValidationResult<never> {
  return { ok: false, code, message };
}

function isBoundedPlainString(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !CONTROL_PATTERN.test(value) && getUtf8ByteLength(value) <= maxBytes;
}

function isGitSha(value: unknown): value is string {
  return typeof value === "string" && GIT_SHA_PATTERN.test(value);
}

function isSafeNonNegativeInteger(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function isSafeHttpsUrl(value: unknown, maxBytes: number): value is string {
  if (!isBoundedPlainString(value, maxBytes)) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function assertAllowedExactOrOptional(value: unknown, required: readonly string[], optional: readonly string[]) {
  if (!isPlainObject(value)) {
    throw new Error("invalid_request");
  }
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value as Record<string, unknown>);
  if (actual.some((key) => !allowed.has(key)) || required.some((key) => !actual.includes(key))) {
    throw new Error("invalid_request");
  }
}
