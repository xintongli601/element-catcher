# Milestone 7A Local Generated Source Export Architecture

## 1. Status and Scope

Status: Completed. Milestone 7 is Current. Milestone 7A is Completed. Milestone 7 is not Completed, and no new Milestone 7 substage is started by this closeout.

Milestone 7A delivered a narrow local generated-source export capability. The accepted implementation exports exactly one explicitly selected persisted generated version as one UTF-8 `.tsx` file from Saved Capture Detail. It supports both validated V1 generated-version entries and validated V2 Revision or Regeneration entries.

Milestone 7A does not add GitHub export, Figma export, cloud sync, collaboration, publishing, additional frameworks, archive generation, package scaffolding, or multi-file export.

## 2. Current Repository Inventory

The accepted repository baseline already provides:

- `extension/src/shared/generated-version-contract.ts`: V1 and V2 generated-version entry contracts, validation, IDs, source capture linkage, and V2 operation lineage.
- `extension/src/shared/generation-contract.ts`: generated response contract with validated `componentName`, `code`, `summary`, and `approximationNotes`.
- `extension/src/storage/indexed-db.ts`: IndexedDB version 2 with `captureRecords`, `screenshotAssets`, and `generatedComponentVersions`; one `generatedComponentVersions.sourceCaptureId` index; direct and union generated-version readers.
- `extension/src/sidepanel/SavedCaptureDetail.tsx`: Saved Capture Detail, generated-version list refresh, expanded generated-version details, Preview, Revision/Regeneration, and Comparison entry points.
- `extension/src/sidepanel/PreviewSandbox.tsx` and `extension/src/shared/preview-protocol.ts`: explicit Preview only, isolated packaged sandbox frames, and data-only preview protocol.
- `extension/src/sidepanel/VersionComparison.tsx` and `extension/src/comparison/version-comparison.ts`: local ephemeral two-version comparison.
- `extension/manifest.json`: Manifest V3 with `activeTab` and `sidePanel` permissions, `http://127.0.0.1/*` host permission for the local backend, and no `downloads` permission.
- `package.json`: no export-specific dependency.

Milestone 7A preserved the current database version, stores, indexes, generated-version contracts, Preview protocol, Manifest permissions, CSP, sandbox pages, package dependencies, and backend boundary. The only production fix accepted during hardening was local to `GeneratedVersionExport.tsx`: a synchronous same-row in-flight guard and safer temporary-anchor cleanup.

## 3. Product Definition

The user opens Saved Capture Detail, expands one generated-version row, and activates a row-specific `Export .tsx` button. The button exports only that selected version's exact persisted `entry.value.code` as one UTF-8 `.tsx` file.

Export is independent from Preview eligibility. A generated version that is contract-valid remains exportable even if Previewable Subset V1 rejects rendering it.

Every export requires an explicit user action. Export never starts automatically after generation, revision, regeneration, comparison, Preview, reopen, refresh, or capture navigation.

## 4. Exact Export Data Flow

The accepted implementation uses this flow:

```text
Expanded generated-version row
  -> user activates Export .tsx
  -> derive deterministic filename from displayed validated componentName
  -> reread selected generated-version ID from IndexedDB
  -> validate reread V1/V2 entry
  -> require same ID and same sourceCaptureId
  -> require reread entry exactly equals the displayed immutable entry
  -> encode reread entry.value.code as UTF-8 without source transformation
  -> create Blob
  -> create temporary object URL
  -> create temporary anchor with download filename
  -> initiate download from the trusted Side Panel
  -> revoke object URL after initiation and on cleanup
```

The reread entry must exist, remain valid, retain the expected ID, retain the expected `sourceCaptureId`, and remain exactly equal to the currently displayed immutable entry. If it is missing, invalid, replaced, altered, or belongs to a different capture, export fails with a clear stale-state message and asks the user to refresh before trying again.

## 5. Trust and Privacy Boundaries

Export is local-only and source-only.

Export must not:

- call backend, provider, OpenAI, source pages, content scripts, service workers, analytics, GitHub, Figma, or remote origins;
- execute generated code;
- automatically open Preview;
- create Preview iframes;
- write IndexedDB;
- mutate `CaptureRecord`, screenshot assets, V1 entries, V2 entries, Comparison state, Preview state, or Revision/Regeneration state;
- persist export UI state;
- write clipboard automatically;
- request arbitrary filesystem access;
- use native messaging;
- use directory selection;
- use the File System Access API;
- generate archives, npm packages, README files, Tailwind configs, package files, CSS bundles, screenshots, metadata sidecars, or ZIP files.

Export file contents contain generated source only. They must not include source URL, page title, screenshot data, `CaptureRecord`, notes, tags, capture IDs, generated-version IDs, storage keys, timestamps, fingerprints, logical attempt IDs, lineage metadata, provider metadata, raw backend data, or metadata sidecars.

Export does not claim that generated source is safe, correct, previewable, production-ready, dependency-complete, guaranteed to compile, or suitable for direct execution.

## 6. Persisted-Entry Reread and Stale-State Ownership

Each export attempt is owned by the displayed `sourceCaptureId`, generated-version ID, immutable displayed entry snapshot, and per-row attempt token. The implementation must reread the selected generated-version ID from IndexedDB at export time and validate it through the authoritative V1/V2 union validation path.

The reread entry must:

- exist;
- pass validation;
- retain the expected generated-version ID;
- retain the expected `sourceCaptureId`;
- exactly equal the immutable entry currently displayed by the expanded row.

If the entry is missing, invalid, belongs to another capture, or differs from the displayed entry, the implementation must not initiate a download. It must show a safe stale-version message, require refresh or reopen of the generated-version list, and never silently export the newer, older, or altered entry.

Ownership guards:

- Repeated export attempts are allowed after an attempt reaches a terminal state.
- Rapid double activation cannot start duplicate same-row initiation while that row's attempt is preparing or initiating.
- No global disable should affect unrelated generated-version rows.
- Capture switch during preparation cannot export or report success for the previous capture.
- Detail unmount during preparation releases any live object URL and suppresses stale state updates.
- Stale asynchronous completion from an old row, old capture, unmounted Detail, or superseded attempt cannot update the current UI.
- Leaving Detail clears export UI state.
- Generated-version refresh must not automatically initiate export.

## 7. Exact Source Payload Contract

The exported file contents are exactly the persisted generated source encoded as UTF-8:

- no CRLF or other line-ending normalization;
- no trimming;
- no formatting;
- no injected comments;
- no metadata header;
- no transpilation;
- no parsing or transformation;
- no automatic final newline.

Unicode source, JSX source, Tailwind class strings, final-newline-sensitive source, and CRLF-sensitive source are covered by accepted tests. Empty generated code is not supported because the existing generation contract rejects empty `code`; Milestone 7A did not weaken that validator.

The downloaded bytes must exactly equal `new TextEncoder().encode(entry.value.code)` for the reread entry selected for export.

## 8. Deterministic Filename Contract

Milestone 7A defines one pure deterministic filename helper.

Input: the authoritative validated persisted `componentName`.

Output: exactly one bounded filename ending in `.tsx`.

Normalization and rejection rules:

- Preserve the validated component name exactly for the visible basename when it is already safe.
- Append `.tsx` exactly once.
- Reject empty names even if a future contract bug permits one.
- Reject path separators `/`, `\`, and platform separator lookalikes selected by the implementation review.
- Reject ASCII control characters and Unicode control/format characters.
- Reject traversal sequences, including `..` as a segment or any name that would normalize outside a single filename.
- Reject reserved path segments such as `.`, `..`, Windows device names, or any segment the helper classifies as filesystem-reserved.
- Reject query or fragment characters such as `?`, `#`, and other characters the implementation marks unsafe for deterministic cross-platform filenames.
- Reject leading or trailing unsafe separators or whitespace.
- Reject names that exceed the helper's bounded filename length.
- Do not add timestamps, random suffixes, capture IDs, generated-version IDs, source URLs, page titles, or local timestamps.

Duplicate filename handling remains browser-owned. Unexpectedly invalid or unsafe component names fail closed rather than falling back to a generic or misleading filename.

The natural happy path is `ComponentName.tsx` for a valid component name that satisfies the current generated-response component-name contract.

## 9. Download Mechanism and Lifecycle

Milestone 7A targets a user-initiated web-platform download from the trusted Side Panel using a UTF-8 Blob, temporary object URL, and temporary anchor with `download`.

The implementation does not use `chrome.downloads`. Chrome's official extension documentation states that the `chrome.downloads` API is for programmatically initiating, monitoring, manipulating, and searching downloads, and that using it requires declaring the `"downloads"` permission in the extension manifest. Chrome's official permissions list describes `"downloads"` as access to the `chrome.downloads` API. Therefore 7A added no `downloads` permission, optional permission, host permission, or Manifest change for the first local export target.

The export button supplies the explicit user activation. The implementation must encode the exact persisted code into a Blob, create one temporary object URL, attach it to one temporary anchor with the deterministic `download` filename, initiate the download from the trusted Side Panel, and move the attempt to `download initiated` only after browser download initiation has been observed by the implementation path.

Object URLs are revoked deterministically after initiation at a safe lifecycle point, when an attempt is replaced, when the row or Detail unmounts, and when preparation fails before initiation. The accepted implementation proved the chosen mechanism in real Chromium through Playwright download events, expected suggested filename, and exact downloaded-byte inspection. Unit tests alone were not treated as sufficient proof of browser download behavior.

Official Chrome Extension references used for this decision:

- `https://developer.chrome.com/docs/extensions/reference/api/downloads`
- `https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions`
- `https://developer.chrome.com/docs/extensions/reference/permissions-list`

If future browser behavior or official Chrome documentation changes this mechanism, a later milestone must document the blocking evidence instead of silently approving `chrome.downloads` or a new permission.

## 10. Object URL Ownership and Cleanup

Object URLs are owned by the specific export attempt that created them. Each attempt can own at most one live object URL.

Cleanup requirements:

- Revoke the object URL after download initiation at a safe lifecycle point.
- Revoke the previous object URL before replacing an attempt.
- Revoke on row unmount and Detail unmount.
- Revoke on preparation failure before initiation.
- Treat repeated revocation as harmless and keep cleanup idempotent.
- Never leave object URL cleanup dependent on a later global page unload.

## 11. Side Panel UI State Model

Add an explicit `Export .tsx` control inside each expanded generated-version detail.

Per-row export states:

- idle;
- preparing;
- download initiated;
- stale version;
- failed.

State rules:

- Export state is row-local and ephemeral.
- Export state is separate from expanded-row state, Preview state, revision/regeneration state, and Comparison state.
- Exporting must not close, reset, reorder, or change an active Comparison or its exact Baseline and Candidate selections.
- Exporting must not close, open, or reset Preview.
- Exporting must not close, open, or reset Revision/Regeneration tools.
- Leaving Detail clears export UI state.
- The UI may report that browser download initiation occurred. It must not claim the file was written successfully to disk, because the extension does not control the user's filesystem or final browser download outcome.

## 12. Accessibility

Required accessibility behavior:

- Use a native keyboard-operable button.
- Provide a version-specific accessible name.
- Disable only while that same row's export attempt is preparing or initiating.
- Do not globally disable unrelated generated-version rows.
- Do not steal focus automatically after export initiation or failure.
- Announce safe visible states through existing status/alert patterns without exposing raw IDs or storage details.
- Keep keyboard operation available through the expanded row without requiring pointer-only behavior.

## 13. Threat and Failure Analysis

Threats and required responses:

- Stale persisted entry: fail closed, do not download, show stale-version message.
- Wrong capture ownership: fail closed if reread `sourceCaptureId` differs from the displayed capture.
- Altered or replaced generated version: fail closed if exact displayed-entry equality fails.
- Duplicate activation: suppress duplicate same-row initiation while preparing or initiating.
- Capture switch or Detail unmount: suppress stale completion and clean object URLs.
- Preview rejection: do not block export solely because Previewable Subset V1 rejects rendering.
- Generated-code execution risk: never execute, parse, transform, Preview, or iframe generated source as part of export.
- Privacy leakage: export source only; exclude capture metadata, storage identifiers, screenshots, provider metadata, and backend data.
- Browser mechanism uncertainty: real Chromium validation passed for the accepted Side Panel Blob/object URL/anchor mechanism; future browser or Chrome documentation changes remain a later-milestone risk.

## 14. Test Matrix

Accepted implementation validation included deterministic tests for:

- V1 exact-byte `.tsx` export.
- V2 Revision exact-byte export.
- V2 Regeneration exact-byte export.
- Deterministic suggested filename.
- Empty code rejected by the existing generation contract; Milestone 7A did not weaken the validator.
- Code with no final newline.
- Code with a final newline.
- CRLF-sensitive code.
- Unicode code.
- JSX and Tailwind-heavy code.
- Preview-rejected but contract-valid source.
- Active Comparison remains open and unchanged.
- Exact Baseline and Candidate IDs remain selected.
- Active or previously opened Preview remains independently controlled.
- Revision/Regeneration state remains independently controlled.
- Missing selected version.
- Invalid selected version.
- Externally replaced or altered selected version.
- Wrong `sourceCaptureId`.
- Repeated exports.
- Rapid double activation.
- Detail unmount during preparation.
- Capture switch during preparation.
- Stale asynchronous completion.
- Deterministic object URL cleanup.
- Zero IndexedDB writes.
- Zero HTTP/HTTPS requests.
- Zero runtime messages.
- Zero tab messages.
- Zero automatic iframe creation.
- `CaptureRecord` unchanged.
- Screenshot asset unchanged.
- Every pre-existing V1/V2 entry byte-for-byte unchanged.
- Playwright download event receives the exact expected suggested filename.
- Downloaded bytes exactly equal UTF-8 encoding of the persisted code.
- Default E2E remains headless.

## 15. Accepted Implementation History and Slices

Milestone 7A completed exactly four slices:

Accepted implementation history:

- `b4cc9384edef40c4829d62b3d2e635c1b1c185b3` - Milestone 7A architecture and Milestone 7 start.
- `f0f37cc8655edd4747315d6ef190f1ecba8f2bd3` - local exact-source export implementation and focused tests.
- `ec89ccb46a2621d8fc0509ac493a85ca65743481` - real Chromium download validation, lifecycle/security hardening, and final regression.

Slice 1 completed:

- architecture;
- milestone status update;
- browser mechanism decision;
- no runtime changes.

Slice 2 completed:

- pure filename helper;
- exact export-payload helper;
- authoritative persisted-entry reread;
- Side Panel row integration;
- focused deterministic tests.

Slice 3 completed:

- real Chromium download validation;
- exact filename and byte verification;
- stale-state and lifecycle hardening;
- privacy, no-network, no-message, no-iframe, no-write, and immutability assertions;
- full regression and audit;
- only minimal fixes exposed by tests.

Slice 4 completed:

- documentation closeout after independent acceptance;
- mark Milestone 7A Completed after implementation and hardening acceptance;
- keep Milestone 7 Current without starting another substage prematurely.

Milestone 7A must not split GitHub, Figma, cloud, ZIP bundles, package scaffolding, or multi-file export into implementation slices.

## 16. Accepted Validation and Closeout

Milestone 7A is marked Completed because accepted local validation demonstrated:

- exact-byte export for V1, V2 Revision, and V2 Regeneration entries;
- deterministic filename behavior and fail-closed unsafe-name handling;
- stale-state fail-closed behavior for missing, invalid, altered, or wrong-capture versions;
- object URL cleanup across success, failure, replacement, row unmount, and Detail unmount;
- zero network, runtime-message, tab-message, iframe, IndexedDB-write, and mutation boundaries;
- active Comparison, Preview, and Revision/Regeneration state independence;
- real Chromium Playwright download event and exact byte validation;
- full regression and audit as specified by the implementation slice.

Accepted exact-source cases:

- V1 CRLF source.
- V2 Revision Unicode source.
- V2 Regeneration JSX/Tailwind source.
- Code with no final newline.
- Code with exactly one final newline.
- Preview-rejected but generated-contract-valid source.
- Maximum valid persisted component name.

Accepted local validation reported for Milestone 7A:

- Slice 2 contract tests: `3 passed`.
- Slice 2 Side Panel tests: `6 passed`.
- Slice 3 hardening tests: `11 passed`.
- Combined Milestone 7A focused suite run 1: `20 passed`.
- Combined Milestone 7A focused suite run 2: `20 passed`.
- Relevant generated-version/Comparison/Preview/Revision regressions: `93 passed`.
- Backend tests: `13 passed`.
- Full Playwright E2E: `245 passed, 1 skipped`.
- `npm run build`: passed.
- `npm audit --omit=dev`: `0 vulnerabilities`.

Existing skip:

`generation-5c-loopback.spec.ts › browser generation flow sends one loopback request and preserves persistence`

Reason:

`Milestone 5C loopback E2E requires an extension build with the loopback endpoint.`

These are local reported validation results associated with the accepted implementation. They are not GitHub Actions results, an independent ChatGPT rerun, or a general security proof.

## 17. Explicit Exclusions

Milestone 7A does not include:

- GitHub export.
- Figma export.
- Cloud sync.
- Collaboration.
- Publishing.
- Additional frameworks.
- Clipboard export.
- File System Access API.
- Native messaging.
- Arbitrary filesystem access.
- Archive or ZIP export.
- npm package generation.
- Multi-file export.
- README, Tailwind config, package.json, CSS bundle, screenshot, or metadata sidecar generation.
- Claiming generated source is safe, correct, production-ready, previewable, or dependency-complete.

## 18. Residual Risks

Residual risks after Milestone 7A:

- Download initiation does not prove the file was successfully written to disk, because the browser and user settings own the final download outcome and location.
- Browser duplicate filename behavior remains browser-owned and may vary by user settings.
- Exported generated source may not compile, may be unsafe to run elsewhere, may lack dependencies, or may be rejected by Preview.
- Local IndexedDB contents can still be externally altered by browser/devtools behavior outside ordinary application control; the export path must fail stale when it detects mismatch.
- Milestone 7A exports only one selected generated version as one `.tsx` file; ZIP/package export, multi-file export, GitHub, Figma, cloud sync, publishing, collaboration, and additional frameworks remain unstarted.

## 19. Frozen Decisions

Frozen for Milestone 7A:

- One explicit export action exports exactly one selected persisted generated version.
- V1 and V2 generated-version entries are supported through the authoritative union validation path.
- The payload is exactly `entry.value.code` encoded as UTF-8.
- Filename derives only from the validated persisted `componentName`.
- The download mechanism is trusted Side Panel Blob plus temporary object URL plus temporary anchor `download`.
- No `chrome.downloads`, no new permission, no optional permission, no Manifest change, no host-permission change, and no new dependency.
- Export has no Preview dependency and does not execute, parse, transform, or iframe generated source.
- Export writes no IndexedDB data and mutates no capture, screenshot, generated-version, Preview, Revision/Regeneration, or Comparison state.
- GitHub, Figma, cloud, ZIP, package scaffolding, multi-file export, publishing, and additional frameworks remain outside Milestone 7A.
