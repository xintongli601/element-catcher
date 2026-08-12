# Element Catcher v0.1 Development Brief

## 1. Objective

Describe the current Element Catcher architecture after completion of Milestones 1 through 10 and the current Milestone 11 user-assisted interaction capture work.

Current implementation order:

```text
Milestones 1-5: Completed
Milestone 6: Completed
Milestone 6A: Completed
Milestone 6B: Completed
Milestone 6C: Completed
Milestone 6D: Completed
Milestone 6E: Completed
Milestone 7: Completed
Milestone 7A: Completed
Milestone 7B: Completed
Milestone 8: Completed
Milestone 9: Completed
Milestone 9 Slice 1: Completed and accepted at 13fa1fdb1d0ff36cd2aa305336b0d7302bd8ab33
Milestone 9 Slice 2: Completed
Milestone 10: Completed / Accepted
Milestone 10 Slice 1: Completed / Accepted at b0ed05823c530b2b0632c5db3bdb189459719f0d
Milestone 10 Slice 2: Completed / Accepted at 5b6a0b81c75a2c7c354a630620ec62e784a9bc99
Milestone 10 Slice 3: Not created
Milestone 11: Local implementation complete; pending independent ChatGPT final acceptance
Milestone 11 Slice 1: Completed / Accepted at 23ff038b2e02a9f8bb3b08824a2f52180175b1df
Milestone 11 Slice 2: Local implementation complete - Interaction Reaction model and Minimal Hover Capture Assist
Milestone 12: Not started
```

Milestone 6E completed local generated-version comparison and final Milestone 6 integrated regression. Milestone 7 is Completed based on accepted Milestone 7A one narrow local `.tsx` export path and accepted Milestone 7B deterministic fake/development single-file GitHub export workflow. Milestone 8 is Completed: Slice 1 architecture and feasibility, Slice 2 pure Bundle V1 contracts/ZIP32 writer, Slice 3 Side Panel row workflow, and Slice 4 lifecycle hardening and final acceptance are completed and accepted. Milestone 9 is Completed for portfolio/demo readiness. Milestone 10 is Completed / Accepted for browser-native capture of UI state the user already has access to, without requiring the source page to be publicly reachable or remotely re-fetched. Slice 1 implements bounded Start Capture recovery for supported ordinary webpages when the current content runtime is unavailable and is Completed / Accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d`. Slice 2 is Completed / Accepted at `5b6a0b81c75a2c7c354a630620ec62e784a9bc99` for browser-session trust and privacy UX. No Slice 3 was created for Milestone 10. Milestone 11 is locally implemented for bounded user-assisted Interaction Capture V1, pending independent ChatGPT final acceptance. Slice 1 is Completed / Accepted at `23ff038b2e02a9f8bb3b08824a2f52180175b1df`; Slice 2 adds Trigger / Before -> Interaction -> Primary Reaction plus optional Additional Reactions and Minimal Hover Capture Assist. M12 is not started. Element Catcher is a portfolio-ready local v0.1 demonstration, not production-ready, SaaS, store-ready, deployed, or production GitHub-integrated. Real GitHub authorization, OAuth exchange, token storage, real GitHub REST transport, and production GitHub writes are not implemented.

## 2. Current Architecture

```text
Supported webpage
  -> content script selection and extraction
  -> background screenshot capture
  -> CaptureRecord assembly
  -> IndexedDB local persistence
  -> Capture Library
  -> generation Review data
  -> provider-neutral transport
  -> local backend/proxy
  -> provider adapter
  -> generated-version persistence
  -> isolated Preview
  -> revision/regeneration Review
  -> immutable V2 generated-version persistence
  -> local generated-version comparison
  -> local generated-source export
  -> deterministic fake/development GitHub export workflow
  -> local portable component bundle export
  -> portfolio/demo reviewer documentation
  -> local Interaction Pair V1 persistence for Trigger / Interaction / Reaction(s)
  -> minimal page-side Enter quick capture for visible hover states
```

The `CaptureRecord` remains the immutable source capture. Generated versions have a separate lifecycle and are linked to the source capture through a generated-version persistence envelope.

## 3. Development Principles

- Keep the MVP focused on Capture -> Save -> Organize -> Rebuild -> Preview -> Revise/Regenerate.
- Keep generated-version comparison local, read-only, deterministic, and ephemeral.
- Keep local generated-source export explicit, source-only, deterministic, and independent from Preview.
- Keep GitHub export explicit, single-file, Review-gated, fail-closed, and separate from local generated-source persistence.
- Preserve local-first behavior by default.
- Treat raw extraction data as intermediate input, not the persisted product.
- Normalize persisted capture data into `CaptureRecord v1`.
- Store screenshot binary data as referenced local assets.
- Do not persist live DOM references or unsanitized raw `outerHTML`.
- Preserve the distinction between original captures and generated component versions.
- Keep provider secrets out of extension code, browser storage, IndexedDB, logs, source maps, and committed files.
- Treat captured strings and user metadata as untrusted data.
- Execute only accepted Previewable Subset V1 render plans in the isolated Milestone 6C sandbox.
- Keep revised and regenerated source inert until the user explicitly chooses Preview.
- Avoid unnecessary dependencies and permissions.
- Keep Milestone 9 bounded to reviewer readiness. Slice 2 runtime clarity work did not expand product capability, and real Chrome manual smoke evidence is recorded only as user-confirmed manual evidence.

## 4. Module Responsibilities

### 4.1 Side Panel

The Side Panel owns the user workflow:

- Start capture.
- Display selection, capture, save, library, detail, metadata edit, delete, search, filter, generation, and generated-version states.
- Render Capture Preview from persisted data.
- Render saved-capture detail from local read models.
- Show Review data for generation.
- Require consent before generation transport.
- Display generated code as inert source text.
- Open generated versions from saved-capture detail.
- Preview supported generated source through the explicit Milestone 6C sandbox action.
- Start trusted Revision or Regeneration from a selected generated version.
- Show exact frozen revision/regeneration Review data and require consent before transport.
- Persist successful revision/regeneration results as immutable V2 generated-version entries.
- Compare exactly two distinct persisted generated versions for the same source capture through explicit Baseline and Candidate selection.
- Export one explicitly selected persisted generated version's exact stored source as a local `.tsx` file after rereading and validating the entry at export time.
- Mount the Milestone 7B `Export to GitHub` row action for one selected generated version, one selected repository, one existing branch, one `.tsx` path, and a frozen Review before any fake/development write.
- Mount the Milestone 8 `Export bundle` row action for one selected generated version and one local Bundle V1 ZIP download.
- Mount the Milestone 11 Interaction Pair workflow for choosing Trigger / Before, Primary Reaction, optional Additional Reactions, and one V1 interaction trigger, then saving/reopening/inspecting/deleting the local pair.
- Surface the Milestone 11 Slice 2 Enter quick-capture instruction while selection mode is active.

### 4.2 Background Service Worker

The background service worker coordinates privileged extension actions:

- Configure side panel open behavior.
- Route selection commands between the side panel and active tab.
- Guard unsupported pages.
- Keep regular webpages the user can access in Chrome, including many authenticated or private pages, distinct from Chrome-protected browser surfaces where content scripts cannot run.
- Recover Start Capture by programmatically injecting the packaged content script at most once only when a supported ordinary active tab is missing the current content runtime and Chrome permits the active-tab grant.
- Capture the current visible tab through `chrome.tabs.captureVisibleTab`.
- Keep privileged Chrome APIs out of content scripts.

It does not contain provider credentials and does not call OpenAI directly.

### 4.3 Content Script

The content script handles supported-page interaction:

- Selection mode.
- Hover overlay and label.
- Click-to-lock selection.
- Enter quick capture of the current highlighted hover state while selection mode is active.
- Parent/Child refinement.
- Confirm and cancellation.
- Overlay cleanup before screenshot capture.
- Privacy-safe DOM extraction.
- Normalized style extraction.
- Optional pseudo-element snapshots.
- Semantic summaries.

The content script does not persist captures permanently, does not store provider credentials, and does not bypass browser access controls.

### 4.4 Shared Contracts and Validators

Shared modules define browser-independent contracts and validators:

- Extension messages.
- `CaptureRecord v1` types and validation.
- JSON compatibility helpers.
- Generation request and response contracts.
- Revision request/input contracts.
- Request projection limits.
- Canonical JSON and fingerprint helpers.
- Generated-version V1/V2 persistence contract.
- Preview protocol and Previewable Subset V1 policy.

These modules keep backend, extension, and tests aligned on exact schema and limit behavior.

### 4.5 CaptureRecord Assembly

CaptureRecord assembly converts confirmed extraction plus verified screenshot metadata into one complete `CaptureRecord v1`:

- `schemaVersion: 1`.
- Stable capture id.
- ISO `createdAt`.
- Source, environment, element, DOM, style, pseudo-style, and summary fields.
- Stable screenshot asset reference.
- User library metadata.
- Required `generatedVersions` compatibility field initialized as an empty array.

The screenshot data URL is not stored in the `CaptureRecord`.

### 4.6 IndexedDB Repositories

Current persistence architecture:

```text
IndexedDB version: 3

Stores:
- captureRecords
- screenshotAssets
- generatedComponentVersions
- interactionPairs

Index:
- generatedComponentVersions.sourceCaptureId
```

Repository responsibilities:

- Atomic capture and screenshot writes.
- Capture read models.
- Metadata replacement with validation and read-back.
- Atomic deletion and rollback behavior.
- Generated-version add, direct read, list, and source-deletion cascade.
- Generated-version V1/V2 union read paths.
- V2 revision/regeneration target persistence and recovery.
- Complete source `CaptureRecord v1` validation for generated-version linkage.
- Complete selected source generated-version validation for V2 lineage.
- Orphan cleanup when generated versions no longer have a valid source capture.
- Deterministic generated-version ordering.
- Interaction Pair V1 add, read, list, and delete paths with safe incomplete-pair read models when referenced captures are missing.

The database is at version 3 with exactly the four stores above and one generated-version source index.

### 4.7 Capture Library

The Capture Library is implemented as local UI over persisted captures:

- List all valid explicitly saved captures.
- Reopen saved detail.
- Display Blob-backed previews.
- Edit user-managed title, component type, tags, and notes.
- Delete captures.
- Search and filter with approved field allowlists.
- Preserve source `CaptureRecord` and screenshot asset integrity.

Search/filter state is session-only and does not write to persistence.

### 4.7.1 Interaction Pair Library

Milestone 11 adds a local Interaction Pair V1 Library workflow:

- Select one existing saved capture as Trigger / Before.
- Select a distinct existing saved capture as Primary Reaction.
- Optionally select Additional Reactions that are distinct from Trigger / Before and Primary Reaction.
- Select exactly one approved interaction trigger: click, toggle, hover, or focus.
- Save a separate interaction-pair record that references captures by stable local IDs.
- Reopen the pair and inspect Trigger / Before, Interaction, Primary Reaction, optional Additional Reactions, and source screenshots.
- Delete the pair without deleting its source captures.
- Mark the pair incomplete when a referenced capture is missing rather than duplicating or fabricating source data.

### 4.8 Generation Workflow

The generation workflow is implemented from saved capture detail:

- Reread and validate saved capture and screenshot before generation.
- Build the exact outbound projection.
- Compute local review fingerprint.
- Show Review data before transmission.
- Require explicit consent.
- Create Base64 screenshot data URL only after consent and immediately before transport.
- Revalidate source and screenshot before sending and before persistence.
- Abort transport and persistence where practical.
- Validate responses before persistence.
- Persist generated versions only after source linkage and fingerprint checks.

Generated code remains inert text unless the user explicitly chooses Preview.

### 4.9 Preview Workflow

The accepted Milestone 6C Preview workflow is implemented from saved-capture detail:

- Preview is an explicit user action on a persisted generated version.
- Generated source is sent only to the packaged sandbox host.
- The host parses JSX with the approved parser and converts accepted source into `PreviewRenderPlanV1`.
- The trusted Side Panel validates identities, message direction, request/session data, source hash, component name, plan schema, and plan hash before relay.
- The sandbox render realm receives only the validated data plan and renders through trusted React.
- Unsupported or unsafe generated source remains visible as inert source text.
- Preview does not mutate captures or generated versions and does not auto-open after revision/regeneration persistence.

### 4.10 Provider-Neutral Transport

The extension depends on a provider-neutral transport boundary:

```ts
type GenerationTransport = {
  generate(request: ComponentGenerationRequestV1, signal: AbortSignal): Promise<ComponentGenerationResponseV1>;
};
```

The extension contract does not expose OpenAI SDK objects, provider response IDs, raw provider errors, raw provider bodies, or API keys.

Revision and regeneration use a separate provider-neutral transport boundary for `POST /v1/revise-component`. The idempotency header is bound to the frozen `logicalAttemptId`, transport Retry reuses the same frozen Review identity, and successful responses must preserve the selected source `componentName`.

### 4.11 Local Backend and Provider Adapter

The local backend/proxy is the Milestone 5 development/demo topology:

- Receives only the approved request contract.
- Enforces request-size and shape limits.
- Validates PNG data URL, decoded bytes, and decoded dimensions.
- Keeps provider secrets server-side.
- Calls the OpenAI Responses API through the backend provider adapter when configured.
- Uses provider settings such as `store: false` and no provider tools.
- Normalizes provider responses into the Element Catcher response contract.
- Normalizes backend/provider errors into safe error envelopes.
- Avoids payload and secret logging.
- Hosts the dedicated revision/regeneration route `POST /v1/revise-component` behind the same provider-neutral privacy and error-normalization boundary.
- Keeps revision prompt construction source-controlled and excludes local IDs, source URL, page title, notes, storage keys, browser storage, cookies, raw idempotency, provider response IDs, raw provider errors, stacks, and secrets from user-visible responses and logs.

This topology is not a production multi-user backend. Production hosted operations would need authentication, rate limiting, budgets, monitoring, abuse prevention, and deployment policy.

No real OpenAI request was made during automated acceptance. The provider adapter and local loopback path were validated deterministically without committing or exposing a real API secret.

### 4.12 Generated-Version Persistence

Generated versions use a separate IndexedDB store and V1/V2 envelopes. V1 remains the initial-generation entry shape:

```ts
type GeneratedComponentVersionEntryV1 = {
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceReviewFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
};
```

V2 is used only for accepted revision/regeneration entries:

```ts
type GeneratedComponentVersionEntryV2 = {
  contractVersion: 2;
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceReviewFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
  operation: {
    kind: "revision" | "regeneration";
    logicalAttemptId: string;
    reviewAttemptFingerprint: string;
    sourceGeneratedVersionId: string;
    sourceGeneratedVersionFingerprint: string;
    instruction?: string;
    instructionFingerprint?: string;
    screenshotIncluded: boolean;
  };
};
```

Lifecycle rules:

- Generated versions are separate from original captures.
- Original `CaptureRecord` data is not mutated by generation.
- The source capture is reread and fully validated before persistence.
- The screenshot asset is reread and validated before persistence.
- Success requires generated-version read-back.
- Retry saving is idempotent for the same generated-version ID and entry.
- Conflicting same-ID content fails safely.
- Active abort calls abort the IndexedDB transaction.
- Deleting a source capture cascades to linked generated versions.
- Missing or invalid sources make linked generated versions orphaned and invalid.
- Normal read/list paths clean or prevent orphans.
- V1 and V2 entries are read through the union reader.
- V2 target IDs are derived deterministically from the frozen `logicalAttemptId`.
- V2 lineage records the exact selected source generated version.
- Retry saving first attempts deterministic recovery and does not call the provider again.
- Conflicting recovery targets fail safely without overwrite.
- Commit-after-cancel results may remain stored and become discoverable through later explicit refresh.

### 4.13 Version Comparison

Milestone 6E comparison is implemented from the Generated Versions section:

- It compares exactly two distinct persisted generated versions with the same `sourceCaptureId`.
- The user explicitly chooses Baseline and Candidate and may Swap them.
- V1 and V2 versions are supported.
- Full original generated code remains visible and copyable.
- Code comparison uses a bounded internal LCS diff and no added dependency.
- Comparison state is local UI state only and is not persisted.
- Stale, out-of-order, and pending generated-version refresh completions cannot update a newer capture, reopen Detail, or restore ephemeral Comparison after returning to Library.
- Revision and Regeneration may save while Comparison remains active; the original selected Baseline and Candidate IDs remain selected, and exact newly persisted version IDs appear in available options.
- Existing `CaptureRecord`, screenshot asset, and pre-existing V1/V2 entries remain immutable; Revision and Regeneration append new immutable versions only.

Comparison does not automatically Preview, execute generated code, write IndexedDB, call backend/provider/OpenAI/source pages/content scripts/service workers/remote origins, compare screenshot pixels or rendered output, score versions, choose winners, merge, edit, compare across captures, or compare three or more versions.

### 4.14 Local Generated Source Export

Milestone 7A implements local export as one narrow, explicit, source-only path:

- Export is initiated only from an expanded generated-version row in Saved Capture Detail.
- The first target exports exactly one selected persisted V1 or V2 generated-version entry.
- Export rereads the selected generated-version ID from IndexedDB at initiation time.
- The reread entry must exist, validate, retain the expected ID, retain the expected `sourceCaptureId`, and exactly equal the displayed immutable entry.
- The exported bytes are the exact persisted `entry.value.code` encoded as UTF-8.
- Export performs no CRLF normalization, trimming, formatting, comment injection, metadata header insertion, transpilation, parsing, transformation, or automatic final newline insertion.
- Filename construction uses the validated persisted `componentName` and produces one deterministic safe `.tsx` filename with no IDs, URLs, page titles, timestamps, path separators, traversal, query characters, or random suffixes.
- Export remains independent from Preview eligibility and does not claim the source is safe, correct, production-ready, previewable, or dependency-complete.
- The target mechanism is a user-initiated Side Panel download using a UTF-8 Blob, temporary object URL, and temporary anchor, with deterministic object URL revocation and real Chromium Playwright download validation.

Export does not automatically run after generation, revision, regeneration, comparison, Preview, reopen, refresh, or capture navigation. Export state is separate from expanded row state, Preview state, revision/regeneration state, and Comparison state.

Implementation responsibilities:

- `extension/src/export/generated-source-export.ts` owns the pure deterministic filename helper and exact minimal export payload helper.
- `extension/src/sidepanel/GeneratedVersionExport.tsx` owns row-local UI state, authoritative generated-version reread, exact displayed-entry equality, `sourceCaptureId` ownership, stale-state handling, Blob/object URL/anchor initiation, same-row in-flight suppression, and cleanup.
- `SavedCaptureDetail` only mounts the row-specific `Export .tsx` control inside expanded generated-version details.

Hardening boundaries:

- Missing, altered, invalid, unsafe, and wrong-capture rereads do not download.
- Same-row rapid activation produces at most one real download.
- Repeated exports remain explicit and use the same suggested filename; duplicate-name handling is browser-owned.
- Leaving Detail, capture switching, and stale async completions cannot initiate old downloads or restore old success state.
- Object URLs are revoked on success, replacement, failure, unmount, and capture switch, and stale older attempts cannot affect newer attempts or unrelated object URLs.
- Temporary anchors are removed even when initiation fails, and failure remains retryable.
- Export adds no `chrome.downloads`, no `downloads` permission, no optional permission, no Manifest change, no host-permission change, no File System Access API, no native messaging, no clipboard write, and no dependency.

### 4.15 GitHub Export Workflow

Milestone 7B implements one deterministic fake/development GitHub handoff while preserving the production security boundary:

- The user action is `Export to GitHub` from one expanded generated-version row.
- The target is exactly one `.tsx` file in one user-selected repository and existing branch.
- File contents remain exactly the selected generated version's persisted `entry.value.code`.
- The default filename reuses the accepted Milestone 7A deterministic safe filename helper.
- Target path validation is separate from filename validation and must reject traversal, absolute paths, `.github/workflows/`, and unsafe segments.
- Every GitHub write requires a fresh local reread, exact displayed-entry equality, `sourceCaptureId` ownership, remote branch/file check, frozen Review, and explicit confirmation.
- Shared extension-facing contracts contain bounded versioned data and opaque session references only; no GitHub token, refresh token, OAuth code, client secret, cookie, authorization header, screenshot, or `CaptureRecord` crosses into extension GitHub export state.
- The backend owns isolated GitHub gateway routes for session, repositories, branches, inspect, and write. Unknown routes, methods, fields, origins, headers, body sizes, and discriminants fail closed.
- Normal runtime uses the not-configured transport and exposes no fake active GitHub session. Deterministic fake behavior is available only through explicit development/test injection.
- One selected persisted generated version maps to one repository-relative `.tsx` path and one commit in the deterministic fake transport.
- Local stale and remote conflict states fail closed. A second authoritative local reread happens immediately before write, and no write is sent after local stale.
- Exact source bytes, CRLF/LF state, Unicode, no-final-newline, and one-final-newline states are preserved. The workflow performs no trim, format, parse, transpile, metadata insertion, or automatic newline transform.
- Duplicate confirmation creates at most one write. Leaving Detail and capture switching clear ephemeral Review and Success state.
- Runtime production GitHub authorization, OAuth exchange, token storage, real GitHub REST requests, Manifest permission changes, host-permission changes, dependencies, repository creation, branch creation, pull requests, workflow creation, Actions execution, releases, deployments, GitHub Pages, ZIP/package export, multi-file export, and real ambiguous-write reconciliation are not implemented.

### 4.16 Portable Component Bundle Export

Milestone 8 is Completed for local portable component source bundle export. Slice 1 is Completed and accepted at `c06b3c10d7bfa2ee772126f137833c836aea0dd3`; Slice 2 is Completed and accepted at `167d2a96f91261b0af4422541b3b9978e7563692`; Slice 3 is Completed and accepted at `a2aac799fa5e6ef9c493520973d8421afc80c430`; Slice 4 is Completed and accepted at `e1d9237653aee1076bf8ebcdad63d0bca94b21a3`.

Bundle V1 is one explicit user-initiated local ZIP download for one selected persisted V1 or V2 generated version. It builds on the accepted Milestone 7A authoritative IndexedDB reread, exact displayed-entry equality, `sourceCaptureId` ownership, stale fail-closed behavior, and trusted Side Panel Blob/object-URL/temporary-anchor download boundary.

The accepted runtime supports V1, V2 Revision, and V2 Regeneration entries; keeps export local-only, source-only, and read-only; and is covered by real Chromium downloaded-artifact validation plus lifecycle, accessibility, stale, failure/retry, duplicate, object URL, privacy, and coexistence hardening.

Bundle V1 contents are fixed:

```text
README.md
element-catcher.json
src/<ComponentName>.tsx
```

The source bytes for `src/<ComponentName>.tsx` must exactly equal `new TextEncoder().encode(authoritativeEntry.value.code)`. Bundle export must not trim, format, parse, transpile, compile, normalize line endings, insert metadata, add comments, infer dependencies, or otherwise transform generated source.

`element-catcher.json` is a strict canonical JSON contract containing only `formatVersion`, `framework: react`, `styling: tailwind`, `componentName`, and `entryPath`. It excludes capture IDs, generated-version IDs, `sourceCaptureId`, source URL, page title, screenshots, tags, notes, storage keys, timestamps, lineage, provider metadata, backend metadata, GitHub metadata, credentials, and session information.

The README uses a deterministic fixed template stating that the source was generated by Element Catcher, must be reviewed before use, and excludes dependencies, `package.json`, Tailwind configuration, build configuration, and application scaffolding. It must also state that the bundle is not guaranteed to compile, render correctly, be secure, or be production-ready.

Accepted implementation strategy: a bounded internal uncompressed ZIP writer for the three-entry Bundle V1 format. This avoids approving a ZIP dependency, keeps supply-chain and bundle-size cost low, avoids compression nondeterminism, and allows deterministic artifact-inspection tests. Reviewed ZIP dependencies and browser compression strategies remain rejected for Bundle V1 unless future separately scoped evidence proves the bounded internal writer insufficient.

### 4.17 Portfolio and Demo Readiness

Milestone 9 is Completed for documentation and runtime clarity that help an external reviewer understand and repeat the accepted local v0.1 demonstration. Slice 1 is Completed and accepted at `13fa1fdb1d0ff36cd2aa305336b0d7302bd8ab33`; it created:

- `docs/MILESTONE_9_PORTFOLIO_DEMO_READINESS.md`;
- `docs/PORTFOLIO_DEMO_GUIDE.md`;
- `docs/MANUAL_CHROME_SMOKE_CHECKLIST.md`;
- `docs/CHROME_WEB_STORE_READINESS_GAPS.md`.

Slice 1 made no runtime behavior, permission, dependency, storage, networking, backend, export, generation, preview, or GitHub integration change and claimed no new validation result. Slice 2 is Completed. Its focused reviewer-facing runtime clarity implementation, modulepreload build fix, generation-preparation fix for newly saved captures, local automated validation, real Chrome manual smoke execution, and final closeout acceptance are recorded. Generated-version-only GitHub and Bundle paths retain automated evidence when no configured provider/generated version is available for manual execution.

### 4.18 Private Session Capture

Milestone 10 is Completed / Accepted for browser-native capture of UI state the user already has access to, without requiring the source page to be publicly reachable or remotely re-fetched.

Slice 1 is Completed / Accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d`. Accepted evidence includes completed implementation, automated validation with final full Playwright evidence of `295 passed / 0 failed / 1 skipped / 0 did not run`, and required real-user Chrome manual validation passed. The background service worker first attempts the existing content-script message path for `EC_START_SELECTION`. If the receiving content runtime is missing, automated checks verify that it performs exactly one `chrome.scripting.executeScript()` call for the active tab main frame using `content/content-script.js`, then retries Start Selection exactly once. If the initial message succeeds, automated checks verify no programmatic injection occurs. If injection or retry fails, the workflow fails closed with actionable UX.

Slice 2 is Completed / Accepted at `5b6a0b81c75a2c7c354a630620ec62e784a9bc99`. It adds Side Panel trust UX that identifies current-browser-session capture, no remote source-page re-fetch, local Capture Preview/save boundaries before AI generation, and the separate explicit AI action boundary. AI Review states that AI receives only the screenshot shown in Review and the structured fields shown in Review, and that the AI backend does not receive the browser session, cookies, browser storage, login credentials, or source-page access.

Milestone 10 is closed without a Slice 3. Milestone 11 is locally implemented for bounded user-assisted Interaction Capture V1 and pending independent ChatGPT final acceptance.

Recovery is not used for Cancel, Parent, Child, Confirm, screenshot completion, or unrelated runtime messages. Restricted/browser-protected surfaces remain fail-closed, including `chrome://` pages and Chrome Web Store pages. The implementation must not reload, navigate, recreate tabs, submit forms, alter page history, broaden host permissions, extract credentials, extract cookies, or request persistent all-sites access.

The only approved Manifest permission addition for Slice 1 is `scripting`; `activeTab` remains the temporary user-grant boundary. See `docs/MILESTONE_10_PRIVATE_SESSION_CAPTURE.md`.

## 5. Security and Privacy Boundaries

- Captures remain local by default.
- Browser storage, cookies, local persistence keys, raw wrappers, source URL, page title, notes, raw idempotency keys, and screenshot storage keys are excluded from approved outbound generation and revision/regeneration prompts.
- API keys remain backend-only.
- The extension does not store provider secrets.
- Generated code is displayed as source text unless the user explicitly chooses Preview.
- Preview execution is limited to accepted data-only render plans in the Milestone 6C sandbox; no full arbitrary generated-code execution, `eval`, `Function` constructor, `dangerouslySetInnerHTML`, browser APIs, storage, navigation, network, workers, or generated CSS runtime is allowed.
- Revision/regeneration never automatically previews or executes revised source.
- Comparison never automatically previews or executes generated source, never persists comparison state, and never calls backend/provider/OpenAI/source pages/content scripts/service workers or remote origins.
- Local export never executes, parses, compiles, evaluates, or transforms generated source; never opens Preview; never creates Preview iframes; never writes IndexedDB; never mutates `CaptureRecord`, screenshots, V1 entries, or V2 entries; never persists export UI state; and never calls backend/provider/OpenAI/source pages/content scripts/service workers, analytics, GitHub, Figma, or remote origins.
- Exported files contain generated source only and exclude capture IDs, generated-version IDs, `sourceCaptureId`, source URL, page title, notes, tags, screenshots, storage keys, fingerprints, logical attempt IDs, lineage fields, provider metadata, and backend metadata.
- GitHub export keeps GitHub credentials out of extension source, extension state, IndexedDB, generated-version stores, exported files, logs, URLs, source maps, and generated bundles. The extension-facing model uses bounded contracts and opaque session references only. The deterministic fake transport must be explicitly injected, normal runtime remains not-configured, `.github/workflows/` paths are rejected, local and remote stale states fail closed, and the GitHub gateway remains separate from AI provider routes.

## 6. Completed Milestone 6 Handoff

Milestone 6 is completed. The accepted Milestone 6E closure added:

- Version comparison.
- Final Milestone 6 integrated regression.
- Final Milestone 6 documentation closure after implementation and independent acceptance.

Accepted local validation associated with the Milestone 6E closure reported: `npm run build` passed; focused Milestone 6E suite 25 passed; focused stability rerun 25 passed; backend tests 13 passed; full E2E 225 passed and 1 skipped; `npm audit --omit=dev` 0 vulnerabilities. The existing skip was: `Milestone 5C loopback E2E requires an extension build with the loopback endpoint.` These are local reported results, not GitHub Actions results.

Milestone 6 preserves the local-first capture model, provider-secret boundary, source CaptureRecord immutability, generated-version separation, and no-raw-provider-state extension boundary. Final hardening made no production security relaxation and no database, Manifest, CSP, Preview protocol, or generated-version contract change.

## 7. Explicit Exclusions

The current implementation does not include:

- Runtime export beyond the narrow Milestone 7A local single-version `.tsx` source-export path, deterministic Milestone 7B fake/development GitHub workflow, and Milestone 8 single-version Bundle V1 ZIP path.
- npm package export, runnable application scaffolding, dependency inference, Tailwind configuration generation, build configuration generation, and production-ready scaffolding.
- Multi-file export.
- Chrome Web Store readiness claim or submission.
- Website publishing.
- Figma export.
- Real GitHub authorization, OAuth exchange, token storage, real GitHub REST transport, production GitHub writes, protected manual validation, production deployment, and operational controls.
- Team collaboration.
- Cloud sync.
- Multiple framework generation.
- Enterprise workflow.
- Payment.
- Authentication.
- Production hosted multi-user backend operations.
- Drag-to-box selection unless later validated as necessary.
