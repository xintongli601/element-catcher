# Milestone 6D Revision Architecture

## 1. Status and Scope

Milestone 6D is Current. This document closes the architecture for natural-language revision and regeneration planning only. It does not implement 6D runtime behavior, does not mark Milestone 6D Completed, and does not mark Milestone 6 Completed.

Milestones 1 through 5, 6A, 6B, and 6C are Completed. Milestone 6E remains Planned for version comparison and final Milestone 6 regression closeout.

6D must preserve the accepted 6C execution boundary:

- revised output remains inert response data until persisted and explicitly previewed;
- generated source reaches only the packaged sandbox host during Preview;
- the render realm receives only `PreviewRenderPlanV1`;
- Previewable Subset V1 and Protocol V2 remain unchanged;
- no Tailwind runtime, CDN, generated CSS, eval, `Function`, WebAssembly, worker execution, `srcdoc`, Blob execution, or data URL execution is introduced;
- unsupported generated source remains visible and copyable;
- failure, cancellation, Retry, and stale continuations cannot mutate the source generated version or original `CaptureRecord`.

Out of scope for this documentation task:

- extension runtime code changes;
- backend implementation changes;
- storage migration implementation;
- provider calls or real OpenAI requests;
- test changes;
- package, lockfile, Manifest, CSP, preview protocol, preview policy, or build changes;
- production approval or implementation.

Production approval gate: implementation may begin only after independent architecture approval confirms that this document is internally consistent, implementation-ready, and preserves Milestone 5 consent plus Milestone 6C preview isolation.

## 2. Current Contract Inventory

The current repository is authoritative. Earlier reports are superseded where they conflict with the inspected code.

| Contract or subsystem | Current version | Authoritative file | Immutable guarantees | Milestone 6D impact |
| --- | --- | --- | --- | --- |
| CaptureRecord | `schemaVersion: 1` | `extension/src/shared/capture-schema.ts`, `extension/src/capture/capture-record-v1.ts` | JSON-compatible source record; screenshot is an asset reference; source URL and page title are stored locally; `generatedVersions` compatibility field is not mutated by Milestone 5 generation. | 6D must not mutate CaptureRecord. Revision lineage points to the separate generated-version store. |
| Generation request | `contractVersion: 1` | `extension/src/shared/generation-contract.ts`, `extension/src/generation/request-validation.ts` | Exact keys: `contractVersion`, `screenshot`, `captureContext`, `requestedOutput`; screenshot data URL exists only in the full post-consent request. | Revisions require a new versioned request shape because V1 has no source generated version, instruction, operation kind, or attempt identity. |
| Review projection | V1 | `extension/src/generation/projection.ts`, `extension/src/sidepanel/GenerationWorkflow.tsx` | Visible Review data equals the approved outbound projection; source URL, page title, local IDs, screenshot storage key, cookies, storage, raw wrappers, and hidden DOM are excluded. | 6D must build an equally exact visible Review projection for revision/regeneration. |
| Backend route | V1 route | `backend/src/app.ts` | `POST /v1/generate-component`; CORS-limited; provider-neutral extension; backend-only provider secret. | 6D uses a new route to avoid overloading V1 exact-key generation and to keep implementation review isolated. |
| Backend normalized response | `ComponentGenerationResponseV1` | `extension/src/shared/generation-contract.ts`, `backend/src/validation/backend-validation.ts` | React + Tailwind only; bounded `componentName`, `code`, `summary`, `approximationNotes`; optional bounded opaque metadata; no raw provider response. | 6D reuses this response shape for successful revision output, then stores lineage in generated-version entry metadata, not in provider output. |
| OpenAI adapter normalization | V1 | `backend/src/provider/openai-provider.ts` | `store:false`, no tools, strict JSON schema, safe error mapping, no raw provider response returned. | 6D backend prompt responsibilities mirror this boundary with revision-specific input, while extension remains provider-neutral. |
| Generated-version entry | Implicit V1 with no top-level `contractVersion` | `extension/src/shared/generated-version-contract.ts` | Exact keys: `id`, `sourceCaptureId`, `sourceCaptureSavedAt`, `sourceReviewFingerprint`, `createdAt`, `value`; `value` is `ComponentGenerationResponseV1`. | V1 cannot carry lineage. 6D needs an additive V2 entry contract. |
| Generated-version IDs | V1 | `extension/src/shared/generated-version-contract.ts` | `generated-version-` plus UUID or 32 hex fallback. | 6D keeps the prefix/pattern and makes new result ID deterministic from `logicalAttemptId` for idempotency. |
| IndexedDB | version 2 | `extension/src/storage/indexed-db.ts` | Stores: `captureRecords`, `screenshotAssets`, `generatedComponentVersions`; generated-version keyPath `id`; index `sourceCaptureId`, non-unique. | Existing store and index can hold V2 entries without a schema bump if validators/readers are revised. |
| Generated-version write transaction | V1 | `extension/src/storage/indexed-db.ts` | Re-reads source record, validates screenshot asset, adds version, reads back by ID, validates equality before success; duplicate equal add is idempotent. | 6D preserves this ordering and extends duplicate handling around deterministic IDs and attempt identity. |
| Source-deletion cascade | V1 | `extension/src/storage/indexed-db.ts` | Capture deletion also deletes generated versions for the sourceCaptureId. Orphan versions are removed when source is missing during reads. | 6D must define ancestor-generated-version deletion separately because V1 has no ancestor relationship. |
| UI generation state | V1 | `extension/src/sidepanel/GenerationWorkflow.tsx` | Closed, preparing, review, generating, succeeded, save-failed, failed, cancelled; one in-flight operation; AbortController; sequence guard; Retry saving. | 6D introduces explicit revision states but should reuse one-at-a-time, AbortController, and stale sequence concepts. |
| Explicit consent | V1 | `extension/src/sidepanel/GenerationWorkflow.tsx` | Submission disabled until user checks consent; consent text says data leaves the device and paid API capacity may be used. | 6D requires a separate consent action after Review of revision projection. |
| Provider-neutral transport | V1 | `extension/src/generation/transport.ts`, `extension/src/generation/types.ts` | Extension transport sends Element Catcher JSON only, omits credentials, no provider-specific fields. | 6D adds provider-neutral revision transport, not OpenAI-specific extension state. |
| Abort ownership | V1 | `extension/src/sidepanel/GenerationWorkflow.tsx`, `backend/src/app.ts` | Side Panel owns extension AbortController; backend owns provider timeout AbortController and aborts on request abort. | 6D binds abort and continuations to source IDs, logical attempt, and workflow generation token. |
| Preview separation | Protocol V2 / Plan V1 | `extension/src/shared/preview-protocol.ts`, `extension/src/shared/preview-policy.ts`, `extension/src/sidepanel/PreviewSandbox.tsx` | Preview is a separate explicit button; source goes to host only; render realm gets validated plan only. | 6D must not auto-preview revised output. |

## 3. Product Semantics

Natural-language revision means:

1. The user opens one persisted generated version.
2. That selected version is the immutable source generated version.
3. The user provides one bounded natural-language instruction.
4. Element Catcher prepares a visible Review projection.
5. After explicit consent, the backend produces one new candidate component.
6. The source version is not overwritten.
7. A new immutable generated version is persisted.
8. Lineage records the selected source generated version and the logical attempt.

Regeneration decision: 6D implements regeneration as the same workflow with an explicit mode and no free-text instruction. The product label is "Regenerate" and the plain-language meaning is "create another version from this saved generated version using the same approved source context." This avoids a separate route and avoids pretending regeneration is initial generation. It also preserves lineage, Retry semantics, and Review privacy consistency.

Input inclusion decisions:

| Potential input | Decision | Reason |
| --- | --- | --- |
| Revision instruction | Sent for `mode: "revision"` only | It is the user-requested change and must be visible, bounded, normalized, and consented. |
| Selected generated source code | Sent | It is the visual/code baseline being revised; without it, fidelity and lineage are weak. |
| `componentName` | Sent | Needed for deterministic naming policy and provider instruction. |
| Summary | Sent | Low-cost context that improves continuity. |
| Approximation notes | Sent | Helps the provider avoid repeating known compromises. |
| Source CaptureRecord Review projection | Sent by default | Reuses Milestone 5 bounded projection for fidelity and current contract compatibility. |
| Screenshot | Not sent by default; optional explicit checkbox | The selected generated source plus source projection is usually enough; screenshot is high-privacy and high-cost. Optional resend is available when visual fidelity matters. |
| User notes | Excluded | Local library notes may be private and are not needed by default. |
| Tags | Sent only through the existing CaptureRecord Review projection | Tags are already part of the approved bounded Milestone 5 projection. |
| DOM summary | Sent through CaptureRecord Review projection | Needed for fidelity and already bounded. |
| Style summary | Sent through CaptureRecord Review projection | Needed for fidelity and already bounded. |

This is not a chat transcript. One logical revision attempt accepts exactly one bounded instruction for revision mode, or one explicit no-instruction regeneration confirmation for regeneration mode.

## 4. User Workflow

Trusted workflow:

1. Open a saved capture detail.
2. Expand one persisted generated version.
3. Choose `Revise` or `Regenerate`.
4. For Revise, enter one instruction. For Regenerate, confirm that no instruction will be sent.
5. Validate locally.
6. Re-read the source CaptureRecord and selected generated version.
7. Prepare exact Review data.
8. Display every user-derived field approved for transmission.
9. Obtain explicit consent with `Send revision to AI` or `Send regeneration to AI`.
10. Start request.
11. Allow `Cancel` while transport or save is active.
12. Validate normalized backend response.
13. Construct a new immutable generated version.
14. Persist it.
15. Read it back by stable identity.
16. Validate read-back.
17. Show success only after verified persistence.
18. Keep Preview closed until the user separately chooses `Preview`.

States:

| State | Meaning | Primary controls |
| --- | --- | --- |
| `idle` | No 6D workflow open for the selected version. | `Revise`, `Regenerate` enabled. |
| `editing` | Instruction entry or regeneration confirmation is open. | `Review revision`, `Cancel`; submit disabled until valid. |
| `invalid` | Local validation failed. | Field remains focused; `Review revision` disabled. |
| `review` | Exact projection is displayed before consent. | Consent checkbox, `Send revision to AI` or `Send regeneration to AI`, `Back to edit`, `Cancel`. |
| `awaiting-consent` | Review is valid but consent unchecked. | Send disabled; consent focused after Review opens. |
| `submitting` | Transport is active. | `Cancel` enabled; edit/source selection disabled. |
| `cancelling` | Abort requested while work may still be settling. | All submit controls disabled. |
| `cancelled` | User cancellation won current workflow. | `Review again`, `Close`. |
| `response-received` | Response received and validated; persistence not yet complete. | No Preview; `Cancel` still best-effort before write starts. |
| `saving` | New entry is being persisted and read back. | `Cancel` best-effort; no Preview. |
| `success` | New version was written and validated by read-back. | `Close`, `Revise this version`, version list shows result; `Preview` remains separate. |
| `transport-failure` | Network/timeout/CORS/local transport failed. | `Retry after review`, `Close`. |
| `backend/provider-failure` | Safe backend/provider error. | `Retry after review`, `Close`. |
| `invalid-response` | Backend response failed normalized validation. | Retry unavailable unless Review is reopened. |
| `persistence-failure` | Local save failed before verified read-back. | `Retry saving` if pending entry is available. |
| `stale-response-ignored` | A late continuation was ignored. | No visible success; optional polite status for diagnostics only. |
| `Retry-available` | Current failure has a stable logical attempt or safe Review retry. | Retry button enabled. |
| `Retry-unavailable` | Source missing, source changed, malformed source, or unsupported contract. | Retry hidden; `Close` only. |

Button labels:

- `Revise`
- `Regenerate`
- `Review revision`
- `Review regeneration`
- `Send revision to AI`
- `Send regeneration to AI`
- `Back to edit`
- `Cancel`
- `Retry after review`
- `Retry saving`
- `Close revision`
- `Preview`

Disabled states:

- Revise/Regenerate are disabled while any 6D workflow is active for the same generated version.
- Source version expansion controls are disabled during `submitting`, `cancelling`, `response-received`, and `saving`.
- Send is disabled until local validation passes and consent is checked.
- Retry saving is disabled while persistence retry is active.
- Preview is disabled for pending results and visible only for persisted versions.

Focus and live regions:

- Opening Revise focuses the instruction field.
- Opening Regenerate focuses the confirmation text and primary Review button.
- Invalid instruction focuses the field and announces the validation error with `role="alert"`.
- Opening Review focuses the Review heading; the consent checkbox is next in tab order.
- Submitting announces progress in a polite `role="status"` region.
- Failure focuses the first Retry button if available, otherwise `Close revision`.
- Cancellation focuses `Review again`.
- Success focuses the new version heading.

Navigation and selection:

- Navigating away during `editing` or `review` preserves a draft in component state only for the same source generated version in the same panel lifetime.
- Navigating away during active transport aborts best-effort and must not show later success.
- Selecting another generated version closes Review and clears the draft by default. If the draft has non-empty unsent text, the UI asks for confirmation before switching.
- Deleting the source CaptureRecord during the workflow cancels the workflow and leaves no new version.
- If the selected source generated version is deleted before Review, Review cannot open. If deletion occurs after request start, persistence fails because the source version re-read cannot validate.

## 5. Revision Input Contract

Contract name: `ComponentRevisionInputV1`.

Shape before Review:

```ts
type ComponentRevisionInputV1 = {
  contractVersion: 1;
  mode: "revision" | "regeneration";
  sourceCaptureId: string;
  sourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  instruction?: string;
  logicalAttemptId: string;
  requestId?: string;
};
```

Constraints:

- `contractVersion` must be exactly `1`.
- `mode` must be exactly `revision` or `regeneration`.
- `sourceCaptureId` must match the existing capture ID pattern.
- `sourceGeneratedVersionId` must match the existing generated-version ID pattern.
- `sourceGeneratedVersionFingerprint` must be lowercase SHA-256 hex over canonical source entry fields.
- `logicalAttemptId` pattern: `revision-attempt-` plus 32 lowercase hex characters.
- `requestId` pattern when present: `revision-request-` plus 32 lowercase hex characters.
- `requestId` is created after consent and before transport when the implementation needs one request-level UI/logging identity; Retry may create a new `requestId` while preserving the same `logicalAttemptId`.
- Exact-key validation rejects unknown keys and missing required keys.
- `instruction` is required for `mode: "revision"` and forbidden for `mode: "regeneration"`.
- Instruction normalization is Unicode NFC.
- Leading and trailing whitespace are trimmed.
- Internal runs of Unicode whitespace are collapsed to one ASCII space, except line breaks are allowed only before normalization and do not survive the normalized value.
- Minimum revision instruction: 4 Unicode code points after normalization.
- Maximum revision instruction: 1,000 Unicode code points after normalization.
- Maximum revision instruction UTF-8 bytes: 4,096.
- Empty or whitespace-only instructions are rejected.
- Disallowed control characters are rejected: C0/C1 controls except TAB, LF, and CR before whitespace normalization. Bidi control characters are rejected.
- Repeated identical instruction for the same source version is allowed only through Retry with the same `logicalAttemptId`; an intentional new alternative must create a new `logicalAttemptId`.

Unsupported contractVersion, unsupported mode, malformed IDs, unknown keys, excessive code points, excessive bytes, empty instruction, and disallowed controls fail locally before Review.

## 6. Exact Outbound Privacy Projection

The Review UI must display exactly the user-derived outbound projection. No hidden user-derived prompt data may leave the extension. Fixed source-controlled backend system instructions may be hidden only by category: safety instructions, strict JSON output instructions, provider-neutral React + Tailwind generation instructions, prompt-injection warnings, and screenshot handling rules. These fixed instructions must contain no private user data.

Outbound request name: `ComponentRevisionRequestV1`.

```ts
type ComponentRevisionRequestV1 = {
  contractVersion: 1;
  mode: "revision" | "regeneration";
  revisionInstruction?: string;
  sourceComponent: {
    componentName: string;
    framework: "react";
    styling: "tailwind";
    code: string;
    summary: string;
    approximationNotes: string;
  };
  captureContext: ExactCaptureContextProjectionV1;
  screenshot?: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
    dataUrl: string;
  };
  requestedOutput: {
    framework: "react";
    styling: "tailwind";
    fields: ["componentName", "code", "summary", "approximationNotes"];
  };
};
```

Field classification:

| Field | Classification |
| --- | --- |
| revision mode | Sent |
| revision instruction | Sent for revision only |
| selected generated component code | Sent |
| selected componentName | Sent |
| selected summary | Sent |
| selected approximationNotes | Sent |
| sourceCaptureId | Not sent |
| generated version ID | Not sent |
| timestamps | Not sent |
| source URL | Not sent |
| page title | Not sent |
| local database IDs | Not sent |
| screenshot asset key | Not sent |
| screenshot bytes | Optional only after explicit screenshot checkbox |
| CaptureRecord Review projection | Sent |
| DOM summary | Sent inside Review projection |
| style summary | Sent inside Review projection |
| title | Sent only as bounded library title in Review projection |
| component type | Sent inside Review projection |
| tags | Sent inside Review projection |
| notes | Not sent |
| browser storage | Not sent |
| cookies | Not sent |
| prior provider metadata | Not sent |
| request IDs | Not sent to provider-visible prompt; backend may log a server correlation ID only |
| idempotency keys | Not sent in model-visible prompt; see backend contract |

Screenshot rule: screenshot is optional through a separate explicit checkbox, unchecked by default. This balances fidelity with privacy and cost. Existing Milestone 5 initial generation sends the screenshot after consent because the screenshot is the primary source. Revision has a selected generated source plus the source projection, so resending pixels is not required by default. Retry must reuse the same screenshot choice and same visible Review projection for consistency.

## 7. Backend Contract

Route decision: add a dedicated provider-neutral endpoint:

```text
POST /v1/revise-component
```

Reasons:

- V1 initial generation uses exact-key validation and screenshot-required semantics.
- Revision/regeneration have different required fields and privacy choices.
- A dedicated route prevents accidental V1 behavior changes and keeps Milestone 5 regression simpler.

Extension-to-backend request:

- Header: `Content-Type: application/json`
- Header: `X-Element-Catcher-Contract-Version: 1`
- Header: optional `X-Element-Catcher-Idempotency-Key`, value equals `logicalAttemptId`; this header is backend-visible but not provider-prompt-visible.
- Body: `ComponentRevisionRequestV1`.

Successful response decision: reuse `ComponentGenerationResponseV1`.

The response contract already carries normalized React + Tailwind output and bounded metadata. Lineage belongs to local persistence, so a new provider response model is unnecessary.

Backend responsibilities:

- validate route, method, origin, content type, contract header, and request size;
- exact-key validate `ComponentRevisionRequestV1`;
- validate optional screenshot exactly as Milestone 5 does when present;
- enforce code, instruction, summary, and approximation note bounds;
- construct provider prompt from fixed source-controlled instructions plus visible request body only;
- tell the provider that all source code, CaptureRecord text, and user instruction are untrusted reference data;
- require strict JSON matching the existing generation response schema;
- normalize provider response into `ComponentGenerationResponseV1`;
- return safe bounded errors only;
- never return provider secrets, stack traces, raw provider response IDs, tool calls, or raw errors to the extension.

Forbidden hidden fields:

- source URL, page title, local IDs, screenshot storage key, cookies, browser storage, library notes, prior provider metadata, raw provider response, backend stack, and secret material.

## 8. Lineage and Persistence Design

Decision: additive generated-version contract revision is needed, but no IndexedDB version bump is required.

Rationale:

- V1 exact-key validation cannot accept lineage fields.
- The existing object store keyPath remains `id`.
- Existing non-unique `sourceCaptureId` index still supports capture-level listing.
- V2 entries can be stored in the same object store if validators and readers accept V1 or V2.
- No new IndexedDB store or index is required for 6D MVP. Lineage lookup by source generated version can filter versions loaded by `sourceCaptureId`.

New entry shape:

```ts
type GeneratedComponentVersionEntryV2 = {
  contractVersion: 2;
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceReviewFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
  operation: {
    kind: "initial-generation" | "revision" | "regeneration";
    logicalAttemptId: string;
    instruction?: string;
    instructionFingerprint?: string;
    sourceGeneratedVersionId?: string;
    sourceGeneratedVersionFingerprint?: string;
    sourceReviewFingerprint: string;
    screenshotIncluded: boolean;
  };
};
```

Required fields:

- V2 requires all top-level fields shown above.
- `operation.kind` is required.
- For revision/regeneration, `sourceGeneratedVersionId` and `sourceGeneratedVersionFingerprint` are required.
- For revision, `instruction` and `instructionFingerprint` are required.
- For regeneration, `instruction` and `instructionFingerprint` are absent.

Legacy behavior:

- V1 entries have no top-level `contractVersion` and are read as legacy initial-generation entries.
- V1 entries remain immutable and readable.
- New initial generation may remain V1 until a later implementation slice chooses to write V2 initial-generation entries. 6D-created revision/regeneration entries must be V2.

Ordering:

- Version list remains newest-first by `createdAt`, then `id`.
- Descendants can be shown beneath their source in later UI, but 6D MVP may list flat with lineage labels.

Deletion and orphan behavior:

- Deleting a CaptureRecord deletes all generated versions with that `sourceCaptureId`, including descendants.
- Deleting an individual generated version with descendants is allowed only after an explicit confirmation; descendants remain as immutable versions with a missing ancestor marker.
- Lineage is a soft reference, not an enforced IndexedDB foreign key.
- A missing ancestor is represented as "Source version deleted" with the stored source version ID/fingerprint.
- A missing source CaptureRecord remains fatal; existing orphan cleanup may remove versions for a missing capture.

## 9. Idempotency and Retry

Stable identity: `logicalAttemptId`.

- Created when the user first enters Review for a valid revision/regeneration attempt.
- Reused for transport Retry and persistence Retry from the same Review.
- Transmitted to the backend only as an idempotency header, never in model-visible prompt text.
- Used by the extension to derive the generated version ID:

```text
generated-version-${sha256("ElementCatcherRevisionV1:" + logicalAttemptId).slice(0, 32)}
```

Retry rules:

| Scenario | Required behavior |
| --- | --- |
| Repeated submit click | Ignored while in-flight. |
| Transport Retry | Reuses same `logicalAttemptId`, same Review projection, same screenshot choice, and same idempotency header. |
| Persistence Retry | Reuses same pending entry and deterministic ID; no second provider call. |
| Explicit new alternative/regeneration | Creates a new `logicalAttemptId` and therefore a distinct generated version ID. |
| Duplicate backend delivery | Extension validates response and persists by deterministic ID; equal duplicate is idempotent. |
| Same backend response returned twice | Equal entry read-back succeeds once; duplicate equal add resolves to existing entry. |
| Transport success followed by extension timeout | Retry first searches by deterministic ID; if found and valid, show success after read-back; otherwise may call transport again with same idempotency header. |
| Persistence success followed by interrupted UI | Reopen searches by deterministic ID and validates read-back before showing saved result. |
| Panel close and reopen | In-memory drafts are lost, but persisted deterministic results are recoverable by ID. |
| Stale duplicate response | Ignored unless bound source IDs and workflow token match the current workflow. |

Backend deduplication is allowed but not required for correctness. Extension persistence deduplication is required.

## 10. Cancellation and Stale Responses

One-at-a-time rule: one active 6D workflow per Side Panel instance. Starting a new workflow aborts and retires the previous workflow generation token.

Each async continuation is bound to:

- `sourceCaptureId`;
- `sourceGeneratedVersionId`;
- `logicalAttemptId`;
- workflow generation token.

Cancellation coverage:

| Event | Required behavior |
| --- | --- |
| Cancel before request | No transport; state becomes `cancelled`; draft can be reviewed again. |
| Cancel during request | AbortController aborts fetch; late success/failure is ignored. |
| Cancel after response before persistence | Best-effort abort; if write has not started, no entry is added. |
| Cancel during persistence | Best-effort transaction abort; if commit already completed, result is accepted only after matching read-back. |
| Close saved-capture detail | Abort and retire workflow token. |
| Switch selected generated version | Abort current workflow; clear or confirm draft. |
| Start second revision | Abort first workflow; first continuations become stale. |
| Delete source CaptureRecord | Abort active workflow; persistence must fail if source is missing. |
| Delete source generated version | Abort before persistence; if deletion races after request, persistence fails source-version re-read. |
| Browser page unload / extension page unload | Best-effort abort; no UI success after unload. |
| Late success after cancel | Must not update UI, persist under a different source, or trigger Preview. |
| Late failure after newer attempt | Ignored. |
| Stale persistence completion | Does not update current UI unless all binding values still match. |

Guaranteed: stale continuations cannot update current UI, mutate the source version, mutate CaptureRecord, delete older versions, or trigger preview. Best-effort: network/provider work already accepted by backend may continue after client abort.

## 11. Persistence Ordering

Required success ordering:

1. Re-read and validate source CaptureRecord.
2. Re-read and validate selected source generated version.
3. Validate revision input.
4. Construct Review projection.
5. Obtain consent.
6. Create or reuse `logicalAttemptId`.
7. Transmit.
8. Validate normalized response.
9. Enforce componentName policy.
10. Construct immutable new generated version.
11. Persist in one transaction.
12. Read back by stable identity.
13. Validate read-back.
14. Expose success.
15. Keep preview closed.

Failure behavior:

| Failure | Behavior |
| --- | --- |
| Missing CaptureRecord | Fail before transport or persistence; Retry unavailable until source exists. |
| Missing source generated version | Fail before Review/transport; Retry unavailable. |
| Source deleted before request | Fail before transport. |
| Source deleted during request | Persistence fails before save. |
| Invalid backend response | Reject as `invalid-response`; do not persist. |
| ComponentName mismatch | Reject as invalid response under the component-name policy. |
| Network error | `transport-failure`; Retry after Review available. |
| Explicit abort | `cancelled`; no success until matching persisted result is later discovered by user action. |
| Provider error | `backend/provider-failure`; safe bounded message only. |
| Persistence quota error | `persistence-failure`; Retry saving unavailable if no pending entry can be kept. |
| Transaction abort | `persistence-failure`; Retry saving available with pending entry when safe. |
| Duplicate key | If existing entry equals pending entry, read-back succeeds; otherwise conflict failure. |
| Write succeeded but read-back failed | No success; recovery searches deterministic ID before any new provider call. |
| Unknown persistence outcome | Search deterministic ID; show success only after valid read-back. |
| Orphan result | Do not persist if source CaptureRecord or source generated version cannot be validated. |
| Retry after uncertain persistence | Search first, then retry save or transport according to whether pending entry exists. |

## 12. Component-Name Policy

Decision: preserve source `componentName` for all revisions and regenerations.

Justification:

- It avoids silent provider renaming.
- It keeps Preview binding deterministic.
- It keeps version list continuity simple.
- It avoids adding a separate rename UI to 6D.

Rules:

- Backend prompt instructs provider to return the same `componentName`.
- Extension validates that response `componentName` equals selected source `componentName`.
- Mismatch is `invalid-response` and is not persisted.
- Retry reuses the same expected name.
- Duplicate component names across versions are allowed and expected; version identity is `id` plus `createdAt`.
- Lineage display can show `ButtonCard - revised from ButtonCard`.
- Future user rename requires a separate explicit field and architecture approval.

## 13. Preview and Execution Boundary

6D does not change preview architecture.

- Revised output is response data.
- Response validation does not make source trusted.
- Persistence does not preview.
- Preview requires a separate explicit `Preview` action after verified persistence.
- Revised source reaches only the 6C sandbox host.
- Render realm never receives source.
- Unsupported source remains visible and copyable.
- Revision failure cannot modify source version.
- Protocol V2, Previewable Subset V1, sibling sandbox topology, utility CSS registry, CSP, and preview limits remain unchanged.

## 14. Threat Model

| Threat | Trust boundary | Prevention | Detection | Failure behavior | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Malicious revision instruction | User text to backend/provider | Bounds, normalization, visible Review, prompt says instruction is untrusted | Input validator | Reject before Review | Model may still follow style intent imperfectly |
| Prompt injection in generated source | Persisted source to provider | Treat source as untrusted reference data | Backend prompt and bounds | Malformed/unsafe output rejected later by response/preview gates | Provider may produce poor code |
| Prompt injection in CaptureRecord text | Capture text to provider | Existing projection bounds and untrusted-data prompt | Request validation | Reject oversized/malformed projection | Injection can influence aesthetics |
| Hostile model output | Provider to extension | Strict response schema and bounds | Backend and extension validators | `invalid-response` or safe backend error | Valid-looking unsafe source remains inert until preview gate |
| Source generated-version tampering | IndexedDB to UI | Re-read and validate source entry/fingerprint | V1/V2 validators | Retry unavailable | Local attacker with storage access can delete data |
| Stale CaptureRecord relationship | Local storage | Re-read source and fingerprint | Persistence preconditions | Fail before save | User may need to regenerate from current source |
| Cross-capture lineage mix-up | UI state to persistence | Bind IDs and workflow token | Source/version re-read | Reject stale continuation | Bugs in future filters |
| Duplicate backend delivery | Backend to extension | Deterministic ID | Duplicate-key read-back | Idempotent success or conflict | Backend may still bill twice without server dedupe |
| Replayed response | Network/backend | Attempt ID and source fingerprint binding | Persistence equality check | Ignore or reject | No cryptographic server signature in 6D |
| Hidden outbound fields | Extension to backend | Review equals projection; exact keys | Privacy tests | Block request | Future prompt edits need review |
| Repeated Retry cost abuse | UI/backend | Disable in-flight; same idempotency header; future rate limits | Backend logs | Safe provider/rate errors | Local demo backend lacks production quota |
| Oversized instruction | User input | Code point and byte limits | Validator | Reject locally | Unicode edge cases need tests |
| Oversized source component | Stored source to request | Existing response code bound; revision request source bound | Request validator | Reject before transport | Large valid source may be costly |
| Response bomb | Provider to backend/extension | Response byte limit and schema | Bounded response read | Malformed response | Backend memory pressure still needs ops limits |
| Raw provider error leakage | Provider to backend | Safe error mapping | Backend tests | Safe bounded error | Logs must stay controlled |
| Persistence race | Local async | Single transaction and read-back | Transaction/read-back validation | No success | Browser transaction behavior is best-effort on unload |
| Cancellation race | UI to async | AbortController and workflow token | Stale guards | Ignore late continuation | Backend work may continue after abort |
| Stale UI continuation | Async to React state | Generation token | State guard | Ignore | Future refactors could omit guard |
| Auto-preview/execution | Persistence to preview | Separate Preview action | UI tests | No preview opened | User may confuse saved with previewed |
| Deletion race | Source deletion to workflow | Re-read source/version | Persistence preconditions | Fail safely | Individual version deletion needs careful UI |
| Orphan lineage | Missing ancestor | Soft reference marker | Read validators | Show missing ancestor or cleanup missing capture | Descendant context may be incomplete |

## 15. Accessibility and UX Contract

- Field label: `Revision instruction`.
- Help text: `Describe one change to make to this saved generated version. Do not include private data.`
- Maximum-length presentation: live counter `0 / 1000 characters`, plus byte-limit validation only when exceeded.
- Validation timing: on input for length/control characters; on Review for full contract.
- Review headings: `Source version`, `Instruction`, `Approved capture context`, `Optional screenshot`, `Excluded data`, `Consent`.
- Consent action text: `I understand this displayed data will leave my device and may use paid AI capacity.`
- Revise button: `Revise`.
- Regenerate button: `Regenerate`.
- Submit labels: `Send revision to AI`; `Send regeneration to AI`.
- Cancel label: `Cancel`.
- Retry labels: `Retry after review`; `Retry saving`.
- Loading message: `Revising with the configured AI backend...` or `Regenerating with the configured AI backend...`.
- Cancelled message: `Revision cancelled.` or `Regeneration cancelled.`
- Failure messages reuse safe categories and avoid internal protocol terms.
- Success message: `Saved revised generated version locally.` or `Saved regenerated version locally.`
- Focus after error: invalid field, then Retry button for operation failures.
- Focus after cancellation: `Review again`.
- Focus after success: new generated version heading.
- Screen-reader live regions: polite for progress/success, assertive alert for validation/failure.
- Keyboard: all controls reachable by Tab; Escape in editing cancels only when no modal confirmation is active; Enter in textarea inserts text, not submit.
- Draft preservation: preserve only while same source version remains selected and workflow has not submitted.
- Navigation warning: warn before discarding a non-empty unsent draft; active transport aborts without warning if the user explicitly leaves.
- Plain product distinction: Revise means "make a described change"; Regenerate means "create another version without extra instructions."

## 16. Acceptance Test Matrix

| Area | Test | Unit | Backend integration | IndexedDB integration | Playwright extension runtime |
| --- | --- | --- | --- | --- | --- |
| Contract | exact keys | Yes | Yes | No | No |
| Contract | wrong contract version | Yes | Yes | No | No |
| Contract | wrong mode | Yes | Yes | No | No |
| Contract | invalid IDs | Yes | Yes | Yes | No |
| Contract | Unicode normalization | Yes | No | No | Yes |
| Contract | whitespace | Yes | No | No | Yes |
| Contract | invalid controls | Yes | Yes | No | Yes |
| Contract | code-point limit | Yes | Yes | No | Yes |
| Contract | UTF-8 byte limit | Yes | Yes | No | Yes |
| Contract | unknown keys | Yes | Yes | No | No |
| Privacy | Review projection equals transmitted projection | Yes | No | No | Yes |
| Privacy | excluded fields absent | Yes | Yes | No | Yes |
| Privacy | screenshot rule enforced | Yes | Yes | No | Yes |
| Privacy | no hidden CaptureRecord fields | Yes | Yes | No | Yes |
| Privacy | no source URL/page title/local IDs unless approved | Yes | Yes | No | Yes |
| Privacy | no cookies/storage | Yes | No | No | Yes |
| Privacy | no real OpenAI request | No | Yes | No | Yes |
| Lineage | sourceCaptureId preserved | Yes | No | Yes | Yes |
| Lineage | sourceGeneratedVersionId preserved | Yes | No | Yes | Yes |
| Lineage | operation kind recorded | Yes | No | Yes | Yes |
| Lineage | logicalAttemptId recorded | Yes | No | Yes | Yes |
| Lineage | old version immutable | Yes | No | Yes | Yes |
| Lineage | CaptureRecord immutable | Yes | No | Yes | Yes |
| Lineage | legacy versions remain readable | Yes | No | Yes | Yes |
| Lineage | deletion behavior | Yes | No | Yes | Yes |
| Lineage | missing ancestor behavior | Yes | No | Yes | Yes |
| Lineage | orphan behavior | Yes | No | Yes | Yes |
| Idempotency | repeated click | Yes | No | No | Yes |
| Idempotency | transport Retry | Yes | Yes | Yes | Yes |
| Idempotency | persistence Retry | Yes | No | Yes | Yes |
| Idempotency | duplicate backend response | Yes | Yes | Yes | Yes |
| Idempotency | successful persistence then UI interruption | No | No | Yes | Yes |
| Idempotency | unknown persistence outcome | Yes | No | Yes | Yes |
| Idempotency | explicit new alternative creates distinct version | Yes | No | Yes | Yes |
| Cancellation | cancel before transport | Yes | No | No | Yes |
| Cancellation | cancel during transport | Yes | Yes | No | Yes |
| Cancellation | cancel before persistence | Yes | No | Yes | Yes |
| Cancellation | close detail | No | No | No | Yes |
| Cancellation | switch source version | No | No | No | Yes |
| Cancellation | source deletion | Yes | No | Yes | Yes |
| Cancellation | late success | Yes | Yes | Yes | Yes |
| Cancellation | late failure | Yes | Yes | No | Yes |
| Cancellation | stale persistence completion | Yes | No | Yes | Yes |
| Cancellation | newer workflow unaffected | Yes | No | Yes | Yes |
| Backend | request exact-key validation | No | Yes | No | No |
| Backend | bounds | Yes | Yes | No | No |
| Backend | prompt construction | Yes | Yes | No | No |
| Backend | provider normalization | Yes | Yes | No | No |
| Backend | bounded safe errors | Yes | Yes | No | No |
| Backend | no provider secret | No | Yes | No | No |
| Backend | no raw provider response | Yes | Yes | No | No |
| UI | editing | No | No | No | Yes |
| UI | invalid | Yes | No | No | Yes |
| UI | Review | No | No | No | Yes |
| UI | consent | No | No | No | Yes |
| UI | submitting | No | Yes | No | Yes |
| UI | cancellation | No | Yes | Yes | Yes |
| UI | success | No | No | Yes | Yes |
| UI | failure | No | Yes | Yes | Yes |
| UI | Retry | Yes | Yes | Yes | Yes |
| UI | focus | No | No | No | Yes |
| UI | live region | No | No | No | Yes |
| UI | Preview remains separate | No | No | Yes | Yes |
| Regression | Milestone 5 initial generation unchanged | Yes | Yes | Yes | Yes |
| Regression | Milestone 5 Review/consent unchanged | Yes | No | No | Yes |
| Regression | Milestone 6C preview unchanged | Yes | No | No | Yes |
| Regression | no storage corruption | No | No | Yes | Yes |
| Regression | no automatic execution | Yes | No | No | Yes |
| Regression | no real OpenAI request | No | Yes | No | Yes |

## 17. Implementation Slices

| Slice | Purpose | Allowed files | Dependencies | Acceptance criteria | Independent commit? | Prohibited scope | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Contract and lineage foundation | Add revision input, V2 generated-version validators, deterministic IDs | `extension/src/shared/*`, focused unit tests | Approved design | V1 readable, V2 valid, malformed rejected | Yes | UI/backend behavior | Independent acceptance required |
| 2. Backend revision route or mode | Add `/v1/revise-component`, prompt construction, response reuse | `backend/src/*`, backend tests | Slice 1 shared contracts | Exact keys, safe errors, no raw provider data | Yes | Provider secret exposure, V1 route change | Independent acceptance required |
| 3. Extension transport and privacy Review projection | Build provider-neutral request and visible Review data | `extension/src/generation/*`, UI tests | Slices 1-2 | Review equals transmitted projection | Yes | Hidden outbound user data | Independent acceptance required |
| 4. Persistence and idempotency | Persist V2 entries, deterministic ID, Retry recovery | `extension/src/storage/*`, tests | Slices 1 and 3 | Duplicate-safe, read-back required | Yes | IndexedDB schema bump unless separately approved | Independent acceptance required |
| 5. Side Panel Revise/Regenerate workflow | Add trusted UI states and controls | `extension/src/sidepanel/*`, styles, Playwright | Slices 1,3,4 | Complete workflow and accessibility | Yes | Version comparison/export | Independent acceptance required |
| 6. Cancellation and stale-response guards | Harden AbortController and workflow tokens | generation/storage/sidepanel tests | Slices 3-5 | Late continuations ignored | Yes | Preview protocol changes | Independent acceptance required |
| 7. Full regression and documentation closeout | Validate M5/M6C unchanged and close 6D | tests and docs only | Slices 1-6 | All targeted suites pass; docs updated | Yes | 6E implementation | Independent acceptance required |

## 18. Final Decisions Table

| Topic | Selected design | Rejected alternatives | Reason | Implementation impact | Approval still required |
| --- | --- | --- | --- | --- | --- |
| Revision semantics | One selected persisted version plus one bounded instruction creates one new immutable version | Overwrite source; chat transcript | Simpler, private, lineage-safe | New workflow and V2 lineage | Yes, implementation approval |
| Regeneration semantics | Same workflow, explicit mode, no instruction | Deferred; separate contract | Shares lineage/idempotency without ambiguity | Same route/request mode | Yes |
| Instruction bounds | 4-1000 code points, 4096 bytes, NFC, trimmed/collapsed whitespace | Unbounded free text | Cost and validation control | Validator and UI counter | Yes |
| Screenshot transmission | Optional explicit checkbox, off by default | Always, never | Balances fidelity/privacy/cost | Review checkbox and request branch | Yes |
| CaptureRecord context | Existing Review projection sent by default | Hidden context or full record | Fidelity with existing bounds | Reuse projection | Yes |
| Backend route | New `/v1/revise-component` | Reuse `/v1/generate-component` | Avoid V1 exact-key ambiguity | Backend route/tests | Yes |
| Response contract | Reuse `ComponentGenerationResponseV1` | Revision-specific response | Lineage is local persistence concern | Existing response validator reused | Yes |
| Prompt composition | Fixed hidden system categories plus visible request only | Hidden user-derived fields | Privacy reviewability | Backend prompt builder | Yes |
| Lineage contract | V2 generated-version entry | Arbitrary V1 fields | V1 exact-key cannot carry lineage | Validator/readers update | Yes |
| IndexedDB migration outcome | No version bump | New store/index | Store can hold V2; existing index sufficient | Same DB v2 | Yes |
| ComponentName policy | Preserve source name | Provider rename; user rename | Deterministic Preview and list | Response name equality check | Yes |
| logicalAttemptId | Stable per Review attempt | Random per Retry | Retry dedupe | Deterministic generated ID | Yes |
| Transport Retry | Same attempt, same projection | New attempt each Retry | Prevent duplicates/cost drift | Retry state stores Review | Yes |
| Persistence Retry | Same pending entry | Re-call provider by default | Avoid duplicate versions | Pending entry recovery | Yes |
| Explicit new alternative | New attempt ID | Reuse Retry identity | User intent creates distinct result | New deterministic ID | Yes |
| Cancellation | Best-effort abort plus stale guards | Assume abort is complete | Browser/provider work may continue | Token checks | Yes |
| Source CaptureRecord deletion | Cancels; no orphan save | Persist orphan | Capture is source boundary | Re-read source | Yes |
| Source generated-version deletion | Soft ancestor handling for descendants; active workflow fails | Cascade descendants automatically | Preserve immutable descendants | UI marker and validation | Yes |
| Descendants | Remain immutable after ancestor deletion with marker | Forced delete | User may need saved result | Soft lineage | Yes |
| Legacy version reading | V1 readable as initial generation | Migrate eagerly | Avoid unnecessary migration | Union validator | Yes |
| Preview separation | Unchanged explicit Preview after persistence | Auto-preview | Preserve 6C boundary | No preview protocol change | Yes |
| 6D/6E boundary | No comparison/export | Add comparison now | Keep scope tight | 6E remains Planned | Yes |

## 19. Residual Risks

- Backend idempotency may not prevent provider billing if the backend cannot dedupe before provider call; extension persistence still prevents uncontrolled local duplicates.
- No cryptographic signature binds backend response to request; extension relies on local attempt/source binding and schema validation.
- Optional screenshot resend improves fidelity but increases privacy/cost; the checkbox and Review must be tested carefully.
- Soft ancestor references make deletion user-friendly but require clear UI for missing ancestors.
- V2 entries in the existing object store avoid migration, but all readers must be updated to avoid accidental cleanup of valid V2 records.
- Model output is never trusted; preview safety still depends on the Milestone 6C parser/policy/render-plan boundary.
- Production backend operations such as authentication, quotas, budgets, monitoring, and abuse prevention remain outside 6D and require separate approval.

## 20. Production Approval Gate

Before any implementation slice starts, independent review must approve:

- the dedicated backend route;
- V2 generated-version contract without IndexedDB version bump;
- optional screenshot resend rule;
- deterministic generated version ID from `logicalAttemptId`;
- componentName preservation;
- soft ancestor deletion behavior;
- no hidden user-derived outbound prompt data;
- preservation of Milestone 5 consent and Milestone 6C preview boundaries.

No production implementation exists from this document alone.
