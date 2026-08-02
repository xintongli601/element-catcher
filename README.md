# Element Catcher

Element Catcher is a local-first Chrome extension for capturing UI inspiration from supported webpages, saving it into a personal Capture Library, organizing it, and rebuilding it as reusable React + Tailwind source code.

The product direction is:

```text
Capture -> Save -> Organize -> Rebuild -> Preview -> Reuse
```

Milestones 1 through 6 are completed. Milestone 6 delivered isolated preview and generated-version management: safe explicit Preview, revision, regeneration, and local generated-version comparison. Milestone 7 is current. Milestone 7A is completed for narrow local generated-source export. Milestone 7B is current for GitHub export feasibility and security architecture only; runtime GitHub export is not implemented. Generated code is displayed as source text unless the user explicitly chooses Preview, and only source that passes the Milestone 6C previewable-source gate can be rendered from a data-only render plan in the isolated sandbox.

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
- Display generated code as plain text and keep it copyable even when preview fails.
- Preview a strict subset of generated React + Tailwind source through an explicit Preview action, an AST-based previewable-source gate, a data-only render plan, and two isolated sibling packaged sandbox frames.
- Keep generated source out of the sandbox render realm; the render realm receives only a validated `PreviewRenderPlanV1`.
- Render approved class tokens through a source-controlled bounded utility stylesheet whose selectors are kept in exact parity with the preview class-token registry.
- Select an existing persisted V1 or V2 generated version and request either bounded natural-language Revision or instruction-free Regeneration.
- Review the exact approved revision/regeneration outbound request data and provide explicit consent before transport.
- Persist successful revision/regeneration results as new immutable V2 generated-version entries with deterministic target IDs and lineage to the exact selected source version.
- Keep existing `CaptureRecord` data, screenshot assets, V1 versions, V2 source versions, and earlier versions immutable during revision/regeneration.
- Keep revised and regenerated source inert until the user separately chooses Preview through the accepted Milestone 6C sandbox boundary.
- Compare exactly two distinct persisted generated versions for the same source capture through explicit Baseline and Candidate selection, Swap, metadata comparison, bounded internal LCS source diff, and complete original source display.
- Keep comparison local, deterministic, read-only, ephemeral, and separate from Preview, revision, regeneration, persistence, backend/provider/OpenAI calls, source pages, content scripts, service workers, and remote origins.
- Export one explicitly selected persisted generated version from an expanded Saved Capture Detail row through `Export .tsx`.
- Save exactly the persisted `entry.value.code` as one UTF-8 `.tsx` browser download with no line-ending normalization, trimming, formatting, parsing, transpilation, injected comments, metadata header/footer, or automatic final newline.
- Use a deterministic suggested filename derived only from the validated persisted `componentName`, with no capture ID, generated-version ID, source URL, page title, timestamp, or random suffix.
- Reread the authoritative IndexedDB generated-version entry at export time, require exact displayed-entry equality and `sourceCaptureId` ownership, and fail closed for missing, altered, invalid, unsafe, or wrong-capture entries.
- Keep export Preview-independent, explicit, local, read-only, source-only, and separate from Comparison, Revision, Regeneration, backend/provider/OpenAI calls, runtime/tab messages, source pages, iframes, clipboard, File System Access API, and IndexedDB writes.
- Use a trusted Side Panel UTF-8 Blob, temporary object URL, and temporary anchor download path. Milestone 7A added no `chrome.downloads`, no `downloads` permission, no optional permission, no Manifest change, no host-permission change, and no dependency.
- Define Milestone 7B GitHub export architecture for a future explicit `Export to GitHub` action that would write exactly one selected generated version's exact source to one user-selected repository, existing branch, and `.tsx` path after a frozen Review. No GitHub authentication, backend gateway, token storage, remote write, Manifest permission, host permission, or dependency exists yet.

## Local-First and AI Boundary

Captures remain local by default. Saved `CaptureRecord` metadata and screenshot assets are stored under the extension origin in IndexedDB. Generated versions are stored separately from the original capture, and generation does not mutate the original `CaptureRecord`.

AI generation, revision, and regeneration use the configured local backend/proxy path. The extension does not contain provider API keys, and provider secrets must remain server-side. Before any generation, revision, or regeneration request is sent, Element Catcher shows the exact approved outbound projection and requires explicit consent. The outbound contract excludes source URL, page title, local persistence identifiers, screenshot storage keys, browser storage, cookies, notes, raw idempotency keys, and raw wrappers.

The local proxy is a development/demo topology. It is not a production multi-user backend, and it does not add authentication, quotas, budgets, abuse monitoring, or hosted operations.

No real OpenAI request was made during automated acceptance. The provider adapter and loopback path were validated deterministically without committing or exposing a real API secret.

Milestone 6C was accepted on remote baseline `8af49fd68fcdb6169eb9517a8aacadc5e36fe477` (`test: close safe preview security regressions`), retaining the implementation commits `1704b7c7d83fd288dd56bc0f2f4861ee359911c9` (`feat: implement safe generated component preview`) and `291d5b381210cd9a93906724c9e7785e377e7d66` (`fix: complete safe preview lifecycle and styling`). Its reported acceptance validation was two focused preview-suite runs with 38 passing tests each, backend tests with 6 passing tests, full Playwright regression with 146 passing tests and 1 documented loopback skip, `npm audit --omit=dev` with 0 vulnerabilities, no external preview request, and strict sandbox CSP retained. These results document the accepted Milestone 6C baseline; they are not a general security proof.

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

## Testing

Run the extension E2E suite headlessly by default:

```bash
npm run test:e2e
```

The Playwright extension fixture uses Playwright's bundled Chromium with an isolated temporary browser profile for each test context. Visible browser execution is an explicit diagnostic mode only: set `PW_HEADED=1` or run `npm run test:e2e:headed` when a visible run has been deliberately requested. Automated tests should not open the user's ordinary Chrome profile.

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

Completed Milestone 6:

- Milestone 6: Isolated Preview and Version Management.
  - Milestone 6A: Completed. Architecture and threat model.
  - Milestone 6B: Completed. Sandbox runtime foundation with trusted packaged fixtures.
  - Milestone 6C: Completed. Production safe generated-component preview for the approved Previewable Subset V1.
  - Milestone 6D: Completed. Regeneration and natural-language revision.
  - Milestone 6E: Completed. Local generated-version comparison and final Milestone 6 regression closure.

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
- Milestone 6: Completed. Milestone 6A, 6B, 6C, 6D, and 6E are Completed.
- Milestone 7: Current. Milestone 7A is Completed for local exact-source `.tsx` export of one selected persisted generated version. Milestone 7B is Current for GitHub export architecture only.

## Intentionally Unimplemented

- Full arbitrary generated-code execution.
- Full React, TypeScript, JavaScript, CSS, or Tailwind runtime compatibility.
- Dynamic Tailwind class evaluation, generated CSS, arbitrary CSS execution, external assets, imports, hooks, browser APIs, timers, workers, storage, navigation, or network access from generated source.
- Screenshot-pixel, rendered-output, cross-capture, three-way, or multi-version comparison.
- Comparison scoring, winner selection, merging, or editing.
- Export beyond the narrow Milestone 7A local single-version `.tsx` source-export path.
- ZIP/package export.
- Multi-file export.
- Runtime GitHub export, repository creation, branch creation, pull requests, workflow creation, Actions execution, releases, deployments, GitHub Pages, background sync, and credential storage.
- Figma export.
- Authentication, hosted production multi-user backend operations, cloud sync, team collaboration, payments, quotas, and account management.
