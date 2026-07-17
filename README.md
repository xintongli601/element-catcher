# Element Catcher

Element Catcher is a local-first Chrome extension project for capturing UI inspiration from supported webpages and rebuilding it as reusable front-end code. The product is aimed at designers, product managers, front-end learners, and indie makers who want a faster way to collect, organize, study, and reuse interface patterns from pages they can already view in their own browser.

The refined positioning is: "Capture UI inspiration. Rebuild it as reusable code." Element inspection, dimensions, CSS viewing, element screenshots, and Tailwind export are useful supporting capabilities, but the product's core direction is the full workflow: Capture -> Save -> Organize -> Rebuild -> Preview -> Reuse.

Milestone 3A supports a focused locked-selection workflow. The extension can be built, loaded as an unpacked Chrome extension, opened as a side panel, and used to start selection mode on ordinary supported webpages. Hovered DOM elements receive a temporary overlay highlight, clicking locks the highlighted element, Parent and Child controls refine along a deterministic path, and Confirm returns the final selected metadata. Milestone 3B.1 adds a privacy-safe intermediate DOM extraction package for confirmed selections, Milestone 3B.2 adds bounded normalized style extraction and semantic summaries, and Milestone 3C adds current-viewport screenshot capture with bounded element cropping. Screenshots are still temporary; local capture storage, Capture Library, and AI generation are intentionally not implemented yet.

## Prerequisites

- Node.js 20 or newer
- npm
- Google Chrome with extension developer mode enabled

## Installation

Install project dependencies:

```bash
npm install
```

## Development

Start the Vite development server for the side panel UI:

```bash
npm run dev
```

Create a production extension build:

```bash
npm run build
```

Preview the built side panel UI:

```bash
npm run preview
```

## Loading the Extension in Chrome

1. Run `npm run build`.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select the generated `dist/` directory.
6. Click the Element Catcher extension icon to open the side panel.

## Completed Milestones

- Milestone 1: Chrome Extension Manifest V3 scaffold, TypeScript build setup, React side panel, background service worker, content script entry, and plain CSS UI.
- Milestone 2: Selection mode and element highlighting on supported ordinary webpages, including hover overlay, click-to-select, Escape cancellation, cleanup, and minimal selected-element confirmation.
- Milestone 2.5: Product positioning and Capture architecture reset, including the `CaptureRecord v1` schema in `docs/CAPTURE_SCHEMA.md`.

See `docs/ROADMAP.md` for the authoritative milestone status and sequencing.

## Selection Mode

Open the Element Catcher side panel and click `Start Capture` on an ordinary webpage. Move the pointer across page elements to preview the current target with a temporary overlay, then click the highlighted element to lock it. Use `Parent` or `Child` to refine the locked target along the deterministic refinement path, then click `Confirm` to select the final element. Press `Escape` or use the side panel `Cancel` button to leave selection mode without selecting anything.

Selection mode records only in-memory capture metadata for this stage: tag name, bounding rectangle, page URL, optional short text preview, optional element ID, optional class names, optional semantic role, a privacy-safe intermediate DOM/style extraction package after Confirm, and a temporary cropped screenshot of the currently visible viewport area. It does not save captures locally.

## Capture Architecture

The future capture workflow is:

```text
Raw webpage element
  -> Capture extractor
  -> Normalized CaptureRecord
  -> Local Capture Library
  -> AI component generator
  -> Generated component versions
  -> Reuse or export
```

The normalized `CaptureRecord` is planned as the source of truth for Capture Preview, local library entries, search, AI generation, generated component versions, and future export. Raw DOM references will not be persisted.

## Known Limitations

- Selection mode is limited to supported `http://` and `https://` webpages where the content script is available.
- Element Catcher can support many login-only, intranet, permissioned, dynamic, and localhost pages, but it does not work on every visible browser page.
- Restricted pages such as `chrome://` pages, Chrome Web Store pages, browser-controlled UI, and some extension pages cannot be selected.
- Cross-origin iframe support is not implemented in Milestone 2.
- Closed shadow roots and browser UI cannot be inspected.

## Revised Roadmap

- Milestone 3: Reliable Element Capture, including locked selection, parent/child navigation, source URL and page title, screenshot capture and cropping, sanitized DOM snapshot, normalized computed style extraction, semantic summaries, Capture Preview, one valid `CaptureRecord`, and local persistence.
- Milestone 4: Personal Capture Library with list, reopen, edit title, tags, notes, component type, delete, search, and filter.
- Milestone 5: AI React + Tailwind Reconstruction using screenshot plus structured CaptureRecord input, saving generated versions.
- Milestone 6: Isolated Preview and Version Management with preview, natural-language revision, regeneration, multiple versions, and comparison.
- Milestone 7: Export and Future Expansion, potentially including code file export, GitHub workflow, Figma integration, additional frameworks, cloud sync, and team collaboration.

## Intentionally Unimplemented

- Complete `CaptureRecord` creation
- Stable screenshot asset storage
- Capture preview
- Local capture library storage
- Capture Library search and organization
- React + Tailwind component generation
- AI API integration
- Figma export
- Authentication, backend services, cloud sync, and payments
