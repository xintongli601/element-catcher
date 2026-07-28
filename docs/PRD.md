# Element Catcher v0.1 Product Requirements Document

## 1. Product Overview

Element Catcher is a local-first Chrome extension for capturing UI inspiration from supported webpages and rebuilding it as reusable front-end code.

Positioning:

> Capture UI inspiration. Rebuild it as reusable code.

The product is not a full CSS inspector, full-page cloning tool, publishing platform, or enterprise design-to-code suite. Its durable value is the workflow from local capture to organized reusable component source.

## 2. Current Product State

Milestones 1 through 5 are completed. Milestone 6 is current.

Implemented:

- Reliable supported-page element capture.
- Click-to-lock selection with Parent/Child refinement.
- Current-visible-tab screenshot capture and cropping.
- `CaptureRecord v1` creation and validation.
- Persisted screenshot assets.
- Local Capture Library.
- Saved-capture reopen.
- User-managed metadata editing for title, component type, tags, and notes.
- Atomic deletion.
- Search and filtering.
- React + Tailwind generation through the configured provider-neutral backend path.
- Review data and explicit consent before outbound AI transmission.
- Local generated-version persistence in a separate IndexedDB store.
- Inert source-text display of generated code.
- Isolated generated-component preview for Previewable Subset V1 through explicit Preview.
- Natural-language revision from an existing persisted generated version.
- Instruction-free regeneration from an existing persisted generated version.
- Immutable V2 generated-version persistence with lineage to the selected source version.

Current next product stage:

- Version comparison.
- Final Milestone 6 integrated regression.

## 3. Problem Statement

Designers, product managers, front-end learners, and indie makers often notice useful UI patterns while browsing: a pricing card, comment box, dashboard widget, navigation pattern, form layout, or polished call-to-action. Existing workflows often produce passive references such as screenshots, bookmarks, and notes. These references are easy to collect but hard to reuse.

Element Catcher turns supported visible webpage elements into structured local captures, lets users organize them, and can rebuild them as React + Tailwind source code while preserving the original capture as an immutable reference.

## 4. Target Users

- UI/UX students.
- Junior product designers.
- Product managers learning design.
- Front-end beginners.
- Indie makers.
- Portfolio builders collecting interaction and component references.

The strongest early user is someone building a design or front-end portfolio who wants to collect UI patterns, study how interfaces are structured, and turn inspiration into organized reusable assets.

## 5. Product Differentiation

Element Catcher sits between inspiration libraries, browser inspection tools, and AI code generators.

The differentiation is the workflow:

1. Capture from supported webpages already visible in the user's browser.
2. Normalize screenshot, DOM, CSS, and semantic summaries into a stable `CaptureRecord`.
3. Store captures locally as reusable assets.
4. Organize captures with title, tags, notes, and component type.
5. Generate React + Tailwind component versions from screenshot plus structured capture data.
6. Preserve generated versions separately from the original capture.
7. Preview safe generated source explicitly, revise or regenerate from persisted versions, and hand off to comparison plus eventual export without becoming a full publishing platform.

## 6. Supported Page Limitations

Element Catcher can capture from supported webpages currently visible in the user's browser, including many login-only, intranet, permissioned, dynamic, and localhost pages.

It must not claim to work on every browser page. Known limitations include:

- Chrome internal pages such as `chrome://` pages.
- Chrome Web Store pages.
- Browser-controlled UI.
- Extension pages where content scripts cannot run.
- Inaccessible cross-origin iframe contents.
- Closed shadow roots.
- Pages where the extension content script is blocked, unavailable, or not reloaded.

The product must not bypass access controls or capture content the user cannot already view.

## 7. Local-First and AI Transmission

Captures remain local by default. Saved capture metadata and screenshot assets are stored in IndexedDB under the extension origin. The local Capture Library is the primary store for saved inspiration assets.

Outbound AI behavior is current, explicit, and consent-gated:

- The extension rereads and validates the saved capture and screenshot before initial generation.
- Revision and regeneration reread the current saved capture and selected generated source before freezing Review.
- The user sees the approved outbound projection before sending initial generation, revision, or regeneration.
- Explicit consent is required for every generation, revision, or regeneration attempt.
- Screenshot transmission for revision/regeneration is optional and off by default.
- The screenshot and approved structured projection are sent only through the configured backend.
- Source URL, page title, favicon URL, local persistence identifiers, screenshot storage keys, wrapper data, browser storage, and cookies are excluded from the approved outbound contract.
- API credentials remain backend-only and must never enter extension source, browser storage, IndexedDB, logs, or generated bundles.

The local backend/proxy is a development/demo topology, not a production multi-user backend. No real OpenAI request was made during automated acceptance; the provider adapter and local loopback path were deterministically validated without committing or exposing a real API secret.

## 8. Core User Flow

Implemented:

```text
Capture -> Save -> Organize -> Rebuild -> Preview -> Revise/Regenerate -> Persist new version
```

Implemented details:

1. Open a supported webpage.
2. Open the Element Catcher side panel.
3. Start selection mode.
4. Hover, lock, and refine a UI element.
5. Confirm the final selected element.
6. Capture and crop a screenshot.
7. Build a normalized `CaptureRecord v1`.
8. Review the Capture Preview.
9. Save the capture into the local Capture Library.
10. Organize the capture with title, component type, tags, and notes.
11. Review outbound generation data.
12. Consent to send the approved projection through the configured backend.
13. Generate React + Tailwind source.
14. Persist the generated version separately from the original capture.
15. Explicitly Preview supported generated source through the isolated sandbox.
16. Choose Revise or Regenerate from an existing persisted generated version.
17. Review the exact approved outbound revision/regeneration data and consent before transport.
18. Persist the successful result as a new immutable V2 generated-version entry linked to the selected source version.

Current/future:

```text
Compare -> Reuse/Export
```

Version comparison, reuse workflow polish, and export remain future.

## 9. Structured Capture Concept

A capture is not just a screenshot. A capture is a normalized, serializable record that combines visual reference, source context, sanitized structure, normalized style information, semantic summaries, and user library metadata.

The normalized `CaptureRecord` is the source of truth for:

- Local library entries.
- Capture preview.
- Search and filtering.
- AI generation input.
- Future preview, comparison, and export workflows.

Generated versions are intentionally persisted outside the original `CaptureRecord` in a separate IndexedDB store. Initial generation uses the V1 generated-version entry shape. Revision and regeneration create immutable V2 entries that record the exact selected source generated-version ID, source fingerprint, logical attempt, review fingerprint, operation kind, and screenshot-inclusion state. V1 and V2 versions are read together through a union reader.

## 10. Capture Library Concept

The Capture Library is implemented as a personal local-first library of structured reusable assets.

Implemented library features:

- Capture list.
- Reopen capture.
- Edit title.
- Edit component type.
- Edit tags.
- Edit notes.
- Delete.
- Search.
- Filter.

Cloud sync and team sharing remain future possibilities, not v0.1 requirements.

## 11. AI Reconstruction Concept

AI reconstruction uses both the persisted screenshot Blob and a bounded structured projection of the saved `CaptureRecord`. The model must not blindly copy messy website code or internal class names. It produces readable React + Tailwind source inspired by the captured UI element.

The approved outbound input includes:

- PNG screenshot data URL created only after consent.
- Sanitized DOM summary.
- Normalized computed style summary.
- Typography summary.
- Color roles.
- Layout summary.
- Spacing summary.
- Selected element tag, role, and dimensions.
- User-managed title, component type, and tags where available.

The output includes:

- Component name.
- React + Tailwind code.
- Component summary.
- Approximation notes.

Generated code is displayed as inert source text by default. It is rendered only when the user explicitly chooses Preview and the source passes the accepted Milestone 6C Previewable Subset V1 sandbox boundary.

## 12. Generated Component Versions

Generated component versions are stored separately from the original `CaptureRecord`.

Implemented persistence architecture:

```text
IndexedDB version: 2

Stores:
- captureRecords
- screenshotAssets
- generatedComponentVersions

Index:
- generatedComponentVersions.sourceCaptureId
```

Generated-version persistence validates the complete source `CaptureRecord`, source linkage, screenshot reference, response shape, stable generated-version ID, idempotent retry behavior, read-back, cancellation, orphan cleanup, deletion cascade, and deterministic newest-first ordering. Revision/regeneration persistence adds deterministic V2 target IDs, exact source-version lineage, idempotent recovery, conflict-safe recovery failure without overwrite, and source immutability across existing captures, screenshot assets, V1 versions, V2 source versions, and earlier versions.

## 13. Roadmap

- Milestone 1: Completed - extension scaffold.
- Milestone 2: Completed - selection mode and element highlighting.
- Milestone 2.5: Completed - product positioning and Capture architecture reset.
- Milestone 3: Completed - reliable element capture, CaptureRecord assembly, screenshot persistence, Capture Preview, and Save.
- Milestone 4: Completed - personal Capture Library.
- Milestone 5: Completed - AI React + Tailwind reconstruction and generated-version persistence.
- Milestone 6: Current - isolated preview and version management. Milestone 6A, 6B, 6C, and 6D are Completed; Milestone 6E is Current.
- Milestone 7: Planned - export and future expansion.

## 14. Success Criteria

The current MVP is successful when a user can capture a UI element from a supported webpage, save it as a structured local asset, organize it, and use it to generate a readable reusable React + Tailwind component source version without mutating the original capture.

For product and portfolio purposes, success means the project demonstrates:

- A real inspiration-to-reuse workflow.
- Local-first capture and library thinking.
- Clear differentiation from raw inspection and full-site cloning.
- Accurate browser support boundaries.
- Privacy-conscious data handling.
- A stable `CaptureRecord` schema.
- A focused milestone roadmap.

The generated component does not need to be pixel-perfect. It should preserve core structure, visual style, layout intent, and reusable design properties.

## 15. Non-Goals

Element Catcher v0.1 does not include:

- Complete visual CSS editor.
- Large typography, shadow, gradient, or spacing editing panels.
- Full-page cloning.
- Multi-page cloning.
- Image scraping.
- Video scraping.
- Complete page HTML export.
- Website publishing.
- Automatic generated-source execution.
- Version comparison before Milestone 6E.
- Export before Milestone 7.
- Figma export.
- GitHub export.
- Team collaboration.
- Cloud sync.
- Multiple framework generation.
- Enterprise workflow.
- Payment.
- Authentication.
- Production hosted multi-user backend operations.
- Drag-to-box selection unless later validated as necessary.

## 16. Privacy and Ethical Boundaries

Element Catcher is a tool for personal design inspiration, study, and component recreation. It must not be positioned as a tool to steal UI, scrape media, bypass access controls, or extract confidential information.

Privacy safeguards include:

- Keep captures local by default.
- Do not save password values.
- Do not save input or textarea values by default.
- Limit captured text length.
- Sanitize DOM before persistence.
- Remove scripts and event-handler attributes.
- Avoid persisting hidden sensitive content.
- Show Review data before AI transmission.
- Require explicit consent before sending the screenshot and approved projection to the configured backend.
- Keep provider credentials backend-only.
- Preserve generated versions separately from the source capture.
