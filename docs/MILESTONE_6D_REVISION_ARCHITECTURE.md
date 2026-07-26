# Milestone 6D Revision Architecture

## 1. Status and Scope

Milestone 6D is Current. Milestone 6 remains Current. Milestone 6E remains Planned. This document closes the architecture for natural-language revision and regeneration planning only; it does not approve or implement production behavior, does not mark Milestone 6D Completed, and does not mark Milestone 6 Completed.

Milestone 6D preserves the accepted Milestone 6C execution boundary:

- revised output remains inert response data until it is persisted and the user separately chooses Preview;
- existing generated versions and the original `CaptureRecord` remain immutable;
- revised source never executes automatically;
- Preview remains an explicit operation after verified persistence;
- generated source reaches only the packaged sandbox host;
- the render realm receives only `PreviewRenderPlanV1`;
- the sibling packaged sandbox topology, Protocol V2, Previewable Subset V1, preview CSP, and execution prohibitions remain unchanged;
- no Tailwind runtime, CDN, generated CSS, eval, `Function`, WebAssembly, worker execution, `srcdoc`, Blob execution, or data URL execution is introduced;
- no real OpenAI request is made by this documentation task.

Allowed change scope for this follow-up is documentation only. Runtime extension code, backend implementation, tests, package files, lockfiles, Manifest, CSP, IndexedDB implementation, existing production contracts, preview protocol, preview policy, and build configuration are out of scope.

Production approval gate: implementation may start only after independent review approves this corrected architecture and the relevant implementation slice. No production implementation exists from this document alone.

## 2. Current Contract Inventory

The current repository is authoritative.

| Contract or subsystem | Current version | Authoritative file | Immutable guarantees | Milestone 6D impact |
| --- | --- | --- | --- | --- |
| CaptureRecord | `schemaVersion: 1` | `extension/src/shared/capture-schema.ts`, `extension/src/capture/capture-record-v1.ts` | JSON-compatible source record; screenshot is an asset reference; source URL and page title are local fields; generated history is not written into the `generatedVersions` compatibility field by Milestone 5. | 6D must not mutate CaptureRecord. It may build a new current Review projection from the current validated CaptureRecord. |
| Generation request | `contractVersion: 1` | `extension/src/shared/generation-contract.ts`, `extension/src/generation/request-validation.ts` | Exact V1 initial-generation keys: `contractVersion`, `screenshot`, `captureContext`, `requestedOutput`; screenshot data URL is created only after consent. | Revision/regeneration use a new request body for a new route; V1 initial generation remains unchanged. |
| Review projection | V1 | `extension/src/generation/projection.ts`, `extension/src/sidepanel/GenerationWorkflow.tsx` | The user sees the approved outbound projection; source URL, page title, local IDs, screenshot storage key, cookies, storage, raw wrappers, hidden DOM, and notes are excluded. | 6D must display the exact frozen outbound projection and cannot add hidden user-derived prompt data. |
| Backend route | V1 route | `backend/src/app.ts` | `POST /v1/generate-component`; provider-neutral extension; backend-only provider secret; safe bounded errors. | 6D adds a dedicated design route, not a mutation of V1 route semantics. |
| Backend normalized response | `ComponentGenerationResponseV1` | `extension/src/shared/generation-contract.ts`, `backend/src/validation/backend-validation.ts` | Bounded React + Tailwind `componentName`, `code`, `summary`, `approximationNotes`; optional bounded opaque metadata; no raw provider response. | 6D successful revision/regeneration responses reuse this shape. |
| OpenAI adapter normalization | V1 | `backend/src/provider/openai-provider.ts` | `store:false`, no tools, strict JSON schema, safe error normalization. | 6D prompt construction must keep provider specifics behind the backend. |
| Generated-version entry | Implicit V1 with no top-level `contractVersion` | `extension/src/shared/generated-version-contract.ts` | Exact keys: `id`, `sourceCaptureId`, `sourceCaptureSavedAt`, `sourceReviewFingerprint`, `createdAt`, `value`; value is `ComponentGenerationResponseV1`. | V1 cannot carry revision lineage. 6D defines V2 only for revision/regeneration entries. |
| Generated-version IDs | V1 pattern | `extension/src/shared/generated-version-contract.ts` | `generated-version-` plus UUID or 32 hex fallback. | 6D keeps the prefix and uses a deterministic 32-hex suffix from `logicalAttemptId`. |
| IndexedDB | version 2 | `extension/src/storage/indexed-db.ts` | Stores: `captureRecords`, `screenshotAssets`, `generatedComponentVersions`; generated-version keyPath `id`; non-unique `sourceCaptureId` index. | No DB version bump is required for V2 because the existing store/index are sufficient when readers/validators accept V1 or V2. |
| Generated-version write transaction | V1 | `extension/src/storage/indexed-db.ts` | Source record is re-read, screenshot asset is validated, entry is added, read back, and equality-validated before success. | 6D strengthens this into a same-transaction source CaptureRecord plus source generated-version re-read before adding V2. |
| Source capture deletion | V1 | `extension/src/storage/indexed-db.ts` | Capture deletion removes the CaptureRecord, screenshot asset, and generated versions for `sourceCaptureId`; orphan versions for a missing capture may be cleaned up. | 6D keeps capture-level cleanup only; individual generated-version deletion UI remains out of scope. |
| UI generation workflow | V1 | `extension/src/sidepanel/GenerationWorkflow.tsx` | One in-flight generation, AbortController ownership, sequence guards, visible Review, consent, Retry saving. | 6D reuses these patterns but the first reachable UI slice must include complete stale and cancellation guards. |
| Preview separation | Protocol V2 / Plan V1 | `extension/src/shared/preview-protocol.ts`, `extension/src/shared/preview-policy.ts`, `extension/src/sidepanel/PreviewSandbox.tsx` | Preview is separate; source goes to host only; render realm gets only validated plan. | 6D does not change preview contracts. |

## 3. Product Semantics

Natural-language revision means:

1. The user selects one persisted generated version.
2. The selected generated version is the immutable source version.
3. The user provides one bounded natural-language instruction.
4. The extension builds a frozen Review attempt from the selected source version and current validated CaptureRecord projection.
5. After explicit consent, the backend produces one candidate.
6. The source generated version is not overwritten.
7. A new immutable V2 generated-version entry is persisted.
8. Lineage records the selected source generated version and its fingerprint.

Regeneration means the same workflow with explicit `mode: "regeneration"` and no free-text instruction. It creates another version from the selected persisted generated version using the same approved current CaptureRecord context. Regeneration is not deferred and is not a separate backend model.

Input decisions:

| Potential input | Decision | Reason |
| --- | --- | --- |
| Revision instruction | Sent for revision only | It is the requested change and must be visible, bounded, normalized, fingerprinted, and consented. |
| Selected generated source code | Sent | It is the source component being revised/regenerated. |
| Selected `componentName` | Sent | Required for deterministic component-name policy. |
| Selected summary | Sent | Useful low-cost continuity context. |
| Selected approximationNotes | Sent | Helps preserve known tradeoffs. |
| Current CaptureRecord Review projection | Sent by default | Reuses the bounded Milestone 5 projection and reflects current user-managed metadata at Review time. |
| Screenshot | Optional explicit checkbox, off by default | Improves visual fidelity when chosen; otherwise avoids extra privacy and cost. |
| User notes | Not sent | Notes remain local and may contain private planning context. |
| Tags | Sent only through current Review projection | Tags are already bounded and visible in Milestone 5 projection. |
| DOM summary | Sent through current Review projection | Needed for fidelity and bounded. |
| Style summary | Sent through current Review projection | Needed for fidelity and bounded. |

This is not a chat transcript. One frozen Review attempt accepts one revision instruction or one regeneration confirmation.

## 4. Authoritative Attempt Lifecycle and User Workflow

There is one authoritative `logicalAttemptId` lifecycle:

1. The user opens a persisted generated version and chooses `Revise` or `Regenerate`.
2. The extension validates and normalizes the revision/regeneration input.
3. The extension re-reads and validates the current source CaptureRecord and selected persisted generated version.
4. The extension constructs the exact outbound Review projection, including the screenshot included/not-included choice.
5. The extension freezes that Review projection.
6. The extension creates `logicalAttemptId` before displaying the frozen Review.
7. The `logicalAttemptId` is bound to that exact frozen Review attempt.
8. Consent, transport Retry, and persistence Retry reuse the same `logicalAttemptId` only while the frozen Review remains byte-for-byte unchanged.
9. Returning to edit and changing any outbound value invalidates the old attempt. This includes instruction, mode, selected source version, source component data, current CaptureRecord projection, requestedOutput, or screenshot inclusion choice.
10. The next Review after an invalidating change creates a new `logicalAttemptId`.
11. An explicit new alternative always creates a new `logicalAttemptId`.
12. Repeated submit while in flight is ignored.

No separate `requestId` is part of the 6D contract. Stale binding uses `sourceCaptureId`, `sourceGeneratedVersionId`, `sourceGeneratedVersionFingerprint`, `logicalAttemptId`, `reviewAttemptFingerprint`, and the workflow generation token.

Trusted workflow:

1. Open a saved capture detail.
2. Expand one persisted generated version.
3. Choose `Revise` or `Regenerate`.
4. Enter a bounded instruction for Revise, or confirm Regenerate.
5. Validate locally.
6. Re-read source CaptureRecord and source generated version.
7. Construct and freeze exact Review data.
8. Create `logicalAttemptId`.
9. Display frozen Review data.
10. Obtain explicit consent.
11. Revalidate the frozen Review before transport.
12. Send request with the required idempotency header.
13. Allow best-effort cancellation while transport or persistence is active.
14. Validate normalized response.
15. Construct immutable V2 generated-version entry.
16. Persist through the atomic transaction defined in section 11.
17. Show success only after transaction commit and validated read-back, and only if the workflow is still current.
18. Keep Preview closed until a separate explicit Preview action.

UI states:

| State | Meaning | Controls |
| --- | --- | --- |
| `idle` | No 6D workflow is open. | `Revise`, `Regenerate` enabled. |
| `editing` | The user is entering instruction or confirming regeneration. | `Review revision` or `Review regeneration`, `Cancel`; submit disabled until valid. |
| `invalid` | Local validation failed. | Invalid field focused; Review button disabled. |
| `review` | Frozen Review exists and owns a `logicalAttemptId`. | Consent, `Send revision to AI` or `Send regeneration to AI`, `Back to edit`, `Cancel`. |
| `awaiting-consent` | Frozen Review is displayed but consent is unchecked. | Send disabled. |
| `submitting` | Transport is active for the frozen attempt. | `Cancel`; edit/source controls disabled. |
| `cancelling` | Abort requested; completion may still settle. | Submit controls disabled. |
| `cancelled` | Cancellation won the active UI workflow. | `Review again`, `Close`. |
| `response-received` | Response passed shape validation; persistence not complete. | No Preview; Cancel remains best-effort until commit. |
| `saving` | Atomic persistence transaction is active. | Cancel best-effort; no Preview. |
| `success` | The current workflow committed and read back a valid V2 result. | `Close`; version list shows result; Preview remains separate. |
| `transport-failure` | Network, timeout, CORS, or backend transport failed. | `Retry after review`, `Close`. |
| `backend/provider-failure` | Backend/provider returned safe bounded failure. | `Retry after review`, `Close`. |
| `invalid-response` | Response failed schema or component-name validation. | Retry only by reopening Review. |
| `persistence-failure` | Local persistence failed before verified success. | `Retry saving` only when the pending V2 entry is retained. |
| `stale-response-ignored` | A late continuation was ignored. | No active UI success. |
| `Retry-available` | Frozen Review and attempt remain unchanged. | Retry enabled. |
| `Retry-unavailable` | Source missing/changed, malformed source, unsupported contract, or Review invalidated. | Retry hidden; `Close` only. |

Back-to-edit preserves the draft text for the same selected source version, but it invalidates the old `logicalAttemptId`. A new attempt is created only when the user returns to Review after validation and re-freeze.

## 5. Revision Input Contract

`ComponentRevisionInputV1` is extension-local and represents the frozen Review attempt. It is not the backend request body and is not provider-visible.

```ts
type ComponentRevisionInputV1 = {
  contractVersion: 1;
  mode: "revision" | "regeneration";
  sourceCaptureId: string;
  sourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  currentReviewFingerprint: string;
  screenshotIncluded: boolean;
  instruction?: string;
  instructionFingerprint?: string;
  logicalAttemptId: string;
  reviewAttemptFingerprint: string;
};
```

Exact keys are required. Unknown keys are rejected.

Common constraints:

- `contractVersion` is exactly `1`.
- `mode` is exactly `revision` or `regeneration`.
- `sourceCaptureId` matches the existing capture ID pattern.
- `sourceGeneratedVersionId` matches the existing generated-version ID pattern.
- `sourceGeneratedVersionFingerprint`, `currentReviewFingerprint`, `instructionFingerprint`, and `reviewAttemptFingerprint` are lowercase 64-character SHA-256 hex where present.
- `logicalAttemptId` pattern is `revision-attempt-` followed by 32 lowercase hex characters.
- `screenshotIncluded` is boolean and must match the frozen Review projection.

Revision constraints:

- `instruction` is required.
- `instructionFingerprint` is required.
- `instruction` is final normalized text.
- Minimum instruction: 4 Unicode code points.
- Maximum instruction: 1,000 Unicode code points.
- Maximum instruction UTF-8 bytes: 4,096.

Regeneration constraints:

- `instruction` is forbidden.
- `instructionFingerprint` is forbidden.

Instruction normalization:

- Normalize to Unicode NFC.
- Trim leading and trailing whitespace.
- Collapse internal runs of Unicode whitespace to one ASCII space.
- Reject empty or whitespace-only instructions.
- Reject C0/C1 controls except TAB, LF, and CR before whitespace collapse.
- Reject bidi control characters.

## 6. Fingerprints and Canonicalization

All 6D fingerprints use the source-controlled `canonicalJsonStringify` behavior from `extension/src/generation/canonical-json.ts` or an exactly equivalent source-controlled helper: JSON-compatible values only, deterministic object key ordering, no functions, no prototypes, no `undefined`, and no insertion-order dependence. The digest helper is the existing SHA-256 text digest behavior or an equivalent source-controlled helper. All digest outputs are lowercase 64-character SHA-256 hex strings.

Domain-separated fingerprints:

| Fingerprint | Algorithm | Local or sent |
| --- | --- | --- |
| `sourceGeneratedVersionFingerprint` | `sha256HexText("ElementCatcher.SourceGeneratedVersionFingerprint.V1\\n" + canonicalJsonStringify(validatedSourceGeneratedVersionEntry))` | Local only; not sent to backend/provider. |
| `instructionFingerprint` | `sha256HexText("ElementCatcher.RevisionInstructionFingerprint.V1\\n" + normalizedInstruction)` | Local only; not sent to backend/provider. |
| `currentReviewFingerprint` | Existing Milestone 5 Review fingerprint over the current Review request-without-data-url plus screenshot digest/metadata. For 6D, it represents the current CaptureRecord projection used by the frozen Review. | Local only. |
| `reviewAttemptFingerprint` | `sha256HexText("ElementCatcher.RevisionReviewAttemptFingerprint.V1\\n" + canonicalJsonStringify(reviewAttemptFingerprintInput))` | Local only. |

`sourceGeneratedVersionFingerprint` canonicalizes the entire validated V1 or V2 source entry. No field is excluded. V1 entries are canonicalized as the exact validated legacy object with no top-level `contractVersion`. V2 entries are canonicalized as the exact validated V2 object. Object key order cannot change the result because canonical serialization sorts keys deterministically.

`instructionFingerprint` exists only for revision. Regeneration must not include it.

`reviewAttemptFingerprintInput` is:

```ts
type ReviewAttemptFingerprintInputV1 = {
  mode: "revision" | "regeneration";
  localSourceCaptureId: string;
  localSourceGeneratedVersionId: string;
  sourceGeneratedVersionFingerprint: string;
  sourceComponent: {
    componentName: string;
    framework: "react";
    styling: "tailwind";
    code: string;
    summary: string;
    approximationNotes: string;
  };
  captureContext: ExactCaptureContextProjectionV1;
  revisionInstruction?: string;
  requestedOutput: {
    framework: "react";
    styling: "tailwind";
    fields: ["componentName", "code", "summary", "approximationNotes"];
  };
  screenshot: {
    included: boolean;
    mediaType?: "image/png";
    width?: number;
    height?: number;
    byteLength?: number;
    digest?: string;
  };
  currentReviewFingerprint: string;
  logicalAttemptId: string;
};
```

The fingerprint binds local IDs and local fingerprints even though those IDs are not sent. If screenshot is not included, `screenshot` is exactly `{ included: false }`. If screenshot is included, digest and approved metadata are included; the Base64 data URL is not included in the fingerprint input.

Fields sent to backend/provider are only the visible outbound request body in section 8 plus the required idempotency header for the backend. Local IDs, local fingerprints, `logicalAttemptId`, and raw idempotency values are not provider-visible prompt content.

## 7. Current CaptureRecord Semantics

6D uses the current validated CaptureRecord at Review time.

Rules:

- Build the new Review from the current validated CaptureRecord and current screenshot asset metadata at Review time.
- Do not require the current Review fingerprint to equal the selected ancestor version's historical `sourceReviewFingerprint`.
- Preserve the ancestor through `sourceGeneratedVersionId` and `sourceGeneratedVersionFingerprint`.
- Store the current Review fingerprint as the top-level `sourceReviewFingerprint` on the new V2 result.
- Revalidate that same frozen current Review before transport.
- Revalidate the same frozen current Review preconditions again inside the final persistence transaction.
- Notes remain excluded.
- Any change to transmitted current CaptureRecord fields after Review invalidates the Review and the `logicalAttemptId`.

This means user edits to title, tags, or component type after the ancestor was created do not block revision. If those fields are transmitted in the current Review projection, they are part of the new frozen Review and must remain stable for the attempt. Local notes are not transmitted and do not affect the attempt.

## 8. Exact Outbound Privacy Projection

The Review UI must show every user-derived field approved for transmission. No hidden user-derived prompt data may leave the extension. Fixed source-controlled backend system instructions may be hidden only by category: safety instructions, strict JSON output instructions, provider-neutral React + Tailwind generation instructions, prompt-injection warnings, and screenshot handling rules. These fixed instructions must contain no private user data.

Backend request body:

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
| revision/regeneration mode | Sent |
| normalized revision instruction | Sent for revision only |
| selected generated component code | Sent |
| selected `componentName` | Sent |
| selected summary | Sent |
| selected approximationNotes | Sent |
| current CaptureRecord Review projection | Sent |
| screenshot bytes/data URL | Optional explicit checkbox only |
| screenshot metadata | Sent only when screenshot is included |
| sourceCaptureId | Not sent |
| sourceGeneratedVersionId | Not sent |
| local timestamps | Not sent |
| source URL | Not sent |
| page title | Not sent |
| local database IDs | Not sent |
| screenshot asset key | Not sent |
| notes | Not sent |
| browser storage | Not sent |
| cookies | Not sent |
| prior provider metadata | Not sent |
| local fingerprints | Not sent |
| `logicalAttemptId` | Backend idempotency header only; never provider-visible prompt content |

Screenshot rule: screenshot is optional through a separate explicit checkbox, unchecked by default. Retry reuses the same screenshot choice only while the frozen Review remains unchanged. Changing the screenshot choice invalidates the old attempt and creates a new `logicalAttemptId` on the next Review.

## 9. Backend Contract and Idempotency Header

Route decision:

```text
POST /v1/revise-component
```

Required request headers:

- `Content-Type: application/json`
- `X-Element-Catcher-Contract-Version: 1`
- `X-Element-Catcher-Idempotency-Key: <logicalAttemptId>`

`X-Element-Catcher-Idempotency-Key` is required. Its value must equal the validated `logicalAttemptId` for the frozen Review attempt. It is included in CORS allowed headers and preflight validation for `/v1/revise-component`.

Idempotency key privacy:

- backend-visible;
- never included in provider-visible prompt content;
- not returned to the extension;
- not written into ordinary logs as a raw value;
- may be hashed or classified in controlled diagnostics if a later logging design approves it.

Server-side provider-call deduplication remains optional for 6D. Extension deterministic persistence remains mandatory and is the correctness boundary for local duplicates. Residual risk: without server-side provider-call deduplication, duplicate provider billing can still occur after transport ambiguity.

Successful response decision: reuse `ComponentGenerationResponseV1`. Lineage is stored locally in V2 entries, not in the provider response.

Backend responsibilities:

- exact-key validate request body;
- validate required idempotency header;
- validate optional screenshot using Milestone 5 screenshot rules when present;
- enforce instruction/source/summary/response bounds;
- construct provider prompt from fixed instructions plus the visible request body only;
- treat source component code, CaptureRecord text, and revision instruction as untrusted reference data;
- normalize provider response into `ComponentGenerationResponseV1`;
- return safe bounded errors only;
- never return provider secrets, stack traces, raw provider response IDs, raw provider errors, or raw idempotency values.

## 10. V2 Lineage and Persistence Contract

Decision: V2 is a precise discriminated union used only for 6D revision and regeneration entries. Existing V1 entries remain legacy initial-generation entries. 6D does not define V2 initial-generation entries.

No IndexedDB version bump is required. V2 entries are stored in the existing `generatedComponentVersions` object store using the existing `id` keyPath and `sourceCaptureId` index.

```ts
type GeneratedComponentVersionEntryV2 =
  | GeneratedComponentRevisionVersionEntryV2
  | GeneratedComponentRegenerationVersionEntryV2;

type GeneratedComponentVersionEntryV2Base = {
  contractVersion: 2;
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceReviewFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
};

type GeneratedComponentRevisionVersionEntryV2 =
  GeneratedComponentVersionEntryV2Base & {
    operation: {
      kind: "revision";
      logicalAttemptId: string;
      reviewAttemptFingerprint: string;
      sourceGeneratedVersionId: string;
      sourceGeneratedVersionFingerprint: string;
      instruction: string;
      instructionFingerprint: string;
      screenshotIncluded: boolean;
    };
  };

type GeneratedComponentRegenerationVersionEntryV2 =
  GeneratedComponentVersionEntryV2Base & {
    operation: {
      kind: "regeneration";
      logicalAttemptId: string;
      reviewAttemptFingerprint: string;
      sourceGeneratedVersionId: string;
      sourceGeneratedVersionFingerprint: string;
      screenshotIncluded: boolean;
    };
  };
```

Top-level `sourceReviewFingerprint` is the one authoritative current Review fingerprint. It is not duplicated inside `operation`.

Exact key rules:

- V2 top-level keys must be exactly `contractVersion`, `id`, `sourceCaptureId`, `sourceCaptureSavedAt`, `sourceReviewFingerprint`, `createdAt`, `value`, `operation`.
- Revision operation keys must be exactly `kind`, `logicalAttemptId`, `reviewAttemptFingerprint`, `sourceGeneratedVersionId`, `sourceGeneratedVersionFingerprint`, `instruction`, `instructionFingerprint`, `screenshotIncluded`.
- Regeneration operation keys must be exactly `kind`, `logicalAttemptId`, `reviewAttemptFingerprint`, `sourceGeneratedVersionId`, `sourceGeneratedVersionFingerprint`, `screenshotIncluded`.
- Regeneration forbids `instruction` and `instructionFingerprint`.
- Any V2 `operation.kind: "initial-generation"` is rejected as underdefined and malformed for 6D.
- `value` remains `ComponentGenerationResponseV1`.

Reader behavior:

- A valid object with no top-level `contractVersion` is validated only as legacy V1 with the current exact V1 keys.
- A valid object with `contractVersion: 2` is validated only as the V2 union above.
- Unknown top-level or operation keys are rejected.
- Malformed legacy V1 entries are ignored or cleaned up according to existing reader behavior.
- Malformed V2 entries are ignored or cleaned up by the same safe reader path only after validation failure; they must never be coerced into V1.
- V1 legacy entries remain readable as initial-generation entries.

Lineage:

- `sourceCaptureId` is preserved on all V2 entries.
- `sourceGeneratedVersionId` and `sourceGeneratedVersionFingerprint` are required for revision and regeneration.
- Lineage is a soft reference, not an IndexedDB foreign key.
- A valid descendant may be read with a missing-ancestor marker if a missing ancestor state is encountered.

## 11. Atomic Persistence Transaction

Preparation-time reads, pre-transport revalidation, and transaction-time persistence preconditions are distinct.

Preparation-time source reads:

- read current CaptureRecord and screenshot asset;
- read selected source generated version;
- validate both;
- compute source generated-version fingerprint;
- build current CaptureRecord Review projection.

Pre-transport Review revalidation:

- verify the frozen Review still matches the current selected source, current CaptureRecord projection, screenshot choice, and source-generated-version fingerprint;
- if any outbound value changed, invalidate the attempt and require returning to Review with a new `logicalAttemptId`.

Final persistence operation:

- use one `readwrite` transaction covering `captureRecords`, `screenshotAssets`, and `generatedComponentVersions`;
- inside that same transaction, before adding the new V2 entry:
  - re-read the current CaptureRecord;
  - validate its wrapper, `sourceCaptureId`, `savedAt`, and frozen Review fingerprint/preconditions;
  - validate screenshot asset/reference when the frozen Review includes screenshot;
  - re-read the selected source generated version from `generatedComponentVersions`;
  - validate it as V1 or V2;
  - verify `sourceCaptureId` linkage;
  - recompute and compare `sourceGeneratedVersionFingerprint`;
  - verify the deterministic target generated-version ID;
  - check whether an equal target already exists;
  - add the new V2 entry only if all preconditions still hold;
  - read the target entry back;
  - validate exact equality before transaction success.

The source generated-version read and new-entry add must occur in the same `generatedComponentVersions` readwrite transaction. Deletion or mutation during provider transport cannot pass a stale pre-request check.

Deterministic target ID:

```text
generated-version-${sha256HexText("ElementCatcher.RevisionGeneratedVersionId.V1\n" + logicalAttemptId).slice(0, 32)}
```

Success ordering:

1. Validate and normalize input.
2. Preparation-time source reads.
3. Construct frozen Review.
4. Create `logicalAttemptId`.
5. Display frozen Review.
6. Obtain consent.
7. Pre-transport Review revalidation.
8. Transmit with required idempotency header.
9. Validate normalized response.
10. Enforce componentName policy.
11. Construct pending immutable V2 entry.
12. Run the atomic persistence transaction.
13. Expose success only after commit and validated read-back for the current workflow.
14. Keep Preview closed.

Failure and recovery:

| Failure | Behavior |
| --- | --- |
| Missing CaptureRecord | Fail before transport or inside transaction; Retry unavailable until source exists. |
| Missing source generated version | Fail before Review/transport or inside transaction; no V2 entry added. |
| Current CaptureRecord projection changed after Review | Invalidate attempt; new Review creates new `logicalAttemptId`. |
| Screenshot choice or digest changed after Review | Invalidate attempt. |
| Source generated version changed/tampered | Fingerprint mismatch; fail safely. |
| Source deleted during provider request | Same-transaction re-read fails; no entry added. |
| Duplicate target ID with equal entry | Read back existing equal entry and treat as idempotent success only for current workflow. |
| Duplicate target ID with different entry | Persistence conflict; no success. |
| Unknown persistence outcome | Later deterministic recovery lookup may display a valid committed entry after read-back. |

## 12. Idempotency and Retry

`logicalAttemptId` is stable only for one frozen Review attempt.

| Scenario | Required behavior |
| --- | --- |
| Repeated submit click | Ignored while in flight. |
| Transport Retry with unchanged frozen Review | Reuses same `logicalAttemptId`, same idempotency header, same screenshot choice, same Review body. |
| Back-to-edit changes instruction | Old attempt invalidated; next Review creates new `logicalAttemptId`. |
| Back-to-edit changes screenshot choice | Old attempt invalidated; next Review creates new `logicalAttemptId`. |
| Selected source version changes | Old attempt invalidated. |
| CaptureRecord transmitted fields change | Old attempt invalidated. |
| Persistence Retry | Reuses same pending V2 entry and deterministic ID; no provider call. |
| Explicit new alternative | Creates new `logicalAttemptId` and new deterministic target ID. |
| Duplicate backend delivery | Deterministic persistence dedupes equal entry or rejects conflict. |
| Transport success followed by extension timeout | Recovery searches deterministic ID first; provider Retry may reuse same idempotency header if frozen Review still holds. |

Transport Retry must not create uncontrolled duplicate versions. Persistence Retry must not call the provider.

## 13. Cancellation and Stale Responses

Abort is best effort.

Rules:

- If cancellation wins before IndexedDB commit, no V2 entry is added.
- If the IndexedDB transaction has already committed, the entry may remain persisted.
- A cancelled or stale workflow must not show success, update the active workflow, select the result, or trigger Preview.
- A later user-triggered refresh, reopen, or deterministic recovery lookup may display the validated persisted version normally.
- Cancellation must never delete an already committed valid version merely to make UI state appear cancelled.

Every async continuation is bound to:

- `sourceCaptureId`;
- `sourceGeneratedVersionId`;
- `sourceGeneratedVersionFingerprint`;
- `logicalAttemptId`;
- `reviewAttemptFingerprint`;
- workflow generation token.

Cancellation and stale coverage:

| Event | Required behavior |
| --- | --- |
| Cancel before transport | No request; workflow becomes cancelled. |
| Cancel during transport | Abort fetch best-effort; late response ignored. |
| Cancel before transaction commit | Transaction abort best-effort; no success UI. |
| Cancel after commit | UI remains cancelled/stale; later refresh may discover valid result. |
| Close detail | Abort and retire workflow token. |
| Switch source version | Abort current workflow and invalidate attempt. |
| Start second revision/regeneration | Retire previous token; late continuations ignored. |
| Delete source CaptureRecord | Active workflow fails safely; capture-level cleanup remains existing behavior. |
| Source generated version missing by transaction time | Persistence precondition fails. |
| Late success after newer attempt | Ignored; no UI update, no selection, no Preview. |
| Stale persistence completion | Cannot update active UI; committed result is discoverable only by later user action. |

## 14. Deletion and Orphan Scope

Milestone 6D does not add a new individual generated-version deletion button or production management workflow.

Rules:

- CaptureRecord deletion continues to remove all generated versions for `sourceCaptureId`.
- During an active 6D workflow, a source generated version that becomes missing through storage mutation or test setup causes safe failure.
- V2 lineage remains a soft reference, so a valid descendant can be read with a missing-ancestor marker if such a state is encountered.
- A future user-facing individual version deletion feature requires separate scope and review.
- Acceptance tests may seed a missing ancestor through storage/unit harnesses to validate safe reader behavior without introducing production delete UI.

## 15. Component-Name Policy

Revision and regeneration preserve the source `componentName`.

- Backend prompt instructs the provider to return the same `componentName`.
- Extension validates response `componentName` equals source `componentName`.
- Silent provider rename is `invalid-response` and is not persisted.
- Retry reuses the same expected name while the frozen Review remains unchanged.
- Duplicate component names across versions are allowed because identity is the generated-version ID and lineage.
- User rename is out of 6D scope and requires separate approval.

## 16. Preview and Execution Boundary

6D does not change preview architecture.

- Revised output is response data.
- Response validation does not make source trusted.
- Persistence does not preview.
- Preview requires a separate explicit `Preview` action after verified persistence.
- Revised source reaches only the 6C sandbox host.
- Render realm never receives source.
- Unsupported source remains visible and copyable.
- Revision failure cannot modify source version.
- Protocol V2, Previewable Subset V1, sibling sandbox topology, source-controlled utility CSS, CSP, and preview limits remain unchanged.

## 17. Threat Model

| Threat | Trust boundary | Prevention | Detection | Failure behavior | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Malicious revision instruction | User text to backend/provider | Bounds, normalization, visible Review, untrusted-data prompt | Input validator and instruction fingerprint | Reject before Review | Model may still misinterpret benign intent. |
| Prompt injection in generated source | Persisted source to provider | Treat source as untrusted reference data | Request bounds and backend prompt | Invalid response rejected; preview still gated | Valid-looking unsafe source remains inert until Preview gate. |
| Prompt injection in CaptureRecord text | Capture projection to provider | Existing bounded projection and untrusted-data prompt | Request validation | Reject malformed projection | Text may still affect aesthetics. |
| Hostile model output | Provider to backend/extension | Strict response schema and component-name equality | Backend and extension validators | Safe error or invalid-response | Schema-valid hostile source remains inert and must pass 6C preview gate. |
| Source version tampering | IndexedDB to workflow | Same-transaction re-read and fingerprint recompute | Fingerprint mismatch | No V2 entry added | Local storage attacker can still delete data. |
| Current CaptureRecord TOCTOU | Local metadata/storage to persistence | Frozen Review fingerprint and transaction preconditions | Current Review mismatch | Attempt invalidated or persistence fails | User must review again. |
| Cross-capture lineage mix-up | UI state to persistence | Local IDs in attempt fingerprint; source linkage checks | Transaction validation | Reject | Future UI filters must preserve binding. |
| Duplicate backend delivery | Backend to extension | Required idempotency header and deterministic target ID | Duplicate-key equality check | Idempotent success or conflict | Provider billing may duplicate without server dedupe. |
| Replayed response | Network/backend to extension | Attempt binding and deterministic target ID | Review/source fingerprint checks | Ignore/reject | No server response signature in 6D. |
| Hidden outbound fields | Extension to backend/provider | Review equals request body; exact keys | Privacy tests | Block request | Future prompt edits need review. |
| Raw idempotency leakage | Header/log boundary | Header excluded from prompt; no raw ordinary logs | Backend tests | Safe failure | Ops logging policy still needed for production. |
| Oversized instruction/source/response | User/provider boundary | Bounds and byte limits | Validators | Reject | Large valid source may cost more. |
| Persistence race | IndexedDB transaction | Same readwrite transaction over required stores | Read-back equality | No success | Browser unload can still interrupt UI. |
| Cancellation after commit | UI to persistence | Stale guards; no cleanup deletion | Deterministic recovery lookup | Cancelled UI; later refresh can show valid result | User may see result after refresh. |
| Auto-preview/execution | Persistence to preview | Separate Preview action | UI regression tests | No Preview opened | User education still needed. |
| Missing ancestor | Reader lineage | Soft reference marker | Reader validation | Show marker, not crash | Descendant context may be incomplete. |

## 18. Accessibility and UX Contract

- Field label: `Revision instruction`.
- Help text: `Describe one change to make to this saved generated version. Do not include private data.`
- Maximum-length display: `0 / 1000 characters`; byte-limit error appears only when exceeded.
- Validation timing: live for obvious length/control issues, full at Review.
- Review headings: `Source version`, `Instruction`, `Approved capture context`, `Optional screenshot`, `Excluded data`, `Consent`.
- Consent action text: `I understand this displayed data will leave my device and may use paid AI capacity.`
- Buttons: `Revise`, `Regenerate`, `Review revision`, `Review regeneration`, `Send revision to AI`, `Send regeneration to AI`, `Back to edit`, `Cancel`, `Retry after review`, `Retry saving`, `Close revision`, `Preview`.
- Progress status: `Revising with the configured AI backend...` or `Regenerating with the configured AI backend...`.
- Cancelled status: `Revision cancelled.` or `Regeneration cancelled.`
- Success status: `Saved revised generated version locally.` or `Saved regenerated version locally.`
- Focus after error: invalid field or first Retry button.
- Focus after cancellation: `Review again`.
- Focus after success: new generated-version heading only for the current workflow.
- Live regions: polite for progress/success, assertive alert for validation/failure.
- Keyboard: Tab reaches every control; Enter in textarea inserts text; Escape cancels editing only when no confirmation is active.

## 19. Acceptance Test Matrix

| Area | Test | Unit | Backend integration | IndexedDB integration | Playwright extension runtime |
| --- | --- | --- | --- | --- | --- |
| Attempt | `logicalAttemptId` created at frozen Review time | Yes | No | No | Yes |
| Attempt | Back-to-edit instruction change creates new attempt | Yes | No | No | Yes |
| Attempt | screenshot-choice change creates new attempt | Yes | No | No | Yes |
| Attempt | repeated submit ignored while in flight | Yes | No | No | Yes |
| Contract | exact revision input keys | Yes | No | No | No |
| Contract | exact V2 revision keys | Yes | No | Yes | No |
| Contract | exact V2 regeneration keys | Yes | No | Yes | No |
| Contract | underdefined V2 initial-generation entry rejected | Yes | No | Yes | No |
| Contract | wrong contract version | Yes | Yes | Yes | No |
| Contract | wrong mode | Yes | Yes | No | No |
| Contract | invalid IDs | Yes | Yes | Yes | No |
| Contract | unknown keys | Yes | Yes | Yes | No |
| Contract | instruction code-point limit | Yes | Yes | No | Yes |
| Contract | instruction UTF-8 byte limit | Yes | Yes | No | Yes |
| Fingerprint | canonical stability across object key ordering | Yes | No | No | No |
| Fingerprint | source V1 fingerprint | Yes | No | Yes | No |
| Fingerprint | source V2 fingerprint | Yes | No | Yes | No |
| Fingerprint | instruction normalization and fingerprint | Yes | No | No | Yes |
| Fingerprint | review attempt fingerprint binds local IDs and outbound projection | Yes | No | No | Yes |
| Fingerprint | fingerprint mismatch fails safely | Yes | No | Yes | Yes |
| Privacy | Review projection exactly equals request body | Yes | No | No | Yes |
| Privacy | excluded fields absent | Yes | Yes | No | Yes |
| Privacy | screenshot rule enforced | Yes | Yes | No | Yes |
| Privacy | no source URL/page title/local IDs in body | Yes | Yes | No | Yes |
| Privacy | no cookies/storage/notes/prior provider metadata | Yes | Yes | No | Yes |
| Privacy | no raw idempotency value in provider prompt, response, or ordinary logs | Yes | Yes | No | No |
| Backend | required idempotency header | No | Yes | No | No |
| Backend | CORS preflight allowlist includes idempotency header | No | Yes | No | No |
| Backend | safe bounded errors | Yes | Yes | No | No |
| Backend | no real OpenAI request during validation | No | Yes | No | Yes |
| CaptureRecord | current metadata edit semantics | Yes | No | Yes | Yes |
| CaptureRecord | current transmitted field change invalidates attempt | Yes | No | Yes | Yes |
| Lineage | sourceCaptureId preserved | Yes | No | Yes | Yes |
| Lineage | sourceGeneratedVersionId preserved | Yes | No | Yes | Yes |
| Lineage | source version deletion during provider request | Yes | No | Yes | Yes |
| Lineage | source version changed/tampered before persistence | Yes | No | Yes | Yes |
| Lineage | missing ancestor reader behavior without production delete UI | Yes | No | Yes | Yes |
| Persistence | atomic same-transaction source-version re-read | Yes | No | Yes | No |
| Persistence | deterministic target ID verified | Yes | No | Yes | No |
| Persistence | equal duplicate target is idempotent | Yes | No | Yes | Yes |
| Persistence | conflicting duplicate target fails | Yes | No | Yes | Yes |
| Persistence | read-back equality required before success | Yes | No | Yes | Yes |
| Idempotency | transport Retry with unchanged frozen Review | Yes | Yes | Yes | Yes |
| Idempotency | persistence Retry uses pending entry, no provider call | Yes | No | Yes | Yes |
| Idempotency | explicit new alternative creates distinct ID | Yes | No | Yes | Yes |
| Cancellation | cancel before commit | Yes | No | Yes | Yes |
| Cancellation | cancel after commit shows no stale UI success | Yes | No | Yes | Yes |
| Cancellation | later refresh discovers committed valid result | Yes | No | Yes | Yes |
| Cancellation | late success/failure after newer workflow ignored | Yes | Yes | Yes | Yes |
| UI safety | no 6D UI path active before stale guards exist | No | No | No | Yes |
| UI | focus and live regions | No | No | No | Yes |
| Regression | Milestone 5 Review/consent unchanged | Yes | No | No | Yes |
| Regression | Milestone 6C preview isolation unchanged | Yes | No | No | Yes |
| Regression | no automatic execution | Yes | No | No | Yes |
| Regression | no runtime implementation in documentation task | No | No | No | No |

## 20. Implementation Slices

Incomplete backend or transport helpers must remain unreachable from production UI until the trusted complete UI workflow is accepted.

| Slice | Purpose | Allowed files | Dependencies | Acceptance criteria | May commit independently? | Prohibited scope | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Contract, canonicalization, and fingerprint foundation | Define revision input, V2 union validators, fingerprint helpers, deterministic ID helper | `extension/src/shared/*`, `extension/src/generation/*`, focused tests | Approved architecture | V1 readable; malformed V2 rejected; fingerprints stable | Yes | Reachable UI/backend behavior | Independent acceptance |
| 2. Backend revision route, unreachable from production UI | Add `/v1/revise-component`, required idempotency header, CORS, validation, prompt construction | `backend/src/*`, backend tests | Slice 1 shared contracts | Exact keys, safe errors, no raw idempotency/provider data | Yes | Wiring to production UI | Independent acceptance |
| 3. Extension transport and Review projection helpers, unreachable from production UI | Build request body and Review projection builders | `extension/src/generation/*`, tests | Slices 1-2 | Review equals request; hidden fields absent | Yes | User-visible send/save path | Independent acceptance |
| 4. Atomic V2 persistence and deterministic recovery | Enforce same-transaction CaptureRecord/source-version re-read, target ID, read-back | `extension/src/storage/*`, tests | Slices 1 and 3 | TOCTOU closed; duplicate behavior correct | Yes | UI send path without stale guards | Independent acceptance |
| 5. Complete trusted Side Panel workflow | Add first reachable Revise/Regenerate UI with AbortController ownership, workflow-token retirement, source/attempt binding, late-continuation rejection | `extension/src/sidepanel/*`, styles, Playwright | Slices 1-4 | Complete Review/consent/send/save/cancel/Retry safety in first UI release | Yes | Partial unsafe production UI | Independent acceptance |
| 6. Regression hardening | Broaden stale, cancellation, privacy, M5, M6C tests | tests and docs | Slices 1-5 | Full accepted matrix coverage | Yes | New product scope | Independent acceptance |
| 7. Documentation closeout | Mark implementation slice results without starting 6E | docs only | Slices 1-6 | Milestone status remains correct until acceptance | Yes | 6E/version comparison/export | Independent acceptance |

## 21. Final Decisions Table

| Topic | Selected design | Rejected alternatives | Reason | Implementation impact | Approval still required |
| --- | --- | --- | --- | --- | --- |
| Revision semantics | Selected persisted version plus one bounded instruction creates new immutable V2 version | Overwrite source; chat transcript | Simpler and lineage-safe | V2 revision operation | Yes |
| Regeneration semantics | Same workflow, explicit mode, no instruction | Deferred; separate model | Shares privacy/idempotency semantics | V2 regeneration operation | Yes |
| `logicalAttemptId` lifecycle | Created after validation, source re-read, Review freeze, before Review display | Create on edit, on consent, or after transport | Single consistent Retry boundary | Frozen Review owns attempt | Yes |
| `requestId` | Removed from 6D contract | Optional unused ID | Avoid unused identity | Stale binding uses attempt/review/token | Yes |
| V2 contract | Discriminated union for revision/regeneration only | V2 initial-generation | Avoid underdefined initial behavior | Union validators | Yes |
| Fingerprints | Domain-separated canonical SHA-256 | Descriptive hashes | Stable validation and TOCTOU checks | Fingerprint helpers/tests | Yes |
| Current CaptureRecord edits | Current Review projection at Review time; no equality to ancestor fingerprint | Block title/tag/component-type edits | User metadata edits should not block revision | Store current fingerprint on V2 | Yes |
| Screenshot | Optional explicit checkbox, off by default | Always or never | Privacy/cost/fidelity balance | Choice invalidates attempt when changed | Yes |
| Backend route | Dedicated `/v1/revise-component` | Reuse `/v1/generate-component` | Avoid V1 exact-key ambiguity | New route and tests | Yes |
| Idempotency header | Required `X-Element-Catcher-Idempotency-Key` | Optional header | Matches Retry contract | CORS/preflight update | Yes |
| Response | Reuse `ComponentGenerationResponseV1` | Revision-specific response | Lineage is local | Existing validator reused | Yes |
| Persistence | Same readwrite transaction over required stores | Pre-request source check only | Closes source-version deletion race | Atomic persistence function | Yes |
| Cancellation after commit | Cancelled/stale UI does not show success; committed result may remain | Delete committed result | Preserve valid committed data | Recovery lookup later | Yes |
| Individual deletion | Out of 6D production scope | Add delete UI now | Not approved product scope | Missing ancestor tests only | Yes |
| ComponentName | Preserve source name | Provider rename | Deterministic preview/list | Equality check | Yes |
| Preview | Separate explicit Preview after persistence | Auto-preview | Preserve 6C | No protocol changes | Yes |
| Slice safety | First reachable UI includes stale/cancel guards | Add guards later | Avoid unsafe partial workflow | Reordered slices | Yes |
| 6D/6E boundary | No comparison/export | Start 6E | Keep scope tight | 6E remains Planned | Yes |

## 22. Residual Risks

- Without server-side provider-call deduplication, duplicate provider billing can still occur after ambiguous transport Retry.
- No server response signature binds response to request; the extension relies on source/review/attempt binding and deterministic persistence.
- Optional screenshot resend improves fidelity but increases privacy and cost when selected.
- Soft missing-ancestor handling needs careful UI language in implementation.
- V2 entries in the existing object store require every generated-version reader to accept V1/V2 intentionally and reject malformed records safely.
- Production backend operations such as authentication, quotas, budgets, monitoring, and abuse prevention remain separate future work.

## 23. Production Approval Gate

Before implementation starts, independent review must approve:

- consistent `logicalAttemptId` lifecycle;
- exact V2 discriminated union;
- fingerprint algorithms and domain separators;
- current CaptureRecord edit semantics;
- atomic source-version re-read and persistence transaction;
- cancellation-after-commit behavior;
- individual generated-version deletion scope exclusion;
- required idempotency header and CORS behavior;
- safe implementation slice ordering;
- expanded acceptance matrix;
- preservation of Milestone 5 consent and Milestone 6C preview boundaries.

No production implementation exists from this document alone.
