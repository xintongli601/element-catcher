import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  GITHUB_EXPORT_CONTRACT_VERSION,
  safeMessageForGitHubError,
  validateGitHubCommitMessage,
  validateGitHubExportReview,
  validateGitHubTargetPath,
  type GitHubAccountSummaryV1,
  type GitHubBranchIdentityV1,
  type GitHubExportErrorCode,
  type GitHubExportReviewV1,
  type GitHubExportSuccessResultV1,
  type GitHubRepositoryIdentityV1
} from "../github/github-export-contract";
import { prepareGitHubGeneratedSourceExportAfterReread, type GitHubPreparedSourceModelV1 } from "../github/github-export-local";
import { createHttpGitHubExportTransport, type GitHubExportTransport } from "../github/github-export-transport";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract";

declare global {
  interface Window {
    __EC_GITHUB_EXPORT_TEST_LOOPBACK__?: true;
  }
}

const LOOPBACK_ORIGIN = "http://127.0.0.1:8787";

type TransportConfig =
  | { endpointCategory: "backend-unconfigured"; transport?: undefined }
  | { endpointCategory: "local-development-proxy"; transport: GitHubExportTransport };

type SelectionState = {
  token: number;
  sessionRef: string;
  account: GitHubAccountSummaryV1;
  repositories: readonly GitHubRepositoryIdentityV1[];
  selectedRepository?: GitHubRepositoryIdentityV1;
  branches: readonly GitHubBranchIdentityV1[];
  selectedBranch?: GitHubBranchIdentityV1;
  targetPath: string;
  commitMessage: string;
  pathMessage?: string;
  commitMessageError?: string;
};

type ReviewState = SelectionState & {
  review: GitHubExportReviewV1;
  prepared: GitHubPreparedSourceModelV1;
};

type GitHubExportState =
  | { status: "idle" }
  | { status: "checking-session"; token: number }
  | { status: "authorization-required"; message: string }
  | { status: "loading-repositories"; token: number; sessionRef: string; account: GitHubAccountSummaryV1 }
  | (SelectionState & { status: "repository-selected" | "loading-branches" | "branch-selected" | "checking-remote-target" | "ready-for-review" | "cancelled" })
  | (ReviewState & { status: "review" })
  | (ReviewState & { status: "sending" })
  | { status: "success"; result: GitHubExportSuccessResultV1 }
  | { status: "local-stale"; message: string }
  | { status: "remote-conflict"; message: string }
  | { status: "authorization-expired"; message: string }
  | { status: "rate-limited"; message: string }
  | { status: "failed"; message: string };

type OperationOwner = {
  token: number;
  controller: AbortController;
};

export function GitHubVersionExport({
  entry,
  sourceCaptureId
}: {
  entry: GeneratedComponentVersionEntry;
  sourceCaptureId: string;
}) {
  const tokenRef = useRef(0);
  const ownerRef = useRef<OperationOwner | null>(null);
  const writeInFlightRef = useRef(false);
  const [state, setState] = useState<GitHubExportState>({ status: "idle" });
  const busy = ["checking-session", "loading-repositories", "loading-branches", "checking-remote-target", "sending"].includes(state.status);

  useEffect(() => {
    writeInFlightRef.current = false;
    retire(ownerRef, tokenRef);
    setState({ status: "idle" });
    return () => {
      writeInFlightRef.current = false;
      retire(ownerRef, tokenRef);
    };
  }, [entry.id, sourceCaptureId]);

  const start = async () => {
    if (busy) {
      return;
    }
    const config = resolveGitHubTransportConfig();
    if (config.endpointCategory === "backend-unconfigured") {
      setState({ status: "authorization-required", message: "GitHub export gateway is not configured." });
      return;
    }
    const owner = begin(ownerRef, tokenRef);
    setState({ status: "checking-session", token: owner.token });
    const session = await config.transport.getSessionStatus(undefined, owner.controller.signal);
    if (!isCurrent(ownerRef, owner)) {
      return;
    }
    if (!session.ok) {
      setTerminalError(session.code, session.message);
      return;
    }
    if (session.value.session.state !== "active" || !session.value.session.sessionRef || !session.value.session.account) {
      setState({ status: "authorization-required", message: safeMessageForGitHubError("authorization_required") });
      return;
    }
    const { sessionRef, account } = session.value.session;
    setState({ status: "loading-repositories", token: owner.token, sessionRef, account });
    const repositories = await config.transport.listRepositories(sessionRef, owner.controller.signal);
    if (!isCurrent(ownerRef, owner)) {
      return;
    }
    if (!repositories.ok) {
      setTerminalError(repositories.code, repositories.message);
      return;
    }
    setState({
      status: "repository-selected",
      token: owner.token,
      sessionRef,
      account: repositories.value.account,
      repositories: repositories.value.repositories,
      branches: [],
      targetPath: `${entry.value.componentName}.tsx`,
      commitMessage: `Export ${entry.value.componentName}`
    });
  };

  const selectRepository = async (repositoryId: string) => {
    if (!("repositories" in state)) {
      return;
    }
    const selectedRepository = state.repositories.find((repository) => repository.repositoryId === repositoryId);
    if (!selectedRepository) {
      return;
    }
    const config = resolveGitHubTransportConfig();
    if (config.endpointCategory === "backend-unconfigured") {
      setState({ status: "authorization-required", message: "GitHub export gateway is not configured." });
      return;
    }
    const base = { ...state, selectedRepository, branches: [], selectedBranch: undefined };
    const owner = begin(ownerRef, tokenRef);
    setState({ ...base, status: "loading-branches", token: owner.token });
    const branches = await config.transport.listBranches({
      contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
      kind: "github.branches.list.v1",
      sessionRef: state.sessionRef,
      repository: selectedRepository
    }, owner.controller.signal);
    if (!isCurrent(ownerRef, owner)) {
      return;
    }
    if (!branches.ok) {
      setTerminalError(branches.code, branches.message);
      return;
    }
    setState({
      ...base,
      status: "branch-selected",
      token: owner.token,
      account: branches.value.account,
      selectedRepository: branches.value.repository,
      branches: branches.value.branches
    });
  };

  const updateSelection = (patch: Partial<Pick<SelectionState, "selectedBranch" | "targetPath" | "commitMessage">>) => {
    if (!isEditableSelectionState(state)) {
      return;
    }
    setState({
      ...state,
      ...patch,
      status: patch.selectedBranch || state.selectedBranch ? "branch-selected" : state.status,
      pathMessage: undefined,
      commitMessageError: undefined
    });
  };

  const createReview = async () => {
    if (!isEditableSelectionState(state) || !state.selectedRepository || !state.selectedBranch) {
      return;
    }
    const path = validateGitHubTargetPath(state.targetPath);
    const commitMessage = validateGitHubCommitMessage(state.commitMessage);
    if (!path.ok || !commitMessage.ok) {
      setState({
        ...state,
        status: "branch-selected",
        pathMessage: path.ok ? undefined : path.message,
        commitMessageError: commitMessage.ok ? undefined : commitMessage.message
      });
      return;
    }
    const config = resolveGitHubTransportConfig();
    if (config.endpointCategory === "backend-unconfigured") {
      setState({ status: "authorization-required", message: "GitHub export gateway is not configured." });
      return;
    }
    const owner = begin(ownerRef, tokenRef);
    setState({ ...state, status: "checking-remote-target", token: owner.token });
    const publicAttemptId = createPublicAttemptId();
    const prepared = await prepareGitHubGeneratedSourceExportAfterReread({
      displayedEntry: entry,
      sourceCaptureId,
      targetPath: path.value,
      commitMessage: commitMessage.value,
      publicAttemptId
    });
    if (!isCurrent(ownerRef, owner)) {
      return;
    }
    if (!prepared.ok) {
      setState({ status: prepared.code === "local_stale" ? "local-stale" : "failed", message: prepared.message });
      return;
    }
    const inspection = await config.transport.inspectRemote({
      contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
      kind: "github.remote.inspect.v1",
      sessionRef: state.sessionRef,
      repository: state.selectedRepository,
      branchName: state.selectedBranch.name,
      targetPath: prepared.value.targetPath
    }, owner.controller.signal);
    if (!isCurrent(ownerRef, owner)) {
      return;
    }
    if (!inspection.ok) {
      setTerminalError(inspection.code, inspection.message);
      return;
    }
    const review: GitHubExportReviewV1 = Object.freeze({
      contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
      account: inspection.value.account,
      repository: inspection.value.repository,
      branch: inspection.value.branch,
      targetPath: inspection.value.targetPath,
      operation: inspection.value.operation,
      commitMessage: prepared.value.commitMessage,
      sourceFilename: prepared.value.filename,
      sourceByteCount: prepared.value.sourceByteCount,
      publicAttemptId: prepared.value.publicAttemptId,
      remoteFile: inspection.value.remoteFile
    });
    try {
      validateGitHubExportReview(review);
    } catch {
      setState({ status: "failed", message: safeMessageForGitHubError("invalid_request") });
      return;
    }
    setState({
      ...state,
      status: "review",
      token: owner.token,
      account: inspection.value.account,
      selectedRepository: inspection.value.repository,
      selectedBranch: inspection.value.branch,
      review,
      prepared: prepared.value
    });
  };

  const confirmWrite = async () => {
    if (state.status !== "review" || writeInFlightRef.current) {
      return;
    }
    writeInFlightRef.current = true;
    const config = resolveGitHubTransportConfig();
    if (config.endpointCategory === "backend-unconfigured") {
      writeInFlightRef.current = false;
      setState({ status: "authorization-required", message: "GitHub export gateway is not configured." });
      return;
    }
    const owner = begin(ownerRef, tokenRef);
    setState({ ...state, status: "sending", token: owner.token });
    const currentPrepared = await prepareGitHubGeneratedSourceExportAfterReread({
      displayedEntry: entry,
      sourceCaptureId,
      targetPath: state.review.targetPath,
      commitMessage: state.review.commitMessage,
      publicAttemptId: state.review.publicAttemptId
    });
    if (!isCurrent(ownerRef, owner)) {
      writeInFlightRef.current = false;
      return;
    }
    if (!currentPrepared.ok || JSON.stringify(currentPrepared.value) !== JSON.stringify(state.prepared)) {
      writeInFlightRef.current = false;
      setState({ status: "local-stale", message: safeMessageForGitHubError("local_stale") });
      return;
    }
    const result = await config.transport.writeFile({
      contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
      sessionRef: state.sessionRef,
      review: state.review,
      source: state.prepared.source
    }, owner.controller.signal);
    if (!isCurrent(ownerRef, owner)) {
      writeInFlightRef.current = false;
      return;
    }
    if (!result.ok) {
      writeInFlightRef.current = false;
      setTerminalError(result.code, result.message);
      return;
    }
    writeInFlightRef.current = false;
    setState({ status: "success", result: result.value });
  };

  const cancelReview = () => {
    if (state.status !== "review") {
      return;
    }
    setState({
      ...state,
      status: "cancelled",
      review: undefined,
      prepared: undefined
    } as SelectionState & { status: "cancelled" });
  };

  const setTerminalError = (code: GitHubExportErrorCode, message: string) => {
    if (code === "authorization_expired" || code === "authorization_required" || code === "access_denied") {
      setState({ status: "authorization-expired", message });
    } else if (code === "remote_conflict") {
      setState({ status: "remote-conflict", message });
    } else if (code === "rate_limited") {
      setState({ status: "rate-limited", message });
    } else {
      setState({ status: "failed", message });
    }
  };

  return (
    <div className="github-export">
      <button
        className="secondary-action compact-action"
        type="button"
        aria-label={`Export to GitHub for ${entry.value.componentName} - ${entry.createdAt}`}
        disabled={busy}
        onClick={() => void start()}
      >
        Export to GitHub
      </button>
      {state.status === "checking-session" ? <Status text="Checking GitHub session..." /> : null}
      {state.status === "authorization-required" ? <Alert text={state.message} /> : null}
      {state.status === "loading-repositories" ? <Status text="Loading GitHub repositories..." /> : null}
      {"repositories" in state ? (
        <div className="github-export-panel">
          <p className="empty-note">GitHub account: {state.account.login}</p>
          <label>
            Repository
            <select
              aria-label="GitHub repository"
              value={state.selectedRepository?.repositoryId ?? ""}
              disabled={busy}
              onChange={(event) => void selectRepository(event.currentTarget.value)}
            >
              <option value="">Select repository</option>
              {state.repositories.map((repository) => (
                <option key={repository.repositoryId} value={repository.repositoryId}>
                  {repository.fullName}
                </option>
              ))}
            </select>
          </label>
          {state.status === "loading-branches" ? <Status text="Loading GitHub branches..." /> : null}
          {state.selectedRepository ? (
            <label>
              Branch
              <select
                aria-label="GitHub branch"
                value={state.selectedBranch?.name ?? ""}
                disabled={busy || state.branches.length === 0}
                onChange={(event) => updateSelection({ selectedBranch: state.branches.find((branch) => branch.name === event.currentTarget.value) })}
              >
                <option value="">Select branch</option>
                {state.branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {state.selectedRepository && state.selectedBranch ? (
            <>
              <label>
                Target path
                <input
                  aria-label="GitHub target path"
                  value={state.targetPath}
                  disabled={busy}
                  onChange={(event) => updateSelection({ targetPath: event.currentTarget.value })}
                />
              </label>
              {state.pathMessage ? <Alert text={state.pathMessage} /> : null}
              <label>
                Commit message
                <input
                  aria-label="GitHub commit message"
                  value={state.commitMessage}
                  disabled={busy}
                  onChange={(event) => updateSelection({ commitMessage: event.currentTarget.value })}
                />
              </label>
              {state.commitMessageError ? <Alert text={state.commitMessageError} /> : null}
              <button className="primary-action compact-action" type="button" disabled={busy} onClick={() => void createReview()}>
                Review GitHub export
              </button>
            </>
          ) : null}
          {state.status === "checking-remote-target" ? <Status text="Checking GitHub target..." /> : null}
          {state.status === "review" || state.status === "sending" ? (
            <GitHubReviewPanel state={state} sending={state.status === "sending"} onConfirm={() => void confirmWrite()} onCancel={cancelReview} />
          ) : null}
          {state.status === "cancelled" ? <Status text="GitHub export cancelled." /> : null}
        </div>
      ) : null}
      {state.status === "success" ? <Success result={state.result} /> : null}
      {state.status === "local-stale" || state.status === "remote-conflict" || state.status === "authorization-expired" || state.status === "rate-limited" || state.status === "failed" ? (
        <Alert text={state.message} />
      ) : null}
    </div>
  );
}

function GitHubReviewPanel({
  state,
  sending,
  onConfirm,
  onCancel
}: {
  state: ReviewState;
  sending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const review = state.review;
  return (
    <section className="github-review" aria-labelledby={`github-review-${review.publicAttemptId}`}>
      <h4 id={`github-review-${review.publicAttemptId}`}>GitHub export Review</h4>
      <dl className="preview-metadata">
        <Metadata label="Account" value={review.account.login} />
        <Metadata label="Repository" value={review.repository.fullName} />
        <Metadata label="Branch" value={review.branch.name} />
        <Metadata label="Target path" value={review.targetPath} />
        <Metadata label="Operation" value={review.operation} />
        <Metadata label="Commit message" value={review.commitMessage} />
        <Metadata label="Source filename" value={review.sourceFilename} />
        <Metadata label="Source byte count" value={String(review.sourceByteCount)} />
        <Metadata label="Remote blob SHA" value={review.remoteFile.status === "existing" ? review.remoteFile.blobSha : "None"} />
        <Metadata label="Branch head SHA" value={review.branch.headCommitSha} />
        <Metadata label="Remote commit" value="One remote commit will be created." />
      </dl>
      {sending ? <Status text="Sending GitHub export..." /> : null}
      <div className="github-export-actions">
        <button className="primary-action compact-action" type="button" disabled={sending} onClick={onConfirm}>
          Confirm GitHub write
        </button>
        <button className="secondary-action compact-action" type="button" disabled={sending} onClick={onCancel}>
          Cancel GitHub export
        </button>
      </div>
    </section>
  );
}

function Success({ result }: { result: GitHubExportSuccessResultV1 }) {
  return (
    <section className="save-state save-state-success" role="status" aria-labelledby={`github-export-success-${result.commitSha}`}>
      <h4 id={`github-export-success-${result.commitSha}`}>GitHub export succeeded</h4>
      <dl className="preview-metadata">
        <Metadata label="Repository" value={result.repository.fullName} />
        <Metadata label="Branch" value={result.branch.name} />
        <Metadata label="Target path" value={result.targetPath} />
        <Metadata label="Operation" value={result.operation} />
        <Metadata label="Commit SHA" value={result.commitSha} />
        <Metadata label="Commit URL" value={result.commitUrl} />
      </dl>
    </section>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Status({ text }: { text: string }) {
  return (
    <p className="save-state save-state-saving" role="status">
      {text}
    </p>
  );
}

function Alert({ text }: { text: string }) {
  return (
    <p className="save-state save-state-failed" role="alert">
      {text}
    </p>
  );
}

function resolveGitHubTransportConfig(): TransportConfig {
  const configured = (import.meta.env as Record<string, string | undefined>).VITE_ELEMENT_CATCHER_GITHUB_GATEWAY_URL;
  const testLoopback = window.navigator.webdriver === true && window.__EC_GITHUB_EXPORT_TEST_LOOPBACK__ === true;
  if (configured === LOOPBACK_ORIGIN || testLoopback) {
    return { endpointCategory: "local-development-proxy", transport: createHttpGitHubExportTransport(LOOPBACK_ORIGIN) };
  }
  return { endpointCategory: "backend-unconfigured" };
}

function begin(ownerRef: MutableRefObject<OperationOwner | null>, tokenRef: MutableRefObject<number>): OperationOwner {
  retire(ownerRef, tokenRef);
  const owner = { token: tokenRef.current + 1, controller: new AbortController() };
  tokenRef.current = owner.token;
  ownerRef.current = owner;
  return owner;
}

function retire(ownerRef: MutableRefObject<OperationOwner | null>, tokenRef: MutableRefObject<number>) {
  ownerRef.current?.controller.abort();
  ownerRef.current = null;
  tokenRef.current += 1;
}

function isCurrent(ownerRef: MutableRefObject<OperationOwner | null>, owner: OperationOwner) {
  return ownerRef.current === owner && !owner.controller.signal.aborted;
}

function createPublicAttemptId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `github-export-attempt-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function isEditableSelectionState(state: GitHubExportState): state is SelectionState & {
  status: "repository-selected" | "branch-selected" | "ready-for-review" | "cancelled";
} {
  return ["repository-selected", "branch-selected", "ready-for-review", "cancelled"].includes(state.status);
}
