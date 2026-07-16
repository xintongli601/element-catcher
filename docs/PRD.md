# Element Catcher v0.1 Product Requirements Document

## 1. Product Overview

Element Catcher is a local-first Chrome extension for capturing UI inspiration from supported webpages currently visible in the user's browser and rebuilding it as reusable front-end code.

The refined positioning is:

> Capture UI inspiration. Rebuild it as reusable code.

The product is not primarily differentiated by element inspection, raw CSS extraction, Tailwind export, or element screenshots. Those are useful supporting capabilities, but competing tools already provide them. Element Catcher should instead focus on the full reuse workflow:

```text
Capture -> Save -> Organize -> Rebuild -> Preview -> Reuse
```

The long-term product flow is:

```text
Raw webpage element
  -> Capture extractor
  -> Normalized CaptureRecord
  -> Local Capture Library
  -> AI component generator
  -> Generated component versions
  -> Reuse or export
```

Element Catcher should remain lighter and more focused than full-site cloning, visual CSS editing, enterprise design-to-code suites, website publishing tools, or team design-system platforms.

## 2. Project History and Current State

Milestone 1 established the Chrome Extension Manifest V3 scaffold, TypeScript build setup, React side panel, background service worker, content script entry, and plain CSS UI.

Milestone 2 implemented selection mode and element highlighting. The user can start selection from the side panel, hover DOM elements on ordinary supported webpages, see a temporary overlay, click to select an element, cancel with Escape, and see minimal selected-element metadata in the side panel.

Milestone 2.5 is a documentation and architecture reset. It does not implement new extension functionality. It clarifies the product direction before screenshot capture, DOM/CSS extraction, local persistence, Capture Library, or AI generation are built.

## 3. Problem Statement

Designers, product managers, front-end learners, and indie makers often notice useful UI patterns while browsing: a pricing card, comment box, dashboard widget, navigation pattern, form layout, or polished call-to-action. Existing workflows usually produce passive references such as screenshots, bookmarks, and notes. These references are easy to collect but hard to reuse.

Element inspection tools can show dimensions, CSS, screenshots, or Tailwind-like values, but raw inspection data is not enough. A single "Copy Tailwind" action does not create a reusable asset workflow. Users still need to organize the inspiration, understand the component's role, reconstruct it cleanly, preview generated versions, and return to it later.

URL-to-design and screenshot-to-code products can help in adjacent workflows, but they often focus on public pages, full-page conversion, or one-off generation. Element Catcher is intended for local-first capture from supported pages already visible in the user's browser, including many login-only, intranet, permissioned, dynamic, and localhost pages, while respecting browser and extension restrictions.

## 4. Target Users

The first target users remain:

- UI/UX students
- Junior product designers
- Product managers learning design
- Front-end beginners
- Indie makers
- Portfolio builders collecting interaction and component references

The strongest early user is someone building a design or front-end portfolio. They browse real products, collect UI patterns, study how interfaces are structured, and want to turn inspiration into organized, editable, reusable front-end assets.

## 5. Product Positioning

Element Catcher should be positioned as a local-first UI inspiration capture and reusable asset workflow.

The product should not be framed as:

- A complete CSS inspector
- A QA measurement tool
- A full-page cloning tool
- A media scraper
- A website publishing platform
- An enterprise collaboration suite

Element inspection, dimensions, CSS viewing, element screenshots, and Tailwind export are supporting capabilities. The product's durable value should come from transforming raw webpage observations into a structured CaptureRecord, storing that record in a personal library, and using it to generate reusable component versions.

## 6. Product Differentiation

Element Catcher sits between inspiration libraries, browser inspection tools, and AI code generators.

The differentiation is the workflow, not any single extraction feature:

1. Capture from supported webpages already visible in the user's browser.
2. Normalize raw screenshot, DOM, CSS, and semantic summaries into a stable CaptureRecord.
3. Store captures locally as reusable assets, not just screenshots.
4. Let the user organize captures with titles, tags, notes, and component types.
5. Generate React + Tailwind component versions from screenshot plus structured capture data.
6. Preserve generated versions separately from the original capture.
7. Support reuse, comparison, and eventual export without becoming a full publishing platform.

Interaction patterns worth borrowing from existing tools include accurate hover highlighting, click-to-lock selection, Escape to cancel, dimensions, parent/child navigation, and fixed side-panel interaction. These should serve the capture workflow rather than become a full inspector product.

## 7. Supported Page Limitations

Element Catcher should use accurate language about page support.

The product can capture from supported webpages currently visible in the user's browser, including many login-only, intranet, permissioned, dynamic, and localhost pages.

It should not claim to work on literally every visible browser page. Known limitations include:

- Chrome internal pages such as `chrome://` pages
- Chrome Web Store pages
- Browser-controlled UI
- Extension pages where content scripts cannot run
- Inaccessible cross-origin iframe contents
- Closed shadow roots
- Pages where the extension content script is blocked, unavailable, or not reloaded

The product must not bypass access controls or capture content the user cannot already view.

## 8. Local-First Principle

Element Catcher should be local-first by default.

Captured records should stay on the user's device unless the user explicitly chooses to export them or send data to an AI API. The local Capture Library is the primary store for saved inspiration assets.

Future AI generation should warn users before transmitting screenshots, text previews, DOM summaries, or style summaries to an external model. Users should be warned not to send sensitive personal information, private messages, confidential business data, protected content, passwords, payment information, or private identifiers.

## 9. Core User Flow

The revised core user flow is:

1. The user opens a supported webpage.
2. The user opens the Element Catcher side panel.
3. The user starts selection mode.
4. The user hovers and selects a UI element.
5. The extension locks the selected element and offers parent/child refinement.
6. The extension captures a screenshot reference and extracts sanitized, limited source data.
7. The extension builds a normalized `CaptureRecord`.
8. The user reviews a Capture Preview.
9. The user saves the record into the local Capture Library.
10. The user organizes the capture with title, component type, tags, and notes.
11. The user generates one or more React + Tailwind component versions.
12. The user previews, revises, compares, reuses, or exports generated versions.

Milestone 2 currently covers only steps 2-4 at a minimal level.

## 10. Structured Capture Concept

A capture is not just a screenshot. A capture is a normalized, serializable record that combines visual reference, source context, sanitized structure, normalized style information, semantic summaries, and user library metadata.

The normalized `CaptureRecord` should become the source of truth for:

- Local library entries
- Capture preview
- Search and filtering
- AI generation input
- Generated component versions
- Future export workflows

The raw webpage element itself must never be stored as a live DOM reference. Raw `outerHTML` must not be stored without sanitization. Large image data should be referenced as an asset rather than embedded directly in every metadata record.

## 11. Capture Library Concept

The Capture Library is not screenshot history. Each entry should be a structured reusable asset.

Future library features should include:

- Capture list
- Reopen capture
- Edit title
- Tags
- Notes
- Component type
- Delete
- Search
- Filter

The library should remain personal and local-first in the MVP. Cloud sync and team sharing are future possibilities, not v0.1 requirements.

## 12. AI Reconstruction Concept

AI reconstruction should use both the screenshot reference and the structured CaptureRecord. The model should not blindly copy messy website code or internal class names. It should produce readable, reusable React + Tailwind code inspired by the captured UI element.

The AI input should eventually include:

- Cropped screenshot reference
- Sanitized DOM summary
- Normalized computed style summary
- Typography summary
- Color roles
- Layout summary
- Spacing summary
- Component type and user intent where available

The output should include:

- Component name
- React + Tailwind code
- Component summary
- Approximation notes
- Generated version metadata

## 13. Generated Component Versions

Generated components should be stored conceptually separate from the original CaptureRecord.

A single capture may produce multiple generated versions. Future versions may support natural-language revision, regeneration, comparison, and export. Generated versions should preserve their relationship to the source capture without mutating the original capture data.

## 14. MVP Boundaries and Revised Roadmap

Completed Milestone 1: Extension scaffold.

Completed Milestone 2: Selection mode and element highlighting.

Milestone 2.5: Product positioning and Capture architecture reset.

Revised Milestone 3: Reliable Element Capture.

Milestone 3 should eventually include:

- Click-to-lock selected element
- Tag, role, and dimensions
- Parent/child element navigation
- Source URL and page title
- Element screenshot capture and cropping
- Sanitized DOM snapshot
- Normalized computed style extraction
- Optional pseudo-element style extraction
- Semantic design-property summaries
- Capture Preview
- Creation of one valid CaptureRecord
- Local persistence of the completed CaptureRecord

Milestone 4: Personal Capture Library.

Future scope:

- Capture list
- Reopen capture
- Edit title
- Tags
- Notes
- Component type
- Delete
- Search
- Filter

Milestone 5: AI React + Tailwind Reconstruction.

Future scope:

- Screenshot plus structured CaptureRecord input
- React + Tailwind output
- Component name
- Component summary
- Approximation notes
- Save generated version

Milestone 6: Isolated Preview and Version Management.

Future scope:

- Isolated component preview
- Natural-language revision
- Regeneration
- Multiple generated versions
- Compare versions

Milestone 7: Export and Future Expansion.

Future scope may include:

- Code file export
- GitHub workflow
- Figma integration
- Additional frameworks
- Cloud sync
- Team collaboration

## 15. Success Criteria

The revised MVP is successful if a user can capture a UI element from a supported webpage, save it as a structured local asset, and later use it to generate a readable reusable React + Tailwind component.

For product and portfolio purposes, success means the project demonstrates:

- A real inspiration-to-reuse workflow
- Local-first capture and library thinking
- Clear differentiation from raw inspection and full-site cloning
- Accurate browser support boundaries
- Privacy-conscious data handling
- A stable CaptureRecord schema
- A focused milestone roadmap

The generated component does not need to be pixel-perfect. It should preserve core structure, visual style, layout intent, and reusable design properties.

## 16. Non-Goals

Element Catcher v0.1 will not include:

- Complete visual CSS editor
- Large typography, shadow, gradient, or spacing editing panels
- Full-page cloning
- Multi-page cloning
- Image scraping
- Video scraping
- Complete page HTML export
- Website publishing
- Figma export
- GitHub export
- Team collaboration
- Cloud sync
- Multiple framework generation
- Enterprise workflow
- Payment
- Authentication
- Drag-to-box selection unless later validated as necessary

## 17. Privacy and Ethical Boundaries

Element Catcher should be framed as a tool for personal design inspiration, study, and component recreation. It should not be positioned as a tool to steal UI, scrape media, bypass access controls, or extract confidential information.

Privacy safeguards should include:

- Keep CaptureRecords local by default.
- Do not save password values.
- Do not save input or textarea values by default.
- Limit captured text length.
- Sanitize DOM before persistence.
- Remove scripts and event-handler attributes.
- Avoid persisting hidden sensitive content.
- Warn before future AI transmission.

A later version may explore local-only model options, but this is not required for v0.1.
