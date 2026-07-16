# Element Catcher v0.1 Development Brief

## 1. Objective

Define the revised product architecture for Element Catcher before implementing screenshot capture, DOM/CSS extraction, local persistence, Capture Library, or AI integration.

Milestone 2.5 is a documentation and architecture-definition task only. It preserves the existing Milestone 1 scaffold and Milestone 2 selection implementation. It does not add new extension functionality.

The revised architecture is:

```text
Raw element
  -> Capture extractor
  -> Normalized CaptureRecord
  -> Local Library
  -> AI generator
  -> Generated versions
```

The `CaptureRecord` is the source of truth for preview, search, local library, AI generation, generated versions, and future export.

## 2. Existing Architecture to Preserve

The current implementation should remain intact during Milestone 2.5.

Existing structure:

```text
element-catcher/
  README.md
  docs/
    PRD.md
    DEVELOPMENT_BRIEF.md
    CAPTURE_SCHEMA.md
  extension/
    manifest.json
    public/
    src/
      background/
        service-worker.ts
      content/
        index.ts
      shared/
        messages.ts
      sidepanel/
        App.tsx
        index.html
        main.tsx
        styles.css
  package.json
  tsconfig.json
  vite.config.ts
```

Current responsibilities:

- Side panel: user controls and selection status.
- Background service worker: active-tab coordination and messaging.
- Content script: page interaction, hover detection, overlay, click selection, cancellation, cleanup.
- Shared module: typed message definitions and selected-element metadata types.

Milestone 2 already supports basic selection mode and element highlighting. Future implementation should build on this rather than replacing it.

## 3. Development Principles

- Keep the MVP small and focused.
- Treat raw extraction data as an intermediate input, not the final product.
- Normalize all persisted capture data into `CaptureRecord`.
- Store local records as JSON-compatible data.
- Keep screenshot binary data as an asset reference instead of embedding large data URLs in every metadata record.
- Do not persist live DOM references.
- Do not store raw `outerHTML` without sanitization.
- Preserve the distinction between original captures and generated component versions.
- Keep parent/child navigation as selection refinement, not a full DOM inspector.
- Avoid unnecessary dependencies.
- Do not hard-code private API keys.
- If AI generation is added later, use safe configuration excluded from git.

## 4. Module Responsibilities

### 4.1 Side Panel

Current:

- Display extension title, description, selection status, cancel control, and selected-element summary.

Future:

- Show Capture Preview.
- Show local Capture Library.
- Let users edit title, tags, notes, and component type.
- Trigger AI generation.
- Display generated versions and preview.

### 4.2 Background Service Worker

Current:

- Configure side panel open behavior.
- Route start/cancel selection commands to the active tab.
- Return clear errors when a content script cannot be reached.

Future:

- Coordinate screenshot capture with `chrome.tabs.captureVisibleTab`.
- Connect selected-element metadata with screenshot crop requests.
- Coordinate local persistence.
- Keep privileged Chrome API usage out of content scripts.

### 4.3 Content Script

Current:

- Handle selection mode, hover overlay, click selection, Escape cancellation, and cleanup.

Future:

- Lock selected element.
- Support parent/child refinement.
- Extract sanitized DOM snapshot.
- Extract normalized computed style snapshot.
- Extract optional `::before` and `::after` style snapshots.
- Build semantic summaries where practical.

The content script should not store captures permanently and should not send sensitive raw page content unless the user explicitly initiates capture.

### 4.4 Shared Types and Utilities

Current:

- Define typed extension messages and minimal selected-element metadata.

Future:

- Define or import `CaptureRecord` types.
- Define schema migration helpers.
- Define common JSON-compatible primitives.
- Define message types for capture creation, save, preview, and generation.

### 4.5 Local Library

Future module.

Responsibilities:

- Store CaptureRecords locally.
- List captures.
- Reopen capture.
- Edit user metadata.
- Delete captures.
- Search and filter by title, tags, component type, source URL, and summaries.

### 4.6 AI Generator

Future module.

Responsibilities:

- Prepare screenshot plus structured CaptureRecord input.
- Warn before transmitting capture data to an external AI API.
- Request React + Tailwind output.
- Store generated component versions separately from the original CaptureRecord.

## 5. Revised Implementation Order

Completed Milestone 1: Extension scaffold.

Completed Milestone 2: Selection mode and element highlighting.

Milestone 2.5: Product positioning and Capture architecture reset.

Revised Milestone 3: Reliable Element Capture.

Milestone 3 should implement:

- Click-to-lock selected element
- Tag, semantic role, and dimensions
- Parent/child element navigation
- Source URL and page title
- Element screenshot capture and cropping
- Sanitized DOM snapshot
- Normalized computed style extraction
- Optional pseudo-element style extraction
- Typography, color, layout, and spacing summaries
- Capture Preview
- Creation of one valid `CaptureRecord`
- Local persistence of the completed `CaptureRecord`

Milestone 4: Personal Capture Library.

Milestone 5: AI React + Tailwind Reconstruction.

Milestone 6: Isolated Preview and Version Management.

Milestone 7: Export and Future Expansion.

## 6. CaptureRecord Versioning Requirements

`CaptureRecord` must include a `schemaVersion` field. The initial schema is `1`.

Versioning rules:

- New persisted records should write the latest supported schema version.
- Readers should detect older schema versions.
- Migrations should be pure functions from one JSON-compatible object to the next.
- Migrations must not require live DOM nodes, browser runtime objects, or extension-only classes.
- Migrations should preserve original capture data where possible.
- Destructive migrations should be avoided.
- Generated component versions should maintain their link to the source capture record.

See `docs/CAPTURE_SCHEMA.md` for the `CaptureRecord v1` contract.

## 7. Screenshot Storage Strategy

Screenshot capture is future Milestone 3 work. Architecturally, screenshots should be represented as assets referenced by the CaptureRecord rather than large inline strings in every record.

Recommended approach:

- Store screenshot binary data or data URLs in a local asset store.
- Store a stable `assets.screenshot` reference object in the CaptureRecord.
- Include media type, dimensions, and storage key.
- Keep crop metadata separate from raw selection metadata.
- Avoid duplicating the same large image payload across generated versions.

## 8. DOM Sanitization Requirements

Sanitized DOM snapshots are future Milestone 3 work. They must be limited, serializable, and privacy-aware.

Requirements:

- Remove `<script>` elements.
- Remove inline event-handler attributes such as `onclick`, `onload`, and `onerror`.
- Remove or redact password values.
- Do not save input or textarea values by default.
- Limit text length.
- Avoid hidden sensitive content.
- Limit depth and child count.
- Preserve useful structure such as tag names, selected attributes, child summaries, and semantic hints.
- Do not store live `HTMLElement`, `Node`, `DOMRect`, or `CSSStyleDeclaration` objects.

## 9. Sensitive-Data Handling Requirements

Element Catcher can be used on many login-only, intranet, permissioned, dynamic, and localhost pages that the user can already view. That increases the privacy burden.

Rules:

- Keep captures local by default.
- Warn before sending any screenshot, DOM summary, text preview, style summary, or notes to an AI API.
- Do not store password values.
- Do not store input or textarea values by default.
- Limit text previews.
- Prefer semantic summaries over raw content.
- Avoid persisting hidden sensitive content.
- Do not bypass access controls.
- Do not scrape content the user cannot already view.

## 10. Restricted-Page Limitations

The extension should not promise universal capture.

Known unsupported or limited surfaces:

- Chrome internal pages such as `chrome://` pages
- Chrome Web Store pages
- Browser-controlled UI
- Extension pages where content scripts cannot run
- Inaccessible cross-origin iframe contents
- Closed shadow roots
- Pages where the content script is blocked, unavailable, or not reloaded

Unsupported pages should produce clear user-facing errors rather than permanent loading states.

## 11. Parent/Child Selection Scope

Parent/child navigation should help users refine a selected UI element. It should not become a complete DOM inspector.

Scope:

- Move from selected element to parent.
- Move from selected element to meaningful children.
- Show tag, role, and dimensions.
- Keep overlay aligned with the current locked target.

Out of scope:

- Full DOM tree browser
- CSS editing panel
- QA measurement suite
- Complete computed-style explorer

## 12. Explicit Exclusions

Do not include the following in the current MVP:

- Complete visual CSS editor
- Large typography, shadow, gradient, or spacing editing panels
- Full-page cloning
- Multi-page cloning
- Image scraper
- Video scraper
- Complete page HTML export
- Website publishing
- Figma export
- GitHub export
- Team collaboration
- Cloud sync
- Multiple framework generation
- Enterprise workflow
- Payment
- Authentication
- Drag-to-box selection unless later validated as necessary

## 13. Future Acceptance Criteria

### Revised Milestone 3 Acceptance Criteria

Milestone 3 is acceptable when:

1. A user can lock a selected element on a supported webpage.
2. The user can move to parent or child targets where available.
3. The extension records tag, semantic role, dimensions, source URL, page title, viewport, and device pixel ratio.
4. The extension captures and crops an element screenshot.
5. The extension creates a sanitized DOM snapshot.
6. The extension creates a normalized computed style snapshot.
7. Optional pseudo-element style snapshots are included where available.
8. Typography, color, layout, and spacing summaries are created.
9. A Capture Preview displays the result.
10. One valid `CaptureRecord v1` is created.
11. The CaptureRecord is locally persisted.
12. Sensitive fields are omitted or redacted according to policy.

### Milestone 4 Acceptance Criteria

Milestone 4 is acceptable when users can list, reopen, edit, delete, search, and filter local CaptureRecords.

### Milestone 5 Acceptance Criteria

Milestone 5 is acceptable when users can generate a React + Tailwind component from screenshot plus structured CaptureRecord input and save the generated version.

### Milestone 6 Acceptance Criteria

Milestone 6 is acceptable when users can preview generated components in isolation, revise them with natural language, regenerate, and compare versions.

### Milestone 7 Acceptance Criteria

Milestone 7 is acceptable when export and future expansion paths are defined and implemented without turning the MVP into a full publishing, enterprise, or multi-framework platform.
