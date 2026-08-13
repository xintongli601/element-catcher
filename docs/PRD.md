# Element Catcher v0.1 Product Requirements Document

## 1. Product Overview

Element Catcher is a local-first Chrome extension for capturing UI inspiration from supported webpages and rebuilding it as reusable front-end code.

Positioning:

> Capture UI inspiration. Rebuild it as reusable code.

The product is not a full CSS inspector, full-page cloning tool, publishing platform, or enterprise design-to-code suite. Its durable value is the workflow from local capture to organized reusable component source.

## 2. Current Product State

Milestones 1 through 12 are completed for the bounded local-first v0.1 portfolio/demo readiness scope. Milestone 10 is Completed / Accepted for browser-native capture of UI state the user already has access to, without requiring the source page to be publicly reachable or remotely re-fetched. Milestone 10 Slice 1 implements bounded Start Capture recovery for supported ordinary webpages when the content runtime is unavailable; it is Completed / Accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d` based on completed implementation, passed automated validation, and passed required real-user Chrome manual validation. Milestone 10 Slice 2 is Completed / Accepted at `5b6a0b81c75a2c7c354a630620ec62e784a9bc99` based on completed browser-session trust/privacy UX implementation, passed local automated validation, and passed required real-user Chrome manual validation. Milestone 11 is Completed / Accepted at `5efef21b85167bbe0dc091231343b8ef51afe2bf` for bounded user-assisted Interaction Capture V1, including Trigger / Before -> Interaction -> Primary Reaction plus optional Additional Reactions and Minimal Hover Capture Assist. Milestone 12 adds bounded local Interactive Reconstruction from an accepted Interaction Pair into reviewable React + Tailwind source, safe declarative interactive preview, local persistence, deletion, and `.tsx` export. Element Catcher is a portfolio-ready local v0.1 demonstration, not production-ready, SaaS, store-ready, deployed, or production GitHub-integrated. Milestone 8 is Completed for the bounded portable component source bundle export. Slice 1 architecture and feasibility, Slice 2 pure Bundle V1 contracts/ZIP32 writer, Slice 3 Side Panel row workflow, and Slice 4 lifecycle hardening and final acceptance are completed and accepted. Real GitHub authorization, OAuth exchange, token storage, real GitHub REST requests, and production GitHub writes are not implemented.

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
- Browser-session trust UX that distinguishes local capture/save from explicit AI sending and identifies that AI does not receive browser session, cookies, browser storage, login credentials, or source-page access.
- Local generated-version persistence in a separate IndexedDB store.
- Inert source-text display of generated code.
- Isolated generated-component preview for Previewable Subset V1 through explicit Preview.
- Natural-language revision from an existing persisted generated version.
- Instruction-free regeneration from an existing persisted generated version.
- Immutable V2 generated-version persistence with lineage to the selected source version.
- Local generated-version comparison for exactly two distinct persisted versions with the same `sourceCaptureId`.
- Local single-version exact-source `.tsx` export for one explicitly selected persisted generated version.
- Deterministic fake/development single-file GitHub export workflow for one explicitly selected persisted generated version, with strict contracts, repository and existing-branch selection, validated path and commit message, frozen Review, explicit create/update confirmation, stale/conflict handling, duplicate suppression, and semantic Review/Success states.
- Local Bundle V1 ZIP export for one explicitly selected persisted generated version, containing exactly deterministic README, canonical `element-catcher.json`, and exact source bytes at `src/<ComponentName>.tsx`.
- Bounded M10 Slice 1 Start Capture recovery for supported ordinary webpages when Chrome permits active-tab script injection; Completed / Accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d`.
- Bounded M11 Interaction Pair V1 workflow for Trigger / Before, Interaction, Primary Reaction, and optional Additional Reactions; Completed / Accepted at `5efef21b85167bbe0dc091231343b8ef51afe2bf`.
- M11 Minimal Hover Capture Assist for pressing Enter during active selection to capture the current highlighted hover state through the existing CaptureRecord v1 pipeline.
- Bounded M12 Interactive Reconstruction workflow for complete Interaction Pairs: review projected surfaces, consent locally, generate deterministic React + Tailwind source with visual approximation from sanitized DOM/text/style/layout projections, preview through a safe declarative interactive plan, persist, reopen, delete, and export `.tsx`.

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
7. Preview safe generated source explicitly, revise or regenerate from persisted versions, compare local generated versions, and export one selected generated version locally without becoming a full publishing platform.

## 6. Supported Page Limitations

Element Catcher can capture from supported regular webpages currently visible in the user's browser, including many authenticated, login-only, intranet, permissioned, dynamic, private, and localhost pages that the user can already access in Chrome.

It must not claim to work on every browser page. Known limitations include:

- Chrome internal pages such as `chrome://` pages.
- Chrome Web Store pages.
- Browser-controlled UI.
- Extension pages where content scripts cannot run.
- Inaccessible cross-origin iframe contents.
- Closed shadow roots.
- Pages where the extension content script is blocked and Chrome does not permit bounded active-tab recovery.

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
Capture -> Save -> Organize -> Rebuild -> Preview -> Revise/Regenerate -> Compare -> Export
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
19. Compare exactly two persisted generated versions for the same source capture through explicit Baseline and Candidate selection, optional Swap, metadata comparison, bounded source diff, and complete original source display.
20. Expand one generated-version row and activate `Export .tsx` to initiate one local browser download containing exactly that persisted generated version's `entry.value.code`.
21. In deterministic fake/development mode, expand one generated-version row, activate `Export to GitHub`, choose a repository and existing branch, enter a validated `.tsx` path and commit message, inspect a frozen Review, explicitly confirm one create/update, and see Success only after the backend gateway verifies the fake write.
22. Expand one generated-version row and activate `Export bundle` to initiate one local Bundle V1 ZIP download for that persisted generated version.

Milestone 7A delivered the first narrow export path: one explicit local `.tsx` export of one selected persisted generated version's exact stored source. Broader reuse workflow polish remains future.

Milestone 7B delivers the next narrow handoff as a deterministic fake/development workflow: an explicit `Export to GitHub` action for one selected persisted generated version, one user-selected repository, one existing branch, and one `.tsx` path. The file contents remain exactly persisted `entry.value.code`, the default filename reuses the Milestone 7A filename helper, and every create/update requires a frozen Review and explicit confirmation. Normal runtime remains not-configured for real GitHub; real GitHub authorization, OAuth exchange, token storage, real GitHub REST requests, and production writes are not implemented.

Milestone 8 is Completed. It defines and implements one explicit local ZIP portable component source bundle for one selected persisted generated version. Bundle V1 is not an npm package, runnable application, publishing workflow, production-ready scaffold, dependency-complete project, or compile guarantee.

Milestone 9 is Completed for portfolio/demo readiness. Slice 1 is Completed and accepted at `13fa1fdb1d0ff36cd2aa305336b0d7302bd8ab33` for the documentation package, reviewer path, manual Slice 2 checklist, and Chrome Web Store gap inventory. Slice 2 is Completed based on focused reviewer-facing runtime clarity implementation, the Side Panel modulepreload build fix, the newly saved capture generation-preparation fix, local automated validation, and real Chrome manual smoke evidence confirmed by the user. Generated-version-only GitHub and Bundle paths retain automated evidence when no configured provider/generated version is available for manual execution.

## 9. Structured Capture Concept

A capture is not just a screenshot. A capture is a normalized, serializable record that combines visual reference, source context, sanitized structure, normalized style information, semantic summaries, and user library metadata.

The normalized `CaptureRecord` is the source of truth for:

- Local library entries.
- Capture preview.
- Search and filtering.
- AI generation input.
- Preview, comparison, and future export workflows.

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
IndexedDB version: 3

Stores:
- captureRecords
- screenshotAssets
- generatedComponentVersions
- interactionPairs

Index:
- generatedComponentVersions.sourceCaptureId
```

Generated-version persistence validates the complete source `CaptureRecord`, source linkage, screenshot reference, response shape, stable generated-version ID, idempotent retry behavior, read-back, cancellation, orphan cleanup, deletion cascade, and deterministic newest-first ordering. Revision/regeneration persistence adds deterministic V2 target IDs, exact source-version lineage, idempotent recovery, conflict-safe recovery failure without overwrite, and source immutability across existing captures, screenshot assets, V1 versions, V2 source versions, and earlier versions.

Milestone 11 adds a separate local Interaction Pair V1 store. An interaction pair references existing saved captures by stable local IDs and records one bounded interaction: click, toggle, hover, or focus. `baseCaptureId` represents Trigger / Before, `alternateCaptureId` represents the Primary Reaction, and optional `additionalReactionCaptureIds` represents additional visible reaction surfaces. Reaction UI may be a changed trigger state, sibling UI, dropdown, tooltip, popover, overlay, floating layer, portal-rendered UI, modal, or another visible surface captured by the user. The pair detail resolves referenced captures for inspection, fails safely as incomplete when a referenced capture is missing, and can be deleted without deleting its source captures. It does not modify `CaptureRecord v1`, duplicate source capture data, call AI/backend/provider routes, generate interaction code, or create an interactive generated preview.

Milestone 11 also adds a minimal page-side Enter quick-capture assist while selection mode is active. When a valid candidate is highlighted, Enter prevents the underlying webpage activation, locks the current highlighted element, and routes into the existing extraction, screenshot, Capture Preview, and ordinary `CaptureRecord v1` Save path. It does not add automatic hover detection, interaction recording, permissions, dependencies, CSP changes, backend/provider routes, or Chrome commands.

Version comparison is local, deterministic, read-only, ephemeral, and limited to exactly two distinct persisted generated versions with the same `sourceCaptureId`. It supports explicit Baseline and Candidate selection, Swap, V1/V2 entries, full original code retention, and bounded internal LCS source diff. It does not persist comparison state, automatically Preview, execute generated code, call backend/provider/OpenAI/source pages/content scripts/service workers/remote origins, compare screenshot pixels or rendered output, score, select winners, merge, edit, compare across captures, or compare three or more versions.

Milestone 7A local export is Completed. The accepted implementation exports exactly one explicitly selected persisted V1 or V2 generated version from Saved Capture Detail as one UTF-8 `.tsx` file containing only the exact persisted `entry.value.code`. Export rereads the selected entry from IndexedDB at export time, fails closed if the entry is missing, altered, invalid, unsafe, or tied to the wrong `sourceCaptureId`, remains independent from Preview eligibility, requires explicit user action, avoids automatic export, avoids source transformation, avoids metadata sidecars, and added no `downloads` permission or Manifest change.

The exported bytes preserve persisted source exactly: no CRLF/LF normalization, trimming, formatting, parsing, transpilation, injected comments, metadata header/footer, or automatic final newline. Accepted real Chromium validation covered V1 CRLF, V2 Revision Unicode source, V2 Regeneration JSX/Tailwind source, no final newline, exactly one final newline, Preview-rejected but contract-valid source, and the maximum valid persisted component name. Empty generated code remains rejected by the existing generation contract and was not enabled.

The implementation uses the trusted Side Panel, a UTF-8 Blob, a temporary object URL, and a temporary anchor with `download`. It does not use `chrome.downloads`, File System Access API, native messaging, clipboard writes, arbitrary filesystem access, or new dependencies. Accepted hardening confirmed zero HTTP/HTTPS requests, backend/provider/OpenAI calls, runtime messages, tab messages, source-page interaction, automatic Preview, automatic iframe creation, generated-source parsing/compilation/evaluation/execution, and IndexedDB writes. `CaptureRecord`, screenshot assets, pre-existing V1/V2 generated versions, generated-version ordering, Comparison selections, Preview state, and Revision/Regeneration state remain unchanged by export.

Milestone 7B GitHub export is Completed for deterministic fake/development behavior. The row action makes no GitHub request on row expansion and starts only through explicit `Export to GitHub`. The user chooses a repository and existing branch, enters a validated repository-relative `.tsx` path and bounded single-line commit message, then opens a frozen semantic Review that distinguishes create/update and includes the inspected remote state. Final write requires explicit confirmation, performs another authoritative local generated-version reread immediately before write, fails closed on local stale state or remote conflict, suppresses duplicate confirmation, and shows Success only after the backend gateway returns a verified fake write result. Cancellation, Detail leave, and capture switching clear ephemeral Review/Success state. Keyboard and semantic accessibility coverage verifies row expansion, workflow start, Review, cancellation, confirmation, and Success fields.

The GitHub gateway exposes only versioned session, repositories, branches, inspect, and write routes. Normal runtime uses the not-configured transport and exposes no fake active session. The deterministic fake transport is explicitly injected for tests/development and never performs real `api.github.com` requests. The extension-facing contracts carry bounded versioned models and opaque session references only; no token, refresh token, OAuth code, client secret, cookie, authorization header, screenshot, `CaptureRecord`, source URL, page title, notes, storage key, provider metadata, or OpenAI credential enters GitHub export UI state or persistence. GitHub export does not write IndexedDB, mutate captures or generated versions, execute source, create iframes automatically, contact provider/OpenAI routes, create repositories or branches, open pull requests, create workflows, run Actions, publish releases/deployments/Pages/packages, create ZIPs, or export multiple files.

Milestone 8 Bundle V1 defines exactly `README.md`, `element-catcher.json`, and `src/<ComponentName>.tsx`. It supports V1, V2 Revision, and V2 Regeneration entries. The source file bytes exactly equal `new TextEncoder().encode(authoritativeEntry.value.code)`. The JSON contract contains only safe bundle fields: `formatVersion`, `framework: react`, `styling: tailwind`, `componentName`, and `entryPath`. The README is a deterministic fixed warning template and does not include capture metadata or generated summaries. The implementation uses a bounded internal uncompressed ZIP writer, not an approved third-party ZIP dependency. Bundle export is guarded by authoritative IndexedDB reread, exact displayed-entry equality, `sourceCaptureId` ownership, local-only/source-only/read-only behavior, real Chromium downloaded-artifact validation, and lifecycle, accessibility, stale, failure/retry, duplicate, object URL, privacy, and coexistence hardening.

## 13. Roadmap

- Milestone 1: Completed - extension scaffold.
- Milestone 2: Completed - selection mode and element highlighting.
- Milestone 2.5: Completed - product positioning and Capture architecture reset.
- Milestone 3: Completed - reliable element capture, CaptureRecord assembly, screenshot persistence, Capture Preview, and Save.
- Milestone 4: Completed - personal Capture Library.
- Milestone 5: Completed - AI React + Tailwind reconstruction and generated-version persistence.
- Milestone 6: Completed - isolated preview and version management. Milestone 6A, 6B, 6C, 6D, and 6E are Completed.
- Milestone 7: Completed - accepted based on completed Milestone 7A local exact-source `.tsx` export and completed Milestone 7B deterministic fake/development single-file GitHub export workflow. Real production GitHub integration remains future work. Figma, cloud sync, collaboration, publishing, additional frameworks, package export, and general multi-file export remain Planned or explicitly out of scope.
- Milestone 8: Completed - local ZIP portable component source bundle export. Slice 1 is Completed and accepted at `c06b3c10d7bfa2ee772126f137833c836aea0dd3`; Slice 2 is Completed and accepted at `167d2a96f91261b0af4422541b3b9978e7563692`; Slice 3 is Completed and accepted at `a2aac799fa5e6ef9c493520973d8421afc80c430`; Slice 4 is Completed and accepted at `e1d9237653aee1076bf8ebcdad63d0bca94b21a3`.
- Milestone 9: Completed - portfolio/demo readiness documentation and reviewer path. Slice 1 is Completed and accepted at `13fa1fdb1d0ff36cd2aa305336b0d7302bd8ab33`. Slice 2 is Completed based on runtime clarity implementation, local automated validation, real Chrome manual smoke evidence confirmed by the user, and final closeout acceptance. See `docs/MILESTONE_9_PORTFOLIO_DEMO_READINESS.md`, `docs/PORTFOLIO_DEMO_GUIDE.md`, `docs/MANUAL_CHROME_SMOKE_CHECKLIST.md`, and `docs/CHROME_WEB_STORE_READINESS_GAPS.md`.
- Milestone 10: Completed / Accepted - private/session-state capture reliability. Slice 1 is Completed / Accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d`; Slice 2 is Completed / Accepted at `5b6a0b81c75a2c7c354a630620ec62e784a9bc99`. No Slice 3 is created. See `docs/MILESTONE_10_PRIVATE_SESSION_CAPTURE.md`.
- Milestone 11: Completed / Accepted at `5efef21b85167bbe0dc091231343b8ef51afe2bf` for bounded user-assisted Interaction Capture V1. See `docs/MILESTONE_11_INTERACTION_CAPTURE.md`.
- Milestone 12: Local implementation complete for bounded Interactive Reconstruction from complete Interaction Pairs. See `docs/MILESTONE_12_INTERACTIVE_RECONSTRUCTION.md`.

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
- Screenshot-pixel, rendered-output, cross-capture, three-way, or multi-version comparison.
- Comparison scoring, winner selection, merging, or editing.
- Runtime export beyond the completed narrow Milestone 7A local `.tsx` source-export path, deterministic Milestone 7B fake/development GitHub workflow, and Milestone 8 single-version Bundle V1 ZIP path.
- npm package export, runnable application scaffolding, dependency inference, Tailwind configuration generation, build configuration generation, and production-ready scaffolding.
- Chrome Web Store readiness claim or submission.
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
