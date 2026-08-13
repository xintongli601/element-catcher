# Milestone 12 - Interactive Reconstruction

Status: Completed / Accepted at `e56e00872d1bd4d15e3d19b666804d0ff5a2a308`

Baseline: M11 Completed / Accepted at `5efef21b85167bbe0dc091231343b8ef51afe2bf`.

## Objective

Milestone 12 turns a complete `InteractionPairV1` into a bounded reusable React + Tailwind interactive component without reading or executing source-site application logic.

## Implemented Scope

- Side Panel workflow from an opened Interaction Pair to Interactive Reconstruction.
- Fail-closed reconstruction start when Trigger / Before, Primary Reaction, or any Additional Reaction capture is missing.
- Review model based on `InteractionReconstructionRequestWithoutDataUrlsV1`, with verified screenshot metadata/digest for lineage and completeness.
- Explicit local consent before generation.
- Privacy projection that excludes source URL, page title, cookies, browser storage, credentials, and browser session.
- Deterministic local source generation for click, toggle, hover, and focus.
- Bounded visual reconstruction from sanitized DOM text, child summaries, computed-style projection, layout hints, color, spacing, typography, border, radius, and shadow signals.
- Bounded `InteractivePreviewPlanV1` rendered inside the existing isolated preview render realm from the same declarative visual mapper used by the exported source.
- Display of generated source as inert text; generated source is not executed inside Element Catcher preview.
- Separate IndexedDB persistence store: `interactionReconstructions`.
- Reopen, delete, and exact `.tsx` export for persisted interactive reconstructions.

The local deterministic V1 visual mapper does not read screenshot pixels, does not infer hidden source-site business logic, and does not run source-site code. Screenshot asset metadata and digest are verified to prove the reviewed captures are complete and unchanged; visual approximation comes from bounded capture projections.

## Safety Boundaries

M12 keeps the implementation data-oriented and fail-closed:

- no `eval`;
- no `new Function`;
- no `dangerouslySetInnerHTML`;
- no script tags in persisted interactive reconstruction source;
- no CSP weakening;
- no source-site JavaScript execution;
- no backend/provider/network call before consent;
- no CaptureRecord v1 schema change;
- no Manifest permission change.
- no screenshot-pixel reconstruction or image-to-code inference.

## Validation

Focused M12 validation:

- `npm run build:extension`: PASS.
- `npx playwright test tests/e2e/interaction-reconstruction-12.spec.ts`: `6 passed / 0 failed / 0 skipped / 0 did not run`.

Backend tests are not required because M12 does not change backend files or network/provider behavior.
