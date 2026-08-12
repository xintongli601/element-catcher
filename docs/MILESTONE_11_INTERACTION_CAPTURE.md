# Milestone 11 - Interaction Capture V1

Status: Local implementation complete; pending independent ChatGPT final acceptance

Slice 1 status: Completed / Accepted at `23ff038b2e02a9f8bb3b08824a2f52180175b1df`

Slice 2 status: Local implementation complete; pending independent ChatGPT final acceptance

## Objective

Milestone 11 records a bounded, user-assisted interaction representation from saved captures:

```text
Trigger / Before -> Interaction -> Primary Reaction (+ optional Additional Reactions)
```

Element-level selection remains the capture entry point, but the visible reaction does not have to live inside the selected trigger element's DOM subtree. The user captures meaningful visible surfaces, then Element Catcher stores their relationship.

Examples:

- `More` -> hover -> dropdown appears
- `Avatar` -> click -> account menu appears
- `Bell` -> hover -> tooltip appears
- `Toggle Off` -> toggle -> `Toggle On`
- `Input Rest` -> focus -> focused input state

## Interaction Pair V1

M11 preserves the accepted `InteractionPairV1` schema version and evolves it backward-compatibly.

Fields:

- `schemaVersion: 1`
- `id`
- `createdAt`
- optional `title`
- `baseCaptureId` = Trigger / Before
- `alternateCaptureId` = Primary Reaction
- optional `additionalReactionCaptureIds` = Additional Reactions
- `trigger`

Supported triggers remain exactly:

- click
- toggle
- hover
- focus

Old Slice 1 records without `additionalReactionCaptureIds` remain valid. The pair stores only capture references and bounded metadata; it does not duplicate `CaptureRecord` data or screenshot assets.

## User-Assisted Workflow

The Capture Library includes a compact Interaction Pair workflow:

- choose a saved capture as Trigger / Before;
- choose a different saved capture as Primary Reaction;
- optionally choose Additional Reactions;
- select one approved interaction trigger;
- optionally enter a short title;
- save the pair locally;
- reopen the pair and inspect the Trigger / Before, Interaction, Primary Reaction, and Additional Reactions;
- delete the pair without deleting referenced captures.

The workflow is deliberately not a graph editor, timeline editor, interaction recorder, animation editor, or state-machine builder.

## Hover Capture Assist

M11 also adds a minimal page-side quick capture path for hover-dependent UI that disappears when the pointer leaves the webpage:

```text
Start Capture
-> move pointer over the desired webpage element
-> webpage hover state appears
-> keep pointer in place
-> press Enter
-> Element Catcher captures the current highlighted element/state through the existing capture pipeline
-> Capture Preview appears normally
-> user can save it as an ordinary CaptureRecord v1
```

Pressing Enter with a valid highlighted candidate prevents the underlying webpage activation, locks the highlighted element locally, and routes into the existing extraction, screenshot, Capture Preview, and Save path. Escape keeps the existing cancellation behavior.

The page-side HUD is fixed to the viewport bottom-left with `pointer-events: none`, does not affect page layout, and no longer follows or covers the hovered target or reaction.

## Referential Integrity

M11 enforces:

- Trigger / Before and Primary Reaction are distinct captures.
- Additional Reactions cannot duplicate Trigger / Before.
- Additional Reactions cannot duplicate Primary Reaction.
- Additional Reactions cannot duplicate each other.
- Zero Additional Reactions is valid.
- Old two-state pairs remain valid.
- Deleting a Pair never deletes referenced `CaptureRecord` entries.

If a referenced capture is missing, the pair remains inspectable, the missing state is identified as unavailable, and the UI fails closed without fabricating source data.

Known limitation: if an Interaction Pair is already loaded in the current Side Panel session and one of its referenced captures is deleted elsewhere, the pair view may not refresh immediately. Reopening the Side Panel re-resolves the missing reference correctly. This limitation was accepted in Slice 1 and remains intentionally unchanged.

## Privacy And Boundaries

Interaction Pair metadata remains local-first.

M11 creates no AI request, backend request, provider request, GitHub request, or remote source-page request. It does not read cookies, credentials, browser storage, authentication state, event listeners, source JavaScript, network traffic, or app state managers.

M11 does not add:

- automatic behavior detection;
- MutationObserver tracing;
- event-listener scraping;
- framework introspection;
- portal ownership inference;
- automatic overlay discovery;
- DOM-diff state machines;
- multi-step workflow recording;
- generated interaction code;
- `CaptureRecord v1` schema changes;
- Manifest permission changes;
- dependency changes;
- CSP weakening;
- backend/provider/network changes.

## Local Validation

Current local validation:

- `git diff --check`: PASS.
- Focused M11 Playwright: `10 passed / 0 failed / 0 skipped / 0 did not run`.
- Relevant persistence/library/capture/version-comparison Playwright regression: `140 passed / 0 failed / 0 skipped / 0 did not run`.
- `npm run build:extension`: PASS.
- Final full Playwright: `309 passed / 0 failed / 1 skipped / 0 did not run`.

Backend tests are not required for M11 because backend files and network/provider behavior are unchanged.

M11 remains pending independent ChatGPT final acceptance and does not imply M12, generated interaction output, universal automatic interaction detection, production readiness, store readiness, SaaS readiness, or universal private-site compatibility.
