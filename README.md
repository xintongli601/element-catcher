# Element Catcher

Element Catcher is a local-first Chrome extension for capturing UI inspiration from supported webpages, saving it into a personal Capture Library, organizing it, and rebuilding it as reusable React + Tailwind source code.

The product direction is:

```text
Capture -> Save -> Organize -> Rebuild -> Preview -> Reuse
```

Milestones 1 through 5 are completed. Milestone 6 is the current milestone and is reserved for isolated preview and version management. Generated code is currently displayed only as inert source text; it is not rendered, executed, revised, compared, or exported by the extension.

## Current Capabilities

- Capture supported visible webpage elements with hover highlighting, click-to-lock selection, Parent/Child refinement, and Confirm.
- Build a complete `CaptureRecord v1` with source context, viewport data, selected-element metadata, sanitized DOM, normalized styles, summaries, and screenshot asset reference.
- Save captures locally in IndexedDB with persisted screenshot Blobs.
- Reopen saved captures in a local Capture Library.
- Edit user-managed title, component type, tags, and notes.
- Delete captures atomically.
- Search and filter the local Capture Library.
- Review exact AI-generation outbound data before transmission.
- Require explicit consent before sending the screenshot and approved structured projection through the configured backend.
- Generate React + Tailwind component source through the provider-neutral transport and local backend/proxy when configured.
- Save generated versions locally in a separate `generatedComponentVersions` store linked to the source capture.
- Display generated code as inert plain text.

## Local-First and AI Boundary

Captures remain local by default. Saved `CaptureRecord` metadata and screenshot assets are stored under the extension origin in IndexedDB. Generated versions are stored separately from the original capture, and generation does not mutate the original `CaptureRecord`.

AI generation uses the configured local backend/proxy path. The extension does not contain provider API keys, and provider secrets must remain server-side. Before any generation request is sent, Element Catcher shows the exact approved outbound projection and requires explicit consent. The outbound contract excludes source URL, page title, local persistence identifiers, screenshot storage keys, browser storage, cookies, and raw wrappers.

The local proxy is a development/demo topology. It is not a production multi-user backend, and it does not add authentication, quotas, budgets, abuse monitoring, or hosted operations.

No real OpenAI request was made during automated acceptance. The provider adapter and loopback path were validated deterministically without committing or exposing a real API secret.

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
- Milestone 2: Selection mode and element highlighting on supported ordinary webpages.
- Milestone 2.5: Product positioning and Capture architecture reset, including the `CaptureRecord v1` schema.
- Milestone 3: Reliable element capture, CaptureRecord assembly, screenshot asset persistence, Capture Preview, and explicit local Save.
- Milestone 4: Personal Capture Library with list, reopen, metadata editing, deletion, search, and filtering.
- Milestone 5: AI React + Tailwind reconstruction with explicit Review data, consent-gated transport, local backend/proxy integration, Responses API adapter, and separate local generated-version persistence.

Current milestone:

- Milestone 6: Isolated Preview and Version Management.

See `docs/ROADMAP.md` for the authoritative milestone status and sequencing.

## Supported Page Limitations

- Selection mode is limited to supported `http://` and `https://` webpages where the content script is available.
- Element Catcher can support many login-only, intranet, permissioned, dynamic, and localhost pages, but it does not work on every visible browser page.
- Restricted pages such as `chrome://` pages, Chrome Web Store pages, browser-controlled UI, and some extension pages cannot be selected.
- Cross-origin iframe contents are not accessible to the extension.
- Closed shadow roots and browser UI cannot be inspected.
- The product must not bypass access controls or capture content the user cannot already view.

## Current Roadmap

- Milestones 1-5: Completed.
- Milestone 6: Current. Isolated generated-component preview, natural-language revision, regeneration management, multiple-version management, and comparison remain unimplemented.
- Milestone 7: Planned. Export and future expansion remain unimplemented.

## Intentionally Unimplemented

- Isolated rendered preview of generated code.
- Natural-language revision.
- Regeneration management.
- Version comparison.
- Export.
- Figma export.
- Authentication, hosted production multi-user backend operations, cloud sync, team collaboration, payments, quotas, and account management.
