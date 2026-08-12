# Milestone 11 - Two-State Interaction Capture V1

Status: Current

Slice 1 status: Implementation complete; automated validation passed; real Chrome manual workflow validation passed; pending final independent remote acceptance by ChatGPT

## Objective

Milestone 11 moves Element Catcher toward interactive reconstruction by capturing two observed UI states and recording a bounded transition between them.

The V1 strategy is intentionally simple:

```text
Capture state A
-> user changes the original UI manually
-> Capture state B
-> pair A + B
-> select a bounded trigger
-> save Interaction Pair
```

Element Catcher does not copy the original website JavaScript. Slice 1 proves a local source model for observed interaction states before adding any generated interaction output.

## Why Two-State Pairing

Two-State Pairing is the fastest bounded path to a useful interactive-reconstruction product because it relies on captures Element Catcher already knows how to save and inspect.

It avoids the cost and risk of automatic event recording, framework introspection, mutation tracing, network observation, or arbitrary state-machine editing. The reviewer can understand the captured behavior as:

```text
State A --click--> State B
```

The same model works for simple UI transitions such as click-open details, hover alternatives, focus states, and toggle states without claiming full behavioral replay.

## Slice 1 Architecture

Slice 1 adds a separate `InteractionPairV1` model. It does not modify `CaptureRecord v1`.

The pair record contains only bounded local metadata:

- schema version;
- stable interaction-pair ID;
- created timestamp;
- optional title;
- base saved-capture ID;
- alternate saved-capture ID;
- trigger.

Supported triggers are exactly:

- click
- toggle
- hover
- focus

The pair references existing saved captures by stable local IDs. It does not duplicate full `CaptureRecord` data or screenshot assets into the interaction record.

Persistence uses the existing local IndexedDB architecture with a narrowly scoped `interactionPairs` store in database version 3.

## Library Workflow

The Capture Library includes a compact Interaction Pair workflow:

- choose a saved capture as Base state;
- choose another saved capture as Alternate state;
- select one approved V1 trigger;
- optionally enter a short title;
- save the pair locally;
- reopen the pair;
- inspect both state screenshots, capture metadata, trigger, and transition text;
- delete the pair.

The workflow is deliberately not a graph editor, timeline editor, interaction recorder, animation editor, or state-machine builder.

## Referential Integrity

If a referenced capture is later deleted, the Interaction Pair fails safely as incomplete.

The UI may still show the saved pair metadata and allow deletion, but it must not fabricate, duplicate, or silently replace the missing state. Deleting an Interaction Pair does not delete its source captures.

## Privacy Boundary

Interaction Pair metadata remains local.

Slice 1 creates no AI request, backend request, provider request, GitHub request, or remote source-page request. It does not read cookies, credentials, browser storage, authentication state, event listeners, source JavaScript, network traffic, or app state managers.

The source captures continue to follow the accepted local `CaptureRecord v1` and screenshot-asset privacy boundary from earlier milestones.

## Explicit Non-Goals

Slice 1 does not implement:

- automatic interaction recording;
- MutationObserver interaction tracing;
- event-listener scraping;
- React, Vue, Angular, or app-state introspection;
- network observation;
- multi-step state machines;
- more than two states per pair;
- drag/drop, scroll, keyboard macros, or animation timelines;
- AI interaction generation;
- generated interaction code;
- interactive generated-code preview;
- arbitrary generated JavaScript execution;
- `CaptureRecord v1` schema changes;
- backend/provider/GitHub changes;
- Manifest permission changes;
- new browser permissions;
- CSP weakening;
- new dependencies.

## Slice 1 Acceptance Criteria

Automated acceptance must verify:

- validation accepts exactly click, toggle, hover, and focus;
- invalid triggers fail closed;
- base and alternate captures must be distinct;
- a pair persists across Side Panel close/reopen;
- saved pair detail resolves and displays both source captures;
- pair deletion persists;
- missing referenced captures fail safely;
- ordinary Capture Library behavior remains unchanged;
- no AI/backend/provider request occurs;
- Manifest permissions are not broadened;
- `CaptureRecord v1` schema is unchanged.

## Manual Chrome Validation Plan

Manual validation should use real Chrome with the unpacked extension and ordinary saved captures:

- create two saved captures from a supported ordinary webpage;
- save a click Interaction Pair;
- reopen Element Catcher and confirm the pair persists;
- inspect both screenshots and trigger;
- delete the pair and confirm deletion persists;
- repeat one alternate trigger if useful;
- delete one referenced capture and confirm an incomplete pair fails safely;
- confirm the Capture Library still opens ordinary saved captures;
- optionally inspect Side Panel Console, Service Worker Console, and extension Errors page.

Manual validation is not expected to prove generated interaction output, AI behavior, backend transport, remote fetching, or universal private-site compatibility.

## Slice 1 Validation Evidence

Automated validation:

- `git diff --check`: PASS.
- Focused M11 tests: `4 passed / 0 failed / 0 skipped / 0 did not run`.
- Repaired Milestone 6E version-comparison test: `1 passed / 0 failed / 0 skipped / 0 did not run`.
- Relevant persistence/library/version-comparison regression: `146 passed / 0 failed / 0 skipped / 0 did not run`.
- Final `npm run build:extension`: PASS.
- Final full Playwright: `303 passed / 0 failed / 1 skipped / 0 did not run`.
- Backend tests: not run because backend files were unchanged and outside Slice 1 scope.

Real Chrome manual validation:

- Interaction Pair creation: PASS. The user captured `Account Dropdown - Closed` as Base and `Account Dropdown - Open` as Alternate, then created `Account Dropdown - Closed click interaction` with trigger `click`.
- Saved pair detail: PASS. The detail showed the correct Base capture, correct Alternate capture, both screenshots, correct trigger, and the transition `Account Dropdown - Closed --click--> Account Dropdown - Open`.
- Persistence across Side Panel close/reopen: PASS. The saved pair remained available with the same trigger, Base capture, Alternate capture, and both screenshots.
- Pair deletion: PASS. Deleting the Interaction Pair removed the pair and did not delete the original Base or Alternate captures.
- Missing-reference fail-safe: PASS. After a temporary pair's referenced source capture was deleted, closing and reopening the Side Panel re-resolved the pair as incomplete. The UI showed `This Interaction Pair is incomplete because a referenced capture is missing. Delete the pair or recreate it from available captures.`, `Base capture: Missing`, and `Referenced capture unavailable.`
- Side Panel Console: Not manually checked in this closeout; explicitly waived by the reviewer because build, focused tests, relevant regressions, full Playwright, and the required real Chrome interaction workflow all passed.
- Service Worker Console: Not manually checked in this closeout; explicitly waived by the reviewer because build, focused tests, relevant regressions, full Playwright, and the required real Chrome interaction workflow all passed.
- Extension Errors page: Not manually checked in this closeout; explicitly waived by the reviewer because build, focused tests, relevant regressions, full Playwright, and the required real Chrome interaction workflow all passed.

Known limitation: if an Interaction Pair is already loaded in the current Side Panel session and one of its referenced captures is deleted, the pair view may not refresh immediately. Reopening the Side Panel causes the references to be re-resolved correctly and the missing source is shown as unavailable. This is accepted as a non-blocking Slice 1 limitation because persisted data remains correct, reopening resolves the missing reference correctly, the UI fails closed, and no source data is fabricated.

Acceptance status: pending final independent remote acceptance by ChatGPT. M11 Slice 1 is not formally accepted in this local closeout, Milestone 11 remains Current, M11 Slice 2 is not started, and M12 is not started.
