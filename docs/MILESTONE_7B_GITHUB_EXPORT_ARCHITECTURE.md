# Milestone 7B GitHub Export Architecture

## 1. Status and Scope

Status: Current architecture slice for Milestone 7B. Milestone 7 is Current. Milestone 7A is Completed. Milestone 7B is Current. Milestone 7B is not Completed, and Milestone 7 is not Completed.

Milestone 7B defines one narrow GitHub handoff path for one explicitly selected persisted generated version. It does not implement runtime GitHub authentication, repository selection, or remote writes in this slice.

The intended user outcome is:

```text
Expanded generated-version row
  -> Export to GitHub
  -> authorize GitHub App session
  -> choose repository and existing branch
  -> choose or confirm one repository-relative .tsx path
  -> frozen Review
  -> explicit confirmation
  -> exactly one GitHub commit that creates or updates exactly one .tsx file
```

## 2. Current Repository Inventory

The accepted repository baseline provides:

- `extension/src/shared/generated-version-contract.ts`: validated V1 and V2 generated-version entries, generated-version IDs, `sourceCaptureId` ownership, and V2 lineage.
- `extension/src/shared/generation-contract.ts`: generated response validation, including non-empty `code` and validated `componentName`.
- `extension/src/export/generated-source-export.ts`: Milestone 7A deterministic `.tsx` filename helper and exact source payload helper.
- `extension/src/sidepanel/GeneratedVersionExport.tsx`: Milestone 7A row-local local export UI, authoritative IndexedDB reread, exact displayed-entry equality, `sourceCaptureId` ownership, stale fail-closed handling, Blob/object URL/anchor initiation, and cleanup.
- `extension/src/storage/indexed-db.ts`: IndexedDB version 2 with `captureRecords`, `screenshotAssets`, and `generatedComponentVersions`; one `generatedComponentVersions.sourceCaptureId` index; V1/V2 union generated-version readers.
- `extension/src/sidepanel/SavedCaptureDetail.tsx`: Saved Capture Detail, expanded generated-version rows, Preview, Revision/Regeneration, Comparison, and local `Export .tsx`.
- `backend/src/app.ts`: local generation and revision backend routes only, with provider-secret handling, safe error envelopes, CORS origin checks, request-size limits, and no GitHub route.
- `extension/manifest.json`: Manifest V3 with `activeTab` and `sidePanel` permissions, `http://127.0.0.1/*` host permission for the local backend, strict preview sandbox CSP, and no GitHub, identity, downloads, native messaging, or broad host permission.
- `package.json`: no GitHub SDK or OAuth dependency.

Milestone 7B Slice 1 preserves all source code, backend code, tests, package files, lockfiles, Manifest permissions, CSP, Preview protocol, IndexedDB schema, CaptureRecord contract, generated-version contract, and GitHub workflows.

## 3. Official-Source Research

Official GitHub and Chrome documentation consulted:

- GitHub Apps overview: `https://docs.github.com/en/apps/overview`
- Choosing permissions for a GitHub App: `https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app`
- Generating a user access token for a GitHub App: `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app`
- Refreshing user access tokens for a GitHub App: `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens`
- Creating an OAuth App: `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app`
- Authorizing OAuth Apps: `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps`
- Best practices for creating an OAuth App: `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app`
- Fine-grained personal access token permissions: `https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens`
- Repository contents API: `https://docs.github.com/en/rest/repos/contents`
- Branches API: `https://docs.github.com/en/rest/branches/branches`
- Git commits API: `https://docs.github.com/en/rest/git/commits`
- REST API rate limits: `https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api`
- Chrome extension identity API: `https://developer.chrome.com/docs/extensions/reference/api/identity`
- Chrome extension permission declaration: `https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions`
- Chrome extension permissions list: `https://developer.chrome.com/docs/extensions/reference/permissions-list`

Research conclusions:

- GitHub Apps are preferred over OAuth Apps in GitHub documentation because they provide fine-grained permissions, repository-level user control, and short-lived tokens.
- GitHub Apps have no permissions by default; the app registration must select the minimum required permissions.
- GitHub App user access tokens can be limited to resources that both the app and user can access. By default, user access tokens expire after eight hours and can be refreshed when expiring tokens are enabled.
- OAuth Apps can only act on behalf of a user, do not provide the same repository installation model, and are less suitable for narrow repository-scoped writes.
- OAuth client secrets and GitHub App client secrets must not be embedded in public client code. A Chrome extension is a public client unless a backend keeps the secret.
- Chrome `chrome.identity.launchWebAuthFlow` can launch a non-Google OAuth flow and complete when the provider redirects to `https://<app-id>.chromiumapp.org/*`, but use of the `identity` permission and redirect callback would require a Manifest review in a later implementation slice.
- The repository contents API supports one-file create/update through `PUT /repos/{owner}/{repo}/contents/{path}`. It requires Base64 content, a commit message, optional branch, and the current blob `sha` when updating.
- The contents API accepts GitHub App user access tokens, GitHub App installation access tokens, and fine-grained PATs when the token has `Contents` repository permission with write access.
- The branches API can list and get existing branches with `Contents` read access.
- REST rate limiting must be handled through safe UI states. Authenticated requests normally use the authenticated user's primary rate limit, and secondary rate limits may require waiting before retrying.

## 4. Product Definition

Milestone 7B is a portfolio-relevant GitHub handoff, not a publishing platform.

The user explicitly chooses `Export to GitHub` from one expanded generated-version row. The selected generated version may be V1, V2 Revision, or V2 Regeneration. Element Catcher creates or updates exactly one `.tsx` file in a user-selected repository and existing branch.

The GitHub file contents are exactly the persisted `entry.value.code` encoded as UTF-8 before Base64 transport to GitHub. The default filename uses the accepted Milestone 7A deterministic safe filename helper. Export remains independent from Preview eligibility and never executes, parses, transforms, compiles, evaluates, or iframes generated source.

Every GitHub write requires a fresh explicit user action and a frozen visible Review. No automatic GitHub write occurs after generation, revision, regeneration, Preview, Comparison, local `Export .tsx`, refresh, reopen, or navigation.

## 5. Authentication Options Comparison

| Option | Extension compatibility | Secret handling | Repository scoping | UX | Fit for 7B |
| --- | --- | --- | --- | --- | --- |
| GitHub App user authorization with backend-mediated session | Compatible with a later Chrome identity or browser redirect implementation, but token exchange and session custody belong on a backend | Client secret, refresh token, and API bearer token can stay server-side | Fine-grained app permissions plus repository installation access | Best long-term UX after install/authorization | Preferred |
| OAuth App authorization | Compatible with OAuth flows, but client secret cannot be safely embedded in extension code | Requires backend or public-client PKCE design; OAuth app repository access is broader and less installation-scoped | Scope-based, less aligned to selected repository access | Familiar but broader authorization surface | Rejected for preferred 7B path |
| Device authorization flow | Officially supported for GitHub Apps and OAuth Apps when appropriate, and avoids redirect handling | Does not require client secret for device-token exchange, but device flow is intended for constrained/headless contexts | Depends on app type and permissions | More friction: user copies code into GitHub | Development/protected-environment fallback only |
| Fine-grained PAT manually supplied by user | Technically works with contents API when configured with Contents write | User copies a token into the extension or backend; storage and phishing risks are high | Token can be repository-scoped, but user-managed | Poor and risky UX | Development fallback only; classic PAT is not approved |

Classic personal access tokens are not approved. Fine-grained PATs may be used only for local development or protected manual validation when no production authorization infrastructure exists.

## 6. Selected Authentication Architecture

Milestone 7B selects a GitHub App user authorization model with a narrow backend-mediated GitHub gateway.

Preferred implementation model:

- A GitHub App is registered with minimum repository permissions.
- The user installs or authorizes the GitHub App for selected repositories.
- The extension starts an explicit authorization flow only after a user action explaining why GitHub access is needed.
- A backend-owned GitHub gateway handles the GitHub App client secret, OAuth code exchange, refresh token handling, token rotation, revocation tracking, and GitHub API calls.
- The extension receives only an Element Catcher GitHub session handle and safe account/repository/branch/file metadata. It never receives raw GitHub access tokens or refresh tokens if backend-mediated calls can avoid it.

Backend is required for the preferred production architecture because the Chrome extension is a public client and cannot keep a GitHub App client secret or long-lived GitHub credential confidential. The GitHub gateway must be separate from the AI provider adapter and must not become a generic open proxy.

The later implementation may use `chrome.identity.launchWebAuthFlow` for the browser redirect experience, but adding the Chrome `identity` permission, redirect callback configuration, and any GitHub host permission is out of Slice 1 and must be reviewed before runtime work.

## 7. Extension and Backend Trust Boundaries

Extension responsibilities:

- Display account, repository, branch, path, operation, source byte count, current remote SHA, and commit message.
- Reread local generated-version state before freezing Review.
- Freeze a bounded Review and require explicit confirmation before a remote write.
- Send only approved generated-source export payload plus GitHub target metadata to the GitHub gateway.
- Never store GitHub tokens, OAuth codes, refresh tokens, cookies, or backend raw responses in IndexedDB, CaptureRecord, generated-version entries, exported source, URLs, logs, or source maps.

GitHub gateway responsibilities:

- Handle only GitHub authorization/session and approved GitHub API calls.
- Keep GitHub App client secret, user access tokens, refresh tokens, and installation details server-side.
- Enforce exact request contracts, source byte limits, path limits, branch limits, commit-message limits, and attempt ownership.
- Use allowlisted GitHub REST endpoints only.
- Normalize success and error envelopes.
- Avoid logging tokens, source payloads, OAuth codes, refresh tokens, raw response bodies, response headers, stack traces, cookies, or browser storage.
- Enforce CSRF/state/PKCE or equivalent official protections for the selected flow.
- Define session expiry, revocation, account change, repository access loss, and token retirement.
- Never receive screenshots or full `CaptureRecord` data for GitHub export.
- Never receive or reuse OpenAI/provider credentials in GitHub requests.

The existing AI local backend remains a development/demo topology. A production GitHub gateway requires its own hosted security model and must not be combined with AI provider routes as one generic proxy abstraction.

## 8. Minimum GitHub Permissions

GitHub App permissions for Milestone 7B:

- Repository `Contents`: read and write, limited to selected repositories.
- Metadata: implicit/minimum repository metadata needed by GitHub APIs.

No Milestone 7B permission is approved for:

- Actions or Workflows write;
- Administration;
- Issues;
- Pull requests;
- Releases;
- Deployments;
- Pages;
- Packages;
- Secrets;
- Webhooks beyond required GitHub App authorization lifecycle if the backend uses revocation events;
- Organization administration;
- branch protection management.

The architecture must reject target paths inside `.github/workflows/` so 7B does not require workflow permission and cannot create or modify GitHub Actions workflows.

## 9. Repository and Branch Discovery

Repository discovery must be scoped to repositories the current GitHub App session can access. The UI must show the authenticated GitHub account identity needed for confirmation and the selected repository owner/name. It must not infer repository or branch from page content, source URL, browser tab URL, local capture metadata, package name, or any generated source text.

Branch discovery uses official branch endpoints or backend-verified repository metadata to list existing branches. Milestone 7B cannot create branches. The user must select an existing branch. The selected branch's head commit SHA must be captured before Review and checked again immediately before write.

Repository and branch selections are ephemeral UI state and must be invalidated by account change, repository change, branch change, token/session retirement, Detail unmount, capture switch, or Review cancellation.

## 10. Target-Path Contract

Default target filename derives from the accepted Milestone 7A deterministic safe filename helper.

Target path is separate from filename and must be normalized and validated independently:

- repository-relative path only;
- UTF-8 text path after browser normalization;
- one `.tsx` file target;
- no absolute path;
- no empty segment;
- no `.` or `..` segment;
- no path traversal after normalization;
- no leading or trailing slash;
- no backslash;
- no query, fragment, NUL, ASCII control, Unicode control, or format characters;
- no `.github/workflows/` target;
- bounded segment length and total path length;
- no generated path from source URL, page title, capture title, notes, tags, or repository contents unless explicitly user-entered or user-confirmed.

If path validation fails, no Review is created and no GitHub request is sent.

## 11. Create and Update Write Model

Milestone 7B selects the repository contents API for one-file create/update.

Selected endpoint:

```text
PUT /repos/{owner}/{repo}/contents/{path}
```

Reasons:

- It is the official simple one-file create/update operation.
- It creates one commit for the file change.
- It accepts an explicit branch.
- It requires `sha` when updating, which supports stale remote conflict detection.
- It avoids custom blob/tree/commit/ref orchestration for the first GitHub handoff.

Create flow:

1. User selects repository and existing branch.
2. User confirms target path.
3. Gateway checks the path on that branch.
4. If the file is absent, Review shows operation `create`.
5. User confirms.
6. Gateway rechecks branch head and file absence.
7. Gateway sends Base64 exact source with bounded commit message and branch.
8. Gateway verifies the resulting commit and file bytes before success.

Update flow:

1. Gateway reads the existing file at target path and branch.
2. Review shows operation `update` and the current remote blob SHA.
3. User confirms overwrite.
4. Gateway rechecks branch head and current remote blob SHA.
5. Gateway sends Base64 exact source with `sha`, bounded commit message, and branch.
6. Gateway verifies the resulting commit and file bytes before success.

The implementation must not silently create branches, force-push, rewrite history, overwrite an unexpected remote version, retry against changed remote state, or infer the branch from browser page content.

Git data APIs for blobs, trees, commits, and refs remain a future option only if the contents API proves insufficient for a later multi-file or advanced workflow. They are not selected for 7B.

## 12. Remote Review Contract

Before any GitHub write, show one frozen Review containing only:

- authenticated GitHub account identity needed for confirmation;
- repository owner/name;
- existing branch;
- target path;
- operation: `create` or `update`;
- bounded commit message;
- exact source filename;
- exact UTF-8 source byte count;
- current remote file SHA when updating;
- current branch head SHA used by Review;
- statement that one remote commit will be created.

The Review must not contain:

- source URL;
- page title;
- screenshot;
- `CaptureRecord`;
- notes;
- tags;
- local storage keys;
- fingerprints;
- logical attempt IDs;
- provider metadata;
- raw backend data;
- GitHub access token;
- OAuth code;
- refresh token;
- cookies;
- browser storage contents.

The exact persisted generated source is sent only after Review and explicit confirmation.

## 13. Local Reread and Stale-State Ownership

Milestone 7B reuses Milestone 7A local ownership:

1. Snapshot the displayed validated generated-version entry.
2. Reread the selected generated-version ID from IndexedDB before freezing Review.
3. Require a valid V1 or V2 entry.
4. Require exact generated-version ID.
5. Require exact `sourceCaptureId`.
6. Require exact displayed-entry equality.
7. Fail closed if local state changed.

The local attempt is owned by:

- source capture ID;
- generated-version ID;
- displayed immutable entry snapshot;
- account ID/session handle;
- repository owner/name;
- branch;
- target path;
- Review token;
- current remote file SHA or absence state.

Capture switch, Detail unmount, account change, repository change, branch change, path change, Review cancellation, or token/session retirement invalidates pending work. Late responses from an older attempt must not update current UI.

## 14. Remote Conflict Ownership

Remote ownership requirements:

- Repository and branch selection must belong to the current authenticated GitHub App session.
- Branch head captured for Review must still match immediately before write.
- Existing file SHA shown in Review must still match immediately before update.
- File absence shown in Review must still be true immediately before create.
- Branch deletion, access loss, renamed repository, missing file during update, unexpected file during create, changed branch head, changed blob SHA, rate limit, or authentication failure must fail closed.

Remote stale state must never be overwritten silently. The UI must ask the user to refresh repository/branch/path state and review again.

## 15. Ambiguous-Write Reconciliation

GitHub remote writes cannot be claimed exactly-once by Element Catcher. A request may create a commit while the response is lost.

Safe reconciliation:

- Each confirmed Review creates a deterministic bounded client attempt marker that contains no local secret, no storage key, no capture ID, and no generated-version ID. A safe form is a short random export attempt label shown in Review and included in the bounded commit message footer, such as `Element-Catcher-Attempt: <public-random-id>`.
- After ambiguous transport, the gateway rereads the exact target path at the selected branch.
- It verifies whether the file bytes match the exact source bytes and whether the latest relevant commit message contains the public attempt marker.
- If the file bytes and commit marker match the confirmed Review, the UI may report verified success.
- If bytes, marker, branch head, or remote state do not match, the UI reports ambiguous or conflict state and requires manual refresh. It must not blindly resend the write.

This separates local deterministic attempt ownership from GitHub commit behavior. It also avoids pretending that one local confirmation guarantees exactly one remote commit in every network failure scenario.

## 16. UI State Model

Row-specific GitHub export states:

- signed out;
- authorization required;
- repository loading;
- repository selected;
- branch loading;
- branch selected;
- checking remote path;
- ready for Review;
- Review;
- sending;
- success;
- remote conflict;
- local stale state;
- authorization expired;
- rate limited;
- failed;
- cancelled.

State rules:

- No automatic authorization flow on Side Panel open.
- No automatic repository, branch, or path inference from page content.
- No automatic GitHub write after any other workflow.
- Success must identify repository, branch, path, and resulting commit URL or commit SHA.
- Success is shown only after remote verification.
- Leaving Detail clears ephemeral GitHub export UI state.
- Local `Export .tsx`, Comparison, Preview, Revision, and Regeneration remain independent.

## 17. Accessibility

The GitHub export workflow must use native keyboard-operable controls with accessible names:

- `Export to GitHub` row action;
- GitHub sign-in/authorize action;
- repository selector;
- branch selector;
- target-path text input;
- check path action when needed;
- Review confirmation;
- cancel/back actions.

The UI must not steal focus after async updates, must keep errors associated with the relevant controls, must not render secrets, and must announce success/failure states through existing safe status/alert patterns.

## 18. Error and Rate-Limit Model

Safe user-visible errors:

- authorization required;
- authorization expired;
- repository access lost;
- repository not found;
- branch deleted;
- branch changed;
- target path invalid;
- file already exists;
- file missing for update;
- remote SHA conflict;
- rate limited;
- ambiguous network result;
- failed.

Raw GitHub errors, response headers, stack traces, tokens, cookies, OAuth codes, refresh tokens, full response bodies, and source payloads must not be rendered or logged.

Rate-limit handling:

- Use response headers and gateway-normalized error envelopes.
- Do not continue retrying while rate limited.
- Show safe retry-after or reset information when available.
- Treat secondary rate limit as a safe blocked state, not a reason to automatically repeat writes.

## 19. Threat Analysis

| Threat | Required response |
| --- | --- |
| Token in extension source or committed files | Prohibited; backend owns secrets and tokens. |
| Token in IndexedDB or generated-version stores | Prohibited. |
| Token in logs, URLs, source maps, errors, analytics, or exported source | Prohibited. |
| Broad repository access | Use GitHub App selected-repository installation and minimum Contents permission. |
| Accidental workflow creation | Reject `.github/workflows/` paths and do not request Workflows permission. |
| Local generated-version stale state | Reread and require exact displayed-entry equality before Review. |
| Remote branch or file changed | Recheck branch head and file SHA/absence immediately before write; fail closed. |
| Ambiguous write response | Reconcile by rereading exact target path, bytes, and public attempt marker; do not blindly resend. |
| Capture switch or Detail unmount | Retire attempt and suppress stale UI updates. |
| Generated-source execution | Prohibited; GitHub export sends inert source bytes only after Review. |
| Provider credential crossover | Prohibited; GitHub gateway is separate from AI provider adapter. |

## 20. Test Matrix

Future implementation acceptance must include deterministic coverage for:

- V1 exact-source GitHub payload.
- V2 Revision exact-source GitHub payload.
- V2 Regeneration exact-source GitHub payload.
- accepted Milestone 7A filename reuse.
- target path validation.
- create Review.
- update Review with remote SHA.
- remote SHA conflict.
- branch head change.
- deleted branch.
- repository access loss.
- expired authorization.
- rate limit.
- network failure before write.
- ambiguous response after possible write.
- safe reconciliation success.
- safe reconciliation unresolved conflict.
- rapid double activation.
- capture switch.
- Detail unmount.
- account change during pending work.
- repository change during pending work.
- branch change during pending work.
- stale old response isolation.
- zero local IndexedDB writes.
- `CaptureRecord`, screenshot asset, and generated-version immutability.
- zero Preview, iframe, parsing, compilation, evaluation, or source execution.
- no OpenAI/provider calls.
- no source-page, content-script, or service-worker interaction unless explicitly required by the later chosen Chrome auth mechanism.
- no credential leakage in UI, logs, URLs, request bodies beyond approved authorization headers, errors, or exported source.
- local `Export .tsx`, Comparison, Preview, Revision, and Regeneration coexistence.
- default E2E remains headless.

Real GitHub writes should not be required in ordinary CI because committed tests must not require secrets. The future suite should use a deterministic local fake GitHub gateway and fake GitHub API. A separately documented protected-environment or manual validation gate must cover one real authorized create and update path before Milestone 7B is marked Completed.

## 21. Implementation Slices

Slice 1: feasibility and architecture.

- Official platform research.
- Authentication and write-model decision.
- Milestone 7B start.
- No runtime changes.

Slice 2: contracts and local preparation.

- Frozen shared request/response contracts.
- Local generated-entry reread.
- target-path validation.
- commit-message validation.
- authentication/session boundary foundation.
- deterministic unit and contract tests.

Slice 3: Review UI and one-file GitHub gateway path.

- repository/branch/path Review UI.
- one-file create/update implementation through the selected gateway.
- stale local state and remote conflict handling.
- focused integration tests with fake GitHub server/gateway.

Slice 4: hardening and closeout.

- protected real authorized validation where safely possible.
- ambiguous-write reconciliation.
- lifecycle, privacy, credential, and rate-limit hardening.
- full regression, audit, and documentation closeout after independent acceptance.

## 22. Acceptance Gates

Milestone 7B cannot be marked Completed until later implementation and hardening acceptance demonstrate:

- secure GitHub App authorization without embedding secrets in extension code;
- no raw GitHub token exposure to extension UI or persistent local stores when backend mediation is used;
- exact-source payload for V1 and V2 entries;
- Milestone 7A filename helper reuse;
- repository and existing branch selection scoped to the authenticated session;
- create and update Review with correct operation and remote SHA state;
- one-file contents API write with remote verification before success;
- stale local and remote state fail closed;
- ambiguous-write reconciliation without blind resend;
- credential-safe logging and error normalization;
- no local IndexedDB writes or capture/generated-version mutation;
- no Preview, iframe, source execution, source-page interaction, provider/OpenAI call, workflow creation, branch creation, repo creation, PR creation, issue creation, release, deployment, or Pages action;
- deterministic fake-server coverage plus protected/manual real GitHub validation;
- full regression and audit.

## 23. Explicit Exclusions

Milestone 7B does not include:

- runtime implementation in Slice 1;
- repository creation;
- pull-request creation;
- issue creation;
- branch creation;
- branch protection management;
- force push;
- workflow creation or Actions execution;
- releases;
- deployments;
- GitHub Pages;
- ZIP export;
- package export;
- general multi-file export;
- README generation;
- `package.json` generation;
- Tailwind configuration generation;
- CSS bundle generation;
- screenshot upload;
- `CaptureRecord` upload;
- cloud sync;
- continuous synchronization;
- background synchronization;
- team collaboration;
- Figma integration;
- additional framework targets.

## 24. Residual Risks

Residual risks after Slice 1:

- The selected GitHub App backend-mediated architecture still requires later implementation review for hosted backend security, session storage, CSRF/state/PKCE details, token refresh, revocation, and deployment policy.
- Chrome `identity` permission and redirect behavior must be reviewed before runtime implementation; Slice 1 adds no Manifest permission.
- Real GitHub writes cannot be safely validated in ordinary CI without credentials. A protected-environment or manual validation gate remains required.
- Repository contents API is selected for one-file export; if later GitHub API constraints appear for branch protection or enterprise policies, implementation must fail safely or document a blocked state rather than broadening scope.
- GitHub commit creation is remote state outside local deterministic control; ambiguous writes require reconciliation and cannot promise exactly-once remote commits.

## 25. Frozen Decisions

Frozen for Milestone 7B:

- One explicit `Export to GitHub` action targets exactly one selected persisted generated version.
- V1 and V2 generated-version entries are supported through existing validation.
- File contents are exactly persisted `entry.value.code`.
- Default filename reuses the accepted Milestone 7A deterministic safe filename helper.
- Target path is separately validated and repository-relative.
- GitHub App user authorization is the preferred auth model.
- A narrow backend-mediated GitHub gateway is required for the preferred production design.
- Minimum GitHub permission is selected-repository `Contents` read/write; `.github/workflows/` paths are rejected.
- Repository contents API one-file create/update is selected.
- Existing branch selection is required; no branch creation.
- Remote Review and explicit confirmation are required before every write.
- Branch head and file SHA/absence are rechecked immediately before write.
- Ambiguous writes are reconciled by rereading target path, exact bytes, and public attempt marker; no blind resend.
- No runtime code, backend route, tests, package, Manifest, permission, CSP, Preview protocol, schema, contract, workflow, token, or credential change is part of Slice 1.

## 26. Official Source References

- GitHub Apps overview: `https://docs.github.com/en/apps/overview`
- Choosing permissions for a GitHub App: `https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app`
- Generating a user access token for a GitHub App: `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app`
- Refreshing user access tokens: `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens`
- Creating an OAuth App: `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app`
- Authorizing OAuth Apps: `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps`
- Best practices for creating an OAuth App: `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app`
- Fine-grained PAT permissions: `https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens`
- Repository contents API: `https://docs.github.com/en/rest/repos/contents`
- Branches API: `https://docs.github.com/en/rest/branches/branches`
- Git commits API: `https://docs.github.com/en/rest/git/commits`
- REST API rate limits: `https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api`
- Chrome identity API: `https://developer.chrome.com/docs/extensions/reference/api/identity`
- Chrome permission declaration: `https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions`
- Chrome permissions list: `https://developer.chrome.com/docs/extensions/reference/permissions-list`
