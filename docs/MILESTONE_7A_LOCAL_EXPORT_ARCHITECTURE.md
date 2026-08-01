# Milestone 7A Local Generated Source Export Architecture

## 1. Status and Scope

Status: Current architecture slice for Milestone 7A. Milestone 7 is Current. Milestone 7A is Current. No Milestone 7A implementation is completed by this document.

Milestone 7A defines a narrow local generated-source export capability. The first implementation target exports exactly one explicitly selected persisted generated version as one UTF-8 `.tsx` file from Saved Capture Detail. It supports both validated V1 generated-version entries and validated V2 Revision or Regeneration entries.

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

Milestone 7A must preserve the current database version, stores, indexes, generated-version contracts, Preview protocol, Manifest permissions, CSP, sandbox pages, package dependencies, backend boundary, and test fixture structure unless a later implementation review proves a real defect.

## 3. Product Definition

The user opens Saved Capture Detail, expands one generated-version row, and activates a row-specific `Export .tsx` button. The button exports only that selected version's exact persisted `entry.value.code` as one UTF-8 `.tsx` file.

Export is independent from Preview eligibility. A generated version that is contract-valid remains exportable even if Previewable Subset V1 rejects rendering it.

Every export requires an explicit user action. Export never starts automatically after generation, revision, regeneration, comparison, Preview, reopen, refresh, or capture navigation.

## 4. Exact Export Data Flow

The implementation slice must use this flow:

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

Empty source, Unicode source, JSX source, Tailwind class strings, final-newline-sensitive source, and CRLF-sensitive source must be covered by future tests.

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

The implementation must not use `chrome.downloads`. Chrome's official extension documentation states that the `chrome.downloads` API is for programmatically initiating, monitoring, manipulating, and searching downloads, and that using it requires declaring the `"downloads"` permission in the extension manifest. Chrome's official permissions list describes `"downloads"` as access to the `chrome.downloads` API. Therefore 7A must not add `downloads`, optional permissions, host permissions, or any Manifest change to satisfy the first local export target.

The export button supplies the explicit user activation. The implementation must encode the exact persisted code into a Blob, create one temporary object URL, attach it to one temporary anchor with the deterministic `download` filename, initiate the download from the trusted Side Panel, and move the attempt to `download initiated` only after browser download initiation has been observed by the implementation path.

Object URLs must be revoked deterministically after initiation at a safe lifecycle point, when an attempt is replaced, when the row or Detail unmounts, and when preparation fails before initiation. The implementation must prove the chosen mechanism in real Chromium through Playwright download events, expected suggested filename, and exact downloaded-byte inspection. Unit tests alone cannot establish browser download behavior.

Official Chrome Extension references used for this decision:

- `https://developer.chrome.com/docs/extensions/reference/api/downloads`
- `https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions`
- `https://developer.chrome.com/docs/extensions/reference/permissions-list`

If future implementation inspection or official Chrome documentation proves the Blob/object-URL/anchor mechanism cannot satisfy these requirements in the Side Panel, the implementation must stop and document the blocking evidence instead of silently approving `chrome.downloads` or a new permission.

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
- Browser mechanism uncertainty: prove in real Chromium during Slice 3 or stop and document blocking evidence.

## 14. Test Matrix

Future implementation acceptance must include deterministic tests for:

- V1 exact-byte `.tsx` export.
- V2 Revision exact-byte export.
- V2 Regeneration exact-byte export.
- Deterministic suggested filename.
- Empty code.
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

## 15. Implementation Slices

Milestone 7A implementation uses exactly four slices:

Slice 1:

- architecture;
- milestone status update;
- browser mechanism decision;
- no runtime changes.

Slice 2:

- pure filename helper;
- exact export-payload helper;
- authoritative persisted-entry reread;
- Side Panel row integration;
- focused deterministic tests.

Slice 3:

- real Chromium download validation;
- exact filename and byte verification;
- stale-state and lifecycle hardening;
- privacy, no-network, no-message, no-iframe, no-write, and immutability assertions;
- full regression and audit;
- only minimal fixes exposed by tests.

Slice 4:

- documentation closeout after independent acceptance;
- mark Milestone 7A Completed only after implementation and hardening are independently accepted;
- decide the next Milestone 7 substage without starting it prematurely.

Milestone 7A must not split GitHub, Figma, cloud, ZIP bundles, package scaffolding, or multi-file export into implementation slices.

## 16. Acceptance Gates

Milestone 7A cannot be marked Completed until later implementation and hardening acceptance demonstrate:

- exact-byte export for V1, V2 Revision, and V2 Regeneration entries;
- deterministic filename behavior and fail-closed unsafe-name handling;
- stale-state fail-closed behavior for missing, invalid, altered, or wrong-capture versions;
- object URL cleanup across success, failure, replacement, row unmount, and Detail unmount;
- zero network, runtime-message, tab-message, iframe, IndexedDB-write, and mutation boundaries;
- active Comparison, Preview, and Revision/Regeneration state independence;
- real Chromium Playwright download event and exact byte validation;
- full regression and audit as specified by the implementation slice.

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

Residual risks after Slice 1:

- The Blob/object-URL/anchor mechanism is selected architecturally but must still be proven in the extension Side Panel through real Chromium Playwright download events.
- Browser duplicate filename behavior remains browser-owned and may vary by user settings.
- Download initiation does not prove the file was successfully written to disk.
- Exported generated source may not compile, may be unsafe to run elsewhere, may lack dependencies, or may be rejected by Preview.
- Local IndexedDB contents can still be externally altered by browser/devtools behavior outside ordinary application control; the export path must fail stale when it detects mismatch.

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
