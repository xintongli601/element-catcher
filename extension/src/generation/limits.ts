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
