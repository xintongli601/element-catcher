# Element Catcher v0.1 Development Brief

## 1. Objective

Describe the current Element Catcher architecture after completion of Milestones 1 through 5 and before Milestone 6 implementation.

Current implementation order:

```text
Milestones 1-5: Completed
Milestone 6: Current
Milestone 7: Planned
```

Milestone 6 responsibilities remain explicitly unimplemented: isolated generated-code preview, natural-language revision, regeneration management, version comparison, and export handoff.

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
```

The `CaptureRecord` remains the immutable source capture. Generated versions have a separate lifecycle and are linked to the source capture through a generated-version persistence envelope.

## 3. Development Principles

- Keep the MVP focused on Capture -> Save -> Organize -> Rebuild.
- Preserve local-first behavior by default.
- Treat raw extraction data as intermediate input, not the persisted product.
- Normalize persisted capture data into `CaptureRecord v1`.
- Store screenshot binary data as referenced local assets.
- Do not persist live DOM references or unsanitized raw `outerHTML`.
- Preserve the distinction between original captures and generated component versions.
- Keep provider secrets out of extension code, browser storage, IndexedDB, logs, source maps, and committed files.
- Treat captured strings and user metadata as untrusted data.
- Do not execute generated code in Milestone 5.
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

Milestone 6 will extend this area with isolated preview and version management. Those features are not implemented yet.

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
- Request projection limits.
- Canonical JSON and fingerprint helpers.
- Generated-version persistence contract.

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
- Complete source `CaptureRecord v1` validation for generated-version linkage.
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

Generated code remains inert text and is not rendered or executed.

### 4.9 Provider-Neutral Transport

The extension depends on a provider-neutral transport boundary:

```ts
type GenerationTransport = {
  generate(request: ComponentGenerationRequestV1, signal: AbortSignal): Promise<ComponentGenerationResponseV1>;
};
```

The extension contract does not expose OpenAI SDK objects, provider response IDs, raw provider errors, raw provider bodies, or API keys.

### 4.10 Local Backend and Provider Adapter

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

This topology is not a production multi-user backend. Production hosted operations would need authentication, rate limiting, budgets, monitoring, abuse prevention, and deployment policy.

No real OpenAI request was made during automated acceptance. The provider adapter and local loopback path were validated deterministically without committing or exposing a real API secret.

### 4.11 Generated-Version Persistence

Generated versions use a separate IndexedDB store and envelope:

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

## 5. Security and Privacy Boundaries

- Captures remain local by default.
- Browser storage, cookies, local persistence keys, raw wrappers, source URL, and page title are excluded from the Milestone 5 outbound contract.
- API keys remain backend-only.
- The extension does not store provider secrets.
- Generated code is displayed as source text only.
- No generated-code execution, iframe preview, `eval`, `Function` constructor, or `dangerouslySetInnerHTML` path belongs to Milestone 5.

## 6. Current Milestone 6 Handoff

Milestone 6 may build on the generated-version persistence entity to add:

- Isolated generated-component preview.
- Natural-language revision.
- Regeneration management.
- Multiple-version management UX.
- Version comparison.

Milestone 6 must preserve the local-first capture model, provider-secret boundary, source CaptureRecord immutability, generated-version separation, and no-raw-provider-state extension boundary.

## 7. Explicit Exclusions

The current implementation does not include:

- Isolated rendered preview of generated code.
- Natural-language revision.
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
