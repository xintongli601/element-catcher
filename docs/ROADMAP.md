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

Status: Current

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

Status: Current

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

## Milestone 4 - Personal Capture Library

Status: Planned

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
