# Manual Chrome Smoke Checklist

This checklist is for Milestone 9 Slice 2 execution on a real unpacked Chrome extension. No item is marked passed by this document. Do not treat this checklist as completed evidence until a reviewer records an actual run.

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

## Build and Load

- Run dependency installation if the local checkout has not already installed dependencies.
- Run the production build command.
- Open `chrome://extensions`.
- Enable Developer mode.
- Load the repository `dist/` directory as an unpacked extension.
- Confirm the extension card has no red errors.
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
- Confirm the UI reports unsupported or unavailable selection safely.
- Open a Chrome Web Store page.
- Attempt capture.
- Confirm the UI reports unsupported or unavailable selection safely.

## Final Review

- Confirm no manual item is marked passed unless it was actually executed.
- Confirm no GitHub Actions result is claimed from this manual run.
- Confirm no Chrome Web Store readiness or submission claim is made.
- Record final date, browser version, commit SHA, result, and notes in the Evidence Fields section or in a separate accepted Slice 2 evidence note.
