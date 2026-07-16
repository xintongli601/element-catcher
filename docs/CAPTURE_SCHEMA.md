# CaptureRecord v1 Schema

`CaptureRecord` is the normalized, serializable source of truth for an Element Catcher capture.

It is not a live DOM reference, not raw `outerHTML`, and not just screenshot history. It is a JSON-compatible record that can power the local Capture Library, Capture Preview, search, AI reconstruction, generated component versions, and future export.

## Principles

- Use plain JSON-compatible data.
- Do not store `HTMLElement`, `Node`, `DOMRect`, `CSSStyleDeclaration`, or other browser runtime objects.
- Store screenshot data through an asset reference, not a required inline image string.
- Keep original capture data separate from generated component versions.
- Use `schemaVersion` for migration.
- Prefer semantic summaries over large raw content.
- Keep captures local by default.

## Field Groups

### Required Capture-Time Fields

These fields are required when a complete Milestone 3 capture is created:

- `schemaVersion`
- `id`
- `createdAt`
- `source.url`
- `source.pageTitle`
- `environment.viewport`
- `environment.devicePixelRatio`
- `element.tagName`
- `element.rect`
- `dom.sanitizedSnapshot`
- `dom.childSummary`
- `styles.computed`
- `summaries.typography`
- `summaries.colors`
- `summaries.layout`
- `summaries.spacing`
- `assets.screenshot`

### Optional Capture-Time Fields

These fields may be missing when unavailable or unsafe:

- `source.faviconUrl`
- `element.semanticRole`
- `element.textPreview`
- `element.id`
- `element.classNames`
- `styles.before`
- `styles.after`
- `summaries.componentType`

### User-Editable Library Metadata

These fields are edited by the user in the local Capture Library:

- `library.title`
- `library.componentType`
- `library.tags`
- `library.notes`

### AI-Derived Fields

These fields may be filled by future AI or heuristic processing:

- `summaries.componentType`
- `summaries.layout`
- `summaries.typography`
- `summaries.colors`
- `summaries.spacing`
- `generatedVersions`

### Future Fields

Future versions may add:

- More framework targets
- Export metadata
- Preview settings
- User-defined design tokens
- Local-only embedding/search metadata
- Cloud sync metadata if cloud sync is ever added

## TypeScript Interfaces

```ts
export type CaptureSchemaVersion = 1;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type CaptureRecord = {
  schemaVersion: CaptureSchemaVersion;
  id: string;
  createdAt: string;
  source: CaptureSource;
  environment: CaptureEnvironment;
  element: CapturedElement;
  dom: CaptureDom;
  styles: CaptureStyles;
  summaries: CaptureSummaries;
  assets: CaptureAssets;
  library: CaptureLibraryMetadata;
  generatedVersions: GeneratedComponentVersion[];
};

export type CaptureSource = {
  url: string;
  pageTitle: string;
  faviconUrl?: string;
};

export type CaptureEnvironment = {
  viewport: {
    width: number;
    height: number;
  };
  devicePixelRatio: number;
};

export type CapturedElement = {
  tagName: string;
  semanticRole?: string;
  textPreview?: string;
  id?: string;
  classNames?: string[];
  rect: SerializableRect;
};

export type SerializableRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type CaptureDom = {
  sanitizedSnapshot: SanitizedDomNode;
  childSummary: ChildElementSummary[];
};

export type SanitizedDomNode = {
  tagName: string;
  attributes: Record<string, string>;
  textPreview?: string;
  children: SanitizedDomNode[];
};

export type ChildElementSummary = {
  tagName: string;
  semanticRole?: string;
  textPreview?: string;
  childCount: number;
};

export type CaptureStyles = {
  computed: NormalizedStyleSnapshot;
  before?: PseudoElementStyleSnapshot;
  after?: PseudoElementStyleSnapshot;
};

export type NormalizedStyleSnapshot = {
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
  padding?: BoxEdges;
  margin?: BoxEdges;
  gap?: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
};

export type PseudoElementStyleSnapshot = {
  exists: boolean;
  content?: string;
  display?: string;
  color?: string;
  backgroundColor?: string;
  width?: string;
  height?: string;
};

export type BoxEdges = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export type CaptureSummaries = {
  componentType?: string;
  typography: TypographySummary;
  colors: ColorSummary;
  layout: LayoutSummary;
  spacing: SpacingSummary;
};

export type TypographySummary = {
  primaryFont?: string;
  scale?: string[];
  weights?: string[];
  notes?: string;
};

export type ColorSummary = {
  foreground?: string;
  background?: string;
  accent?: string;
  border?: string;
  roles?: Array<{
    role: string;
    value: string;
  }>;
};

export type LayoutSummary = {
  display?: string;
  direction?: string;
  alignment?: string;
  density?: "compact" | "comfortable" | "spacious";
  notes?: string;
};

export type SpacingSummary = {
  padding?: BoxEdges;
  margin?: BoxEdges;
  gap?: string;
  notes?: string;
};

export type CaptureAssets = {
  screenshot: ScreenshotAssetReference;
};

export type ScreenshotAssetReference = {
  storageKey: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  byteLength?: number;
  crop: SerializableRect;
};

export type CaptureLibraryMetadata = {
  title?: string;
  componentType?: string;
  tags: string[];
  notes?: string;
};

export type GeneratedComponentVersion = {
  id: string;
  createdAt: string;
  generator: "placeholder" | "ai";
  model?: string;
  componentName: string;
  framework: "react";
  styling: "tailwind";
  code: string;
  summary: string;
  approximationNotes?: string;
  userInstruction?: string;
};
```

## Example Shape

```ts
const capture: CaptureRecord = {
  schemaVersion: 1,
  id: "capture_01",
  createdAt: "2026-07-16T10:00:00.000Z",
  source: {
    url: "https://example.com/dashboard",
    pageTitle: "Dashboard"
  },
  environment: {
    viewport: {
      width: 1440,
      height: 900
    },
    devicePixelRatio: 2
  },
  element: {
    tagName: "article",
    semanticRole: "card",
    textPreview: "Starter plan $19 per month",
    rect: {
      x: 120,
      y: 240,
      width: 320,
      height: 420,
      top: 240,
      right: 440,
      bottom: 660,
      left: 120
    }
  },
  dom: {
    sanitizedSnapshot: {
      tagName: "article",
      attributes: {
        class: "pricing-card"
      },
      textPreview: "Starter plan $19 per month",
      children: []
    },
    childSummary: [
      {
        tagName: "h3",
        textPreview: "Starter",
        childCount: 0
      }
    ]
  },
  styles: {
    computed: {
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#ffffff",
      borderRadius: "12px",
      padding: {
        top: "24px",
        right: "24px",
        bottom: "24px",
        left: "24px"
      }
    }
  },
  summaries: {
    componentType: "pricing-card",
    typography: {
      primaryFont: "Inter",
      weights: ["500", "700"]
    },
    colors: {
      foreground: "#111827",
      background: "#ffffff",
      accent: "#2563eb"
    },
    layout: {
      display: "flex",
      direction: "vertical",
      density: "comfortable"
    },
    spacing: {
      gap: "16px"
    }
  },
  assets: {
    screenshot: {
      storageKey: "screenshots/capture_01.png",
      mediaType: "image/png",
      width: 640,
      height: 840,
      crop: {
        x: 120,
        y: 240,
        width: 320,
        height: 420,
        top: 240,
        right: 440,
        bottom: 660,
        left: 120
      }
    }
  },
  library: {
    title: "Starter Pricing Card",
    componentType: "pricing-card",
    tags: ["pricing", "card"],
    notes: "Good compact plan card layout."
  },
  generatedVersions: []
};
```

## Privacy Safeguards

CaptureRecord creation must follow these safeguards:

- Do not save password values.
- Do not save input or textarea values by default.
- Limit text previews.
- Sanitize DOM before persistence.
- Remove scripts.
- Remove event-handler attributes.
- Avoid persisting hidden sensitive content.
- Store only supported, visible, user-selected element context.
- Warn before future AI transmission.

## Sanitization Rules

DOM sanitization should:

- Drop `<script>`, `<style>` when not needed, and executable elements.
- Drop attributes starting with `on`.
- Drop sensitive form values.
- Redact password fields.
- Limit maximum text length per node.
- Limit maximum depth and child count.
- Preserve useful non-sensitive attributes such as `id`, `class`, `role`, `aria-label`, and `data-*` only when safe.

## Migration Strategy

Future schema migrations should use explicit versioned functions:

```ts
export type UnknownCaptureRecord = JsonObject & {
  schemaVersion?: number;
};

export type CaptureMigration = (record: UnknownCaptureRecord) => UnknownCaptureRecord;

export const captureMigrations: Record<number, CaptureMigration> = {
  1: (record) => record
};
```

Migration rules:

- Never mutate the input object in place.
- Preserve original capture data where possible.
- Keep migrations deterministic.
- Do not require live browser objects.
- Do not fetch network resources during migration.
- Do not generate AI output during migration.
