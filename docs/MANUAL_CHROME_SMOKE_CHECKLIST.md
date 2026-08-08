# Manual Chrome Smoke Checklist

This checklist records Milestone 9 Slice 2 execution on a real unpacked Chrome extension. The final real Chrome smoke result was confirmed by the user after the final implementation build.

The earlier real Chrome run found a reload blocker because Chrome recorded Side Panel modulepreload entries as extension Errors-page preload warnings/errors. After the local build fix, the final user-confirmed rerun passed without modulepreload recurrence.

## Evidence Fields

- Date:
- Reviewer:
- Commit SHA:
- Chrome version:
- Operating system:
- Extension ID:
- Backend configuration used: none / configured local backend
- Overall result: not run / pass / fail / blocked
- Notes:

## Final Recorded Manual Evidence

- Overall result: pass, confirmed by the user.
- Extension reload and Errors page: no new modulepreload errors, no new `preview-protocol.js` preload mismatch, no new `client.js` preload mismatch, and no new preload-unused errors.
- Authenticated/private ordinary HTTPS webpage capture: capture mode, hover, selection, confirmation, and save worked. This validates the intended product distinction between authenticated/private regular webpages and browser-protected surfaces, not universal compatibility with every private site.
- Browser-protected page boundary: `chrome://settings` remained unsupported, and reviewer-facing messaging correctly explains that many authenticated/private regular webpages can be captured while Chrome-protected surfaces cannot.
- Newly saved capture generation preparation: the previous "The saved capture could not be prepared for generation." failure is resolved; newly captured/saved data now reaches "AI generation backend integration is not configured yet."; backend-unconfigured behavior remains fail-closed; no generated version is fabricated.
- Library metadata, search, and persistence passed manual smoke.
- Side Panel console: no new red runtime errors.
- Service Worker console and final extension Errors check: no new red runtime errors and no reappearance of modulepreload errors.
- Generated-version-only GitHub and Bundle paths were not claimed as final manual Chrome coverage when no configured provider/generated version was available; their final evidence remains automated.

## Build and Load

- Run dependency installation if the local checkout has not already installed dependencies.
- Run the production build command.
- Open `chrome://extensions`.
- Enable Developer mode.
- Load the repository `dist/` directory as an unpacked extension.
- Confirm the extension card has no red errors.
- Confirm the extension Errors page does not record Side Panel modulepreload or cross-world extension resource mismatch entries for `/assets/preview-protocol.js`, `/assets/client.js`, or other Side Panel chunks.
- Inspect the extension card details for unexpected warnings.
- Open the Side Panel.
- Inspect the Side Panel console for unexpected errors.
- Inspect the service worker console for unexpected errors.

## Supported Page Capture

- Open a supported ordinary `http://` or `https://` webpage.
- Start capture from the Side Panel.
- Confirm hover highlighting appears on visible elements.
- Lock a hovered element.
- Use Parent refinement where available.
- Use Child refinement where available.
- Confirm the refined element.
- Confirm screenshot preview appears.
- Confirm capture metadata appears.
- Save the capture.
- Open an authenticated/private ordinary webpage that the reviewer can access in Chrome, where safe to test.
- Confirm the UI can enter capture mode and select a normal element without implying universal private-site compatibility.

## Persistence and Library

- Open the Capture Library.
- Reopen the saved capture.
- Confirm screenshot and metadata persist.
- Edit title.
- Edit component type.
- Edit tags.
- Edit notes.
- Confirm edited metadata persists after leaving and reopening the detail view.
- Use search.
- Use filter.
- Delete a disposable capture and confirm it is removed.
- Reload the extension.
- Reopen the Side Panel.
- Confirm saved captures still appear after reload.

## Generation Paths

- With no configured backend/provider, attempt generation from a saved capture.
- Confirm unavailable-backend or transport failure behavior is bounded and user-facing.
- Confirm no provider secret is requested inside extension UI storage.
- With configured local backend/provider, review generation outbound data.
- Confirm explicit consent is required before sending.
- Confirm a successful configured generation creates a generated version when the backend/provider path is available.
- Confirm failed configured generation remains retryable or safely closed.

## Preview, Revision, Regeneration, and Comparison

- Expand a generated-version row.
- Choose Preview.
- Confirm preview either renders through the accepted sandbox path or reports unsupported source while keeping code visible.
- Start Revision from an existing generated version.
- Confirm the Review shows outbound data before consent.
- Complete Revision only when configured backend/provider use is intended.
- Start Regeneration from an existing generated version.
- Confirm the Review shows outbound data before consent.
- Complete Regeneration only when configured backend/provider use is intended.
- Select two generated versions for the same capture.
- Confirm Comparison opens.
- Confirm Baseline and Candidate are distinct.
- Use Swap.
- Confirm source diff is visible.
- Confirm Comparison does not automatically Preview or execute generated source.

## Exports

- Expand one generated-version row.
- Choose `Export .tsx`.
- Confirm a browser download is initiated.
- Inspect the downloaded `.tsx` file and confirm it contains exact generated source only.
- Review `Export to GitHub` wording.
- Confirm normal runtime is fail-closed, says GitHub export is not configured in normal runtime, and states that real GitHub authorization, OAuth, token storage, real GitHub REST transport, and production GitHub writes are not implemented.
- Confirm any deterministic fake/development GitHub Review and Success states are labeled as fake/development only and not production GitHub integration.
- Confirm no real GitHub authorization, OAuth exchange, token storage, real GitHub REST transport, or production GitHub write is claimed.
- Choose `Export bundle`.
- Confirm a browser ZIP download is initiated and the visible status says Bundle V1 is local source-only and not runnable or dependency-complete.
- Inspect ZIP contents.
- Confirm Bundle V1 contains exactly `README.md`, `element-catcher.json`, and `src/<ComponentName>.tsx`.
- Confirm Bundle V1 is source-only and does not include dependencies, `package.json`, Tailwind configuration, build configuration, lockfiles, screenshots, CaptureRecord JSON, or deployment files.

## Unsupported Chrome Pages

- Open `chrome://extensions` or another restricted Chrome page.
- Attempt capture.
- Confirm the UI reports that regular webpages the user can access in Chrome, including many authenticated or private pages, are supported while Chrome-protected pages such as `chrome://` and the Chrome Web Store cannot be captured.
- Open a Chrome Web Store page.
- Attempt capture.
- Confirm the UI reports unsupported selection without implying authenticated/private ordinary webpages are unsupported.

## Final Review

- Confirm no manual item is marked passed unless it was actually executed.
- Confirm no GitHub Actions result is claimed from this manual run.
- Confirm no Chrome Web Store readiness or submission claim is made.
- Record final date, browser version, commit SHA, result, and notes in the Evidence Fields section or in a separate accepted Slice 2 evidence note.
