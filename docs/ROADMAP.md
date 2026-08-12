# Element Catcher Roadmap

This roadmap is the authoritative source of truth for Element Catcher milestone status and sequencing. It should be kept aligned with `README.md`, `docs/PRD.md`, `docs/DEVELOPMENT_BRIEF.md`, and `docs/CAPTURE_SCHEMA.md`.

Allowed milestone status values are:

- Completed
- Current
- Planned

## Milestone 1 - Extension Scaffold

Status: Completed

Objective: Establish the Chrome Extension Manifest V3 project foundation and a minimal development/build workflow for Element Catcher.

Included scope:

- Chrome Extension Manifest V3 scaffold.
- TypeScript and Vite build setup.
- React side panel entry.
- Background service worker entry.
- Content script entry.
- Shared message/type module.
- Plain CSS side panel UI.
- Generated `dist/` output for loading the unpacked extension in Chrome.

Explicitly excluded scope:

- Element selection behavior.
- Screenshot capture.
- DOM or CSS extraction.
- Local capture persistence.
- Capture Library.
- AI generation.

Acceptance criteria:

- The extension project can install dependencies, build successfully, and produce a loadable unpacked Chrome extension.
- The side panel, background service worker, and content script entry points exist in the expected source structure.
- The scaffold creates a stable base for selection and capture work in later milestones.

Acceptance status: Completed. Milestone 1 is accepted as the extension scaffold baseline.

## Milestone 2 - Selection Mode and Element Highlighting

Status: Completed

Objective: Let the user start a focused browser selection workflow from the side panel and select a visible DOM element on supported ordinary webpages.

Included scope:

- Side panel `Start Capture` control.
- Background service worker routing from the side panel to the active tab.
- Supported-page guard for ordinary `http://` and `https://` webpages.
- Content script selection mode.
- Hover-based overlay highlighting.
- Overlay label with tag name and dimensions.
- Click-to-select behavior.
- `Escape` and side panel cancellation.
- Listener, cursor, overlay, and label cleanup.
- Minimal selected-element metadata returned to the side panel:
  - tag name
  - bounding rectangle
  - page URL
  - optional short text preview
  - optional element ID
  - optional class names
- Clear user-facing errors when selection cannot reach a page.

Known limitations:

- Selection is limited to supported `http://` and `https://` webpages where the content script is available.
- Restricted pages such as `chrome://` pages, Chrome Web Store pages, browser-controlled UI, and some extension pages cannot be selected.
- Cross-origin iframe support is not implemented.
- Closed shadow roots and browser UI cannot be inspected.
- The selected element is not locked for refinement after click.
- Screenshot capture, DOM/CSS extraction, Capture Preview, local persistence, Capture Library, and AI generation are not implemented.

Explicitly excluded scope:

- Screenshot capture and cropping.
- Sanitized DOM snapshot creation.
- Normalized computed style extraction.
- Parent/child refinement.
- `CaptureRecord` creation.
- Local capture storage.
- AI generation.

Acceptance criteria:

- A user can open the side panel and start selection on a supported webpage.
- Hovered DOM elements are visibly highlighted.
- Clicking the highlighted element selects it and returns minimal metadata to the side panel.
- Pressing `Escape` or using the side panel cancel control exits selection mode and restores normal page interaction.
- Unsupported or unreachable pages produce clear errors rather than hanging.

Acceptance status: Completed. Milestone 2 is accepted as the minimal selection and highlighting workflow.

## Milestone 2.5 - Product Positioning and Capture Architecture Reset

Status: Completed

Objective: Clarify Element Catcher's product direction and capture architecture before implementing screenshot capture, DOM/CSS extraction, local persistence, Capture Library, or AI generation.

Included scope:

- Product positioning reset around: "Capture UI inspiration. Rebuild it as reusable code."
- Capture workflow definition:

```text
Raw webpage element
  -> Capture extractor
  -> Normalized CaptureRecord
  -> Local Capture Library
  -> AI component generator
  -> Generated component versions
  -> Reuse or export
```

- Local-first product principle.
- Supported-page limitations and privacy boundaries.
- Revised milestone sequencing.
- `CaptureRecord v1` schema definition.
- Separation of original captures from generated component versions.

Documentation-only scope:

- Milestone 2.5 does not add extension runtime functionality.
- Existing Milestone 1 and Milestone 2 implementation should remain intact.
- It defines the product and data architecture for subsequent milestones.

Files and architectural decisions produced:

- `README.md`: updated positioning, completed milestones, capture architecture, known limitations, and revised roadmap summary.
- `docs/PRD.md`: revised product requirements, target users, product differentiation, local-first principle, core user flow, roadmap, success criteria, non-goals, and privacy boundaries.
- `docs/DEVELOPMENT_BRIEF.md`: module responsibilities, implementation order, versioning, screenshot storage strategy, sanitization, sensitive-data handling, restricted-page limitations, parent/child scope, and future acceptance criteria.
- `docs/CAPTURE_SCHEMA.md`: `CaptureRecord v1` contract, JSON-compatible interfaces, field groups, example shape, privacy safeguards, sanitization rules, and migration strategy.
- `docs/ROADMAP.md`: authoritative milestone status and sequencing.
- Decision: `CaptureRecord` is the normalized source of truth for Capture Preview, local library entries, search, AI generation input, generated component versions, and future export.
- Decision: Raw DOM references and unsanitized raw `outerHTML` must not be persisted.
- Decision: Screenshot data should be stored through asset references rather than duplicated inline in every metadata record.

Explicitly excluded scope:

- New extension runtime behavior.
- Screenshot capture.
- DOM/CSS extraction.
- Local persistence.
- Capture Library UI.
- AI API integration.

Acceptance criteria:

- Documentation reflects the refined product direction and workflow.
- `CaptureRecord v1` is defined as the future normalized capture contract.
- Milestone 3 scope is clear enough to start implementation without changing the product direction.
- Existing Milestone 1 and Milestone 2 behavior remains unchanged.

Acceptance status: Completed. Milestone 2.5 is accepted as a documentation and architecture reset.

## Milestone 3 - Reliable Element Capture

Status: Completed

Objective: Convert a selected webpage element into one complete, local-first `CaptureRecord v1` with visual reference, source context, sanitized structure, normalized styles, semantic summaries, Capture Preview, and local persistence.

Included scope:

- Click-to-lock selected element.
- Parent/child target refinement.
- Tag, semantic role, and dimensions.
- Source URL and page title.
- Viewport and device pixel ratio.
- Element screenshot capture and cropping.
- Screenshot asset reference strategy.
- Sanitized DOM snapshot.
- Child element summaries.
- Normalized computed style extraction.
- Optional `::before` and `::after` style snapshots where available.
- Typography, color, layout, and spacing summaries.
- Capture Preview in the side panel.
- Creation of one valid `CaptureRecord v1`.
- Local persistence of the completed `CaptureRecord`.
- Sensitive-field omission or redaction according to documented privacy rules.

Explicitly excluded scope:

- Full DOM tree browser.
- Complete visual CSS editor.
- QA measurement suite.
- Complete computed-style explorer.
- Full-page cloning.
- Multi-page cloning.
- Image or video scraping.
- Complete page HTML export.
- AI React + Tailwind generation.
- Generated component version management.
- Cloud sync.
- Team collaboration.
- Authentication.
- Payment.
- Figma export.
- GitHub export.
- Multiple framework generation.
- Drag-to-box selection unless later validated as necessary.

Acceptance criteria:

- A user can lock a selected element on a supported webpage.
- The user can move to parent or child targets where available.
- The extension records tag, semantic role, dimensions, source URL, page title, viewport, and device pixel ratio.
- The extension captures and crops an element screenshot.
- The extension creates a sanitized DOM snapshot.
- The extension creates a normalized computed style snapshot.
- Optional pseudo-element style snapshots are included where available.
- Typography, color, layout, and spacing summaries are created.
- A Capture Preview displays the result.
- One valid `CaptureRecord v1` is created.
- The `CaptureRecord` is locally persisted.
- Sensitive fields are omitted or redacted according to policy.

Acceptance status: Completed. Milestone 3 passed locked-selection and parent/child refinement; privacy-safe DOM and normalized style extraction; pseudo-element and semantic-summary validation; current-visible-tab screenshot capture and viewport/clipping-aware cropping; complete `CaptureRecord v1` assembly and validation; stable screenshot asset reference; atomic local IndexedDB persistence; Capture Preview; explicit Save, duplicate-submission prevention, failure and retry behavior; persisted record and screenshot read-back after Side Panel reopen; privacy-boundary, Console, permission, and extension-error checks.

### Milestone 3A - Locked Selection and Parent/Child Refinement

Status: Completed

Objective: Replace immediate click-to-select completion with a locked-selection refinement flow:

```text
Start Capture
  -> Hover candidate
  -> Click to lock candidate
  -> Refine with Parent or Child
  -> Confirm final element
  -> Return confirmed metadata
```

Included scope:

- Click-to-lock candidate element.
- Temporary content-script runtime state for the locked element.
- Parent refinement to the nearest eligible ancestor.
- Child refinement down the deterministic path created by Parent actions.
- Confirm action that returns final serializable selected-element metadata.
- Cancel and Escape support in active hover and locked states.
- Locked overlay styling and scroll/resize realignment.
- Disconnected locked-element error handling.
- Basic deterministic semantic-role metadata.
- Side panel locked state and Parent, Child, Confirm, and Cancel controls.

Explicitly excluded scope:

- Screenshot capture.
- `CaptureRecord v1` construction.
- Local persistence.
- Capture Preview.
- Capture Library.
- AI generation.
- Full DOM tree browsing.
- Sibling navigation.
- Arbitrary child browsing.

Acceptance criteria:

- TypeScript production build passes.
- The locked-selection runtime flow is manually validated on ordinary supported webpages.
- Parent and Child refinement are manually validated as deterministic and bounded.
- Confirm, Cancel, Escape, cleanup, and repeatability are manually validated.
- Restricted and unreachable page behavior remains clearly reported.

Acceptance status: Completed. Milestone 3A is accepted as the locked-selection refinement stage.

### Milestone 3B - Structured Extraction Before Screenshots

Status: Completed

Objective: Add the structured, privacy-aware capture-time data needed before screenshot capture and full `CaptureRecord v1` creation.

Included scope:

- Milestone 3B.1: `CaptureRecord v1` TypeScript types and privacy-safe DOM extraction.
- Milestone 3B.2: normalized styles, pseudo-elements, and semantic summaries.

Explicitly excluded scope:

- Screenshot capture.
- Screenshot asset storage.
- Complete `CaptureRecord v1` construction.
- Local persistence.
- Capture Preview.
- Capture Library.
- AI generation.

Acceptance criteria:

- Milestone 3B.1 and 3B.2 are implemented and validated separately.
- No complete `CaptureRecord v1` is created before screenshot asset data exists.
- No screenshot placeholder is introduced.

Acceptance status: Completed. Milestone 3B.1 and Milestone 3B.2 are both completed and accepted as the structured extraction baseline before screenshot capture.

#### Milestone 3B.1 - CaptureRecord Types and Privacy-Safe DOM Extraction

Status: Completed

Objective: Extract a limited, serializable, privacy-aware DOM data package when the user confirms a locked element.

Included scope:

- Authoritative `CaptureRecord v1` TypeScript types matching `docs/CAPTURE_SCHEMA.md`.
- Explicitly intermediate `DomCaptureExtraction` type.
- Source URL and page title capture.
- Viewport and device pixel ratio capture.
- Confirmed selected-element identity.
- Privacy-safe sanitized DOM snapshot.
- Limited direct child summaries.
- Reusable deterministic semantic-role helper.
- JSON compatibility validation before extension messaging.
- Confirm-time typed message integration.

Explicitly excluded scope:

- Complete `CaptureRecord v1` construction.
- Screenshot placeholders.
- Screenshot capture.
- Normalized computed CSS extraction.
- `::before` or `::after` extraction.
- Typography, color, layout, or spacing summaries.
- Component-type inference.
- Local persistence.
- Capture Preview.
- Capture Library.
- AI generation.

Acceptance criteria:

- Production build passes.
- Runtime regression passes on ordinary supported webpages.
- Serialized extraction crosses extension messaging without `DataCloneError`.
- Privacy-oriented extraction payload is inspected.
- Password values, input values, textarea values, hidden content, script text, style text, inline event handlers, arbitrary secret data attributes, raw `href`, and raw `src` are confirmed absent.
- Console and extension error checks are completed where required.

Acceptance status: Completed. Milestone 3B.1 passed ordinary-page runtime regression, dynamic-page regression, real extension messaging validation, privacy-oriented payload validation, and console and extension-error checks.

#### Milestone 3B.2 - Normalized Styles, Pseudo-elements and Semantic Summaries

Status: Completed

Objective: Add deterministic style extraction and summaries after DOM extraction is validated.

Included scope:

- Normalized computed CSS extraction.
- Optional `::before` and `::after` snapshots.
- Typography summary.
- Color summary.
- Layout summary.
- Spacing summary.
- Optional deterministic component type.

Explicitly excluded scope:

- Screenshot capture.
- Complete `CaptureRecord v1` construction.
- Local persistence.
- Capture Preview.
- Capture Library.
- AI generation.

Acceptance criteria:

- Style extraction and semantic summaries are added without mutating the original DOM extraction contract.
- Representative normalized computed styles are included in the combined extraction.
- Optional pseudo-element snapshots are bounded and exclude unsafe `attr(...)` and `url(...)` content.
- Typography, color, layout, spacing, and optional conservative component-type summaries are deterministic and bounded.
- Combined DOM and style extraction remains JSON-compatible across typed extension messaging.
- Ordinary-page regression, dynamic-page regression, payload inspection, privacy checks, and Console checks must pass before this milestone subsection is marked Completed.
- No full computed-style explorer or visual CSS editor is introduced.

Acceptance status: Completed. Milestone 3B.2 passed normalized style, Flex and Grid, pseudo-element safety, semantic summary, structured messaging, ordinary-page, dynamic-page, privacy, Console, and extension-error validation.

### Milestone 3C - Screenshot Capture and Cropping

Status: Completed

Objective: Capture one current-visible-tab PNG after confirmed selection cleanup, crop it to the selected element's visible viewport intersection, and show a temporary screenshot verification result without persistence.

Included scope:

- User-confirmed current-visible-tab PNG capture.
- Background-service-worker capture coordination.
- Overlay and label cleanup before screenshot capture.
- CSS-to-image pixel coordinate conversion.
- Browser zoom and device-pixel-ratio-safe scaling based on decoded screenshot dimensions.
- Crop bounds for the selected element's visible viewport intersection.
- Partial and oversized element behavior.
- Temporary cropped screenshot result.
- Minimal screenshot verification thumbnail.

Explicitly excluded scope:

- Full-page screenshot.
- Screenshot stitching.
- Offscreen reconstruction.
- Stable asset storage key.
- Screenshot persistence.
- Complete `CaptureRecord v1` creation.
- Full Capture Preview.
- Save.
- Local persistence.
- Capture Library.
- AI generation.

Acceptance criteria:

- Screenshot capture is requested only after explicit Confirm.
- `chrome.tabs.captureVisibleTab` is called only from the background service worker.
- Element Catcher overlay and label are removed before capture begins.
- The cropped screenshot uses decoded image dimensions to derive `scaleX` and `scaleY`.
- Partially visible and oversized elements crop only the currently visible viewport intersection.
- Fully offscreen selections fail with a clear error.
- The Side Panel shows only a temporary cropped screenshot verification result.
- No screenshot data is persisted and no fake `storageKey` is created.
- Ordinary-page, dynamic-page, zoom, partial-visibility, oversized-element, offscreen, Console, and extension-error checks must pass before this milestone subsection is marked Completed.

Acceptance status: Completed. Milestone 3C passed build and deterministic crop validation; real Chrome `captureVisibleTab` validation; activeTab action invocation; fully visible capture; partial visibility crop; oversized and clipping-ancestor crop; fractional crop; fully offscreen rejection; duplicate Confirm regression; dynamic-page and original-action prevention; wrong-tab protection; 100% and 125% zoom; and Console and extension-error checks.

### Milestone 3D - CaptureRecord Assembly, Preview and Local Persistence

Status: Completed

Objective: Convert the accepted temporary structured extraction and cropped screenshot result into one complete, locally persisted `CaptureRecord v1` with a stable screenshot asset reference and a useful Side Panel Capture Preview.

This stage completes Milestone 3 once all Milestone 3D subsections pass implementation and real runtime validation. The parent Milestone 3 remains Current until every Milestone 3D subsection is completed and accepted.

Included scope:

- Versioned local extension database.
- Separate local storage for screenshot assets and `CaptureRecord` metadata.
- Stable `ScreenshotAssetReference.storageKey`.
- Cropped PNG asset persistence.
- Complete `CaptureRecord v1` assembly.
- `schemaVersion: 1`.
- Unique capture id.
- ISO `createdAt` timestamp.
- Existing source, environment, element, DOM, style, pseudo-element, and summary extraction.
- `assets.screenshot` reference using persisted screenshot metadata.
- Default library metadata appropriate for a new capture.
- Empty `generatedVersions` array.
- JSON compatibility validation.
- Side Panel Capture Preview.
- Explicit Save action.
- Save success, failure, and retry states.
- Read-back validation after Side Panel close and reopen.
- Local-first behavior.

Storage architecture decision:

- Prefer a versioned IndexedDB database under the extension origin.
- Keep `CaptureRecord` metadata and screenshot assets in separate object stores in the same database.
- Allow both stores to be written in one transaction when saving a capture.
- Do not place the screenshot data URL inside `CaptureRecord`.
- Do not add the `chrome.storage` permission for this stage unless later proven technically necessary through an independently reviewed change.
- Do not request `unlimitedStorage` in this stage.

Explicitly excluded from all Milestone 3D subsections:

- Capture Library list.
- Capture Library search or filtering.
- Editing title, tags, notes, or component type after save.
- Deleting captures through Library UI.
- AI generation.
- Generated component versions.
- Cloud sync.
- Authentication.
- Payment.
- Figma or GitHub export.
- `chrome.storage.sync`.
- Full-page screenshot or stitching.
- Schema v2.
- Migration implementation beyond reserving a database version.
- Any modification to the completed Milestone 3C behavior unless a real regression is found.

Acceptance status: Completed. Milestone 3D delivered the versioned IndexedDB foundation, separate screenshot and `CaptureRecord` stores, complete `CaptureRecord v1` assembly, stable screenshot storage references, Capture Preview, explicit local Save, saving/saved/failed/retry states, verified atomic persistence, latest explicitly saved capture lookup, persisted Blob rendering, and Side Panel close/reopen read-back. Real Chrome runtime validation confirmed that temporary diagnostics were not treated as saved captures and that ordinary Save persisted exactly one record and one referenced screenshot asset.

#### Milestone 3D.1 - Local Persistence Foundation

Status: Completed

Objective: Create the versioned local database, screenshot asset repository, `CaptureRecord` repository, transaction boundaries, and typed persistence errors without yet adding full Capture Preview or Capture Library behavior.

Included scope:

- Database open and upgrade handling.
- Explicit database version.
- Screenshot asset object store.
- `CaptureRecord` object store.
- Stable screenshot storage key strategy.
- Save, read, and delete primitives needed for transaction rollback or cleanup.
- Typed JSON-compatible metadata boundaries.
- Clear quota, encoding, transaction, and read-back errors.
- No user-facing Capture Library.

Acceptance criteria:

- Production build passes.
- Database can be created in the extension origin.
- A cropped PNG asset can be written and read back without corruption.
- A JSON-compatible test record can be written and read back.
- Failed writes do not leave an orphaned final record.
- Existing selection, extraction, and screenshot behavior does not regress.
- No new manifest permission is added.
- No Capture Library UI is added.
- Real Chrome runtime validation is required before completion.

Acceptance status: Completed. Milestone 3D.1 passed production build validation; classic content-script bundling validation; real Chrome extension-origin IndexedDB creation; screenshot asset write, digest-based read-back, and cleanup; JSON probe record read-back; deterministic failed-transaction rollback; duplicate diagnostic protection; existing capture regression checks; Console checks; and extension-error checks. The diagnostic confirmed that no real user capture was saved.

#### Milestone 3D.2 - Complete CaptureRecord v1 Assembly

Status: Completed

Objective: Assemble the accepted structured extraction and persisted screenshot reference into one complete `CaptureRecord v1` matching `docs/CAPTURE_SCHEMA.md`.

Included scope:

- `schemaVersion: 1`.
- Unique id.
- ISO `createdAt`.
- Existing source, environment, element, dom, styles, and summaries.
- Persisted `assets.screenshot` reference.
- Default library metadata with `tags` initialized to an empty array.
- `generatedVersions` initialized to an empty array.
- JSON compatibility assertion.
- Validation that no screenshot data URL, DOM runtime object, storage implementation object, or unsafe raw page object enters `CaptureRecord`.

Acceptance criteria:

- One complete `CaptureRecord v1` is produced.
- Required fields are present.
- Optional fields remain optional.
- Screenshot reference points to a readable persisted asset.
- Record survives serialization and read-back.
- Privacy safeguards remain intact.
- No Library management UI or AI generation is added.

Acceptance status: Completed. Milestone 3D.2 passed production build and classic content-script validation; complete `CaptureRecord v1` assembly; general schema and new-candidate invariant validation; JSON compatibility and serialization round-trip validation; screenshot dataUrl and runtime-object exclusion; atomic screenshot-asset and record persistence; screenshot-reference, IndexedDB read-back, SHA-256 digest, repeat-verification, duplicate-activation, candidate-lifecycle, cleanup, privacy-boundary, Console, and extension-error checks. The validation workflow confirmed that no real user capture was saved.

#### Milestone 3D.3 - Capture Preview and Explicit Save Integration

Status: Completed

Objective: Replace the temporary screenshot verification result with a useful Capture Preview and explicit local Save workflow.

Included scope:

- Preview of screenshot, source, selected-element identity, dimensions, semantic role, summaries, and limited sanitized structure information.
- Explicit Save control.
- Saving, saved, failed, and retry states.
- Prevention of duplicate Save submissions.
- Ability to start another capture after save or cancellation.
- Read-back validation after closing and reopening the Side Panel.
- Clear local persistence errors.

Acceptance criteria:

- Preview accurately represents the completed capture.
- Save produces exactly one persisted `CaptureRecord` and one referenced screenshot asset.
- Duplicate Save does not create duplicate records.
- Reopening the Side Panel can read back the saved capture.
- Failure states do not falsely report success.
- Existing `CaptureRecord` privacy boundaries remain intact.
- No list, search, filter, edit, delete, or Capture Library management UI is introduced.
- Real Chrome runtime and Console validation are required.

Acceptance status: Completed. Milestone 3D.3 passed unsaved Capture Preview validation; safe source, element, summary, and limited sanitized-structure display; explicit Save and synchronous duplicate-submission protection; exact one-record and one-asset persistence; savedAt storage-wrapper separation; persisted record, screenshot-reference, decoded-image, and digest read-back; post-commit cleanup behavior; deterministic conflicting-record failure and Retry Save; latest-saved lookup; Side Panel close/reopen restoration; multiple-save retention; continued capture, Cancel, and Escape regression; privacy, Console, permission, object-URL, and extension-error checks.

## Milestone 4 - Personal Capture Library

Status: Completed

Objective: Let users manage saved local `CaptureRecord` entries as reusable inspiration assets rather than screenshot history.

Included scope:

- Capture list.
- Reopen capture.
- Edit title.
- Edit component type.
- Edit tags.
- Edit notes.
- Delete capture.
- Search.
- Filter.
- Local-first storage behavior.

Explicitly excluded scope:

- AI generation.
- Generated component version management.
- Cloud sync.
- Team collaboration.
- Authentication.
- Payment.

Acceptance criteria:

- Users can list local CaptureRecords.
- Users can reopen a saved capture.
- Users can edit user-managed library metadata.
- Users can delete captures.
- Users can search and filter captures by useful metadata such as title, tags, component type, source URL, and summaries.
- Library behavior remains local-first.

Acceptance status: Completed. Milestone 4 passed the completed and independently accepted Milestones 4A through 4E: validated local-library read models and newest-first persisted Blob-backed capture listing; saved-detail reread, navigation, failure recovery, and object-URL lifecycle; verified editing of only user-managed title, component type, tags, and notes while preserving savedAt, all non-library CaptureRecord fields, screenshot references, asset metadata, and Blob digests; exact atomic two-store deletion with pre-delete concurrency validation, safe transaction aborts, post-delete absence verification, deterministic restoration, Library synchronization, and final-item handling; and privacy-safe in-memory search and filtering with explicit field whitelists, sanitized source locations, component-type and tag options, active session state, clear and no-results feedback, metadata and deletion recomputation, and no persistence or network activity. The final production build, classic content-script validation, sixty-two-test Playwright extension-runtime suite, complete list/detail/edit/delete/search/filter/close-reopen regression, and previously accepted real-Chrome extension-action activeTab Capture, Confirm, Preview, Save, and same-session Library-refresh smoke all passed without database, schema, permission, dependency, cloud, authentication, collaboration, payment, or AI-generation changes.

### Milestone 4A - Library Read Model and Capture List Foundation

Status: Completed

Objective: Establish a validated local-library repository/read model and show all explicitly saved `CaptureRecord` entries in a basic capture list.

Included scope:

- Read all explicitly saved record wrappers that contain valid `savedAt`.
- Ignore diagnostic or temporary entries without `savedAt`.
- Parse and validate each `CaptureRecord v1`.
- Load and verify each referenced persisted screenshot asset.
- Use deterministic newest-first ordering by `savedAt`, with a deterministic tie-breaker for equal timestamps.
- Add a reusable saved-capture list/read model instead of putting raw IndexedDB operations directly into UI components.
- Add a basic Side Panel Capture Library list.
- Show persisted Blob-backed thumbnails or previews.
- Create and revoke object URLs correctly.
- Use a safe fallback label when `library.title` is absent.
- Refresh the Library automatically after a newly completed Save.
- Restore the Library after closing and reopening the Side Panel.
- Show clear loading, empty, and safe failure states.
- Retain the existing Capture, Confirm, Preview, and Save workflow.

Explicitly excluded scope:

- Opening a selected list entry in a dedicated detail view.
- Editing metadata.
- Deleting captures.
- Search or filter controls.
- AI generation.
- Cloud sync.
- Authentication.
- Collaboration.
- Payment.
- IndexedDB version changes, new stores, or indexes.
- New permissions or dependencies.

Acceptance criteria:

- All valid explicitly saved captures are listed.
- Multiple saved captures remain available and are ordered newest first.
- Entries without `savedAt` are not shown as user captures.
- Each displayed screenshot comes from the persisted Blob, not an inline `CaptureRecord` data URL.
- Object URLs are revoked on item removal, replacement, and component unmount.
- A newly saved capture appears without requiring the Side Panel to close and reopen.
- Closing and reopening the Side Panel restores the full list.
- Invalid persistence data produces a safe error rather than exposing raw payloads or falsely reporting success.
- Database version 1 and the existing two stores remain unchanged.
- Existing capture and save behavior passes regression.
- Production build and real Chrome runtime validation are required before Milestone 4A can later be marked Completed.

Acceptance status: Completed. Milestone 4A passed production build and classic content-script validation; reusable all-saved-capture read-model validation; complete explicitly saved capture listing; persisted Blob-backed thumbnail rendering; same-session Library refresh after Save; newest-first ordering with deterministic record-id tie-breaking; Side Panel close/reopen restoration; database-version-1 and existing-two-store checks; no-savedAt diagnostic exclusion; safe malformed-savedAt, wrapper-id-mismatch, and missing-asset failure and Retry recovery; title, component-type, tag fallback, bounded-text, and source-sanitization checks; persisted-Blob object-URL creation and replacement cleanup with no missing revoke events; existing Cancel, Escape, Parent, Child, Confirm, Capture Preview, Save, duplicate-save-prevention, and repeated-capture regression; non-interactive list-only scope with no detail, edit, delete, search, filter, source-navigation, or AI controls; final Side Panel, service-worker, and extension-error checks; diagnostic cleanup; and a final normal runtime state of seven capture records and seven screenshot assets. User-facing errors did not expose raw payloads, internal identifiers, screenshot storage keys, or secret source values.

### Milestone 4B - Saved Capture Detail and Reopen Navigation

Status: Completed

Objective: Allow a user to select any saved list item and reopen it as a persisted capture detail view.

Included scope:

- Select a saved capture from the Library list.
- Display a full detail view from the persisted `CaptureRecord` and persisted screenshot Blob.
- Reuse or cleanly extend the existing Capture Preview presentation.
- Navigate back to the Library list.
- Manage the object URL lifecycle correctly when switching captures or leaving the detail view.
- Show clear not-found, invalid-record, and missing-asset states.
- Preserve access to the existing Start Capture and Save workflow.

Explicitly excluded scope:

- Re-running extraction against the source webpage.
- Automatically reopening or navigating the source URL.
- Editing metadata.
- Deleting captures.
- Search or filtering.
- AI generation.
- Database migration or new permissions.

Acceptance criteria:

- Any valid saved capture can be opened from the list.
- The detail view uses persisted data rather than current webpage runtime state.
- Returning to the Library does not delete or mutate the capture.
- Switching between captures does not leak object URLs.
- Side Panel close/reopen still permits reopening any saved capture from the restored list.
- Existing capture and save behavior passes regression.
- Production build and real Chrome runtime validation are required before Milestone 4B can later be marked Completed.

Acceptance status: Completed. Milestone 4B passed production build and classic content-script validation; persisted single-capture reread and full record, wrapper, screenshot-reference, Blob, and decoded-dimension validation; native mouse, Enter, and Space Library-item interaction; persisted saved-detail rendering; safe Back, not-found, wrapper-id-mismatch, missing-asset, and Retry behavior; stale asynchronous detail-load protection; no-mutation and persistence-integrity checks; persisted-Blob object-URL creation and revoke validation across Library, Detail, Back, Side Panel reopen, and switching captures; complete Library restoration; scope checks excluding edit, delete, search, filter, source navigation, and AI controls; Playwright isolated-extension E2E validation with eleven passing tests and no failures or skips; real-Chrome Side Panel detail-navigation validation; and a minimal real extension-action activeTab smoke confirming Start Capture, Confirm, Save, Saved locally, same-session Library refresh after Back, retention of earlier captures, and no extension Errors. The Playwright direct extension-page environment did not reproduce the real action-click activeTab grant, so the final activeTab integration smoke was completed manually without adding production permissions or test bypasses.

### Milestone 4C - User-Managed Library Metadata Editing

Status: Completed

Objective: Let users edit only the user-managed `CaptureRecord v1` library metadata.

Included scope:

- Edit `library.title`.
- Edit `library.componentType`.
- Edit `library.tags`.
- Edit `library.notes`.
- Validate and normalize user-entered metadata.
- Persist the updated `CaptureRecord` wrapper.
- Preserve the wrapper `id` and original `savedAt`.
- Revalidate the complete `CaptureRecord v1` before commit.
- Perform read-back verification before reporting success.
- Update list and detail UI after a successful edit.
- Show safe saving, success, failure, and retry states.

Explicitly excluded scope:

- Editing `source`.
- Editing `environment`.
- Editing `element`.
- Editing `dom`.
- Editing `styles`.
- Editing `summaries`, including heuristic `summaries.componentType`.
- Editing `assets`.
- Editing `generatedVersions`.
- Replacing or rewriting the screenshot asset.
- Adding `modifiedAt` or changing `CaptureRecord v1`.
- AI generation or cloud features.

Acceptance criteria:

- Only the four `library.*` fields can change.
- All non-library `CaptureRecord` fields remain unchanged.
- The referenced screenshot asset remains unchanged.
- The original `savedAt` remains unchanged.
- The updated record continues to pass the `CaptureRecord v1` validator.
- Failed validation or persistence does not falsely report success.
- Successful edits persist across Side Panel close/reopen.
- List and detail views reflect successful edits.
- Production build and real Chrome runtime validation are required before Milestone 4C can later be marked Completed.

Acceptance status: Completed. Milestone 4C passed production build and classic content-script validation; isolated Playwright extension-runtime validation with twenty-five passing tests and no failures or skips; reusable title, component-type, tag, and notes normalization and field-specific validation; accessible prepopulated edit, Save, Cancel, failure, and Retry states; verified replacement of only the four user-managed library metadata fields; complete CaptureRecord v1 validation and serialization; missing-record and savedAt-conflict protection; synchronous duplicate-submission and stale-detail protection; verified read-back before success; exact preservation of wrapper id, original savedAt, every non-library CaptureRecord field, screenshot reference, screenshot asset metadata, asset count, and Blob digest; deterministic rollback handling after committed verification failure; immediate Detail and Library synchronization without item-count or ordering changes; successful persistence across Side Panel close/reopen; and scope checks excluding source, extraction, summaries, screenshot, generatedVersions, modifiedAt, delete, search, filter, navigation, AI, cloud, database, permission, and dependency changes. Automated testing fully covered the approved Milestone 4C scope, so no user manual testing was required.

### Milestone 4D - Atomic Capture Deletion

Status: Completed

Objective: Delete one saved capture and its referenced screenshot asset atomically without leaving orphaned local data.

Included scope:

- Provide a deliberate user delete action from an opened saved capture.
- Require a clear confirmation step.
- Read and validate the target before deletion.
- Delete the record and referenced screenshot asset in one IndexedDB transaction.
- Perform post-delete read-back verification that both keys are absent.
- Remove the deleted item from list and detail state.
- Clean up object URLs correctly.
- Show safe deleting, success, and failure states.
- Retain all unrelated captures.

Explicitly excluded scope:

- Bulk deletion.
- Delete-all.
- Automatic deletion based on age or storage limits.
- Cloud deletion.
- Undo history or Trash unless separately approved.
- Database migration, new indexes, permissions, or dependencies.

Acceptance criteria:

- Confirmed deletion removes exactly the selected record and referenced asset.
- No orphan record or screenshot asset remains after successful deletion.
- Other captures remain intact.
- Cancelling confirmation performs no write.
- Failed deletion does not falsely report success.
- The deleted capture disappears from the list immediately.
- Deleting the currently opened detail returns the UI safely to the Library.
- Deletion remains correct after Side Panel close/reopen.
- Production build and real Chrome runtime validation are required before Milestone 4D can later be marked Completed.

Acceptance status: Completed. Milestone 4D passed production build and classic content-script validation; isolated Playwright extension-runtime validation with forty-one passing tests and no failures or skips; a deliberate accessible saved-detail deletion flow with confirmation, Cancel, deleting, safe failure, Retry, and success states; exact pre-delete reread and validation of the saved wrapper, CaptureRecord v1, savedAt, screenshot reference, screenshot asset, Blob, and decoded dimensions; exact same-savedAt wrapper-value concurrency protection between repository validation and deletion; one atomic two-store IndexedDB transaction that verifies both current objects before deleting the selected CaptureRecord wrapper and referenced screenshot asset; safe abort behavior for missing records, missing assets, savedAt conflicts, record mutations, reference mismatches, and asset conflicts without partial deletion; verified post-delete absence before success; exact atomic restoration and read-back verification after forced post-commit verification failure; preservation of all unrelated wrappers, savedAt values, screenshot metadata, Blob digests, item ordering, and database structure; immediate Library synchronization, final-item empty-state handling, Side Panel close/reopen persistence, stale-detail and duplicate-submission protection, and object-URL preservation on Cancel or failure and revocation after success; and scope checks excluding bulk deletion, delete-all, Trash, Undo, soft deletion, deletedAt, modifiedAt, search, filter, source navigation, AI, cloud, database migrations, permissions, and dependencies. Automated testing fully covered the approved Milestone 4D scope, so no user manual testing was required.

### Milestone 4E - Search, Filtering, and Milestone 4 Regression

Status: Completed

Objective: Add privacy-safe in-memory search and filtering, then complete final Milestone 4 regression and runtime acceptance.

Included scope:

- Case-insensitive text search over safe persisted metadata.
- Search fields include `library.title`, `library.tags`, `library.componentType`, `source.url`, `source.pageTitle`, and safe semantic and design summaries.
- Filter by user-visible component type.
- Filter by tag.
- Show clear active-filter state.
- Show a clear no-results state distinct from an empty Library.
- Run search and filters over the already loaded local read model.
- Avoid network requests.
- Complete final Milestone 4 regression across list, reopen, edit, delete, save refresh, close/reopen restoration, and multiple captures.
- Check Console, extension errors, permissions, object URLs, privacy, and classic content-script build regression.
- Keep search and filtering over stored privacy-safe `CaptureRecord` fields.
- Keep simple Library search and filtering in memory; this stage does not justify an IndexedDB version upgrade or indexes.

Search and filtering must not expose or search:

- Raw DOM objects.
- Raw IndexedDB wrappers.
- Screenshot Blob contents.
- Inline image data.
- Form values.
- Password values.
- Raw hidden content.
- Arbitrary sensitive attributes.
- Unsanitized payloads.

Explicitly excluded scope:

- Full-text database indexing.
- IndexedDB schema upgrades or indexes.
- Fuzzy search libraries.
- Embeddings or semantic vector search.
- AI generation.
- Cloud sync.
- Authentication.
- Team collaboration.
- Payment.

Acceptance criteria:

- Search returns matching captures across the approved safe fields.
- Component-type and tag filters work independently and together.
- Search and filtering are deterministic and case-insensitive.
- Clearing controls restores the complete Library.
- No-results and empty-Library states are distinct.
- Search/filter actions do not mutate persisted records.
- No database version change, index, permission, or dependency is introduced.
- All Milestone 4 functions pass real Chrome runtime validation.
- Existing Milestone 3 Capture, Confirm, screenshot, Preview, Save, failure/retry, privacy, and classic content-script behavior remains intact.
- Milestone 4 must not be marked Completed until Milestones 4A through 4E have each been implemented, independently reviewed, runtime validated, and marked Completed through later documentation-only commits.

Acceptance status: Completed. Milestone 4E passed production build and classic content-script validation; isolated Playwright extension-runtime validation with sixty-two passing tests and no failures or skips; privacy-safe case-insensitive in-memory search over the explicitly approved title, tag, component-type, sanitized source-location, page-title, typography, color, layout, and spacing-summary fields; explicit exclusion of library notes, element data, DOM data, styles, screenshot references and Blob contents, generated versions, raw wrappers, hidden content, form or password values, and unsanitized payloads; HTTP/HTTPS source normalization excluding credentials, query strings, fragments, malformed URLs, and source navigation; deterministic library-first component-type fallback, tag derivation, case-insensitive exact filtering, option deduplication, sorting, and combined AND semantics; App-owned session-only query state across Detail, Back, verified metadata edits, deletion, and Library refresh with reset after Side Panel reopen; no IndexedDB rereads or writes, network requests, content-script messages, navigation, analytics, permissions, dependencies, schema changes, or persisted query state during search and filtering; accessible native search and filter controls, live-search helper text, a prominent aria-live result-feedback region, bounded visible query text, active-filter summaries, and a distinct No matching captures panel; correct empty-Library distinction, clearing, ordering, metadata synchronization, deletion synchronization, selected-option preservation, large deterministic multi-capture results, and filtered object-URL cleanup; complete Milestone 4 integrated regression across list, persisted Detail, edit, Back, atomic delete, close/reopen restoration, counts, and Blob-backed previews; and the previously accepted real-Chrome extension-action activeTab smoke on an ordinary supported webpage confirming Capture, Confirm, Preview, Save, same-session filtered Library refresh, Clear recovery, newly saved capture visibility, and retention of earlier captures. Automated testing covered all deterministic Milestone 4E behavior, and no additional user manual testing was required after the accepted activeTab smoke.

## Milestone 5 - AI React + Tailwind Reconstruction

Status: Completed

Objective: Generate readable, reusable React + Tailwind component versions from a screenshot reference plus structured `CaptureRecord` input.

Included scope:

- Prepare screenshot plus structured `CaptureRecord` input for generation.
- Warn before transmitting capture data to an external AI API.
- Generate React + Tailwind output.
- Produce a component name.
- Produce a component summary.
- Produce approximation notes.
- Save generated component versions separately from the original capture.
- Preserve the relationship between generated versions and the source CaptureRecord.

Explicitly excluded scope:

- Blind copying of messy website code or internal class names.
- Pixel-perfect cloning as a requirement.
- Multiple framework generation.
- Website publishing.
- Cloud sync.
- Team collaboration.

Acceptance criteria:

- Users can generate a React + Tailwind component from screenshot plus structured `CaptureRecord` input.
- Generated output includes component code, name, summary, and approximation notes.
- Generated versions are saved separately from the original CaptureRecord.
- The original capture data is not mutated by generation.
- Users receive an appropriate warning before any external AI transmission.

Acceptance status: Completed. Milestone 5 is accepted as the completed and independently accepted Milestones 5A through 5D: provider-neutral architecture and privacy boundary; exact outbound CaptureRecord projection with visible Review data and explicit consent before transmission; local backend/proxy topology with backend-only provider secrets; OpenAI Responses API adapter with normalized React + Tailwind response output and safe backend/extension error contracts; separate generated-version persistence in IndexedDB database version 2 with exactly three stores, `captureRecords`, `screenshotAssets`, and `generatedComponentVersions`, plus one non-unique `generatedComponentVersions.sourceCaptureId` index; complete source linkage, full `CaptureRecord v1` validation, original CaptureRecord and screenshot immutability, persistence read-back before success, stable IDs, idempotent Retry saving, and abortable transport and persistence; deterministic newest-first generated-version listing in Saved Capture Detail; orphan detection and cleanup; source-deletion cascade; inert plain-text generated code display with no execution or rendered preview; and automated backend, loopback, and extension-runtime regression. Automated acceptance made zero real OpenAI requests; the provider adapter and local loopback path were validated deterministically without committing or exposing a real API secret.

## Milestone 6 - Isolated Preview and Version Management

Status: Completed

Objective: Let users preview, revise, regenerate, compare, and manage generated component versions in isolation.

Substage status:

- Milestone 6A - Architecture and threat model: Completed.
- Milestone 6B - Sandbox runtime foundation with trusted packaged fixtures: Completed.
- Milestone 6C - Safe generated-component preview for Previewable Subset V1: Completed.
- Milestone 6D - Regeneration and natural-language revision: Completed.
- Milestone 6E - Version comparison and final Milestone 6 regression: Completed.

Included scope:

- Isolated component preview.
- Natural-language revision.
- Regeneration.
- Multiple generated versions per capture.
- Version comparison.
- Relationship between each version and its source CaptureRecord.

Explicitly excluded scope:

- Full website publishing.
- Enterprise collaboration workflow.
- Multiple framework generation unless explicitly added in a later roadmap update.
- Cloud sync.

Acceptance criteria:

- Users can preview generated components in isolation.
- Users can request natural-language revisions.
- Users can regenerate component versions.
- Users can keep multiple generated versions for a single capture.
- Users can compare versions.
- Version metadata remains linked to the original CaptureRecord.

Acceptance status: Completed for Milestone 6 overall. Milestone 6A is completed as the architecture and threat model review. Milestone 6B is completed as the accepted sandbox runtime foundation. Milestone 6C is completed as the accepted safe generated-component preview baseline at remote commit `8af49fd68fcdb6169eb9517a8aacadc5e36fe477` (`test: close safe preview security regressions`), retaining implementation commits `1704b7c7d83fd288dd56bc0f2f4861ee359911c9` (`feat: implement safe generated component preview`) and `291d5b381210cd9a93906724c9e7785e377e7d66` (`fix: complete safe preview lifecycle and styling`). The accepted 6C result exposes an explicit Preview action for persisted generated versions, keeps unsupported source visible and copyable, sends generated source only to the packaged sandbox host, parses JSX with `@babel/parser@7.29.7` into a bounded AST, rejects executable or unsupported constructs through Previewable Subset V1, produces a data-only `PreviewRenderPlanV1`, and has the trusted Side Panel independently validate `WindowProxy`, direction, identity, lifecycle, source hash, component name, and plan hash. The render realm receives no generated source, independently validates the data plan, and renders through trusted React. Approved class tokens use source-controlled bounded utility CSS. Timeout, failure, close, and replacement dispose sibling frames, and stale async continuations cannot reverse terminal state. Storage, `CaptureRecord`, generated-version schema, backend, and generation contracts remain unchanged. Acceptance reported focused preview-suite run 1 with 38 passing tests, focused preview-suite run 2 with 38 passing tests, backend tests with 6 passing tests, full Playwright regression with 146 passing tests and 1 documented loopback skip, `npm audit --omit=dev` with 0 vulnerabilities, no external preview request, no real OpenAI request, and strict sandbox CSP retained. These results record the accepted baseline and are not a general security proof.

Milestone 6D is Completed for regeneration and natural-language revision. Accepted remote baseline: `661970e210e0a44d456b4ff7f72cb28fdd283307` (`fix: close milestone 6d regression gaps`). The accepted implementation lets a user select an existing persisted V1 or V2 generated version; choose bounded natural-language Revision or instruction-free Regeneration; reread the current `CaptureRecord` and selected source before freezing Review; display the exact approved outbound user-derived request data; require explicit consent before transport; keep optional screenshot transmission off by default; send through `POST /v1/revise-component`; bind the idempotency header to the frozen `logicalAttemptId`; reuse the provider-neutral backend boundary; require accepted responses to preserve the source `componentName`; and persist successful results as new immutable V2 generated-version entries. Existing `CaptureRecord`, screenshot asset, V1 versions, V2 source versions, and earlier versions remain immutable. V2 lineage records the exact selected source version, deterministic target IDs support idempotent persistence and recovery, Retry saving does not call the provider again, transport Retry reuses the same frozen Review identity, conflicting recovery targets fail safely without overwrite, cancellation and stale continuations cannot expose stale success, and commit-after-cancel results may remain stored and become discoverable through a later explicit refresh. V1 and V2 versions are read through the union reader, missing ancestors display safely, revised or regenerated source remains inert until the user separately chooses Preview, Preview continues through the accepted Milestone 6C sandbox boundary, and no automatic Preview or automatic generated-source execution was introduced.

Accepted local validation reported for the accepted 6D implementation: `npm run build` passed; combined Milestone 6D focused suites reported 54 passed; Slice 6 closeout suite reported 4 passed and 4 passed again on the focused stability rerun; Milestone 5 persistence regression reported 24 passed; initial-generation focused regression reported 19 passed and 1 documented existing skip; Milestone 6C Preview regression reported 38 passed; backend tests reported 13 passed; full Playwright regression reported 200 passed and 1 documented existing skip; `npm audit --omit=dev` reported 0 vulnerabilities. Automated acceptance made no real OpenAI request, no real provider request, and no unapproved remote origin contact. The accepted implementation made no database version, store, index, `CaptureRecord` schema, Manifest, CSP, or Preview protocol change. These were reported local results associated with the accepted implementation, not GitHub Actions results.

Residual risks: the local backend/proxy remains a development/demo topology, not a production multi-user hosted service; server-side provider-call deduplication remains outside the local deterministic persistence guarantee, so ambiguous transport may still have provider billing risk; Generated Preview supports only the accepted bounded Previewable Subset V1; valid but unsupported generated source remains source-only; local storage can still be deleted or altered outside ordinary application behavior; and automated acceptance is not a general security proof.

Milestone 6E is Completed for local generated-version comparison and final Milestone 6 regression closure. Accepted implementation history: `778aa54abb0145256b718d19617916391e55a7fb` recorded the comparison architecture; `dead6397574af2458fbd7b9d5adaed7c97a3d834` delivered the initial comparison implementation; `642ff37ae6c0fc8dc95cece2d758096d979c69ee` closed Slice 2 review fixes; `db96241f96e769d1442763107444a854b5f01d22` provided the integrated hardening baseline; `86005b85f8d298f2bcce19522461d810642ab555` closed stale-state, coexistence, and immutability hardening; and `7b9bffaebc3e33bb745e3547af33c1a1243a98ca` closed pending refresh ownership.

The accepted Milestone 6E result adds local, deterministic, read-only, ephemeral comparison for exactly two distinct persisted generated versions with the same `sourceCaptureId`. Users explicitly select Baseline and Candidate, can Swap them, and can compare V1 and V2 versions. The comparison retains full original generated code, uses a bounded internal LCS source diff without adding dependencies, and stores no comparison state. It does not automatically Preview, execute generated code, call backend/provider/OpenAI/source pages/content scripts/service workers/remote origins, compare screenshot pixels or rendered output, score, pick winners, merge, edit, compare across captures, or compare three or more versions.

Accepted 6E hardening confirmed that stale and out-of-order refreshes cannot overwrite newer accepted state; a pending Capture A refresh cannot update Capture B; pending refresh completion cannot reopen Detail or Comparison after returning to Library; Revision and Regeneration can save while Comparison remains active; the original Baseline and Candidate IDs remain selected; newly persisted exact version IDs appear in available options; Preview remains explicitly triggered and independent; existing `CaptureRecord`, screenshot asset, and pre-existing V1/V2 entries remain immutable; Revision and Regeneration append new immutable versions only; and privacy, no-network, no-runtime-message, no-automatic-iframe, and schema boundaries remain intact.

Accepted local validation reported for the Milestone 6E closure: `npm run build` passed; focused Milestone 6E suite reported 25 passed; focused stability rerun reported 25 passed; backend tests reported 13 passed; full E2E reported 225 passed and 1 skipped; `npm audit --omit=dev` reported 0 vulnerabilities. The documented skip was: `Milestone 5C loopback E2E requires an extension build with the loopback endpoint.` These were local reported validation results associated with the accepted implementation, not GitHub Actions results. Final hardening made no production security relaxation and no database, Manifest, CSP, Preview protocol, or generated-version contract change.

Milestone 6 explicitly excludes export, GitHub integration, Figma integration, cloud sync, collaboration, authentication, payment, multiple framework generation, production hosted backend operations, arbitrary conversational coding-agent behavior, automatic execution of generated or revised source, storage migration, screenshot-pixel comparison, rendered-output comparison, scoring, winner selection, merge, edit, cross-capture comparison, three-way comparison, and multi-version comparison. The first narrow local generated-source export path was completed in Milestone 7A.

Milestone 6E architecture: `docs/MILESTONE_6E_COMPARISON_ARCHITECTURE.md`.

## Milestone 7 - Export and Future Expansion

Status: Completed

Objective: Define and implement export and expansion paths without turning the MVP into a full publishing, enterprise, or multi-framework platform.

Substage status:

- Milestone 7A - Local generated source export: Completed.
- Milestone 7B - Deterministic GitHub export workflow: Completed after final local validation and acceptance.
- Figma integration: Planned or explicitly out of scope until separately scoped.
- Cloud sync: Planned or explicitly out of scope until separately scoped.
- Collaboration: Planned or explicitly out of scope until separately scoped.
- Additional framework targets: Planned or explicitly out of scope until separately scoped.

Included scope:

- Narrow local generated source export.
- Narrow deterministic fake/development single-file GitHub export workflow.
- Future export and expansion hooks only after explicit scoping.

Explicitly excluded scope:

- Any expansion that undermines the focused Capture -> Save -> Organize -> Rebuild -> Preview -> Reuse workflow.
- Full-site cloning as a product direction.
- Website publishing as a primary product direction.
- Enterprise suite requirements as MVP requirements.
- Real GitHub integration, Figma, cloud sync, collaboration, publishing, additional frameworks, archive export, package scaffolding, ZIP/package export, and multi-file export are not part of completed Milestone 7 beyond accepted 7A and 7B scope.

Acceptance criteria:

- Export paths are defined and implemented in a way that preserves the local-first capture workflow.
- Future integrations do not replace the core CaptureRecord-centered architecture.
- Any added sync, collaboration, framework, GitHub, or Figma capability is explicitly scoped before implementation.
- The product remains focused on reusable UI inspiration capture rather than full-site cloning or publishing.

Acceptance status: Completed. Parent Milestone 7 is accepted based only on completed Milestone 7A local exact-source export and completed Milestone 7B deterministic fake/development single-file GitHub export workflow. Real GitHub authorization, OAuth exchange, token storage, real GitHub REST transport, production GitHub writes, production deployment, ZIP/package export, multi-file export, publishing, Figma, cloud sync, collaboration, and additional frameworks remain unimplemented and future separately scoped work.

### Milestone 7A - Local Generated Source Export

Status: Completed

Objective: Define and implement one narrow local generated-source export path from Saved Capture Detail without changing the database, Manifest permissions, CSP, Preview protocol, generated-version contracts, package dependencies, backend, GitHub workflows, or production security boundaries.

Accepted implementation history:

- `b4cc9384edef40c4829d62b3d2e635c1b1c185b3` recorded the Milestone 7A architecture and started Milestone 7.
- `f0f37cc8655edd4747315d6ef190f1ecba8f2bd3` delivered local exact-source export implementation and focused tests.
- `ec89ccb46a2621d8fc0509ac493a85ca65743481` delivered real Chromium download validation, lifecycle/security hardening, and final regression.

Included scope:

- Export exactly one explicitly selected persisted generated version.
- Support validated V1 entries and validated V2 Revision/Regeneration entries.
- Operate from an expanded generated-version row in Saved Capture Detail.
- Reread the selected version from IndexedDB at export time and require it to still exist, remain valid, retain the expected ID, retain the expected `sourceCaptureId`, and exactly equal the displayed immutable entry.
- Export the exact persisted `entry.value.code` as one UTF-8 `.tsx` file without CRLF normalization, trimming, formatting, injected comments, metadata headers, transpilation, parsing, transformation, or automatic final newline.
- Derive one deterministic safe `.tsx` filename from the validated persisted `componentName`; fail closed for unexpectedly unsafe names; leave duplicate filename handling to the browser.
- Use one explicit user-initiated trusted Side Panel download with a Blob, temporary object URL, and temporary anchor.
- Revoke object URLs deterministically after initiation and on cleanup.
- Prove the download mechanism in real Chromium with Playwright download events, expected suggested filename, and exact downloaded-byte inspection.

Accepted result:

- Saved Capture Detail exposes a row-specific `Export .tsx` action for expanded generated-version rows.
- The exported file contains only the exact persisted `entry.value.code` encoded as UTF-8.
- The suggested filename is deterministic and derives only from the validated persisted `componentName`.
- Export rereads the authoritative IndexedDB generated-version entry at activation time and requires exact displayed-entry equality plus `sourceCaptureId` ownership.
- Missing, altered, invalid, unsafe, or wrong-capture rereads fail closed and do not download.
- Same-row rapid activation produces at most one real download; repeated successful exports stay explicit and use the same suggested filename while duplicate-name handling remains browser-owned.
- Object URLs are revoked on success, replacement, failure, unmount, and capture switch; stale older attempts cannot affect newer attempts or unrelated object URLs.
- Export remains independent from Preview, Comparison, Revision, Regeneration, backend/provider/OpenAI calls, source pages, runtime/tab messages, and IndexedDB writes.

Explicitly excluded scope:

- New `downloads` permission, optional permission, Manifest change, host-permission change, File System Access API, native messaging, arbitrary filesystem access, or automatic clipboard write.
- Backend, provider, OpenAI, source-page, content-script, service-worker, analytics, GitHub, Figma, or remote-origin requests.
- Generated-code execution, automatic Preview, Preview iframe creation, IndexedDB writes, `CaptureRecord` mutation, screenshot mutation, generated-version mutation, export UI persistence, metadata sidecars, screenshots, ZIP archives, npm packages, README generation, Tailwind config generation, package file generation, CSS bundle generation, multi-file export, GitHub export, Figma export, cloud sync, collaboration, publishing, and additional frameworks.

Acceptance criteria:

- Completed. V1 CRLF, V2 Revision Unicode, V2 Regeneration JSX/Tailwind, no-final-newline, exactly-one-final-newline, Preview-rejected but contract-valid source, and maximum-valid persisted component-name cases passed real Chromium suggested-filename and downloaded-byte validation.
- Completed. Empty generated code remains rejected by the existing generation contract and was not enabled.
- Completed. Deterministic filename behavior and unsafe-name fail-closed behavior passed.
- Completed. Active Comparison, Preview, Revision, and Regeneration state remain independently controlled.
- Completed. Missing, replaced, externally altered, invalid, unsafe, or wrong-`sourceCaptureId` selected versions fail without a download.
- Completed. Repeated export, rapid double activation, Detail unmount during preparation, and capture switch during preparation are deterministic.
- Completed. Object URL cleanup is verified.
- Completed. Zero IndexedDB writes, zero HTTP/HTTPS requests, zero runtime or tab messages, zero automatic iframe creation, zero clipboard writes, and zero File System Access API calls are verified.
- Completed. `CaptureRecord`, screenshot assets, generated-version ordering, and every pre-existing V1/V2 entry remain unchanged.
- Completed. Default E2E remains headless.

Accepted local validation reported for the Milestone 7A closeout: Slice 2 contract tests `3 passed`; Slice 2 Side Panel tests `6 passed`; Slice 3 hardening tests `11 passed`; combined Milestone 7A focused suite run 1 `20 passed`; combined Milestone 7A focused suite run 2 `20 passed`; relevant generated-version/Comparison/Preview/Revision regressions `93 passed`; backend tests `13 passed`; full Playwright E2E `245 passed, 1 skipped`; `npm run build` passed; and `npm audit --omit=dev` reported `0 vulnerabilities`. The existing skip was `generation-5c-loopback.spec.ts › browser generation flow sends one loopback request and preserves persistence`, with reason `Milestone 5C loopback E2E requires an extension build with the loopback endpoint.` These are local reported results associated with the accepted implementation, not GitHub Actions results or a general security proof.

Architecture: `docs/MILESTONE_7A_LOCAL_EXPORT_ARCHITECTURE.md`.

### Milestone 7B - GitHub Export Architecture

Status: Completed after final local validation and acceptance

Objective: Define and implement a narrow, secure deterministic fake/development GitHub handoff for one explicitly selected persisted generated version without implementing real GitHub authorization, OAuth exchange, token storage, real GitHub REST transport, or production GitHub writes.

Accepted implementation history:

- `1327ca4f1aea85f6cf286998f7d4324c83c45b6b` completed Slice 1 architecture and feasibility.
- `16c37e69a0db239bbe1e26247677bfa6543a6bb0` completed Slice 2 contracts and local preparation.
- `78f58d37e0d9ca5538422229d7c23e55fd09c4f3` completed Slice 3 Review workflow and deterministic fake gateway path.
- Slice 4 completes final hardening, keyboard/accessibility coverage, status consistency, integrated regression definition, and documentation closeout after the user runs and accepts final local validation.

Slice status:

- Slice 1 - Architecture and feasibility: Completed.
- Slice 2 - Contracts and local preparation: Completed.
- Slice 3 - Review workflow and fake gateway path: Completed.
- Slice 4 - Final hardening and documentation closeout: Completed after final local validation and acceptance.

Included scope:

- `Export to GitHub` begins from one expanded generated-version row.
- Row expansion makes no GitHub request; workflow starts only from explicit `Export to GitHub`.
- The write target is exactly one `.tsx` file in one user-selected repository and existing branch.
- File contents must be exactly the persisted `entry.value.code`.
- The default filename reuses the accepted Milestone 7A deterministic safe filename contract.
- V1 and V2 generated-version entries are supported.
- Every remote write requires a frozen visible Review and explicit confirmation.
- Strict versioned contracts validate session, repository, branch, inspect, Review, write, success, target path, commit message, source byte count, and safe error shapes.
- The extension rereads the authoritative generated-version entry before Review and immediately before write, requires exact ID, exact `sourceCaptureId`, validation, and canonical displayed-entry equality, freezes exact UTF-8 source bytes, and sends no write after local stale.
- The isolated backend GitHub gateway has fixed session, repositories, branches, inspect, and write routes; normal runtime defaults to not-configured; deterministic fake transport is enabled only through explicit development/test injection.
- Repository and branch selection are explicit; only existing branches are selectable.
- Remote inspect freezes account, session, repository, branch, branch head SHA, path, operation, and remote file state; write verifies the same state again and fails closed on conflict.
- Create never silently becomes update, update never silently becomes create, duplicate confirmation creates at most one fake write, and one approved fake write changes exactly one file and one commit.
- Review and Success use named semantic sections and label/value fields, including distinct commit SHA and commit URL fields; keyboard/accessibility coverage verifies the complete fake workflow.

Explicitly excluded scope:

- Real GitHub App registration, real authorization, OAuth exchange, token storage, real GitHub REST transport, production GitHub writes, protected manual validation, production deployment, operational controls, real ambiguous-write reconciliation, repository creation, branch creation, pull requests, issues, branch protection management, Actions workflows, releases, deployments, GitHub Pages, ZIP/package export, general multi-file export, README generation, package generation, Tailwind configuration generation, CSS bundle generation, screenshot upload, `CaptureRecord` upload, cloud sync, background sync, continuous sync, collaboration, Figma integration, publishing, and additional frameworks.

Historical accepted Slice 3 validation reported: focused GitHub create/update test passed; focused invalid-path/conflict/navigation test passed; complete GitHub focused suite 8 passed; Milestone 7A regression 9 passed; Preview, Comparison, and Revision coexistence regression 59 passed; backend suite 15 passed; build passed; content-script validation passed; `npm audit --omit=dev` reported 0 vulnerabilities.

Accepted Slice 4 closeout added focused keyboard/accessibility regression coverage for keyboard row expansion, keyboard workflow start, semantic Review inspection, cancellation, reopening, keyboard confirmation, semantic Success inspection, Detail leave cleanup, zero iframe, and unchanged IndexedDB counts. Historical Slice 4 validation is treated as previously reported acceptance evidence only, not newly executed during this documentation-only parent closeout.

Remaining future GitHub production work is separate from completed Milestone 7B: GitHub App registration, real authorization UX, OAuth token exchange, secure backend token/session storage, real GitHub REST transport, protected manual validation against an authorized repository, production ambiguous-write reconciliation, deployment policy, monitoring, rate limiting, abuse controls, and operational security review.

Architecture: `docs/MILESTONE_7B_GITHUB_EXPORT_ARCHITECTURE.md`.

## Milestone 8 - Portable Component Bundle Export

Status: Completed

Objective: Define and implement one explicit local ZIP portable component source bundle export for one selected persisted generated version, building on the accepted Milestone 7A exact-source export boundary without creating an npm package, runnable application, publishing workflow, production-ready scaffold, or dependency-complete project.

Slice status:

- Slice 1 - Architecture and feasibility: Completed and accepted at `c06b3c10d7bfa2ee772126f137833c836aea0dd3`.
- Slice 2 - Pure portable bundle contracts and deterministic ZIP32 writer: Completed and accepted at `167d2a96f91261b0af4422541b3b9978e7563692`.
- Slice 3 - Side Panel row workflow: Completed and accepted at `a2aac799fa5e6ef9c493520973d8421afc80c430`.
- Slice 4 - Hardening and acceptance closeout: Completed and accepted at `e1d9237653aee1076bf8ebcdad63d0bca94b21a3`.
- Runtime Side Panel bundle export: Implemented.
- Real Chromium filesystem/download-artifact validation and final hardening: Completed and accepted.

Bundle V1 contents:

```text
README.md
element-catcher.json
src/<ComponentName>.tsx
```

Included scope:

- Define the Bundle V1 file list, internal paths, entry order, ZIP filename contract, canonical JSON contract, README fixed template, exact source byte rule, exact numeric limits, frozen deterministic ZIP32 profile, archive implementation strategy, privacy boundary, Side Panel lifecycle model, accessibility behavior, coexistence rules, test matrix, and implementation slices.
- Define the source rule that `src/<ComponentName>.tsx` bytes must exactly equal `new TextEncoder().encode(authoritativeEntry.value.code)`.
- Define `element-catcher.json` as strict canonical JSON containing only `formatVersion`, `framework: react`, `styling: tailwind`, `componentName`, and `entryPath`.
- Define a deterministic README template that states the component source was generated by Element Catcher, must be reviewed before use, excludes dependencies, `package.json`, Tailwind configuration, build configuration, and application scaffolding, and is not guaranteed to compile, render correctly, be secure, or be production-ready.
- Recommend a bounded internal uncompressed ZIP writer for the implementation slice.
- Freeze the ZIP32 Store-only wire profile with no implementation-defined ZIP fields: ZIP64, multi-disk archives, encryption, data descriptors, streaming output, extra fields, comments, directory entries, and trailing bytes after EOCD are forbidden.

Explicitly excluded scope:

- Runtime behavior in the architecture slice.
- Multiple components, multiple captures, project generation, npm package generation, runnable application scaffolding, `package.json`, Tailwind configuration, build configuration, lockfiles, dependency inference, generated-source parsing, generated-source compilation, generated-source execution, README generation from AI output, screenshot export, `CaptureRecord` export, metadata sidecars beyond the approved canonical JSON, backend/provider/OpenAI/GitHub requests, source-page/content-script/service-worker requests, IndexedDB writes, Preview iframe creation, File System Access API, `chrome.downloads` permission unless later technical proof shows the trusted Side Panel Blob/object-URL/anchor path is insufficient, real GitHub integration, publishing, deployment, Figma, cloud sync, collaboration, and additional frameworks.

Architecture decision:

- Prefer a bounded internal Store-only ZIP32 writer for Bundle V1 because the archive has exactly three deterministic entries, avoids compression nondeterminism, avoids a new dependency and supply-chain review, keeps bundle-size and CSP impact low, and is straightforward to validate with artifact-inspection tests.
- Do not approve a reviewed ZIP dependency for Bundle V1 unless later evidence proves the bounded internal writer insufficient.
- Reject server-side ZIP generation because bundle export must remain local-first and must not send generated source to backend/provider/OpenAI/GitHub.

Historical acceptance criteria for the architecture slice:

- Completed only when documentation defines the Bundle V1 contract, exact source rule, JSON and README boundaries, exact numeric limits, frozen deterministic ZIP32 filename/internal path/wire-profile rules, no implementation-defined ZIP fields, recommended archive strategy, rejected alternatives, inherited Milestone 7A stale-state behavior, Side Panel lifecycle, privacy exclusions, accessibility, coexistence, deterministic test matrix, and implementation slices.
- Runtime bundle export remained unimplemented in the historical Slice 1 architecture-only scope.
- No runtime validation was claimed for the historical Slice 1 architecture-only scope.

Accepted Slice 4 result:

- Real Chromium download artifacts are validated for V1, V2 Revision, and V2 Regeneration generated versions.
- Downloaded ZIP bytes match the pure Bundle V1 writer output exactly; suggested filenames remain deterministic while duplicate-name handling stays browser-owned.
- ZIP inspection verifies the exact entry list and order, matching central directory order, no directory entries, no ZIP64, no data descriptors, no extra fields, no comments, no trailing bytes, Store method, UTF-8 flag `0x0800`, fixed DOS date/time, version fields, Unix mode external attributes, exact README bytes, canonical JSON bytes, and exact source bytes.
- Missing, altered, and wrong-`sourceCaptureId` authoritative rereads fail closed without download and remain retryable.
- One-shot `structuredClone`, `Blob`, `createObjectURL`, `createElement`, temporary-anchor append, click, and cleanup failures fail closed without real download, leave no active bundle object URL or temporary ZIP anchor, and remain retryable.
- Object URL ownership, duplicate activation suppression, unrelated object URL preservation, row collapse, Detail leave, capture switch, remount, keyboard accessibility, status semantics, read-only/local-only/privacy probes, and coexistence with Comparison and Revision workflows are covered.

Accepted Milestone 8 validation for `e1d9237653aee1076bf8ebcdad63d0bca94b21a3`: production build passed; focused keyboard/accessibility/status test `1 passed`; hardening suite pass 1 `14 passed`; hardening suite pass 2 `14 passed`; Milestone 8 focused suites `29 passed`; Milestone 7A/7B export coexistence regressions `29 passed`; backend tests `15 passed`; full Playwright regression `283 passed` and `1 existing documented skip`; `npm audit --omit=dev` reported `0 vulnerabilities`; HEAD and `origin/main` both resolved to `e1d9237653aee1076bf8ebcdad63d0bca94b21a3`; and the working tree was clean after push. The one skip was the existing real loopback generation-flow test and was not a Milestone 8 failure.

Acceptance status: Completed. Milestone 8 is accepted only for the bounded Bundle V1 capability: one explicit local browser ZIP download for one selected persisted generated version, supporting V1, V2 Revision, and V2 Regeneration entries; exactly `README.md`, `element-catcher.json`, and `src/<ComponentName>.tsx`; source bytes exactly equal `new TextEncoder().encode(authoritativeEntry.value.code)`; deterministic canonical JSON; deterministic fixed README warning; bounded internal Store-only ZIP32 writer; explicit row-local `Export bundle` action; authoritative IndexedDB reread; exact displayed-entry equality; `sourceCaptureId` ownership; local-only, source-only, read-only behavior; real Chromium downloaded-artifact validation; and lifecycle, accessibility, stale, failure/retry, duplicate, object URL, privacy, and coexistence hardening.

Bundle V1 is not an npm package, runnable application, dependency-complete project, production-ready scaffold, compile guarantee, publishing or deployment workflow, multi-component export, or multi-capture export. Real GitHub authorization, OAuth exchange, token storage, real GitHub REST transport, production GitHub writes, repository or branch creation, pull requests, GitHub Actions/workflows, releases, deployments, GitHub Pages, Figma export, cloud sync, collaboration, and general package/project export remain unimplemented and future or out of scope. The accepted validation is not a production security proof, universal browser compatibility proof, arbitrary generated-code safety proof, generated-source compilation guarantee, rendering correctness guarantee, production-readiness claim, real OpenAI acceptance traffic claim, or real GitHub integration claim.

Architecture: `docs/MILESTONE_8_PORTABLE_COMPONENT_BUNDLE_ARCHITECTURE.md`.

## Milestone 9 - Portfolio and Demo Readiness

Status: Completed

Objective: Make the accepted Element Catcher local v0.1 demonstration understandable, honest, repeatable, and independently reviewable by an external portfolio reviewer without expanding existing product capability.

Milestone status summary:

- Milestones 1 through 8 remain Completed.
- Milestone 9 is Completed.
- Slice 1 - Documentation package and reviewer path: Completed and accepted at `13fa1fdb1d0ff36cd2aa305336b0d7302bd8ab33`.
- Slice 2 - Reviewer-facing runtime clarity, validation, and closeout: Completed.

Included scope:

- Documentation package for the portfolio-ready local v0.1 demonstration.
- Reviewer guide for the accepted product flow: Capture -> Save -> Organize -> Rebuild -> Preview -> Revise/Regenerate -> Compare -> Export.
- Manual Chrome smoke checklist and final user-confirmed real Chrome manual evidence.
- Chrome Web Store readiness gap inventory.
- Consistency updates in high-level project documents.
- Focused reviewer-facing runtime clarity for accepted GitHub export and Bundle V1 boundaries.
- Local automated validation for the implemented Slice 2 clarity changes and final fixes.
- Build-level correction for the real Chrome manual-smoke blocker caused by Side Panel HTML modulepreload links.
- Generation preparation correction for newly saved capture-shaped data.
- Product wording clarification that many authenticated/private ordinary webpages are intended supported targets while Chrome-protected pages remain unsupported.

Explicitly excluded scope:

- New runtime capability.
- Permission, dependency, storage, networking, backend, export, generation, preview, or GitHub integration changes.
- New validation result claims in Slice 1.
- Claims beyond the recorded real Chrome manual smoke evidence.
- Chrome Web Store readiness claim or submission.
- Production hosted backend, account system, cloud sync, collaboration, publishing, deployment, npm package generation, runnable project generation, or production GitHub integration.

Milestone 9 documents:

- `docs/MILESTONE_9_PORTFOLIO_DEMO_READINESS.md`
- `docs/PORTFOLIO_DEMO_GUIDE.md`
- `docs/MANUAL_CHROME_SMOKE_CHECKLIST.md`
- `docs/CHROME_WEB_STORE_READINESS_GAPS.md`

Acceptance status: Completed. Slice 1 is Completed and accepted at `13fa1fdb1d0ff36cd2aa305336b0d7302bd8ab33`. Slice 2 is Completed: reviewer-facing runtime clarity implementation, the modulepreload build fix for the observed real Chrome reload blocker, generation preparation fix, private/authenticated-page positioning clarification, local automated validation, and real Chrome manual smoke evidence confirmed by the user are recorded. Milestone 9 is Completed as Portfolio / Demo Readiness for the bounded local-first v0.1.

## Milestone 10 - Private Session Capture

Status: Completed / Accepted

Objective: Improve browser-native capture of UI state the user already has access to, without requiring the source page to be publicly reachable or remotely re-fetched.

Milestone status summary:

- Milestones 1 through 9 remain Completed.
- Milestone 10 is Completed / Accepted.
- Slice 1 - Session-preserving capture recovery: Completed / Accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d`.
- Slice 2 - Browser-session trust and privacy UX: Completed / Accepted at `5b6a0b81c75a2c7c354a630620ec62e784a9bc99`.
- Slice 3: Not created.
- Milestone 11: Local implementation complete for bounded user-assisted Interaction Capture V1; pending independent ChatGPT final acceptance. Slice 1 is Completed / Accepted at `23ff038b2e02a9f8bb3b08824a2f52180175b1df`; Slice 2 adds Trigger / Before -> Interaction -> Primary Reaction plus optional Additional Reactions and Minimal Hover Capture Assist. M12 is not started.

Included scope:

- Treat many authenticated, private, login-only, intranet-style, stateful SPA, permission-specific, and localhost ordinary webpages as intended supported targets when Chrome permits extension access and the user can already view the page.
- Preserve the distinction between supported ordinary webpages and Chrome-protected browser surfaces.
- Avoid refresh, navigation, tab recreation, remote refetch, form submission, or intentional source-page state changes during capture recovery.
- Add bounded Start Capture recovery when the active tab is a supported ordinary webpage but the current Element Catcher content runtime is unavailable.
- Add Side Panel trust UX that makes current-browser-session capture, no remote source-page re-fetch, local capture/save boundaries, and the separate explicit AI sending boundary clear.
- Add only the approved `scripting` permission while keeping the existing `activeTab` boundary.

Explicitly excluded scope:

- Bypassing authentication, authorization, firewalls, paywalls, browser restrictions, or site access controls.
- Universal private-site support claims.
- Capture from `chrome://`, Chrome Web Store, browser UI, inaccessible extension pages, inaccessible cross-origin iframe contents, or closed shadow roots.
- `<all_urls>`, `tabs`, new/broader host permissions, `webRequest`, `identity`, `downloads`, CSP weakening, dependency additions, backend changes, AI changes, CaptureRecord schema changes, visual-only capture, GitHub changes, network/cloud features, or credential/cookie/token/session extraction.

Slice 1 architecture:

- Resolve the active tab through the existing side-panel command routing pattern.
- Apply the supported-page boundary before any injection attempt.
- Try the existing content-script message path first.
- If the existing content runtime responds, continue the accepted capture flow with zero `chrome.scripting.executeScript()` calls.
- If the Start Capture content runtime is missing, inject the packaged `content/content-script.js` into the active tab main frame exactly once, then retry Start Capture exactly once.
- If injection or retry fails, fail closed with actionable product wording and no raw Chrome exception details.
- Do not run recovery injection for Cancel, Parent, Child, Confirm, screenshot completion, or unrelated messages.

Acceptance status: Completed / Accepted. Milestone 10 is accepted based on the bounded combination of Slice 1 and Slice 2. Slice 1 is Completed / Accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d`; accepted evidence includes completed implementation, focused automated checks, final full Playwright validation with `295 passed / 0 failed / 1 skipped / 0 did not run`, and required real-user Chrome manual validation passed. Slice 2 is Completed / Accepted at `5b6a0b81c75a2c7c354a630620ec62e784a9bc99`; accepted evidence includes focused Playwright validation with `4 passed / 0 failed / 0 skipped / 0 did not run`, final full Playwright validation with `299 passed / 0 failed / 1 skipped / 0 did not run`, `npm run build:extension` passed, and required real-user Chrome manual validation passed. No real AI provider request was required or claimed for Slice 2. No Slice 3 is created. Milestone 11 is now Current.

## Milestone 11 - Interaction Capture V1

Status: Local implementation complete; pending independent ChatGPT final acceptance

Objective: Reach a complete interactive-reconstruction product quickly by relating user-captured visible UI surfaces rather than attempting automatic interaction recording or source-site JavaScript extraction.

Implemented scope:

- Select one existing saved capture as Trigger / Before.
- Select a different existing saved capture as Primary Reaction.
- Optionally select Additional Reactions that are distinct from Trigger / Before and Primary Reaction.
- Select exactly one bounded V1 interaction trigger: click, toggle, hover, or focus.
- Optionally provide a short title.
- Save the Interaction Pair locally in a separate V1 model that references existing saved captures by stable local IDs.
- Reopen the saved pair and inspect Trigger / Before, Interaction, Primary Reaction, optional Additional Reactions, and screenshots.
- Delete the pair without deleting its source captures.
- Fail safely as incomplete if a referenced capture is missing.
- Preserve old two-state Interaction Pair records without `additionalReactionCaptureIds`.
- Use Enter during active selection to capture the current highlighted hover state through the existing CaptureRecord v1 pipeline.
- Keep the page-side HUD fixed at viewport bottom-left with `pointer-events: none`.

Exclusions:

- No CaptureRecord v1 schema change.
- No automatic interaction recording, mutation tracing, event-listener scraping, framework introspection, automatic overlay discovery, portal ownership inference, network observation, multi-step state machine, drag/drop, scroll, keyboard macro, animation timeline, AI interaction generation, generated interaction code, or interactive generated-code preview.
- No backend/provider/GitHub changes, Manifest permission changes, new browser permissions, CSP weakening, dependency additions, cookies, credentials, browser storage, authentication state, source JavaScript, network traffic, or app state manager reads.

Local validation status: complete, pending independent ChatGPT final acceptance. Evidence includes `git diff --check` PASS, focused M11 Playwright `10 passed / 0 failed / 0 skipped / 0 did not run`, relevant persistence/library/capture/version-comparison Playwright regression `140 passed / 0 failed / 0 skipped / 0 did not run`, `npm run build:extension` PASS, and final full Playwright `309 passed / 0 failed / 1 skipped / 0 did not run`. Backend tests are not required because backend files are unchanged.

Known limitation: if an Interaction Pair is already loaded in the current Side Panel session and one of its referenced captures is deleted, the pair view may not refresh immediately. Reopening the Side Panel causes the references to be re-resolved correctly and the missing source is shown as unavailable. This is accepted as non-blocking Slice 1 behavior because persisted data remains correct, reopening resolves the missing reference correctly, the UI fails closed, and no source data is fabricated.

M11 Slice 1 is formally accepted. M11 final local implementation remains pending independent ChatGPT final acceptance. M12 is not started.

Architecture: `docs/MILESTONE_11_INTERACTION_CAPTURE.md`.

Milestone 10 completion does not mean universal private-site compatibility, authentication detection, private-page detection, bypassing login/firewalls/access controls, Chrome-protected page capture, cross-origin iframe access, closed shadow-root access, visual-only fallback, permanent all-sites permission, production readiness, Chrome Web Store readiness, production SaaS, or production backend deployment. The accepted claim is narrower: Element Catcher captures UI directly from supported ordinary webpages in the browser session the user already has access to, including many authenticated/private/stateful pages when Chrome permits extension access, without requiring the source page to be publicly reachable or remotely re-fetched for capture. Capture/save remains local-first, and AI generation remains a separate reviewed and explicit consent-gated data transmission step.

Architecture: `docs/MILESTONE_10_PRIVATE_SESSION_CAPTURE.md`.
