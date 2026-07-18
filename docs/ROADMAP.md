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

Status: Current

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

### Milestone 4A - Library Read Model and Capture List Foundation

Status: Current

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

### Milestone 4B - Saved Capture Detail and Reopen Navigation

Status: Planned

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

### Milestone 4C - User-Managed Library Metadata Editing

Status: Planned

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

### Milestone 4D - Atomic Capture Deletion

Status: Planned

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

### Milestone 4E - Search, Filtering, and Milestone 4 Regression

Status: Planned

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

## Milestone 5 - AI React + Tailwind Reconstruction

Status: Planned

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

## Milestone 6 - Isolated Preview and Version Management

Status: Planned

Objective: Let users preview, revise, regenerate, compare, and manage generated component versions in isolation.

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

## Milestone 7 - Export and Future Expansion

Status: Planned

Objective: Define and implement export and expansion paths without turning the MVP into a full publishing, enterprise, or multi-framework platform.

Included scope:

- Code file export.
- Potential GitHub workflow.
- Potential Figma integration.
- Potential additional framework targets.
- Potential cloud sync.
- Potential team collaboration.
- Export metadata and future expansion hooks.

Explicitly excluded scope:

- Any expansion that undermines the focused Capture -> Save -> Organize -> Rebuild -> Preview -> Reuse workflow.
- Full-site cloning as a product direction.
- Website publishing as a primary product direction.
- Enterprise suite requirements as MVP requirements.

Acceptance criteria:

- Export paths are defined and implemented in a way that preserves the local-first capture workflow.
- Future integrations do not replace the core CaptureRecord-centered architecture.
- Any added sync, collaboration, framework, GitHub, or Figma capability is explicitly scoped before implementation.
- The product remains focused on reusable UI inspiration capture rather than full-site cloning or publishing.
