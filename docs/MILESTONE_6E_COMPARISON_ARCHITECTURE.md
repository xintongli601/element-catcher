# Milestone 6E Version Comparison Architecture

## 1. Status and Scope

Milestone 6E is Completed. Milestone 6D is Completed. Milestone 6 is Completed. Milestone 7 is Current, beginning with Milestone 7A local generated-source export architecture.

This document records the accepted architecture and closeout state for local comparison of two persisted generated component versions. Milestone 6E delivered production behavior and tests without storage schema changes, backend routes, Preview protocol changes, package dependencies, Manifest changes, CSP changes, generated-version contract changes, or production security relaxation. Final integrated Milestone 6 regression and documentation closure are complete.

Accepted implementation history:

- `778aa54abb0145256b718d19617916391e55a7fb` - comparison architecture.
- `dead6397574af2458fbd7b9d5adaed7c97a3d834` - initial comparison implementation.
- `642ff37ae6c0fc8dc95cece2d758096d979c69ee` - Slice 2 review fixes.
- `db96241f96e769d1442763107444a854b5f01d22` - integrated hardening baseline.
- `86005b85f8d298f2bcce19522461d810642ab555` - stale-state, coexistence, and immutability hardening.
- `7b9bffaebc3e33bb745e3547af33c1a1243a98ca` - pending refresh ownership closure.

## 2. Current Implementation Inventory

- Generated versions already persist in IndexedDB database version 2, store `generatedComponentVersions`, indexed by `sourceCaptureId`.
- V1 generated-version entries represent initial generation and contain source capture linkage, created time, and `ComponentGenerationResponseV1`.
- V2 generated-version entries represent revision or regeneration and add operation lineage: source generated-version ID, source fingerprint, logical attempt, review fingerprint, operation kind, revision instruction when present, and screenshot inclusion state.
- `listGeneratedComponentVersionUnionBySourceCaptureId` returns validated V1 and V2 entries for one source capture as immutable cloned objects.
- `SavedCaptureDetail` already owns the Generated Versions section, loaded version list, expanded item state, Preview state, revision source state, and refresh after new revision/regeneration persistence.
- Version rows already display version kind, source generated version, screenshot state, summary, approximation notes, optional revision instruction, complete generated code, explicit Preview, and revision tools.
- Preview remains explicit and separate through the Milestone 6C packaged sandbox host and render-realm boundary.

## 3. Product Definition and Exclusions

Version Comparison is local, deterministic, read-only, ephemeral, and limited to exactly two different persisted generated versions with the same `sourceCaptureId`. The user explicitly orders the pair as Baseline and Candidate, can reverse that order through Swap, and clears comparison by closing it or leaving the capture.

Comparison must not write IndexedDB, mutate a `CaptureRecord`, mutate generated versions, call backend/provider/OpenAI/content script/service worker/source webpage/analytics/remote origins, automatically Preview or execute code, compare screenshot pixels or rendered output, score versions, choose a winner, merge code, edit code, compare across captures, compare three or more versions, delete, roll back, export, sync, authenticate, collaborate, or add payments.

No database migration, new dependency, Preview protocol change, sandbox change, Manifest change, package-file change, generated-version contract change, or backend change was introduced by Milestone 6E.

## 4. Comparison Model

The implementation must expose a pure helper that derives one immutable comparison model from two validated `GeneratedComponentVersionEntry` objects and the currently loaded validated union list.

Model shape:

```ts
type VersionComparisonModel = {
  baseline: GeneratedComponentVersionEntry;
  candidate: GeneratedComponentVersionEntry;
  relationship: VersionLineageRelationship;
  metadataRows: VersionMetadataComparisonRow[];
  codeDiff: VersionCodeDiffResult;
  changeSummary: {
    metadataChanged: number;
    metadataBaselineOnly: number;
    metadataCandidateOnly: number;
    codeAddedLines: number;
    codeRemovedLines: number;
  };
};
```

Input rules:

- Reject comparing an entry with itself.
- Reject entries with different `sourceCaptureId`.
- Traverse only the currently loaded validated union list.
- Use generated-version IDs as graph nodes.
- Treat V1 entries as roots with no generated-version parent.
- Treat V2 `operation.sourceGeneratedVersionId` as the parent edge.
- Detect cycles.
- Bound traversal by the number of loaded versions.
- Treat missing ancestors as a safe display condition.
- Never fetch, persist, or mutate data.

The helper must clone or derive plain values and must not mutate caller-owned entries or arrays.

## 5. Lineage Classification

Relationship values are:

- `direct-child`: Candidate directly references Baseline as its source generated version.
- `direct-parent`: Baseline directly references Candidate as its source generated version.
- `descendant`: Candidate reaches Baseline through one or more loaded parent edges.
- `ancestor`: Baseline reaches Candidate through one or more loaded parent edges.
- `sibling`: Both entries have the same known loaded parent generated-version ID.
- `unrelated-lineage`: Both entries are valid for the same capture, but no known loaded path or shared loaded parent relates them.
- `incomplete-lineage`: At least one traversal reaches a missing ancestor ID before proving a relationship, or a defensive cycle is detected.

Tie rules:

- Check direct-child and direct-parent first.
- Then check descendant and ancestor through bounded traversal.
- Then check sibling only when both known parent IDs are equal and exist in the loaded list.
- If traversal encounters a missing parent or a cycle before proving a relationship, return `incomplete-lineage`.
- Otherwise return `unrelated-lineage`.

The UI must display the relationship as descriptive text and must not imply quality, superiority, or correctness.

## 6. Metadata Comparison

Metadata comparison uses a fixed allowlist:

- Component name.
- Framework.
- Styling.
- Summary.
- Approximation notes.
- Created time.
- Version kind.
- Source generated version.
- Screenshot inclusion state.
- Revision instruction when present.
- Bounded technical version ID.

Each row must contain Baseline value, Candidate value, and one status:

- `unchanged`.
- `changed`.
- `baseline-only`.
- `candidate-only`.

Display rules:

- Use bounded text for long values.
- Use "No value" for absent optional values.
- Use "Initial generation", "Revision", and "Regeneration" for version kind.
- Use "(missing ancestor)" when a referenced source generated version is not in the loaded list.
- Use a shortened generated-version ID label for the technical ID row, with the complete ID available as text that can be selected and copied.
- Do not display fingerprints, `logicalAttemptId`, review fingerprints, storage keys, wrappers, provider metadata, source URL, page title, notes, secrets, or raw backend data.
- Do not infer or explain why a field changed.

## 7. Bounded Code Diff

The code diff uses a small internal bounded longest-common-subsequence implementation. No dependency is added.

Input behavior:

- Compare exact persisted `entry.value.code`.
- Normalize CRLF and CR to LF only for diff calculation.
- Do not trim or normalize spaces, tabs, quotes, semicolons, JSX, or Tailwind classes.
- Preserve final-newline difference by representing a final missing newline as a deterministic marker row.
- Render code as React text nodes only.
- Never parse, transform, compile, evaluate, or use `dangerouslySetInnerHTML`.

Diff output rows:

```ts
type VersionCodeDiffRow =
  | { kind: "context"; baselineLine: number; candidateLine: number; text: string }
  | { kind: "removed"; baselineLine: number; candidateLine: null; text: string }
  | { kind: "added"; baselineLine: null; candidateLine: number; text: string };
```

Deterministic LCS tie-breaking:

- Build the LCS table from the end of both line arrays.
- During reconstruction, when both "skip baseline" and "skip candidate" have equal score, choose "skip candidate" first so additions before removals are stable for repeated lines.
- Equal lines are emitted as `context`.
- Non-equal unmatched Baseline lines are `removed`.
- Non-equal unmatched Candidate lines are `added`.

Limits:

- Maximum lines per side: 1,200.
- Maximum displayed line length: 1,000 UTF-16 code units per row before horizontal scrolling; do not truncate row text.
- Maximum diff rows: 2,500.
- Maximum total LCS work: 1,440,000 cells.

These limits are compatible with the existing generated-code contract and protect the Side Panel from large quadratic work.

Fallback behavior:

- If either side exceeds 1,200 lines or the projected LCS work exceeds 1,440,000 cells, return `Diff unavailable at this size`.
- If reconstructed rows exceed 2,500, return `Diff unavailable at this size`.
- Do not silently truncate the diff.
- Keep complete Baseline and Candidate code separately visible and copyable.
- Equal code returns `No code changes.`

## 8. User Workflow and Accessibility

The comparison UI belongs inside the existing Generated Versions section.

Workflow:

1. User activates `Compare versions`.
2. Show two native select controls: `Baseline version` and `Candidate version`.
3. Do not auto-select either version.
4. Prevent the same version from being selected for both roles.
5. Enable `Compare` only after two different deliberate selections.
6. Open the comparison panel below the controls.
7. Provide `Swap`, `Change selections`, and `Close comparison`.
8. Sections are `Comparison overview`, `Relationship`, `Metadata changes`, `Code changes`, `Complete Baseline code`, and `Complete Candidate code`.

Native select controls are selected because the version list already has stable labels, the interaction is a simple bounded choice, and native controls provide keyboard and screen-reader behavior without a custom listbox.

Accessibility requirements:

- Keyboard-only operation.
- Native controls.
- Visible focus.
- Complete accessible names.
- No color-only meaning.
- Text labels for added, removed, unchanged, Baseline only, and Candidate only.
- Focus moves to the comparison heading after Compare.
- Focus returns to `Compare versions` after Close.
- Invalid duplicate selection focuses the conflicting control.
- Swap leaves focus on `Swap` and updates a concise aria-live status.
- Aria-live announces only concise status, never full code or full diff.
- Long code lines are horizontally scrollable.
- Reduced-motion users receive no animated comparison transitions.

Changing a select after a comparison is shown does not automatically recompute. The user must activate `Compare` again or use `Change selections`.

## 9. State and Refresh Lifecycle

Comparison state is owned by `GeneratedVersionsSection` or a dedicated child keyed by `sourceCaptureId`.

State rules:

- Capture switch clears comparison immediately.
- Returning to Library or closing the Side Panel clears comparison.
- Selections are not restored across reopen.
- Refresh preserves comparison only when both exact selected IDs still exist in the accepted loaded list.
- If one selected version disappears, close stale results and clear only the unavailable selection.
- Late results from another capture cannot update comparison.
- Comparison uses immutable snapshots from the currently accepted loaded list.
- Comparison state remains separate from `expandedId`, `previewOpenId`, and `revisionSourceId`.
- Comparison must not automatically close Preview or revision tools.
- No stale async result may update a new capture.

The comparison helper is synchronous after the loaded list exists. If implementation later schedules work to avoid blocking, it must use a capture-scoped operation token and discard stale completion.

## 10. Privacy and Security

Comparison is local-only and read-only.

It must not:

- Call fetch.
- Send messages to content scripts or the service worker.
- Contact backend/provider/OpenAI/analytics/remote origins.
- Read source webpages.
- Read browser storage or cookies.
- Write IndexedDB.
- Open Preview automatically.
- Execute generated code.
- Render raw HTML.

Displayed data is limited to the metadata allowlist and exact persisted generated code for the two selected versions. Hidden fields such as fingerprints, logical attempt IDs, storage keys, wrappers, provider metadata, source URL, page title, notes, secrets, and raw backend data remain undisplayed.

## 11. Implementation Boundaries

Accepted implementation shape:

- One pure comparison helper module.
- One dedicated Side Panel comparison component.
- Minimal `SavedCaptureDetail` integration.
- Minimal Side Panel styles.
- Focused helper tests and E2E tests.

Areas that remain out of scope unless separately approved:

- Generated-version contracts.
- IndexedDB schema, database version, stores, and indexes.
- Backend routes and provider adapter.
- Preview protocol, preview policy, host, and render realm.
- Manifest and CSP.
- Package files and dependencies.
- CaptureRecord schema.

## 12. Test Plan

Pure helper coverage:

- V1/V1, V1/V2, and V2/V2 comparisons.
- All lineage classifications.
- Missing ancestor.
- Defensive cycle.
- Identical and changed metadata.
- Additions, removals, replacements.
- Blank and whitespace-only lines.
- CRLF and CR normalization.
- Final-newline difference.
- Repeated-line tie-breaking.
- Safety fallback.
- Input immutability.

Side Panel E2E coverage:

- Deliberate Baseline/Candidate selection.
- Duplicate selection rejection.
- Compare readiness.
- Swap and Close.
- Focus behavior.
- V1/V2 comparison.
- Metadata labels.
- Code diff states.
- Missing lineage.
- Refresh preservation and retirement.
- Capture switch cleanup.
- No automatic Preview or iframe.
- No revision transport.
- Zero network.
- Zero IndexedDB writes.
- Source entries unchanged.
- Keyboard operation.
- Default headless execution.

## 13. Accepted Slice Closeout

Slice 2 delivered Version Comparison implementation:

- Pure comparison helper.
- Bounded deterministic diff.
- Relationship classification.
- Accessible UI.
- Integration and styles.
- Focused tests.
- No backend, storage, schema, or Preview changes.

Slice 3 delivered hardening and final Milestone 6 regression:

- Adversarial lifecycle and stale-state tests.
- Privacy and no-network assertions.
- Preview and revision/regeneration coexistence.
- Full Milestone 1-6 regression.
- Backend regression and audit.
- Only minimal fixes exposed by tests.

Slice 4 delivered documentation closeout:

- Documentation-only after independent acceptance of Slice 3.
- Mark 6E and Milestone 6 Completed.
- Update project documentation.
- Record accepted local validation without misrepresenting GitHub CI.

## 14. Acceptance Gates

Milestone 6E is accepted with these gates satisfied:

- Comparison is local, read-only, deterministic, and ephemeral.
- Exactly two different versions with the same `sourceCaptureId` are required.
- Baseline and Candidate order is explicit and swappable.
- V1 and V2 entries are supported.
- Lineage classification follows this document.
- Metadata rows use only the fixed allowlist.
- Code diff follows the bounded LCS algorithm and limits.
- Oversized diffs use the explicit unavailable fallback.
- Complete Baseline and Candidate code remain visible and copyable.
- No automatic Preview, iframe creation, transport, network, or IndexedDB write occurs.
- Keyboard and screen-reader behavior follows the accessibility requirements.
- Tests cover helper behavior, Side Panel workflow, privacy, refresh, stale state, and headless default execution.

Hardening acceptance additionally confirmed:

- Stale and out-of-order refreshes cannot overwrite newer accepted state.
- Pending Capture A refresh cannot update Capture B.
- Pending refresh completion cannot reopen Detail or Comparison after returning to Library.
- Revision and Regeneration can save while Comparison remains active.
- Original Baseline and Candidate IDs remain selected.
- Newly persisted exact version IDs appear in available options.
- Preview remains explicitly triggered and independent.
- Existing `CaptureRecord`, screenshot asset, and pre-existing V1/V2 entries remain immutable.
- Revision and Regeneration append new immutable versions only.
- Privacy, no-network, no-runtime-message, no-automatic-iframe, and schema boundaries remain intact.

Accepted local validation associated with closure:

- `npm run build`: passed.
- Focused Milestone 6E suite: 25 passed.
- Focused stability rerun: 25 passed.
- Backend tests: 13 passed.
- Full E2E: 225 passed, 1 skipped.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Existing skip: `Milestone 5C loopback E2E requires an extension build with the loopback endpoint.`

These were local reported validation results associated with the accepted implementation, not GitHub Actions results.

## 15. Residual Risks

- Line diff does not understand JSX semantics.
- Repeated lines can have multiple reasonable alignments; the selected tie-breaker is deterministic but not uniquely "correct".
- Large inputs may use the safe fallback.
- Missing ancestors limit lineage classification.
- Comparison cannot determine which version is better.
- Source comparison may differ from rendered appearance.
- Previewable Subset V1 remains limited.
- Local storage may be externally altered.
- Automated tests are not a general security proof.

## 16. Frozen Decisions

- Implement comparison as local-only, read-only, deterministic, ephemeral UI state.
- Compare exactly two different persisted generated versions with the same `sourceCaptureId`.
- Use explicit user-ordered Baseline and Candidate roles.
- Provide Swap, Change selections, and Close comparison.
- Store no comparison state in IndexedDB.
- Add no dependency.
- Use an internal bounded LCS line diff with the limits in Section 7.
- Normalize only CRLF/CR to LF for diff calculation.
- Do not parse, compile, execute, Preview, score, merge, or edit code.
- Use native select controls.
- Keep comparison state separate from expand, Preview, and revision state.
- Preserve comparison across refresh only when both selected IDs still exist.
- Display only allowlisted metadata.
- Keep complete Baseline and Candidate code visible and copyable even when diff is unavailable.
- Implement Slice 2 without backend, storage schema, contract, Preview protocol, Manifest, CSP, package, or database changes.
