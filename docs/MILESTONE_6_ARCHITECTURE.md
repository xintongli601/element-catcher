# Milestone 6A Isolated Preview Architecture Draft

## Implementation Status and Supersession Note

Milestone 6A architecture review is Completed. Milestone 6B runtime foundation is Completed. Milestone 6C is Completed with the accepted production safe generated-component preview for Previewable Subset V1. Milestone 6D is Current for regeneration and natural-language revision. Milestone 6E remains Planned.

This document began as the Milestone 6A architecture draft. Its original nested packaged architecture was a 6A proposal, not the accepted current implementation. Real Chromium feasibility testing showed that a topology where the Side Panel loads a packaged sandbox host, and that host then navigates a second packaged sandbox page, fails unless the second page is exposed through `web_accessible_resources`. That exposure was not approved for Milestone 6B. `srcdoc` was also not selected.

The accepted Milestone 6B foundation uses two Side Panel-owned sibling sandbox frames:

```text
Side Panel trusted extension page
  -> packaged sandbox host
  -> packaged sandbox render realm
```

The Side Panel performs a narrow trusted relay between the packaged sandbox host and packaged sandbox render realm. Any section below that describes the sandbox host as creating or owning a nested packaged render realm is superseded for current implementation planning by this accepted sibling architecture. Milestone 6C builds on the accepted 6B sibling foundation, not on a host-owned nested packaged render realm, `srcdoc` render realm, or `web_accessible_resources`-based nested render realm.

## Milestone 6C Accepted Implementation

Accepted remote baseline:

```text
8af49fd68fcdb6169eb9517a8aacadc5e36fe477 - test: close safe preview security regressions
```

Retained implementation commits:

```text
1704b7c7d83fd288dd56bc0f2f4861ee359911c9 - feat: implement safe generated component preview
291d5b381210cd9a93906724c9e7785e377e7d66 - fix: complete safe preview lifecycle and styling
```

Actual preview pipeline:

```text
GeneratedComponentVersionEntryV1.code
  -> Side Panel explicit Preview action
  -> packaged sandbox host source request
  -> @babel/parser JSX AST gate
  -> Previewable Subset V1
  -> PreviewRenderPlanV1 plain-data tree
  -> Side Panel trusted validation and relay
  -> packaged sandbox render realm React createRoot render
```

Security boundaries:

- Generated source remains visible and copyable in the trusted Side Panel, but it is never sent to the packaged sandbox render realm.
- The host is the only sandbox page that receives generated source. It parses with the packaged `@babel/parser` dependency and converts approved source into a data-only render plan.
- The render realm receives only `PreviewRenderPlanV1`, independently validates that plan, recomputes the canonical plan hash, and renders only allowed tags, text, attributes, roles, and class tokens.
- The Side Panel validates current host and render `WindowProxy` identities, message direction, exact keys, message byte limits, protocol version, requestId, sessionNonce, source hash, component name, plan schema, and canonical plan hash. It reconstructs clean relay objects rather than forwarding `event.data`.
- The Side Panel rejects unrelated `WindowProxy` sources before byte-size calculation, JSON serialization, schema traversal, or payload field access.
- Source hash and complete session identity are created before the preview frames are mounted, preventing a lost iframe `onLoad` from permanently dropping init.
- Host planning, render planning, and trusted plan validation use captured-session and operation-token guards after async parser/hash boundaries so terminal state cannot be reversed by stale work.
- Unsupported, unsafe, malformed, oversized, stale, wrong-session, or timed-out preview attempts fail closed. Persisted generated source remains source-only and CaptureRecord/generated-version storage is not mutated.

Previewable Subset V1:

- Allows exactly one matching function component declaration or arrow-function component.
- Allows static JSX built from the approved tag list, text nodes, expression containers containing string/number literals, static `className`, `role`, `aria-label`, `aria-hidden`, `title`, and button `type`.
- Normalizes button `type` to `button`.
- Allows only configured class tokens and bounded text; unsupported Tailwind classes become preview diagnostics instead of generated CSS execution.
- Rejects program directives, function-body directives, and duplicate JSX attributes before constructing the render plan. JSX comments are treated as inert empty JSX expressions and do not create executable output.
- Rejects imports, exports unrelated to the single component, classes, calls, member expressions, spreads, hooks, effects, browser APIs, network, storage, navigation, workers, WebAssembly, timers, raw scripts, `dangerouslySetInnerHTML`, inline styles, dynamic classes, URLs, event handlers, and unsupported JSX constructs.

Protocol V2:

- Host and render boot through separate `preview.host.init.v2` and `preview.render.init.v2` messages.
- The host requests source through `preview.source.request.v2` and replies with `preview.plan.success.v2` or `preview.plan.failure.v2`.
- The Side Panel sends only `preview.render.plan.v2` to the render realm.
- The render realm replies with `preview.render.success.v2` or `preview.render.failure.v2`.
- All contexts accept `preview.dispose.v2`; dispose reasons are `close`, `timeout`, `terminal-failure`, and `session-replaced`.
- The old Milestone 6B fixture protocol is not used for generated-source preview.

Resource and lifecycle limits:

- Source limit: 8,192 code points.
- Parser/AST traversal limit: 800 AST nodes.
- Render plan limit: 160 nodes, depth 16, 32 children per node, 8 props per node, 512 code points per text node, 4,096 total text code points, and 16,384 serialized bytes.
- Message byte limit: 32,768 bytes.
- Preview timeout: 10,000 ms per attempt, followed by terminal disposal.
- One preview attempt owns one requestId, one sessionNonce, one host frame, and one render frame. Reopen creates fresh identities.
- The complete `preview.source.request.v2` message is byte-size checked before posting; a source inside the code-point limit but outside the UTF-8 message limit fails immediately without waiting for timeout.

Dependency decision:

- `@babel/parser` is the only added production parser dependency for Milestone 6C.
- It is used for AST inspection only; no Babel transform, Babel standalone runtime, eval, `Function`, WebAssembly, worker compiler, Tailwind compiler, CDN, remote module, or runtime download is introduced.

Accepted validation record:

- Focused preview suite run 1: 38 passed.
- Focused preview suite run 2: 38 passed.
- Backend tests: 6 passed.
- Full Playwright regression: 146 passed, 1 documented loopback skip.
- `npm audit --omit=dev`: 0 vulnerabilities.
- No external preview request.
- No real OpenAI request.
- Strict sandbox CSP retained.
- These results document the accepted Milestone 6C baseline; they do not provide a general security proof.

Residual risks:

- Parser policy bugs may reject valid generated code or allow a construct that should have stayed source-only; the render realm still receives only a validated data plan.
- The bounded Tailwind subset is intentionally lower fidelity than full Tailwind output. Every accepted class token must have exactly one source-controlled utility CSS selector, and no extra utility selector may exist outside the registry.
- Iframe disposal cannot guarantee forced termination of an already-hung browser renderer.
- Milestone 6C does not implement natural-language revision, regeneration, version comparison, export, storage migrations, backend contract changes, or provider calls.

## Milestone 6D Current Scope

Milestone 6D is regeneration and natural-language revision. It is current but not implemented in this documentation-only closeout.

Intended scope:

- User selects an existing generated component version.
- User enters a bounded natural-language revision request.
- Revision is reviewed before external transmission.
- Revision creates a new immutable generated version.
- Original `CaptureRecord` and earlier generated versions remain unchanged.
- New version preserves `sourceCaptureId` and source-version lineage.
- Regeneration may use the existing provider-neutral backend path.
- Consent and privacy boundaries from Milestone 5 remain mandatory.
- Preview remains a separate explicit action after persistence.
- No generated source executes during revision or preview.
- Retry must not create uncontrolled duplicate versions.
- Cancellation and stale-response handling are required.

Explicitly excluded from Milestone 6D:

- Version comparison UI.
- Final Milestone 6 regression closure.
- Export.
- GitHub or Figma integration.
- Cloud sync.
- Collaborative editing.
- Arbitrary conversational coding-agent behavior.
- Automatic execution of revised source.
- Storage migration unless separately reviewed and approved.

Milestone 6E remains responsible for version comparison and final Milestone 6 regression.

Milestone 6D architecture closure:

- `docs/MILESTONE_6D_REVISION_ARCHITECTURE.md` is the authoritative 6D design for revision and regeneration semantics, Review privacy projection, backend route selection, generated-version lineage, idempotency, Retry, cancellation, persistence ordering, component-name policy, accessibility, acceptance testing, and implementation slices.
- Milestone 6D remains Current and unimplemented until that document receives independent approval and implementation slices land.

## Milestone 6B Accepted Foundation

Actual topology:

```text
Side Panel trusted extension page
  -> packaged sandbox host iframe
  -> packaged sandbox render-realm iframe
```

The host and render-realm iframes are siblings directly owned by the Side Panel. Both sandbox pages are packaged local resources declared in Manifest `sandbox.pages`. No `web_accessible_resources` entry, `srcdoc`, Blob URL, data URL, `allow-same-origin`, `unsafe-inline`, `unsafe-eval`, `wasm-unsafe-eval`, CDN, remote preview resource, backend request, or OpenAI request is part of the accepted 6B preview foundation.

Responsibilities:

- Side Panel trusted extension page: owns user controls, preview lifecycle, the current host and render `WindowProxy` references, request ID, session nonce, fixture ID, failure display, timeout cleanup, and React-controlled iframe mounting.
- Packaged sandbox host: validates Side Panel messages, requests the trusted fixture render, validates render result messages relayed back from the Side Panel, and emits final success or failure to the Side Panel.
- Packaged sandbox render realm: renders only the source-controlled trusted packaged fixture through React `createRoot` and returns bounded render success or failure messages.

Message and relay boundary:

- The Side Panel validates the current host and render `WindowProxy` identities.
- Messages use versioned direction-specific runtime validation.
- Exact keys, message size, requestId, sessionNonce, and fixtureId are validated.
- The Side Panel reconstructs clean allowlisted relay objects and does not forward `event.data` directly.
- Active-session tests independently validate nonce, requestId, exact-key, malformed-message, and unrelated source-window rejection before final Ready or Failed lifecycle state.

Sandbox and execution boundary:

- Sandbox CSP remains strict, with sandbox network and worker access blocked.
- The sandbox pages have no usable extension API.
- Storage and cookies are unavailable under the tested environment.
- The accepted 6B fixture protocol is not a generated-source protocol.
- Generated source remains inert text. It is not sent through iframe URLs or `postMessage`, parsed, compiled, transformed, executed, injected as HTML/CSS, or passed to `PreviewSandbox`.
- CaptureRecord and generated-version persistence are not mutated by preview.

Lifecycle:

- Lifecycle covers ready, render, success, failure, timeout, close, dispose, and reopen.
- Timeout and every terminal failure dispose both sibling sandbox frames.
- Iframe unmount is controlled through React rather than imperative removal of React-owned iframe nodes.
- Dispose is idempotent, clears Side Panel timeout state, clears ready flags, sends bounded dispose messages when current `WindowProxy` references are available, and ignores late host/render messages.
- Reopen creates a fresh component session, requestId, sessionNonce, host iframe, render iframe, and host/render `WindowProxy` identities.

Accepted validation:

- `npm run build` passed.
- Focused Milestone 6B Playwright passed with 13 tests.
- Backend regression passed with 6 tests.
- Full Playwright regression passed with 121 tests and 1 existing skipped Milestone 5C loopback test.
- No flaky or unavailable tests were reported.
- No real OpenAI request occurred.

Residual risks:

- Iframe disposal cannot guarantee forced termination of an already-hung browser renderer.
- A removed browsing context actively sending a new message to its former parent was not directly dynamically reproduced.
- Protection for stale or removed contexts relies on current `WindowProxy` identity, lifecycle state, requestId, and sessionNonce validation.

Milestone 6B did not approve executing `ComponentGenerationResponseV1.code`, parser installation, compiler installation, Tailwind installation, regex-only JavaScript or JSX security validation, eval, `Function`, WebAssembly or worker-based compilation, generated HTML or CSS injection, generated source transfer into the existing fixture protocol, or changes to storage or generation contracts. Milestone 6C approves only the narrower AST-to-render-plan implementation described above. It still does not approve arbitrary generated-code execution, Tailwind compilation, eval, `Function`, WebAssembly, workers, generated HTML/CSS injection, storage or generation contract changes, backend provider calls, or expanding the render realm to receive generated source.

## 1. Purpose and Scope

This section preserves the original Milestone 6A documentation-only scope. It was accurate for the 6A architecture review, but later sections above record the accepted 6B and accepted 6C implementations.

Generated code is hostile input. Passing the Milestone 5 response validator means `ComponentGenerationResponseV1` has the expected JSON shape and bounded strings; it does not mean `ComponentGenerationResponseV1.code` is safe to compile, render, or execute.

## 2. Milestone 6A Historical Baseline

Baseline commit inspected: `d29628416ec9aab0eadca453d846d5ceef8bddf8`.

- `extension/manifest.json` is a Manifest V3 extension with a module background service worker, content script entries, `activeTab` and `sidePanel` permissions, and a Side Panel default page.
- The current Side Panel is an extension page at `src/sidepanel/index.html`; extension pages are trusted UI, not generated-code execution surfaces.
- No sandbox page is declared in the Manifest.
- No preview iframe, sandbox host, nested render realm, parser, compiler, Tailwind runtime, preview UI, revision UI, comparison UI, or version-management UI exists.
- Generated code is currently inert source text displayed in the generated-version UI.
- `ComponentGenerationResponseV1.code` is a bounded non-empty string with a 60,000 Unicode code point limit; it is not a verified executable program.
- Generated versions are persisted separately in `generatedComponentVersions` and linked to source captures by `sourceCaptureId`, `sourceCaptureSavedAt`, and `sourceReviewFingerprint`.
- IndexedDB remains version 2 with `captureRecords`, `screenshotAssets`, and `generatedComponentVersions`.
- Current dependencies include React, React DOM, OpenAI, PNG utilities, TypeScript, Vite, and Playwright. There is no dedicated JSX compiler dependency, AST parser dependency, Tailwind compiler/runtime dependency, or preview sandbox package.
- The provider prompt asks the model not to emit unsafe code, external assets, `dangerouslySetInnerHTML`, or arbitrary scripts. That prompt is defense in depth, not a security boundary.

## 3. Official Source Registry

Access date for all sources: 2026-07-22.

| Source | Publisher | Architectural fact supported |
| --- | --- | --- |
| Chrome Extensions, "Manifest file format", https://developer.chrome.com/docs/extensions/reference/manifest | Chrome for Developers | MV3 extension structure and Manifest keys, including `side_panel`, `content_security_policy`, and `sandbox`, are declared through `manifest.json`. |
| Chrome Extensions, "Extensions / Manifest V3", https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3 | Chrome for Developers | MV3 uses service workers for background logic and restricts remotely hosted code in extension contexts. |
| Chrome Extensions, "Manifest - Content Security Policy", https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy | Chrome for Developers | Extension pages and sandbox pages have separate CSP treatment; extension pages cannot loosen into unsafe eval-like execution. |
| Chrome Extensions, "Manifest - Sandbox", https://developer.chrome.com/docs/extensions/reference/manifest/sandbox | Chrome for Developers | Manifest sandbox pages have no extension API access, have a unique origin, cannot directly access non-sandboxed pages, communicate through `postMessage`, and must not use `allow-same-origin`. |
| Chrome Extensions, "chrome.sidePanel", https://developer.chrome.com/docs/extensions/reference/api/sidePanel | Chrome for Developers | Side Panel pages are extension pages and may use extension APIs when the extension has permission. |
| Chrome Extensions, "Deal with remote hosted code violations", https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code | Chrome for Developers | MV3 extension logic must not load remotely hosted JavaScript or WASM as executable code. |
| HTML Standard, iframe sandbox, https://html.spec.whatwg.org/multipage/iframe-embed-object.html | WHATWG | `iframe sandbox` creates restrictions by default; `allow-scripts` enables script execution; `allow-same-origin` restores origin behavior and must be avoided for hostile same-origin content. |
| HTML Standard, web messaging, https://html.spec.whatwg.org/multipage/web-messaging.html | WHATWG | `postMessage` receivers must validate sender and message data; receivers should rate-limit untrusted messages. |
| MDN, "Window: postMessage()", https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage | MDN Web Docs | Opaque-origin targets can require wildcard target origins, so confidentiality must rely on sending no secrets plus source-window, nonce, request ID, and schema validation. |
| React, "createRoot", https://react.dev/reference/react-dom/client/createRoot | React | Client rendering uses `createRoot`, `root.render`, and `root.unmount` around a DOM container. |
| Tailwind CSS, "Styling with utility classes", https://tailwindcss.com/docs/styling-with-utility-classes | Tailwind Labs | Tailwind utility classes map to generated CSS rules rather than a universal full-fidelity runtime by default. |
| Tailwind CSS, "Detecting classes in source files", https://tailwindcss.com/docs/detecting-classes-in-source-files | Tailwind Labs | Tailwind detects complete class names as source text and cannot reliably infer dynamically constructed class names. |
| Tailwind CSS, "Play CDN", https://tailwindcss.com/docs/installation/play-cdn | Tailwind Labs | The Play CDN is intended for development, not production use. |
| Babel, "@babel/parser", https://babel.dev/docs/babel-parser | Babel | Babel parser can parse JavaScript and JSX into an AST. |
| Babel, "@babel/standalone", https://babeljs.io/docs/babel-standalone | Babel | Browser-side Babel can transform source at runtime but is not a default production choice and needs CSP/security review. |
| esbuild, "API", https://esbuild.github.io/api/ | esbuild | esbuild can transform in-memory source; browser use requires the WASM build and therefore separate WASM/worker policy review. |
| TypeScript Wiki, "Using the Compiler API", https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API | Microsoft TypeScript | TypeScript compiler APIs can transpile source but are not a security validator by themselves. |

## 4. Threat Model

| Threat | Prevention | Where prevented | Residual risk | Safe failure |
| --- | --- | --- | --- | --- |
| Prompt injection in captured webpage text | Treat provider output as hostile; never follow generated instructions | Backend prompt, preview validator, sandbox | Model may emit valid-looking malicious code | Block preview or show source-only |
| Malicious generated code | Separate previewable-source validation from response validation | Parser/compiler policy and sandbox | Validator gaps | Unsafe preview state; source remains inert |
| Compromised provider/backend response | Shape validation plus preview validation and isolation | Backend, extension, sandbox host | Shape-valid exploit attempt | Block or isolate |
| `import`, dynamic `import()`, `require` | Reject imports except exact future React normalization; reject dynamic import and require | AST validation | Parser bug | Compile failed or unsafe |
| `eval`, `Function`, `new Function`, WebAssembly | Reject constructs and globals; do not choose eval/WASM compiler without review | AST, CSP, dependency gate | Compiler may need eval/WASM | Candidate rejected for first implementation |
| `fetch`, XHR, WebSocket, EventSource, beacon | Reject API usage and set `connect-src 'none'` | AST and CSP | Aliasing if validation weak | Network blocked and preview failed |
| Storage, IndexedDB, cookies | Opaque sandbox origin, no extension APIs, reject storage globals | Sandbox and AST | Browser bug | Runtime failure in isolated realm |
| `postMessage` spoofing | Exact-key schema, direction checks, current `WindowProxy`, nonce, request ID, rate limits | Side Panel and sandbox host | Opaque origin limits normal origin checks | Ignore message |
| Navigation, popups, downloads, forms | Omit sandbox tokens and reject URL/action constructs | Sandbox, CSP, AST | Browser behavior edge case | Dispose preview |
| CSS network loading | Reject URL-bearing CSS and classes; block images/fonts/connect | CSS policy and CSP | CSS parser gap | Resource blocked; warning |
| Infinite loops, recursion, memory exhaustion | Compile/render timeouts, one preview instance, disposable realm | Lifecycle controller | Main-thread script cannot always be forcibly interrupted | Abandon/remove realm; show timed out |
| Large DOM output | DOM node and frame-height limits | Sandbox host | Measurement delay | Dispose or clamp |
| Timers and event listeners after close | Reject timers initially; destroy realm on close/switch/back | AST and lifecycle | Late messages | Stale messages ignored |
| Generated code replacing controller | Keep trusted controller out of untrusted render realm | Two-layer architecture | Same-realm design would fail | Reject same-realm execution |
| Accessibility and focus traps | Keep trusted controls outside frame; provide close/back outside preview | Side Panel UX | Focus can enter preview | Dispose and restore trusted focus |
| Preview state surviving version switch | New nonce/request ID/realm per attempt | Lifecycle controller | Late messages | Ignore stale responses |

## 5. Architecture Options

### Option A - Execute inside the Side Panel

Rejected. The Side Panel is a privileged extension page. Running generated code there would expose the Side Panel DOM, trusted React state, extension APIs available to the page, persistence access patterns, and user navigation state. It would also collide with extension-page CSP limitations around dynamic code execution.

### Option B - Ordinary extension-origin iframe

Rejected for first implementation. A normal extension-origin iframe is still an extension-origin document unless it is explicitly handled as a sandbox page. It does not provide the documented sandbox-page guarantees of unique origin, no extension API access, and no direct access to non-sandboxed extension pages.

### Option C - One packaged sandbox page

Partially acceptable as a foundation. A Manifest-declared sandbox page can have a separate sandbox CSP, no extension API access, no `allow-same-origin`, packaged local runtime resources, no network by default, and strict parent/sandbox messaging.

Risk: if trusted preview-controller code and untrusted generated code share one sandbox realm, generated code can patch globals, replace DOM APIs, interfere with messages, or prevent cleanup. One sandbox page alone is therefore not enough unless generated code is never executed in the controller realm.

### Option D - Trusted sandbox host plus nested untrusted render realm

Superseded for the accepted Milestone 6B foundation. This remains historical 6A reasoning and possible future design material only if a later milestone independently approves the required exposure and security boundary changes.

```text
Side Panel extension page
  -> packaged sandbox host page
      -> ephemeral untrusted render realm
```

The Side Panel remains trusted and never compiles or executes generated code. The packaged sandbox host has no extension API access and owns validation, compilation, CSS generation, React runtime loading from packaged resources, inner realm creation, message checks, timeout supervision, and disposal. The nested render realm executes only the transformed preview payload and is destroyed for close, back, retry, failure, timeout, or version switch.

Inner-realm candidates:

- Nested sandboxed iframe: preferred first candidate because HTML sandboxing supports an opaque origin without `allow-same-origin` while allowing scripts through `allow-scripts`.
- Another packaged sandbox page: viable if it remains sandboxed, receives no extension-origin secrets, and has strict local-resource CSP.
- `srcdoc`: possible but complicates CSP and message handling; not first choice.
- Blob-backed iframe: possible but should be avoided initially because Blob/data URL lifecycle and opaque-origin messaging add complexity.
- Any other mechanism must be rechecked against current Chrome policy before implementation.

### Option E - Remote preview service

Rejected as the default MVP path. It would transmit generated source and potentially capture-derived information to another service, adding privacy, availability, cost, authentication, abuse, logging, and retention concerns. It should be reconsidered only if local packaged isolation proves infeasible and the product explicitly accepts the new data boundary.

### Option F - Static approximation

Safer because it avoids generated-code execution. It is incomplete because it cannot prove the generated React component actually renders, fails, times out, or violates runtime restrictions. It can be a fallback state, not the isolated component-preview architecture.

## 6. Recommended Architecture

Historical 6A recommendation, superseded for the accepted Milestone 6B implementation by the Side Panel-owned sibling sandbox architecture described at the top of this document. The accepted Milestone 6C implementation uses the bounded AST-to-render-plan pipeline described at the top of this document; this host-owned nested render realm design remains historical only.

Primary 6A recommendation: local packaged two-layer isolation.

Trusted contexts:

- Side Panel extension page: owns user controls, selected generated-version ID, source-code display, trusted labels, and persistence reads.
- Packaged sandbox host: owns preview validation, compilation, CSS generation, packaged React runtime selection, nested realm creation, message validation, timeouts, and disposal.

Untrusted context:

- Ephemeral render realm: executes transformed generated component code for one preview attempt.

Boundaries and ownership:

- Compile code in the sandbox host, not the Side Panel.
- Execute generated component code only in the nested render realm.
- Load React from packaged local resources controlled by the sandbox host or render realm; never from CDN.
- Build generated CSS in the sandbox host and inject only bounded CSS into the render realm.
- Mount output into a single known root node and unmount/dispose through realm destruction.
- On version switch, dispose the old realm, mint a new request ID and nonce, revalidate source, compile, create a new render realm, and ignore old messages.
- On compile failure, unsafe source, runtime failure, timeout, or close, destroy the current render realm and keep persisted source text unchanged.
- If preview hangs, the Side Panel abandons the active session and removes or replaces the outer sandbox frame. A renderer-level browser hang remains residual risk and must be tested honestly.

Data that may cross into preview:

- Request ID, one-time session nonce, component name, bounded generated source text, source hash, selected preview mode, and minimal user-visible labels.

Data that must not cross:

- Chrome API handles, backend/provider credentials, raw CaptureRecord wrappers, screenshot Blob/data URL, source URL, page title, storage keys, cookies, browser storage, provider metadata, backend errors, unrelated captures, other generated versions, or source webpage state.

## 7. Preview Message Protocol

Messages are JSON-compatible, versioned, exact-key validated, direction-specific, and bounded. Maximum serialized message size: 64 KiB. Unknown keys are rejected.

```ts
type PreviewHostInitV1 = {
  contractVersion: 1;
  type: "preview.host.init";
  requestId: string;
  sessionNonce: string;
  hostCapabilities: {
    react: "packaged";
    css: "bounded-subset" | "generated-css";
  };
};

type PreviewRenderRequestV1 = {
  contractVersion: 1;
  type: "preview.render.request";
  requestId: string;
  sessionNonce: string;
  source: PreviewableGeneratedSourceV1;
};

type PreviewRenderSuccessV1 = {
  contractVersion: 1;
  type: "preview.render.success";
  requestId: string;
  sessionNonce: string;
  width: number;
  height: number;
  warnings: string[];
};

type PreviewRenderFailureV1 = {
  contractVersion: 1;
  type: "preview.render.failure";
  requestId: string;
  sessionNonce: string;
  category: "compile_failed" | "blocked_unsafe" | "runtime_failed" | "timed_out" | "disposed";
  message: string;
};

type PreviewResizeV1 = {
  contractVersion: 1;
  type: "preview.resize";
  requestId: string;
  sessionNonce: string;
  width: number;
  height: number;
};

type PreviewDisposeV1 = {
  contractVersion: 1;
  type: "preview.dispose";
  requestId: string;
  sessionNonce: string;
  reason: "back" | "close" | "version-switch" | "timeout" | "error";
};
```

Protocol rules:

- `requestId` is unique per preview attempt.
- `sessionNonce` is unguessable and single-use.
- Side Panel accepts messages only from the current sandbox host `WindowProxy`.
- Sandbox host accepts messages only from the current Side Panel or current inner realm `WindowProxy`, depending on message direction.
- Opaque origins must not be treated as normal same-origin peers. If wildcard `targetOrigin` is unavoidable, no confidential data may be sent, and validation must rely on current source window, nonce, request ID, exact schema, and rate limits.
- Replayed, stale, oversized, malformed, wrong-direction, or unknown-key messages are ignored or surfaced as safe preview failure.
- Dispose is idempotent. Late success/resize messages after dispose, timeout, retry, or version switch are ignored.

## 8. Previewable Source Policy

Existing `ComponentGenerationResponseV1.code` remains stored source text unless it passes the separate Milestone 6C previewable-source gate.

```ts
type PreviewableGeneratedSourceV1 = {
  contractVersion: 1;
  language: "tsx";
  componentName: string;
  source: string;
  sourceSha256: string;
};
```

Source categories:

- Stored inert text: any valid generated-version entry may remain persisted and visible as source.
- Previewable source: source parses, passes AST validation, converts to a bounded `PreviewRenderPlanV1`, uses allowed React/Tailwind constructs, and contains no forbidden API or side effect.
- Source-only failure: source fails preview validation but remains persisted, visible, and eligible for future regeneration/revision flows.

Construct policy:

| Construct | Draft policy |
| --- | --- |
| `import React`, named React imports | Prefer reject; a future normalizer may remove exactly allowed React imports after AST proof. |
| Default/named exports | Allow exactly one component export after normalization; reject multiple components and unrelated exports. |
| Hooks | First implementation rejects effects; may allow a narrow reviewed set such as `useState` and `useMemo`. |
| External packages, CSS imports, image imports | Reject. |
| Dynamic `import()`, `require` | Reject. |
| Browser globals | Reject unless explicitly provided by trusted preview runtime. |
| Network, storage, navigation APIs | Reject. |
| `dangerouslySetInnerHTML`, raw `<script>`, direct DOM mutation | Reject. |
| Portals | Reject because they can escape the mount subtree. |
| Suspense/async rendering | Reject initially. |
| Timers | Reject initially. |
| Inline `style` | Reject initially or allow only AST-validated plain safe properties with no URLs. |
| Tailwind arbitrary values | Reject for Previewable Subset V1. |
| Dynamically constructed Tailwind classes | Reject for Previewable Subset V1. |
| External URL values in JSX, style, or class values | Reject. |

## 9. Parser and Compiler Policy

Regex-only validation of JavaScript or JSX is not approved.

Required pipeline for generated-source preview:

1. Enforce source length before parsing.
2. Parse with a real JS/JSX parser.
3. Traverse AST to reject forbidden constructs.
4. Normalize the allowed component export into a controlled plain-data render plan.
5. Send only the render plan, never generated source, to the render realm.
6. Render the plan through trusted packaged React runtime code.
7. Avoid source maps, runtime transforms, and generated JavaScript execution.
8. Bound parse/traversal work, render plan size, message size, diagnostics length, and lifecycle timeout.

Candidate comparison:

| Candidate | Pros | Risks / review needs |
| --- | --- | --- |
| `@babel/parser` plus Babel transform packages | Mature JSX AST ecosystem; good construct visibility | Bundle size, transform dependencies, CSP/eval behavior must be measured |
| `@babel/standalone` | Browser-oriented runtime transform | Not the default production choice; auto-execution modes must be disabled; CSP impact needs proof |
| TypeScript compiler APIs / `transpileModule` | Can transpile TSX-like input | Not a security validator; still needs AST policy checks |
| `esbuild-wasm` | Fast transform API | Requires WASM and likely worker policy; not first choice without separate isolation review |

No dependency was selected or added in Milestone 6A. Milestone 6C adds `@babel/parser` as the production parser dependency for AST inspection only. It does not add Babel transform packages, `@babel/standalone`, TypeScript compiler runtime, esbuild, WebAssembly, workers, Tailwind compiler/runtime, CDN resources, or remote modules.

All compiler/parser/runtime resources must be packaged locally. CDN scripts, remote hosted code, remote modules, and runtime compiler downloads are prohibited.

## 10. Tailwind Preview Strategy

| Strategy | Evaluation |
| --- | --- |
| Full precompiled utility stylesheet | Runtime-simple and local, but can be large and still cannot cover all arbitrary/dynamic classes. |
| Generate CSS from selected source | Best fidelity for static complete class names; requires isolated class extraction/compilation, bounded arbitrary values, caching by source hash, and unsupported-class reporting. |
| Packaged browser Tailwind runtime | Rejected for first implementation; Play CDN is development-oriented, and a packaged runtime still needs CSP, cost, and security review. |
| Bounded utility subset | Safest first implementation; lower fidelity but deterministic, small, local, and easy to audit. |

Milestone 6C implementation: bounded utility subset plus static class-token diagnostics. It does not generate CSS from source and does not run Tailwind at preview time. Later implementation may add per-source CSS generation after a separate parser/compiler/CSS review.

Requirements:

- No Tailwind CDN.
- No external stylesheet.
- No remote font.
- No CSS network loading.
- No unbounded arbitrary CSS execution.
- No CSS persisted into the original CaptureRecord.
- No generated-version schema change unless a later migration is explicitly approved.
- Unsupported or dynamic classes are surfaced as preview warnings while source text remains viewable.

## 11. CSP and Sandbox Proposal

Historical 6A proposal. The accepted 6B/6C implementation uses the sibling packaged sandbox pages already declared in the Manifest.

```json
{
  "sandbox": {
    "pages": ["src/preview/preview-host.html"]
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';",
    "sandbox": "sandbox allow-scripts; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; child-src 'self'; frame-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  }
}
```

Policy notes:

- The sandbox page must not use `allow-same-origin`.
- `allow-scripts` is required only for packaged sandbox controller/runtime scripts and the nested render realm.
- Forms, popups, modals, top navigation, downloads, workers, service workers, object/embed, connect, fonts, media, and external images stay disabled.
- `style-src 'unsafe-inline'` is a narrow sandbox-only allowance for bounded generated CSS injection. A nonce or packaged stylesheet is preferred if feasible.
- Inline scripts are avoided.
- Any eval-like compiler requirement must be separately approved and must never run in extension pages.
- Blob/data URLs are avoided initially. If later required for an inner realm, they must carry no confidential data and use strict nonce/source-window validation.
- All resources are packaged local resources.

## 12. Resource and Lifecycle Limits

Initial draft limits for later implementation:

- Input source length: 60,000 Unicode code points.
- Transformed JavaScript length: 120,000 UTF-16 code units.
- Generated CSS length: 128 KiB.
- Compile duration: 1,500 ms.
- Initial render duration: 2,000 ms after inner realm load.
- DOM node count where measurable: 1,000 nodes.
- Iframe height: 2,000 CSS px, then internal scrolling.
- Resize-message frequency: 10 per second.
- Console-message count: 20 per preview session.
- Recoverable error message length: 1,000 Unicode code points.
- Simultaneous preview instances: 1.
- Retained Blob URLs: 0 initially; any later Blob URL must be revoked on dispose.
- Dispose on Back, close, version switch, Side Panel close/reopen, timeout, compile failure, unsafe source, and runtime failure.
- Retry always creates a new nonce, request ID, host session, and render realm.

Do not claim main-thread JavaScript can always be forcibly interrupted. Frame disposal and session abandonment are recovery mechanisms; renderer-level hangs remain residual browser risk.

## 13. UX States

| State | User-facing message | Actions | Source view | Persistence |
| --- | --- | --- | --- | --- |
| Preview unavailable | "Preview is not available for this version." | View source, close | Available | No change |
| Checking preview compatibility | "Checking whether this generated source can be previewed safely..." | Cancel | Available | No change |
| Preparing preview | "Preparing an isolated preview..." | Cancel | Available | No change |
| Preview loading | "Loading isolated preview..." | Cancel | Available | No change |
| Preview ready | "Preview ready." | Close preview, view source | Available | No change |
| Preview compile failed | "Preview could not compile this source." | View source, retry | Available | No change |
| Preview blocked as unsafe | "Preview blocked because the generated source uses unsupported or unsafe features." | View source | Available | No change |
| Preview runtime failed | "Preview failed while running in isolation." | View source, retry | Available | No change |
| Preview timed out | "Preview timed out and was disposed." | View source, retry | Available | No change |
| Preview disposed | "Preview closed." | Reopen preview | Available | No change |

Retry recreates a completely new preview realm.

## 14. Version-Management Boundary

- Previewing does not mutate a generated version.
- Previewing does not create a generated version.
- Closing preview does not delete a generated version.
- Failed preview does not invalidate persisted source text.
- Version selection uses existing `GeneratedComponentVersionEntryV1` records.
- Source CaptureRecord remains unchanged.
- Regeneration and natural-language revision are later Milestone 6 stages.
- Comparison is a later Milestone 6 stage.
- Export remains Milestone 7.

Current sequence:

```text
6A - Completed - Architecture and threat model
6B - Completed - Sandbox runtime foundation with trusted packaged fixtures
6C - Completed - Safe generated-component preview for Previewable Subset V1
6D - Current - Regeneration and natural-language revision
6E - Planned - Version comparison and final Milestone 6 regression
```

Each stage needs independent security review before expanding the amount of generated code that can run.

## 15. Testing Strategy

No tests were added in Milestone 6A. The accepted 6B/6C implementation is expected to cover:

- Unit tests for exact-key message validators, nonce/request ID behavior, replay/stale rejection, malformed messages, oversized messages, and timeout/dispose behavior.
- Unit tests for previewable-source validation: imports, dynamic imports, `require`, browser globals, network calls, storage calls, navigation, popups, timers, workers, WebAssembly, DOM mutation, `dangerouslySetInnerHTML`, raw scripts, portals, hooks/effects, oversized source, compiler errors, and runtime errors.
- Tailwind tests for static class extraction, unsupported dynamic classes, arbitrary-value limits, and bounded CSS output.
- Static checks for Manifest sandbox declaration, sandbox CSP, no unexpected permissions, no CDN references, no remote scripts/modules/styles/fonts, packaged runtime resources, and no generated-code execution path in Side Panel, service worker, content script, backend, or source webpage.
- Playwright extension-runtime tests for no extension API access from sandbox, no IndexedDB/storage/cookie access, no source-page access, no network/external resources, blocked popups/forms/navigation/downloads/workers/service workers, message source/nonce validation, malicious source isolation, hung-preview recovery, repeated open/close, capture switching, version switching, Side Panel close/reopen, CaptureRecord immutability, generated-version persistence immutability, no real AI request, and no unexpected Console errors.
- Real Chrome manual validation where browser security behavior cannot be reliably asserted in automated fixtures.

## 16. Milestone 6A Explicit Non-Goals

These non-goals describe the original documentation-only Milestone 6A architecture review. They are historical for 6A and do not override the accepted Milestone 6B foundation status described at the top of this document.

- No preview implementation.
- No generated-code execution.
- No Manifest change.
- No CSP change.
- No dependency or lockfile change.
- No parser/compiler installation.
- No Tailwind installation.
- No runtime, backend, source, test, database, schema, Vite, or `dist` change.
- No database migration.
- No generated-version schema change.
- No revision request contract.
- No backend revision endpoint.
- No version comparison UI.
- No export.
- No real OpenAI or provider call.
