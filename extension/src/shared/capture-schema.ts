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

export type ScreenshotCaptureResult = {
  dataUrl: string;
  mediaType: "image/png";
  width: number;
  height: number;
  byteLength: number;
  crop: SerializableRect;
  sourceWidth: number;
  sourceHeight: number;
  scaleX: number;
  scaleY: number;
  wasClipped: boolean;
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

export type DomCaptureExtraction = {
  source: CaptureSource;
  environment: CaptureEnvironment;
  element: CapturedElement;
  dom: CaptureDom;
};

export type StructuredCaptureExtraction = DomCaptureExtraction & {
  styles: CaptureStyles;
  summaries: CaptureSummaries;
};
