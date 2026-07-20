export const GENERATION_CONTRACT_VERSION = 1;

export const GENERATION_LIMITS = {
  serializedRequestBytes: 6_291_456,
  screenshotBytes: 4_194_304,
  screenshotMaxDimension: 4096,
  domDepth: 4,
  domNodeCount: 60,
  domChildrenPerNode: 8,
  domAttributesPerNode: 6,
  tagNameCodePoints: 32,
  attributeNameCodePoints: 32,
  attributeValueCodePoints: 120,
  textPreviewCodePoints: 160,
  childSummaryCount: 12,
  childSummaryChildCount: 999,
  semanticRoleCodePoints: 64,
  titleCodePoints: 120,
  componentTypeCodePoints: 64,
  tagsCount: 12,
  tagCodePoints: 32,
  rectMaxCssPixels: 100_000,
  computedStyleCodePoints: 160,
  boxEdgeCodePoints: 32,
  pseudoStyleCodePoints: 160,
  pseudoContentCodePoints: 240,
  typographyPrimaryFontCodePoints: 120,
  typographyScaleCount: 8,
  typographyScaleCodePoints: 32,
  typographyWeightsCount: 8,
  typographyWeightCodePoints: 16,
  summaryNotesCodePoints: 500,
  colorValueCodePoints: 64,
  colorRolesCount: 12,
  colorRoleNameCodePoints: 48,
  layoutValueCodePoints: 64,
  spacingGapCodePoints: 64,
  componentNameCodePoints: 64,
  codeCodePoints: 60_000,
  summaryCodePoints: 2_000,
  approximationNotesCodePoints: 4_000,
  providerMetadataCodePoints: 80
} as const;

export const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
export const TAG_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
export const COMPONENT_NAME_PATTERN = /^[A-Z][A-Za-z0-9]{0,63}$/;
export const PAGE_TITLE_POLICY_REASON = "Excluded by default; future explicit opt-in required.";
export const SOURCE_URL_POLICY_REASON = "Excluded by default.";
export const BACKEND_ERROR_CODES = [
  "configuration_unavailable",
  "request_validation_failed",
  "request_too_large",
  "invalid_screenshot",
  "network_unavailable",
  "timeout",
  "provider_rejected",
  "rate_limited",
  "malformed_response"
] as const;

export type GenerationBackendErrorCodeV1 = typeof BACKEND_ERROR_CODES[number];

export type GenerationBackendErrorResponseV1 = {
  contractVersion: 1;
  error: {
    code: GenerationBackendErrorCodeV1;
    message: string;
  };
};

export const REQUESTED_OUTPUT_FIELDS = ["componentName", "code", "summary", "approximationNotes"] as const;
export const REQUESTED_OUTPUT = {
  framework: "react",
  styling: "tailwind",
  fields: REQUESTED_OUTPUT_FIELDS
} as const;

export const TRANSMITTED_ATTRIBUTE_NAMES = [
  "id",
  "class",
  "role",
  "ariaLabel",
  "ariaPressed",
  "ariaSelected",
  "ariaExpanded",
  "ariaCurrent",
  "type",
  "name"
] as const;

export const SOURCE_TO_TRANSMITTED_ATTRIBUTES: Record<string, typeof TRANSMITTED_ATTRIBUTE_NAMES[number] | undefined> = {
  id: "id",
  class: "class",
  role: "role",
  "aria-label": "ariaLabel",
  "aria-pressed": "ariaPressed",
  "aria-selected": "ariaSelected",
  "aria-expanded": "ariaExpanded",
  "aria-current": "ariaCurrent",
  type: "type",
  name: "name"
};

export const COMPUTED_STYLE_KEYS = [
  "display",
  "position",
  "boxSizing",
  "width",
  "height",
  "color",
  "backgroundColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "border",
  "borderRadius",
  "boxShadow",
  "gap",
  "flexDirection",
  "alignItems",
  "justifyContent",
  "gridTemplateColumns",
  "gridTemplateRows"
] as const;

export const BOX_EDGE_KEYS = ["top", "right", "bottom", "left"] as const;
export const PSEUDO_STYLE_KEYS = ["content", "display", "color", "backgroundColor", "width", "height"] as const;

export type TransmittedBoxEdgesV1 = {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
};

export type TransmittedDomNodeV1 = {
  tagName: string;
  attributes: Partial<Record<typeof TRANSMITTED_ATTRIBUTE_NAMES[number], string>>;
  textPreview?: string;
  children: TransmittedDomNodeV1[];
};

export type TransmittedChildSummaryV1 = {
  tagName: string;
  semanticRole?: string;
  textPreview?: string;
  childCount: number;
};

export type TransmittedComputedStylesV1 = Partial<Record<typeof COMPUTED_STYLE_KEYS[number], string>> & {
  padding?: TransmittedBoxEdgesV1;
  margin?: TransmittedBoxEdgesV1;
};

export type TransmittedPseudoStylesV1 = {
  exists: boolean;
} & Partial<Record<typeof PSEUDO_STYLE_KEYS[number], string>>;

export type TransmittedTypographySummaryV1 = {
  primaryFont?: string;
  scale?: string[];
  weights?: string[];
  notes?: string;
};

export type TransmittedColorSummaryV1 = {
  foreground?: string;
  background?: string;
  accent?: string;
  border?: string;
  roles?: Array<{
    role: string;
    value: string;
  }>;
};

export type TransmittedLayoutSummaryV1 = {
  display?: string;
  direction?: string;
  alignment?: string;
  density?: "compact" | "comfortable" | "spacious";
  notes?: string;
};

export type TransmittedSpacingSummaryV1 = {
  padding?: TransmittedBoxEdgesV1;
  margin?: TransmittedBoxEdgesV1;
  gap?: string;
  notes?: string;
};

export type ExactCaptureContextProjectionV1 = {
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
    reason: typeof PAGE_TITLE_POLICY_REASON;
  };
  sourceUrlPolicy: {
    included: false;
    reason: typeof SOURCE_URL_POLICY_REASON;
  };
};

export type ComponentGenerationRequestWithoutDataUrlV1 = {
  contractVersion: typeof GENERATION_CONTRACT_VERSION;
  screenshot: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
  };
  captureContext: ExactCaptureContextProjectionV1;
  requestedOutput: {
    framework: typeof REQUESTED_OUTPUT.framework;
    styling: typeof REQUESTED_OUTPUT.styling;
    fields: typeof REQUESTED_OUTPUT_FIELDS;
  };
};

export type ComponentGenerationRequestV1 = ComponentGenerationRequestWithoutDataUrlV1 & {
  screenshot: ComponentGenerationRequestWithoutDataUrlV1["screenshot"] & {
    dataUrl: string;
  };
};

export type OpaqueGenerationProviderMetadata = {
  providerLabel?: string;
  providerModelLabel?: string;
};

export type ComponentGenerationResponseV1 = {
  contractVersion: typeof GENERATION_CONTRACT_VERSION;
  componentName: string;
  framework: "react";
  styling: "tailwind";
  code: string;
  summary: string;
  approximationNotes: string;
  metadata?: OpaqueGenerationProviderMetadata;
};

export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "componentName", "framework", "styling", "code", "summary", "approximationNotes"],
  properties: {
    contractVersion: { const: GENERATION_CONTRACT_VERSION },
    componentName: {
      type: "string",
      pattern: "^[A-Z][A-Za-z0-9]{0,63}$",
      maxLength: GENERATION_LIMITS.componentNameCodePoints
    },
    framework: { const: "react" },
    styling: { const: "tailwind" },
    code: { type: "string", minLength: 1, maxLength: GENERATION_LIMITS.codeCodePoints },
    summary: { type: "string", minLength: 1, maxLength: GENERATION_LIMITS.summaryCodePoints },
    approximationNotes: { type: "string", maxLength: GENERATION_LIMITS.approximationNotesCodePoints }
  }
} as const;

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function codePointLength(value: string) {
  return Array.from(value).length;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertAllowedObjectKeys(value: unknown, keys: readonly string[]) {
  if (!isPlainObject(value)) {
    throw new Error("request_validation_failed");
  }
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error("request_validation_failed");
    }
  }
}

export function assertExactObjectKeys(value: unknown, keys: readonly string[]) {
  assertAllowedObjectKeys(value, keys);
  const actual = Object.keys(value as Record<string, unknown>);
  if (actual.length !== keys.length || keys.some((key) => !actual.includes(key))) {
    throw new Error("request_validation_failed");
  }
}
