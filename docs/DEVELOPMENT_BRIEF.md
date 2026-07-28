# Element Catcher v0.1 Development Brief

## 1. Objective

Describe the current Element Catcher architecture after completion of Milestones 1 through 5 and the accepted Milestone 6C Preview plus Milestone 6D revision/regeneration work.

Current implementation order:

```text
Milestones 1-5: Completed
Milestone 6: Current
Milestone 6A: Completed
Milestone 6B: Completed
Milestone 6C: Completed
Milestone 6D: Completed
Milestone 6E: Current
Milestone 7: Planned
```

Milestone 6E is the current handoff for version comparison and final Milestone 6 integrated regression. Export remains planned for Milestone 7.

## 2. Current Architecture

```text
Supported webpage
  -> content script selection and extraction
  -> background screenshot capture
  -> CaptureRecord assembly
  -> IndexedDB local persistence
  -> Capture Library
  -> generation Review data
  -> provider-neutral transport
  -> local backend/proxy
  -> provider adapter
  -> generated-version persistence
  -> isolated Preview
  -> revision/regeneration Review
  -> immutable V2 generated-version persistence
```

The `CaptureRecord` remains the immutable source capture. Generated versions have a separate lifecycle and are linked to the source capture through a generated-version persistence envelope.

## 3. Development Principles

- Keep the MVP focused on Capture -> Save -> Organize -> Rebuild -> Preview -> Revise/Regenerate.
- Preserve local-first behavior by default.
- Treat raw extraction data as intermediate input, not the persisted product.
- Normalize persisted capture data into `CaptureRecord v1`.
- Store screenshot binary data as referenced local assets.
- Do not persist live DOM references or unsanitized raw `outerHTML`.
- Preserve the distinction between original captures and generated component versions.
- Keep provider secrets out of extension code, browser storage, IndexedDB, logs, source maps, and committed files.
- Treat captured strings and user metadata as untrusted data.
- Execute only accepted Previewable Subset V1 render plans in the isolated Milestone 6C sandbox.
- Keep revised and regenerated source inert until the user explicitly chooses Preview.
- Avoid unnecessary dependencies and permissions.

## 4. Module Responsibilities

### 4.1 Side Panel

The Side Panel owns the user workflow:

- Start capture.
- Display selection, capture, save, library, detail, metadata edit, delete, search, filter, generation, and generated-version states.
- Render Capture Preview from persisted data.
- Render saved-capture detail from local read models.
- Show Review data for generation.
- Require consent before generation transport.
- Display generated code as inert source text.
- Open generated versions from saved-capture detail.
- Preview supported generated source through the explicit Milestone 6C sandbox action.
- Start trusted Revision or Regeneration from a selected generated version.
- Show exact frozen revision/regeneration Review data and require consent before transport.
- Persist successful revision/regeneration results as immutable V2 generated-version entries.

### 4.2 Background Service Worker

The background service worker coordinates privileged extension actions:

- Configure side panel open behavior.
- Route selection commands between the side panel and active tab.
- Guard unsupported pages.
- Capture the current visible tab through `chrome.tabs.captureVisibleTab`.
- Keep privileged Chrome APIs out of content scripts.

It does not contain provider credentials and does not call OpenAI directly.

### 4.3 Content Script

The content script handles supported-page interaction:

- Selection mode.
- Hover overlay and label.
- Click-to-lock selection.
- Parent/Child refinement.
- Confirm and cancellation.
- Overlay cleanup before screenshot capture.
- Privacy-safe DOM extraction.
- Normalized style extraction.
- Optional pseudo-element snapshots.
- Semantic summaries.

The content script does not persist captures permanently, does not store provider credentials, and does not bypass browser access controls.

### 4.4 Shared Contracts and Validators

Shared modules define browser-independent contracts and validators:

- Extension messages.
- `CaptureRecord v1` types and validation.
- JSON compatibility helpers.
- Generation request and response contracts.
- Revision request/input contracts.
- Request projection limits.
- Canonical JSON and fingerprint helpers.
- Generated-version V1/V2 persistence contract.
- Preview protocol and Previewable Subset V1 policy.

These modules keep backend, extension, and tests aligned on exact schema and limit behavior.

### 4.5 CaptureRecord Assembly

CaptureRecord assembly converts confirmed extraction plus verified screenshot metadata into one complete `CaptureRecord v1`:

- `schemaVersion: 1`.
- Stable capture id.
- ISO `createdAt`.
- Source, environment, element, DOM, style, pseudo-style, and summary fields.
- Stable screenshot asset reference.
- User library metadata.
- Required `generatedVersions` compatibility field initialized as an empty array.

The screenshot data URL is not stored in the `CaptureRecord`.

### 4.6 IndexedDB Repositories

Current persistence architecture:

```text
IndexedDB version: 2

Stores:
- captureRecords
- screenshotAssets
- generatedComponentVersions

Index:
- generatedComponentVersions.sourceCaptureId
```

Repository responsibilities:

- Atomic capture and screenshot writes.
- Capture read models.
- Metadata replacement with validation and read-back.
- Atomic deletion and rollback behavior.
- Generated-version add, direct read, list, and source-deletion cascade.
- Generated-version V1/V2 union read paths.
- V2 revision/regeneration target persistence and recovery.
- Complete source `CaptureRecord v1` validation for generated-version linkage.
- Complete selected source generated-version validation for V2 lineage.
- Orphan cleanup when generated versions no longer have a valid source capture.
- Deterministic generated-version ordering.

The database remains at version 2 with exactly the three stores above and one generated-version source index.

### 4.7 Capture Library

The Capture Library is implemented as local UI over persisted captures:

- List all valid explicitly saved captures.
- Reopen saved detail.
- Display Blob-backed previews.
- Edit user-managed title, component type, tags, and notes.
- Delete captures.
- Search and filter with approved field allowlists.
- Preserve source `CaptureRecord` and screenshot asset integrity.

Search/filter state is session-only and does not write to persistence.

### 4.8 Generation Workflow

The generation workflow is implemented from saved capture detail:

- Reread and validate saved capture and screenshot before generation.
- Build the exact outbound projection.
- Compute local review fingerprint.
- Show Review data before transmission.
- Require explicit consent.
- Create Base64 screenshot data URL only after consent and immediately before transport.
- Revalidate source and screenshot before sending and before persistence.
- Abort transport and persistence where practical.
- Validate responses before persistence.
- Persist generated versions only after source linkage and fingerprint checks.

Generated code remains inert text unless the user explicitly chooses Preview.

### 4.9 Preview Workflow

The accepted Milestone 6C Preview workflow is implemented from saved-capture detail:

- Preview is an explicit user action on a persisted generated version.
- Generated source is sent only to the packaged sandbox host.
- The host parses JSX with the approved parser and converts accepted source into `PreviewRenderPlanV1`.
- The trusted Side Panel validates identities, message direction, request/session data, source hash, component name, plan schema, and plan hash before relay.
- The sandbox render realm receives only the validated data plan and renders through trusted React.
- Unsupported or unsafe generated source remains visible as inert source text.
- Preview does not mutate captures or generated versions and does not auto-open after revision/regeneration persistence.

### 4.10 Provider-Neutral Transport

The extension depends on a provider-neutral transport boundary:

```ts
type GenerationTransport = {
  generate(request: ComponentGenerationRequestV1, signal: AbortSignal): Promise<ComponentGenerationResponseV1>;
};
```

The extension contract does not expose OpenAI SDK objects, provider response IDs, raw provider errors, raw provider bodies, or API keys.

Revision and regeneration use a separate provider-neutral transport boundary for `POST /v1/revise-component`. The idempotency header is bound to the frozen `logicalAttemptId`, transport Retry reuses the same frozen Review identity, and successful responses must preserve the selected source `componentName`.

### 4.11 Local Backend and Provider Adapter

The local backend/proxy is the Milestone 5 development/demo topology:

- Receives only the approved request contract.
- Enforces request-size and shape limits.
- Validates PNG data URL, decoded bytes, and decoded dimensions.
- Keeps provider secrets server-side.
- Calls the OpenAI Responses API through the backend provider adapter when configured.
- Uses provider settings such as `store: false` and no provider tools.
- Normalizes provider responses into the Element Catcher response contract.
- Normalizes backend/provider errors into safe error envelopes.
- Avoids payload and secret logging.
- Hosts the dedicated revision/regeneration route `POST /v1/revise-component` behind the same provider-neutral privacy and error-normalization boundary.
- Keeps revision prompt construction source-controlled and excludes local IDs, source URL, page title, notes, storage keys, browser storage, cookies, raw idempotency, provider response IDs, raw provider errors, stacks, and secrets from user-visible responses and logs.

This topology is not a production multi-user backend. Production hosted operations would need authentication, rate limiting, budgets, monitoring, abuse prevention, and deployment policy.

No real OpenAI request was made during automated acceptance. The provider adapter and local loopback path were validated deterministically without committing or exposing a real API secret.

### 4.12 Generated-Version Persistence

Generated versions use a separate IndexedDB store and V1/V2 envelopes. V1 remains the initial-generation entry shape:

```ts
type GeneratedComponentVersionEntryV1 = {
  id: string;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceReviewFingerprint: string;
  createdAt: string;
  value: ComponentGenerationResponseV1;
};
```

V2 is used only for accepted revision/regeneration entries:

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
    kind: "revision" | "regeneration";
    logicalAttemptId: string;
    reviewAttemptFingerprint: string;
    sourceGeneratedVersionId: string;
    sourceGeneratedVersionFingerprint: string;
    instruction?: string;
    instructionFingerprint?: string;
    screenshotIncluded: boolean;
  };
};
```

Lifecycle rules:

- Generated versions are separate from original captures.
- Original `CaptureRecord` data is not mutated by generation.
- The source capture is reread and fully validated before persistence.
- The screenshot asset is reread and validated before persistence.
- Success requires generated-version read-back.
- Retry saving is idempotent for the same generated-version ID and entry.
- Conflicting same-ID content fails safely.
- Active abort calls abort the IndexedDB transaction.
- Deleting a source capture cascades to linked generated versions.
- Missing or invalid sources make linked generated versions orphaned and invalid.
- Normal read/list paths clean or prevent orphans.
- V1 and V2 entries are read through the union reader.
- V2 target IDs are derived deterministically from the frozen `logicalAttemptId`.
- V2 lineage records the exact selected source generated version.
- Retry saving first attempts deterministic recovery and does not call the provider again.
- Conflicting recovery targets fail safely without overwrite.
- Commit-after-cancel results may remain stored and become discoverable through later explicit refresh.

## 5. Security and Privacy Boundaries

- Captures remain local by default.
- Browser storage, cookies, local persistence keys, raw wrappers, source URL, page title, notes, raw idempotency keys, and screenshot storage keys are excluded from approved outbound generation and revision/regeneration prompts.
- API keys remain backend-only.
- The extension does not store provider secrets.
- Generated code is displayed as source text unless the user explicitly chooses Preview.
- Preview execution is limited to accepted data-only render plans in the Milestone 6C sandbox; no full arbitrary generated-code execution, `eval`, `Function` constructor, `dangerouslySetInnerHTML`, browser APIs, storage, navigation, network, workers, or generated CSS runtime is allowed.
- Revision/regeneration never automatically previews or executes revised source.

## 6. Current Milestone 6 Handoff

Milestone 6E may build on the accepted generated-version persistence and revision lineage to add:

- Version comparison.
- Final Milestone 6 integrated regression.
- Final Milestone 6 documentation closure after implementation and independent acceptance.

Milestone 6 must preserve the local-first capture model, provider-secret boundary, source CaptureRecord immutability, generated-version separation, and no-raw-provider-state extension boundary.

## 7. Explicit Exclusions

The current implementation does not include:

- Version comparison.
- Export.
- Website publishing.
- Figma export.
- GitHub export.
- Team collaboration.
- Cloud sync.
- Multiple framework generation.
- Enterprise workflow.
- Payment.
- Authentication.
- Production hosted multi-user backend operations.
- Drag-to-box selection unless later validated as necessary.
