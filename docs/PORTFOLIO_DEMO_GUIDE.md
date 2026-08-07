# Element Catcher Portfolio Demo Guide

This guide is for an external reviewer evaluating the portfolio-ready local v0.1 demonstration.

Element Catcher is not production-ready, SaaS, store-ready, deployed, or production GitHub-integrated. The default demo path requires no provider secret and focuses on local extension behavior.

## 1. Prerequisites

- Node.js 20 or newer.
- npm.
- Google Chrome with extension Developer mode enabled.
- A supported ordinary `http://` or `https://` webpage for capture.

Unsupported capture targets include `chrome://` pages, Chrome Web Store pages, browser-controlled UI, inaccessible cross-origin iframe contents, closed shadow roots, and pages where the content script is blocked or unavailable.

## 2. Checkout and Install

Check out the repository:

```bash
git clone https://github.com/xintongli601/element-catcher.git
cd element-catcher
```

Install dependencies:

```bash
npm install
```

## 3. Build and Load the Extension

Create the production extension build:

```bash
npm run build
```

Load the unpacked extension:

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on Developer mode.
4. Choose Load unpacked.
5. Select the repository `dist/` directory.
6. Open Element Catcher from the extension icon or Side Panel entry.

Expected visible outcome: Chrome shows an Element Catcher extension card without red extension errors, and the Side Panel opens.

## 4. Default Local Extension Demonstration

Use this path when no provider backend is configured.

1. Open a supported ordinary webpage.
2. Open the Element Catcher Side Panel.
3. Start capture.
4. Hover a visible UI element.
5. Click to lock the candidate.
6. Use Parent and Child refinement where available.
7. Confirm the selected element.

Expected visible outcome: the Side Panel shows captured element information, screenshot preview, and local Save controls.

Save and organize:

1. Save the capture.
2. Open the Capture Library.
3. Reopen the saved capture.
4. Edit title, component type, tags, or notes.
5. Use search and filtering.
6. Delete a capture only when deletion behavior is intentionally being reviewed.

Expected visible outcome: capture metadata and screenshot persist after Library reopen, and edited user-managed fields are reflected locally.

Unavailable-backend behavior:

- Generation, revision, and regeneration require the configured local backend/provider path.
- When the backend is unavailable or unconfigured, the UI should fail safely with a bounded user-facing error.
- The default local extension demonstration should not require `OPENAI_API_KEY`, `OPENAI_MODEL`, or `ELEMENT_CATCHER_EXTENSION_ORIGIN`.

## 5. Optional Configured Generation Demonstration

Use this path only when the reviewer intentionally configures the local backend/provider.

Required backend configuration is read from environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `ELEMENT_CATCHER_EXTENSION_ORIGIN`

The backend listens on `127.0.0.1:8787` after it is built and started with the documented project scripts:

```bash
npm run build
npm run start:backend
```

Expected visible outcome: after explicit Review and consent, generation can send the approved screenshot and structured projection through the configured local backend/proxy. Provider secrets remain backend-only.

Consent-gated generation:

1. Reopen a saved capture.
2. Start generation.
3. Review the exact outbound data shown by Element Catcher.
4. Consent only if the outbound projection is acceptable.
5. Wait for a generated React + Tailwind source version.

Expected visible outcome: generated source is saved as a separate generated version linked to the capture. The original capture remains unchanged.

## 6. Preview, Revision, Regeneration, and Comparison

Preview:

1. Expand a generated version.
2. Choose Preview.
3. Review the result or unsupported-source state.

Expected visible outcome: only source that passes Previewable Subset V1 renders through the isolated preview sandbox. Unsupported or unsafe generated source remains visible as inert source text.

Previewable Subset V1 limitations:

- No universal generated-code execution.
- No arbitrary React, TypeScript, JavaScript, CSS, Tailwind runtime, imports, hooks, browser APIs, timers, workers, storage, navigation, remote assets, generated CSS, `eval`, or `Function` execution.
- Rendering is not a production security proof, compile guarantee, or rendering correctness guarantee.

Revision and regeneration:

1. Select an existing generated version.
2. Choose Revise or Regenerate.
3. Review the approved outbound data.
4. Consent only if the configured backend/provider path is intended.
5. Confirm that successful results create new immutable generated versions.

Expected visible outcome: revision or regeneration appends a new generated version and leaves the original capture and earlier generated versions unchanged.

Comparison:

1. Select two distinct generated versions for the same capture.
2. Choose Baseline and Candidate.
3. Use Swap if needed.
4. Review metadata and source diff.

Expected visible outcome: comparison is local, read-only, and ephemeral. It does not execute source, call the backend, or persist comparison state.

## 7. Export Demonstrations

Exact local `.tsx` export:

1. Expand one generated-version row.
2. Choose `Export .tsx`.
3. Inspect the downloaded file.

Expected visible outcome: the browser downloads exactly one UTF-8 `.tsx` file containing the selected persisted `entry.value.code` bytes. The export does not transform, format, parse, compile, execute, or add metadata.

Deterministic fake/development GitHub workflow:

1. Expand one generated-version row.
2. Choose `Export to GitHub`.
3. In deterministic fake/development mode only, select one repository and existing branch.
4. Enter or confirm one repository-relative `.tsx` path and a bounded single-line commit message.
5. Review the frozen create/update summary.
6. Explicitly confirm the fake/development write.

Expected visible outcome: deterministic fake/development mode can show a verified fake single-file create/update success, with Review and Success states labeled as development/fake only and not production GitHub integration. Normal runtime remains fail-closed and explicitly states that real GitHub authorization, OAuth, token storage, real GitHub REST transport, and production GitHub writes are not implemented.

Never claim real GitHub integration. Element Catcher does not implement real GitHub authorization, OAuth exchange, token storage, real GitHub REST transport, production GitHub writes, repository creation, branch creation, pull requests, workflows, Actions, releases, deployments, or GitHub Pages.

Bundle V1 ZIP export:

1. Expand one generated-version row.
2. Choose `Export bundle`.
3. Inspect the downloaded ZIP.

Expected visible outcome: Bundle V1 contains exactly:

```text
README.md
element-catcher.json
src/<ComponentName>.tsx
```

The visible download status should state that Bundle V1 is local source-only and is not a runnable or dependency-complete project.

Bundle V1 is source-only. It is not an npm package, runnable application, dependency-complete project, production-ready scaffold, compile guarantee, publishing workflow, or deployment workflow.

## 8. Common Unsupported or Unavailable States

- Unsupported pages cannot be selected.
- The Side Panel may need reload after extension rebuild.
- Cross-origin iframe contents and closed shadow roots are unavailable.
- Generation, revision, and regeneration are unavailable without a configured local backend/provider.
- Preview may reject valid-looking generated source that is outside Previewable Subset V1.
- Normal runtime GitHub export is fail-closed and not configured for real GitHub.
- Bundle V1 and `.tsx` export do not prove the source compiles or runs in a project.

## 9. Claims to Avoid

Never claim in a portfolio demonstration that Element Catcher v0.1 is:

- production-ready;
- Chrome Web Store ready or submitted;
- deployed as a production hosted service;
- SaaS or multi-user;
- backed by an account system, cloud sync, or collaboration;
- integrated with real GitHub;
- able to execute arbitrary generated code safely;
- an npm package generator;
- a runnable project generator;
- a publishing or deployment workflow;
- dependency-complete or guaranteed to compile.
