# Element Catcher Portfolio Demo Guide

This guide supports a 3-5 minute interviewer demo of the completed v0.1 portfolio build.

Element Catcher is a local-first Chrome extension that captures visible UI elements from supported webpages and turns those references into reusable React + Tailwind components. The strongest demo path is local Interaction Reconstruction, because it shows the product differentiator without requiring a paid provider.

## Demo Goal

Show this story clearly:

```text
Capture -> Save -> Interaction Pair -> Interactive Reconstruction -> Safe Preview -> Export
```

Recommended example:

```text
More button -> hover or toggle -> dropdown appears
```

Use any supported ordinary webpage with a simple visible interaction pattern. A menu, dropdown, toggle panel, focus state, or call-to-action reveal works well.

## Setup

Prerequisites:

- Node.js 20 or newer.
- npm.
- Google Chrome with extension Developer mode enabled.
- A supported `http://` or `https://` page the user can already access.

Build:

```bash
npm install
npm run build
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select the repository `dist/` directory.
5. Open Element Catcher from the extension icon or Side Panel entry.

Expected result: the Side Panel opens without extension errors.

## Part A - Capture

Goal: show Element Catcher collecting an element-level reference directly from the browser session.

1. Open a supported ordinary webpage.
2. Open the Element Catcher Side Panel.
3. Choose Start Capture.
4. Hover a meaningful UI element.
5. Click to lock the candidate.
6. Use Parent or Child refinement if it improves the selected boundary.
7. Confirm the selected element.
8. Save the capture.
9. Open the Capture Library.

What to say:

> Element Catcher captures at the element level, not the whole page. It stores a structured CaptureRecord and a screenshot locally, then lets me organize the result in a Capture Library.

Expected visible result: the saved capture appears in the Capture Library with its thumbnail, title, component type, source display, and saved time.

## Part B - Interaction Capture

Goal: show the key product insight that interaction states are explicit references, not hidden event-system reverse engineering.

Capture at least two related states:

- **Trigger / Before:** for example, a More button before interaction.
- **Primary Reaction:** for example, the dropdown after hover/toggle/click.
- **Additional Reaction:** optional extra visible UI that appears at the same time.

Create the Interaction Pair:

1. In Capture Library, choose the Trigger / Before capture.
2. Choose the Primary Reaction capture.
3. Optionally select Additional Reactions.
4. Select the interaction type: click, toggle, hover, or focus.
5. Add a short title such as `More menu hover`.
6. Save the Interaction Pair.

What to say:

> A dropdown is often not just the same node changing state. M11 models the product truth explicitly: Trigger / Before plus Interaction plus visible Reaction states.

Expected visible result: the Interaction Pair detail shows the transition, referenced captures, and reaction surfaces.

## Part C - Interactive Reconstruction

Goal: show the strongest local portfolio capability.

1. Open the saved Interaction Pair.
2. Choose Reconstruct interaction.
3. Review the reconstruction data and privacy copy.
4. Explain that source URL, page title, cookies, browser storage, credentials, and browser session are excluded.
5. Check the consent box.
6. Generate the interactive reconstruction.
7. Open the safe interactive preview.
8. Perform the interaction in the preview.
9. Show the reaction appearing.
10. Show the React + Tailwind source.
11. Export `.tsx`.

What to say:

> M12 reconstructs a bounded interactive component from sanitized DOM, text, style, and layout projections. The preview uses a validated declarative plan; it does not execute arbitrary generated source inside the preview realm.

Expected visible result: preview rest state shows the trigger, the active state shows the reaction, and the source/export controls are visible.

## Optional Secondary Demo - Static AI Generation

Use this only when a reviewer intentionally configures the local backend/provider.

Required environment:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `ELEMENT_CATCHER_EXTENSION_ORIGIN`

Run:

```bash
npm run build
npm run start:backend
```

Demo path:

1. Reopen a saved capture.
2. Start generation.
3. Review the outbound data.
4. Consent only if the provider path is intentionally configured.
5. Wait for the generated React + Tailwind version.
6. Preview if the source passes the Previewable Subset V1 gate.
7. Optionally revise, regenerate, compare, or export.

What to say:

> Static AI generation is consent-gated and backend-mediated. Provider secrets stay server-side, and generated versions are stored separately from the original capture.

## Optional Export Demos

Exact `.tsx` export:

1. Expand a generated or reconstructed source row.
2. Choose Export `.tsx`.
3. Inspect the downloaded file.

Expected result: one UTF-8 `.tsx` file with exact persisted source bytes.

Bundle V1 ZIP export:

1. Expand a generated-version row.
2. Choose Export bundle.
3. Inspect the ZIP.

Expected result:

```text
README.md
element-catcher.json
src/<ComponentName>.tsx
```

Deterministic fake/development GitHub export:

1. Expand a generated-version row.
2. Choose Export to GitHub.
3. Use only the deterministic fake/development workflow.
4. Review and confirm the fake create/update.

Expected result: fake/development success only. Do not present this as production GitHub integration.

## Boundaries To State Out Loud

- Element Catcher v0.1 is a portfolio build, not production SaaS.
- Capture works on supported ordinary pages where Chrome allows extension access.
- The product must not bypass auth, paywalls, permissions, browser restrictions, or inaccessible iframes.
- Interactive Reconstruction is bounded visual approximation, not pixel-perfect cloning.
- Source-site JavaScript, cookies, browser storage, credentials, browser session, and hidden app state are not reconstructed.
- Preview uses restricted declarative plans and does not execute arbitrary generated code.
- Real GitHub OAuth, token storage, production repository writes, PRs, releases, deployments, and GitHub Pages are not implemented.

## Common Recovery Notes

- If the Side Panel looks stale after rebuilding, reload the extension from `chrome://extensions` and reopen the Side Panel.
- If Start Capture is unavailable on a restricted page, switch to a supported ordinary webpage.
- If provider-backed generation is unavailable, continue with Interaction Reconstruction, Capture Library, preview, and export.
- If preview rejects static generated source, explain that Previewable Subset V1 is intentionally restricted.

## Portfolio Assets

Deterministic documentation screenshots live in [`docs/assets/`](assets/):

- [`capture-library.png`](assets/capture-library.png)
- [`interaction-pair.png`](assets/interaction-pair.png)
- [`interactive-reconstruction-review.png`](assets/interactive-reconstruction-review.png)
- [`interactive-preview-rest.png`](assets/interactive-preview-rest.png)
- [`interactive-preview-active.png`](assets/interactive-preview-active.png)
