# Milestone 5 AI Generation Architecture

## 1. Purpose and non-goals

Milestone 5 reconstructs React + Tailwind component versions from a verified saved screenshot plus a bounded projection of a structured `CaptureRecord`. The model input is an explicit outbound request contract, not the live page, not raw webpage code, not raw storage data, and not a full-page clone request.

Milestone 5 does not execute generated code. It produces, validates, and persists structured text output for generated component versions.

Milestone 5 does not include isolated preview, natural-language revision, regeneration comparison, or export. Those capabilities belong to Milestones 6 and 7.

Milestone 5A was this architecture document only. It did not implement AI generation, call an AI API, add backend runtime code, change extension source, change tests, change the database schema, change the Manifest, or update Roadmap statuses.

## Implementation status

Milestones 5A through 5D are implemented and independently accepted. The final accepted Milestone 5 outcome includes exact request projection, visible Review data, explicit consent before transmission, stale-review fingerprint protection, a local development proxy, backend-only provider secrets, OpenAI Responses API normalization, safe backend and extension errors, generated-version database migration and store, abortable generation and persistence, stable generated-version IDs, idempotent saving, persistence read-back verification, complete source `CaptureRecord v1` validation, orphan cleanup, source-deletion cascade, and inert generated-code display.

Milestone 5 does not execute or render generated code.

Isolated preview, natural-language revision, regeneration management, and version comparison belong to Milestone 6. Export belongs to Milestone 7.

Official OpenAI references used for OpenAI-specific claims:

- Responses API reference: https://developers.openai.com/api/reference/resources/responses/methods/create
- Images and vision guide: https://developers.openai.com/api/docs/guides/images-vision
- Structured outputs guide: https://developers.openai.com/api/docs/guides/structured-outputs
- Error codes guide: https://developers.openai.com/api/docs/guides/error-codes
- API key safety: https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safet
- Account and API key security: https://help.openai.com/en/articles/8304786-how-can-i-keep-my-openai-accounts-secure
- API data controls: https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint

## 2. Security topology

Recommended topology:

```text
Chrome Extension
  -> Element Catcher backend/proxy
  -> OpenAI Responses API
```

Authoritative rules:

- The extension never contains the developer's OpenAI API key.
- The extension never receives the developer's OpenAI API key.
- The backend loads `OPENAI_API_KEY` and `OPENAI_MODEL` from server-side environment configuration excluded from git.
- No secret may be stored in extension source, Vite variables, Manifest, `chrome.storage`, `localStorage`, `sessionStorage`, IndexedDB, generated source maps, or logs.
- `VITE_*` variables are bundled client configuration, not secret storage.
- Browser obfuscation is not secure secret management.
- A production multi-user backend requires authentication, rate limiting, budgets, monitoring, and abuse prevention.

OpenAI's API key safety guidance says API keys must not be deployed in client-side environments such as browsers or mobile apps, and requests should be routed through a backend server where keys can be kept secure.

## 3. Deployment options

| Option | Security | Privacy | Usability | Abuse risk | Deployment suitability | Portfolio/demo suitability | Production suitability |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Developer key embedded in extension | Unacceptable. The key can be extracted from the bundle or source maps. | Poor. All user traffic is billed and authorized as the developer. | Initially simple, but dangerous. | Very high. Any extension user can exfiltrate and reuse the key. | Not suitable. | Not suitable. | Not suitable. |
| B. User BYOK stored in extension | Better for developer billing, but still stores a secret in a browser context. | User controls the key, but capture payload still leaves the device. | Friction-heavy and confusing for non-developers. | Medium to high if the key is exposed from browser storage. | Possible only for local expert use, not default MVP. | Weak fit for a polished portfolio demo. | Not suitable without a separate secure credential strategy. |
| C. Local development proxy | Keeps the developer key out of the extension bundle and browser storage. | Payload goes from extension to local proxy to provider after consent. | Good for a developer-run demo. Requires local setup. | Lower for single-user local use; still needs request limits. | Suitable for Milestone 5C development. | Recommended first step. | Not a production multi-user architecture. |
| D. Hosted backend proxy | Keeps provider secrets server-side and supports auth, quotas, monitoring, and abuse controls. | Payload leaves the device and goes through the hosted backend; needs clear policy and minimal logging. | Best user experience when operated correctly. | Manageable only with auth, rate limits, budgets, monitoring, and abuse prevention. | Suitable after backend operations are ready. | Strong for a deployed demo if scoped. | Recommended production direction. |

Recommendation:

- Start with a local development proxy for the portfolio/demo.
- Keep the extension transport provider-neutral.
- Later replace the endpoint with a hosted backend.
- Do not present the local proxy as a production multi-user architecture.

## 4. Provider-neutral extension boundary

The extension should depend on a conceptual transport boundary:

```ts
type GenerationTransport = {
  generate(
    request: ComponentGenerationRequestV1,
    signal: AbortSignal
  ): Promise<ComponentGenerationResponseV1>;
};
```

Rules:

- No OpenAI SDK objects cross into extension product state.
- No API keys appear in any extension contract.
- No OpenAI response IDs, raw errors, raw response fields, provider stack traces, or provider-specific request fields cross into extension business logic.
- Provider internals stay inside the backend provider adapter.
- Provider metadata is omitted from extension product state by default.
- If future diagnostics require provider metadata, it must be optional, opaque, bounded, and never used by extension business logic for branching.
- OpenAI is the initial backend provider, not the extension contract.
- Extension UI and persistence code depend only on Element Catcher request and response contracts.
- `GenerationTransport.generate` accepts only `ComponentGenerationRequestV1`, the exact outbound network contract. Extension-local review context is used by orchestration code before and after transport, not sent through the transport boundary.

Optional opaque metadata shape, if a future approved design needs it:

```ts
type OpaqueGenerationProviderMetadata = {
  providerLabel?: string;
  providerModelLabel?: string;
};
```

`providerLabel` and `providerModelLabel` are display-only strings produced by the backend. They are not OpenAI SDK types, not provider response IDs, and not persistence keys.

## 5. Local context and outbound request contracts

Milestone 5 separates extension-local review context from the outbound network payload.

The extension-local context may contain source identifiers and validation data that never leave the device:

```ts
type ComponentGenerationLocalContextV1 = {
  contractVersion: 1;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceRecordWrapperId: string;
  sourceRecordValidationDigest: string;
  screenshotStorageKey: string;
  screenshotBlobDigest: string;
  reviewFingerprint: string;
  reviewedRequestWithoutDataUrl: ComponentGenerationRequestWithoutDataUrlV1;
};
```

Local-only rules:

- `sourceCaptureId`, `sourceCaptureSavedAt`, wrapper identity, screenshot `storageKey`, screenshot Blob digest, and review fingerprint are for local correlation, stale-review protection, and persistence verification only.
- These local-only values must not be transmitted to the backend or provider unless a future approved design documents a concrete unavoidable backend requirement.
- They must not appear in model-visible prompt text.

The request shapes are:

```ts
type ComponentGenerationRequestWithoutDataUrlV1 = {
  contractVersion: 1;
  screenshot: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
  };
  captureContext: ExactCaptureContextProjectionV1;
  requestedOutput: {
    framework: "react";
    styling: "tailwind";
    fields: ["componentName", "code", "summary", "approximationNotes"];
  };
};

type ComponentGenerationRequestV1 = {
  contractVersion: 1;
  screenshot: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
    dataUrl: string;
  };
  captureContext: ExactCaptureContextProjectionV1;
  requestedOutput: {
    framework: "react";
    styling: "tailwind";
    fields: ["componentName", "code", "summary", "approximationNotes"];
  };
};
```

The outbound request must not include capture ID, `savedAt`, IndexedDB wrapper identity, screenshot `storageKey`, source URL, page title, favicon URL, or generated-version data.

Screenshot rules:

- Opening Review data does not create the Base64 `dataUrl`.
- The Review data screenshot preview may use an object URL and the existing verified screenshot Blob.
- `dataUrl` is created only after explicit consent and immediately before transport.
- `dataUrl` comes from the verified persisted screenshot Blob.
- `dataUrl` is never written into `CaptureRecord`.
- `dataUrl` is never written into IndexedDB.
- `dataUrl` is never logged.
- `dataUrl` is released after the request finishes or is cancelled.

`requestedOutput` is fixed to React, Tailwind, `componentName`, `code`, `summary`, and `approximationNotes` for Milestone 5.

## 6. Exact transmission projection and limits

The exact outbound projection is:

```ts
type ExactCaptureContextProjectionV1 = {
  library: {
    title?: string;
    componentType?: string;
    tags: string[];
  };
  element: {
    tagName: string;
    semanticRole?: string;
    rect: {
      width: number;
      height: number;
    };
  };
  dom: {
    sanitizedSnapshot: TransmittedDomNodeV1;
    childSummary: TransmittedChildSummaryV1[];
  };
  styles: {
    computed: TransmittedComputedStylesV1;
    before?: TransmittedPseudoStylesV1;
    after?: TransmittedPseudoStylesV1;
  };
  summaries: {
    componentType?: string;
    typography: TransmittedTypographySummaryV1;
    colors: TransmittedColorSummaryV1;
    layout: TransmittedLayoutSummaryV1;
    spacing: TransmittedSpacingSummaryV1;
  };
  pageTitlePolicy: {
    included: false;
    reason: "Excluded by default; future explicit opt-in required.";
  };
  sourceUrlPolicy: {
    included: false;
    reason: "Excluded by default.";
  };
};
```

DOM projection:

```ts
type TransmittedDomNodeV1 = {
  tagName: string;
  attributes: {
    id?: string;
    class?: string;
    role?: string;
    ariaLabel?: string;
    ariaPressed?: string;
    ariaSelected?: string;
    ariaExpanded?: string;
    ariaCurrent?: string;
    type?: string;
    name?: string;
  };
  textPreview?: string;
  children: TransmittedDomNodeV1[];
};

type TransmittedChildSummaryV1 = {
  tagName: string;
  semanticRole?: string;
  textPreview?: string;
  childCount: number;
};
```

Attribute rules:

- Do not transmit `SanitizedDomNode.attributes` as unrestricted `Record<string, string>`.
- Only the exact attributes listed above may be transmitted.
- HTML `aria-label` is normalized to `ariaLabel`, `aria-pressed` to `ariaPressed`, `aria-selected` to `ariaSelected`, `aria-expanded` to `ariaExpanded`, and `aria-current` to `ariaCurrent`.
- Exclude all `data-*` attributes by default.
- Exclude `href`, `src`, `style`, event handlers, form values, password values, hidden payload attributes, and unknown attributes.
- Reject unknown properties at every object level.

Style and summary projection:

```ts
type TransmittedBoxEdgesV1 = {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
};

type TransmittedComputedStylesV1 = {
  display?: string;
  position?: string;
  boxSizing?: string;
  width?: string;
  height?: string;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  border?: string;
  borderRadius?: string;
  boxShadow?: string;
  padding?: TransmittedBoxEdgesV1;
  margin?: TransmittedBoxEdgesV1;
  gap?: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
};

type TransmittedPseudoStylesV1 = {
  exists: boolean;
  content?: string;
  display?: string;
  color?: string;
  backgroundColor?: string;
  width?: string;
  height?: string;
};

type TransmittedTypographySummaryV1 = {
  primaryFont?: string;
  scale?: string[];
  weights?: string[];
  notes?: string;
};

type TransmittedColorSummaryV1 = {
  foreground?: string;
  background?: string;
  accent?: string;
  border?: string;
  roles?: Array<{
    role: string;
    value: string;
  }>;
};

type TransmittedLayoutSummaryV1 = {
  display?: string;
  direction?: string;
  alignment?: string;
  density?: "compact" | "comfortable" | "spacious";
  notes?: string;
};

type TransmittedSpacingSummaryV1 = {
  padding?: TransmittedBoxEdgesV1;
  margin?: TransmittedBoxEdgesV1;
  gap?: string;
  notes?: string;
};
```

String and constant rules:

- Field character limits are measured in Unicode code points.
- The complete serialized-body limit is measured in UTF-8 bytes.
- Optional strings are omitted when empty after trimming; empty optional strings must not be serialized.
- Required strings are rejected when empty after trimming.
- The extension projection builder and backend validator must use the same named constants for every limit in this section.

Exact limits:

| Field | Limit |
| --- | --- |
| Complete serialized HTTP JSON request body | 6 MiB, exactly 6,291,456 UTF-8 bytes maximum |
| Screenshot media type | `image/png` only |
| Screenshot byte length | 1 to 4,194,304 bytes |
| Screenshot width and height | positive integers, each 1 to 4096 |
| `dataUrl` prefix | exactly `data:image/png;base64,` |
| `requestedOutput.framework` | exactly `react` |
| `requestedOutput.styling` | exactly `tailwind` |
| `requestedOutput.fields` | exactly `["componentName", "code", "summary", "approximationNotes"]` in that order |
| DOM depth | root plus 3 descendant levels maximum |
| DOM node count | 60 nodes maximum |
| Children per DOM node | 8 maximum |
| `element.tagName` and DOM node `tagName` | 1 to 32 code points, lowercase HTML tag pattern `^[a-z][a-z0-9-]{0,31}$` |
| `childSummary.tagName` | 1 to 32 code points, lowercase HTML tag pattern `^[a-z][a-z0-9-]{0,31}$` |
| DOM attributes per node | 6 maximum after projection |
| Attribute name | exact allowlist only, 1 to 32 code points |
| Attribute value | 1 to 120 code points |
| `textPreview` on DOM nodes and child summaries | 160 code points maximum |
| `childSummary` count | 12 items maximum |
| `childSummary.childCount` | finite non-negative integer, 0 to 999 |
| `childSummary.semanticRole` | 64 code points maximum |
| `library.title` | 120 code points maximum |
| `library.componentType` and `summaries.componentType` | 64 code points maximum |
| `library.tags` | 12 items maximum |
| Each tag | 32 code points maximum |
| `element.semanticRole` | 64 code points maximum |
| Element rect width and height | finite positive numbers, each <= 100000 CSS px |
| Each `TransmittedComputedStylesV1` string value | 160 code points maximum |
| Every `TransmittedBoxEdgesV1` value | 32 code points maximum |
| Each `TransmittedPseudoStylesV1` string value except `content` | 160 code points maximum |
| `TransmittedPseudoStylesV1.content` | 240 code points maximum |
| `typography.primaryFont` | 120 code points maximum |
| `typography.scale` | 8 items maximum; each 32 code points maximum |
| `typography.weights` | 8 items maximum; each 16 code points maximum |
| Summary notes in typography, layout, and spacing | 500 code points maximum per notes field |
| `colors.foreground`, `colors.background`, `colors.accent`, and `colors.border` | 64 code points maximum each |
| `colors.roles` | 12 items maximum |
| Color role name | 48 code points maximum |
| Color role value | 64 code points maximum |
| `layout.display`, `layout.direction`, and `layout.alignment` | 64 code points maximum each |
| `spacing.gap` | 64 code points maximum |
| `pageTitlePolicy.reason` | exact literal `Excluded by default; future explicit opt-in required.` |
| `sourceUrlPolicy.reason` | exact literal `Excluded by default.` |

The 6 MiB request-body limit:

- Applies to the complete serialized HTTP JSON request body.
- Includes the Base64 screenshot data URL and every JSON field.
- Is enforced by the backend before JSON parsing or unbounded buffering.
- Is enforced again after parsing and validation against the validated serialized request.
- Causes a safe request-too-large error before any provider call.

Default excluded fields:

- `library.notes`
- Full `source.url`
- `source.pageTitle`
- `faviconUrl`
- `CaptureRecord` id
- `savedAt`
- Screenshot `storageKey`
- IndexedDB wrapper data
- `generatedVersions`
- Browser cookies
- `localStorage`
- `sessionStorage`
- `chrome.storage`
- Form values
- Password values
- Arbitrary hidden content
- Raw `outerHTML`
- Live DOM
- Unrelated captures
- Extension logs

Page-title policy:

- `source.pageTitle` is excluded by default.
- It may be included only through a future explicit user opt-in.

Reason: page titles can contain account names, document names, private thread titles, customer information, project names, ticket titles, or other user-identifying context.

## 7. Prompt-injection boundary

Every outbound string is untrusted reference data. This includes captured webpage strings, user-edited metadata, tags, summary notes, style strings, DOM text previews, transmitted attributes, and any future user instructions.

Backend construction must enforce structural separation:

- Backend-owned system/developer instructions are separate from untrusted payload data.
- The untrusted payload is serialized as data under the approved schema, not concatenated into instruction text.
- The provider adapter must state that payload fields are reference data, not instructions.
- Commands contained in any payload field must not be followed.
- The model must not browse, retrieve external URLs, use tools, call MCP servers, use file search, use code interpreter, execute code, or execute captured commands.
- The model must not reveal system or developer instructions.
- Output is limited to the React + Tailwind structured response contract.

DOM sanitization is not prompt-injection prevention. Sanitization reduces unsafe persisted data, but model-facing instructions and provider configuration must still isolate captured strings as untrusted data.

## 8. Consent UX

Saved-detail generation flow:

```text
Generate component
  -> Review data being sent
  -> Required confirmation checkbox
  -> Send to AI and generate
  -> Cancel
```

Required warning:

```text
Data is leaving your device. Element Catcher will send the screenshot and the displayed structured fields to the configured AI backend. Do not send passwords, payment data, private messages, confidential business content, personal identifiers, or protected material. Generated output is approximate and may use paid API capacity. Provider data handling depends on the configured backend and provider settings; do not assume the provider immediately deletes all submitted data.
```

Rules:

- Checkbox is initially unchecked.
- Checkbox is required for every generation attempt.
- Consent is tied to the current `reviewFingerprint`.
- Consent is invalidated by any fingerprint mismatch.
- Consent is not persisted in Milestone 5.
- Cancel before network sends nothing.

## 9. Review-data UI

The Review data panel must make clear that the displayed values are the exact outbound projection that will be sent.

The panel shows safe, truncated, human-readable outbound values:

- Screenshot preview from the verified persisted Blob.
- Decoded screenshot dimensions.
- Screenshot byte size.
- Approximate final request size.
- `library.title`.
- `library.componentType`.
- Each transmitted tag.
- `element.tagName`, `element.semanticRole`, width, and height.
- DOM text previews that will be transmitted.
- Transmitted attributes after the exact allowlist projection.
- Typography values and notes that will be transmitted.
- Color values and color roles that will be transmitted.
- Layout values and notes that will be transmitted.
- Spacing values and notes that will be transmitted.
- Excluded categories.
- Page-title exclusion status.
- URL exclusion status.
- Provider/backend endpoint category, such as local development proxy or hosted backend proxy.

The review panel must not show:

- Raw JSON dump.
- Screenshot `storageKey`.
- Raw IndexedDB wrapper.
- API key.
- Full URL.
- Credential-bearing URL.
- Hidden DOM payload.
- Capture ID.
- `savedAt`.
- Review fingerprint.
- Screenshot digest.

## 10. Backend responsibilities, provider privacy configuration, and limits

Backend responsibilities:

- Validate request contract.
- Reject additional properties.
- Enforce request body limits.
- Allow supported image media types only.
- Enforce dimensions and byte limits.
- Validate the PNG data URL, Base64 decoding, PNG signature, decoded byte size, and actual decoded dimensions.
- Create safe provider prompt with structural separation between backend instructions and untrusted payload.
- Send text plus image input through the OpenAI Responses API.
- Request strict structured output.
- Independently validate the backend-normalized response even when OpenAI strict structured output is used.
- Enforce timeout.
- Support cancellation where practical.
- Avoid persisting user payload.
- Normalize provider errors.
- Never expose provider stack traces or secrets.

Mandatory OpenAI provider configuration for Milestone 5C:

- Use the Responses API only.
- Set `store: false` explicitly on every Responses API request.
- Set `background: false` or omit background mode.
- Do not attach a `conversation`.
- Do not use `previous_response_id` for this workflow.
- Do not upload screenshots through the Files API.
- Do not configure provider tools.
- Set `tool_choice: "none"` if the selected OpenAI SDK/API surface accepts it with no tools.
- Do not enable web search, file search, MCP, code interpreter, computer use, image generation, function tools, shell tools, or hosted tools.

OpenAI-specific notes:

- The Responses API creates model responses from text or image inputs and can generate text or JSON outputs.
- OpenAI image input documentation supports fully qualified image URLs, Base64 data URLs, and file IDs; Element Catcher should use the temporary Base64 data URL for the local persisted screenshot Blob.
- OpenAI structured output documentation supports JSON schema response formatting with strict schemas.
- OpenAI error documentation identifies categories such as authentication, rate limit, quota, server, overloaded, and connection-related failures that the backend should normalize.
- OpenAI data-control documentation states that API inputs and outputs are not used to train OpenAI models by default unless the customer opts in.
- OpenAI data-control documentation states that the Responses API has default application-state retention behavior, and that `store: false` changes storage behavior. Therefore Milestone 5C must set `store: false`.
- `store: false` reduces Responses application-state storage, but it does not promise zero retention of abuse-monitoring data.
- OpenAI data-control documentation describes abuse monitoring logs and special handling for image and file inputs, including CSAM scanning. Consent and privacy copy must not claim that data is never retained or immediately deleted by OpenAI.

Selected MVP limits:

- Screenshot media type: `image/png` only initially.
- Screenshot maximum: exactly 4,194,304 decoded bytes.
- Maximum width: 4096 px.
- Maximum height: 4096 px.
- Total serialized HTTP JSON request body maximum: 6 MiB, exactly 6,291,456 UTF-8 bytes.
- Backend request timeout: 60 seconds.
- Response code maximum: 60,000 Unicode code points.
- Summary maximum: 2,000 Unicode code points.
- Approximation notes maximum: 4,000 Unicode code points.

Justification:

- Current persisted screenshot assets are PNG, so `image/png` avoids unnecessary format expansion.
- 4,194,304 decoded screenshot bytes are large enough for a cropped component screenshot while limiting bandwidth, memory, and provider cost.
- 4096 x 4096 protects against accidental oversized captures while allowing high-DPI component crops.
- 6 MiB total serialized body allows Base64 expansion and structured context overhead without accepting unbounded payloads.
- 60 seconds is long enough for a first MVP generation while keeping cancellation and retry behavior understandable.
- 60,000 code points give room for a substantial React component but prevent runaway responses.
- 2,000-code-point summaries and 4,000-code-point notes keep UI display and persistence bounded.

## 11. Structured generation response contract

`ComponentGenerationResponseV1` is JSON-compatible and provider-neutral:

```ts
type ComponentGenerationResponseV1 = {
  contractVersion: 1;
  componentName: string;
  framework: "react";
  styling: "tailwind";
  code: string;
  summary: string;
  approximationNotes: string;
  metadata?: OpaqueGenerationProviderMetadata;
};
```

Response validation rules:

- Reject additional properties except the optional `metadata` object defined in this document.
- `framework` must be `react`.
- `styling` must be `tailwind`.
- `componentName` must match `^[A-Z][A-Za-z0-9]{0,63}$`.
- `componentName` maximum length is 64 Unicode code points.
- `code` must be non-empty and at most 60,000 Unicode code points.
- `summary` must be non-empty and at most 2,000 Unicode code points.
- `approximationNotes` must be bounded plain text at most 4,000 Unicode code points.
- Optional metadata values must be plain strings at most 80 Unicode code points each.
- Malformed or incomplete responses are rejected.
- No success is reported before validation.
- Backend validation and extension validation are both required.
- No HTML rendering from response fields.
- No `dangerouslySetInnerHTML`.
- No `eval`.
- No `Function` constructor.
- No dynamic code execution.
- No generated preview in Milestone 5.
- Persisted code should not require Markdown fences.

Provider-specific output IDs, raw errors, usage internals, and raw response bodies remain inside the backend provider adapter.

## 12. Stale-review protection

Do not rely on `savedAt` alone. Existing metadata edits preserve `savedAt`, so `savedAt` cannot prove that the reviewed outbound projection still matches the current saved capture.

Milestone 5 must compute a deterministic extension-local `reviewFingerprint` from:

- Request contract version.
- Deterministic canonical JSON of the complete outbound request with `screenshot.dataUrl` excluded.
- Screenshot Blob SHA-256 digest.
- Screenshot decoded byte length.
- Decoded screenshot width.
- Decoded screenshot height.

Rules:

- Opening Review data does not create the Base64 data URL.
- The screenshot preview may use an object URL and the existing verified Blob.
- The Base64 data URL is created only after consent and immediately before transport.
- Before sending, the extension revalidates the Blob, rebuilds the non-`dataUrl` outbound request, recomputes the fingerprint, and compares it with the reviewed fingerprint.
- After response arrival and before any future persistence, the fingerprint is recomputed from current persisted data.
- The data URL itself is not included in the fingerprint because the Blob digest already binds the exact screenshot bytes.
- Fingerprint canonicalization recursively sorts object keys, preserves array order, uses JSON-compatible values, UTF-8 encoding, and SHA-256.
- Recompute the fingerprint when opening Review data.
- Recompute immediately before sending.
- Recompute before retrying.
- Recompute before accepting a response.
- Recompute before persisting a generated version.
- Any mismatch invalidates consent and returns the user to Review data.
- The fingerprint is local-only.
- The fingerprint, screenshot digest, source identifiers, capture ID, `savedAt`, wrapper identity, and storage keys remain local-only and must not be sent to the provider unless a future approved design documents a concrete backend requirement.

## 13. Generated-version persistence decision

Option A: append generated output to `CaptureRecord.generatedVersions`.

- Simple shape because `CaptureRecord v1` already includes `generatedVersions`.
- Rewrites the source capture for every generated version.
- Couples source capture lifecycle to generated output lifecycle.
- Makes future revision, comparison, and deletion behavior harder to isolate.

Option B: create a separate `generatedComponentVersions` IndexedDB store linked to the source capture.

- Keeps source `CaptureRecord` immutable.
- Gives generated versions their own lifecycle.
- Allows one capture to have multiple generated versions.
- Makes future preview, revision, and comparison naturally version-entity work.
- Avoids rewriting the screenshot or source capture during generation persistence.

Implemented decision: use Option B. Milestone 5D implemented IndexedDB database version 2 with a separate generated-version store.

Implemented store:

```text
generatedComponentVersions
```

Implemented wrapper:

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

Implemented persistence rules:

- `keyPath`: `id`.
- Indexes: one non-unique index on `sourceCaptureId`.
- Source lookup: query by `sourceCaptureId`, then sort newest-first by `createdAt` with `id` tie-breaker.
- Deterministic ordering: newest `createdAt` first; equal timestamps sort by `id`.
- Migration from database version 1 creates only the new store and index.
- Migration transaction is the IndexedDB version-change transaction.
- Failed migration aborts and preserves version 1 data.
- Source capture is reread before generation persistence.
- Generated version uses `add` semantics, not overwrite.
- Success requires read-back verification.
- Invalid generated-version entries fail safely and are not treated as valid generated output.
- Complete source `CaptureRecord v1` validation is required for generated-version persistence and read paths.
- Missing or invalid source captures make linked generated versions orphaned and invalid.
- Read paths clean or prevent orphans using actual IndexedDB primary keys.
- Source deletion cascades to linked generated versions.
- Original `CaptureRecord` data and screenshot assets are not mutated by generation persistence.
- Screenshot Blob and data URL are not duplicated into generated versions.

## 14. Generation state machine

States:

- `closed`
- `reviewing`
- `awaiting-consent`
- `generating`
- `succeeded`
- `failed`
- `retrying`
- `cancelled`

Rules:

- Use a synchronous duplicate-submit guard.
- Cancel before request sends nothing.
- Cancel during request aborts where practical.
- Failure retains safe retry context.
- Retry rereads and revalidates the source record and screenshot.
- Retry recomputes the review fingerprint and invalidates consent on mismatch.
- Back invalidates stale UI completion.
- Stale response cannot reopen closed detail.
- Stale response cannot overwrite another capture.
- Response validation precedes persistence.
- Fingerprint verification precedes persistence.
- Persistence read-back precedes success.

## 15. Failure taxonomy

| Category | Classification | Safe user-facing handling |
| --- | --- | --- |
| Configuration unavailable | Retryable after user correction | Explain that AI generation is not configured. Do not mention key names unless in backend-safe operational logs. |
| Request validation failure | Retryable after user correction | Show that the selected capture cannot be sent as-is. Do not expose raw request data. |
| Consent missing | Retryable after user correction | Keep the review panel open and require explicit checkbox confirmation. |
| Review fingerprint mismatch | Retryable after review | Invalidate consent and return to Review data. |
| Capture changed | Retryable after review | Reread the capture and require review again. |
| Capture missing | Not retryable | Return to Library or show not-found state. |
| Screenshot missing | Not retryable unless the capture is restored | Explain that the saved screenshot asset is unavailable. |
| Network unavailable | Retryable | Show safe retry. |
| Timeout | Retryable | Show retry and preserve review context only if fingerprint still matches. |
| Provider rejected request | Retryable after user correction or configuration change | Normalize without raw provider body. |
| Provider rate limited | Retryable | Suggest waiting and retrying. |
| Malformed provider response | Retryable | Reject the response and do not persist. |
| Persistence failure | Retryable | Do not report success; preserve validated response only in memory if safe. |
| Read-back failure | Retryable | Do not report success; use deterministic recovery policy. |
| Cancellation | Retryable | Show cancelled state and no generated version. |

Never expose:

- API key.
- Provider stack trace.
- Raw request.
- Raw response.
- Screenshot data URL.
- Storage key.
- Wrapper JSON.
- Internal record identifiers in user-facing messages.
- Review fingerprint.
- Screenshot digest.

## 16. Validation requirements

Request validation:

- Reject additional properties at every object level.
- Require finite numeric values.
- Require positive integer screenshot dimensions and byte lengths.
- Enforce the complete serialized HTTP JSON request body limit of 6 MiB, exactly 6,291,456 UTF-8 bytes, before JSON parsing or unbounded buffering.
- Validate `dataUrl` prefix exactly as `data:image/png;base64,`.
- Base64-decode the image and verify decoded byte length equals declared `byteLength`.
- Verify PNG signature bytes: `89 50 4E 47 0D 0A 1A 0A`.
- Decode the PNG and verify actual decoded width and height equal declared dimensions.
- Enforce every limit in Section 6.
- Serialize the validated request and enforce the 6 MiB, exactly 6,291,456 UTF-8 byte limit again before provider submission.
- Return a safe request-too-large error before any provider call if either body-size check fails.

Response validation:

- Validate independently in the backend even when OpenAI strict structured output is used.
- Validate again before extension persistence.
- Enforce `componentName` format `^[A-Z][A-Za-z0-9]{0,63}$`.
- Enforce code, summary, and approximation-notes limits from Section 11.
- Reject Markdown-only wrapper responses that do not provide plain contract fields.

## 17. Logging allowlist

Backend logs may include only:

- Backend-generated correlation ID.
- Normalized outcome category.
- HTTP/status category.
- Duration.
- Request body byte count.
- Screenshot byte count.
- Screenshot dimensions.
- Retry count.
- Non-secret configuration version.

Backend logs must not include:

- Headers.
- Authorization.
- API keys.
- Request bodies.
- Response bodies.
- Screenshots.
- Data URLs.
- DOM content.
- Title.
- Tags.
- Summaries.
- Capture IDs.
- `savedAt`.
- Review fingerprints.
- Screenshot digests.
- Storage keys.
- Raw provider errors.
- Raw provider responses.
- Stack traces that contain provider or payload data.

## 18. Automated testing architecture

Pure tests:

- Local context versus outbound request separation.
- Request whitelist.
- Exact DOM projection and attribute allowlist.
- Exclusions.
- Source/page-title omission.
- Request size validation.
- PNG data URL validation.
- Review fingerprint recomputation and mismatch behavior.
- Response validator.
- Prompt-injection boundary.
- Error mapping.
- Logging allowlist.
- No secret serialization.

Playwright:

- Generate component control.
- Review data displays exact outbound projection in human-readable form.
- Consent required.
- Consent invalidated after metadata changes that preserve `savedAt`.
- Cancel sends nothing.
- Mock success.
- Malformed response.
- Timeout.
- Rate limit.
- Retry.
- Back during generation.
- Stale response protection.
- No raw internals.
- Screenshot data URL not persisted.
- Source `CaptureRecord` unchanged.
- Screenshot asset unchanged.
- No API key in extension bundle.

Mock backend:

- Deterministic local server.
- No OpenAI request during normal `test:e2e`.
- Body inspection.
- Delayed response.
- Failure fixtures.
- Cancellation observation.
- Logging inspection against the allowlist.

Optional live test:

- Separate explicit command.
- Skipped unless required environment configuration exists.
- Never part of normal build/test.
- Uses synthetic safe fixture only.
- May incur real cost.
- Never uses private saved captures.
- Never prints or records the key.
- Must set `store: false`.
- Must not use provider tools, background mode, Conversations, or Files API upload.

## 19. Accepted implementation staging

Milestone 5A accepted:

- This architecture document.
- No runtime implementation.

Milestone 5B accepted:

- Local context and outbound request contracts.
- Request whitelist/projection builder.
- Exact validators.
- Review fingerprint.
- Consent and Review data UI.
- Provider-neutral mock transport.
- Deterministic tests.
- No real OpenAI call.

Milestone 5C accepted:

- Local Node backend proxy.
- OpenAI Responses API provider adapter.
- `store: false`.
- No background mode, Conversations, Files API upload, or provider tools.
- Environment configuration.
- Safe normalized errors.
- Logging allowlist.
- Deterministic backend and loopback validation without committing or exposing a real API secret.

Milestone 5D accepted:

- `generatedComponentVersions` database migration.
- Atomic version persistence.
- Read-back.
- Source linkage.
- Complete source `CaptureRecord v1` validation.
- Orphan cleanup.
- Source-deletion cascade.
- Final Milestone 5 regression.

## 20. Architecture diagrams

Normal:

```text
Saved Capture Detail
  -> Build exact outbound projection
  -> Compute local review fingerprint
  -> Review transmission
  -> Explicit consent
  -> Recompute fingerprint
  -> Backend proxy
  -> Backend validation
  -> OpenAI Responses API with store:false and no tools
  -> Backend response validation
  -> Extension response validation
  -> Recompute fingerprint
  -> Generated-version persistence
  -> Read-back
  -> Success
```

Before-network failure:

```text
Validation, consent, or fingerprint failure
  -> no request
  -> no persistence mutation
  -> return to Review data when needed
```

Provider failure:

```text
Backend/provider failure
  -> normalized safe error
  -> retained retry context
  -> no generated version
```

Persistence failure:

```text
Validated response
  -> fingerprint recheck
  -> persistence failure
  -> no false success
  -> deterministic recovery policy
```

## 21. Security checklist

- API key never enters extension.
- API key never enters browser storage.
- API key never enters IndexedDB.
- API key never enters logs.
- Screenshot is sent only after explicit consent.
- Transmission projection is exact.
- Unknown request properties are rejected.
- Excluded fields are excluded.
- Captured and user-authored strings are treated as untrusted.
- Backend instructions are structurally separated from untrusted payload.
- Provider tools are prohibited for Milestone 5C.
- OpenAI Responses API requests set `store: false`.
- Response is validated by backend and extension.
- Generated code is not executed in Milestone 5.
- Source capture remains unchanged.
- Normal tests use no real API.
- Live test uses synthetic data only.
- No secret file is committed.

## 22. Open decisions

- Timeline for hosted production backend.
- Whether page title opt-in belongs in 5B or later.
- Selected initial model and acceptable maximum per-generation cost.

API-key security, provider-neutral extension boundaries, default transmission projection, stale-review protection, OpenAI `store: false`, provider-tool prohibition, generated-version source-deletion cascade, orphan cleanup, and logging boundaries are not open decisions. They are fixed by this document and the accepted Milestone 5 implementation.
