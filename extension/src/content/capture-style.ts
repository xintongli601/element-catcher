import type {
  BoxEdges,
  CaptureStyles,
  CaptureSummaries,
  ColorSummary,
  LayoutSummary,
  NormalizedStyleSnapshot,
  PseudoElementStyleSnapshot,
  SpacingSummary,
  StructuredCaptureExtraction,
  TypographySummary
} from "../shared/capture-schema";
import { assertJsonCompatible } from "../shared/json";
import { createDomCaptureExtraction } from "./capture-dom";
import { getSemanticRole } from "./semantic-role";

const MAX_STYLE_VALUE_LENGTH = 500;
const MAX_PSEUDO_CONTENT_LENGTH = 160;
const MAX_SAMPLED_ELEMENTS = 60;
const MAX_TYPOGRAPHY_SCALE = 8;
const MAX_TYPOGRAPHY_WEIGHTS = 8;
const MAX_SUMMARY_COLORS = 16;
const MAX_COLOR_ROLES = 6;

const DROPPED_STYLE_TAG_NAMES = new Set(["script", "style", "noscript", "template", "object", "embed", "iframe"]);
const FLEX_DISPLAYS = new Set(["flex", "inline-flex"]);
const GRID_DISPLAYS = new Set(["grid", "inline-grid"]);
const COMPONENT_TYPE_ROLES = new Set([
  "button",
  "link",
  "navigation",
  "dialog",
  "form",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "slider",
  "spinbutton",
  "table",
  "list"
]);

type StyleReadContext = {
  computedStyles: WeakMap<Element, CSSStyleDeclaration>;
};

type StyleCaptureExtraction = {
  styles: CaptureStyles;
  summaries: CaptureSummaries;
};

export function createStructuredCaptureExtraction(element: Element): StructuredCaptureExtraction {
  const domExtraction = createDomCaptureExtraction(element);
  const styleExtraction = createStyleCaptureExtraction(element);
  const extraction: StructuredCaptureExtraction = {
    ...domExtraction,
    ...styleExtraction
  };

  assertJsonCompatible(extraction);
  return extraction;
}

export function createStyleCaptureExtraction(element: Element): StyleCaptureExtraction {
  const context: StyleReadContext = {
    computedStyles: new WeakMap()
  };
  const computed = createNormalizedStyleSnapshot(element, context);
  const styles: CaptureStyles = {
    computed,
    ...optionalPseudo("before", createPseudoElementSnapshot(element, "::before")),
    ...optionalPseudo("after", createPseudoElementSnapshot(element, "::after"))
  };
  const summaries = createCaptureSummaries(element, computed, context);
  const extraction: StyleCaptureExtraction = { styles, summaries };

  assertJsonCompatible(extraction);
  return extraction;
}

function createNormalizedStyleSnapshot(element: Element, context: StyleReadContext): NormalizedStyleSnapshot {
  const style = getCachedComputedStyle(element, context);
  const display = readStyle(style, "display");
  const isFlex = display ? FLEX_DISPLAYS.has(display) : false;
  const isGrid = display ? GRID_DISPLAYS.has(display) : false;

  return {
    ...optionalString("display", display),
    ...optionalString("position", readStyle(style, "position")),
    ...optionalString("boxSizing", readStyle(style, "boxSizing")),
    ...optionalString("width", readStyle(style, "width")),
    ...optionalString("height", readStyle(style, "height")),
    ...optionalString("color", readStyle(style, "color")),
    ...optionalString("backgroundColor", readStyle(style, "backgroundColor")),
    ...optionalString("fontFamily", readStyle(style, "fontFamily")),
    ...optionalString("fontSize", readStyle(style, "fontSize")),
    ...optionalString("fontWeight", readStyle(style, "fontWeight")),
    ...optionalString("lineHeight", readStyle(style, "lineHeight")),
    ...optionalString("letterSpacing", readStyle(style, "letterSpacing")),
    ...optionalString("textAlign", readStyle(style, "textAlign")),
    ...optionalString("border", readStyle(style, "border")),
    ...optionalString("borderRadius", readStyle(style, "borderRadius")),
    ...optionalString("boxShadow", readStyle(style, "boxShadow")),
    padding: readBoxEdges(style, "padding"),
    margin: readBoxEdges(style, "margin"),
    ...optionalString("gap", readRelevantGap(style, isFlex || isGrid)),
    ...(isFlex
      ? {
          ...optionalString("flexDirection", readStyle(style, "flexDirection")),
          ...optionalString("alignItems", readStyle(style, "alignItems")),
          ...optionalString("justifyContent", readStyle(style, "justifyContent"))
        }
      : {}),
    ...(isGrid
      ? {
          ...optionalString("alignItems", readStyle(style, "alignItems")),
          ...optionalString("justifyContent", readStyle(style, "justifyContent")),
          ...optionalString("gridTemplateColumns", readStyle(style, "gridTemplateColumns")),
          ...optionalString("gridTemplateRows", readStyle(style, "gridTemplateRows"))
        }
      : {})
  };
}

function createPseudoElementSnapshot(
  element: Element,
  pseudoElement: "::before" | "::after"
): PseudoElementStyleSnapshot | undefined {
  let style: CSSStyleDeclaration;

  try {
    style = window.getComputedStyle(element, pseudoElement);
  } catch {
    return undefined;
  }

  const rawContent = readStyle(style, "content");
  const content = sanitizePseudoContent(rawContent, element);
  const display = readStyle(style, "display");
  const backgroundColor = readStyle(style, "backgroundColor");
  const width = readStyle(style, "width");
  const height = readStyle(style, "height");
  const hasVisibleDimensions = hasPositiveCssLength(width) && hasPositiveCssLength(height);
  const hasVisibleBackground = Boolean(backgroundColor && !isTransparentColor(backgroundColor));
  const hasMeaningfulDisplay = Boolean(display && display !== "none");

  if (!content && !hasVisibleBackground && !(hasMeaningfulDisplay && hasVisibleDimensions)) {
    return undefined;
  }

  return {
    exists: true,
    ...optionalString("content", content),
    ...optionalString("display", display),
    ...optionalString("color", readStyle(style, "color")),
    ...optionalString("backgroundColor", backgroundColor),
    ...optionalString("width", width),
    ...optionalString("height", height)
  };
}

function createCaptureSummaries(
  root: Element,
  computed: NormalizedStyleSnapshot,
  context: StyleReadContext
): CaptureSummaries {
  const samples = sampleVisibleSubtree(root, context);
  return {
    ...optionalString("componentType", getComponentType(root)),
    typography: createTypographySummary(root, samples, context),
    colors: createColorSummary(root, samples, context, computed),
    layout: createLayoutSummary(computed),
    spacing: createSpacingSummary(computed)
  };
}

function createTypographySummary(
  root: Element,
  samples: Element[],
  context: StyleReadContext
): TypographySummary {
  const rootStyle = getCachedComputedStyle(root, context);
  const primaryFont = getPrimaryFont(readStyle(rootStyle, "fontFamily"));
  const scale = uniqueLimited(
    samples.map((sample) => readStyle(getCachedComputedStyle(sample, context), "fontSize")),
    MAX_TYPOGRAPHY_SCALE,
    sortCssLengths
  );
  const weights = uniqueLimited(
    samples.map((sample) => readStyle(getCachedComputedStyle(sample, context), "fontWeight")),
    MAX_TYPOGRAPHY_WEIGHTS,
    sortNumericStrings
  );

  return {
    ...optionalString("primaryFont", primaryFont),
    ...(scale.length > 0 ? { scale } : {}),
    ...(weights.length > 0 ? { weights } : {})
  };
}

function createColorSummary(
  root: Element,
  samples: Element[],
  context: StyleReadContext,
  computed: NormalizedStyleSnapshot
): ColorSummary {
  const rootStyle = getCachedComputedStyle(root, context);
  const foreground = readStyle(rootStyle, "color");
  const backgroundColor = readStyle(rootStyle, "backgroundColor");
  const background = backgroundColor && !isTransparentColor(backgroundColor) ? backgroundColor : undefined;
  const border = extractVisibleBorderColor(computed.border);
  const accent = findAccentColor(samples, context, [foreground, background, border]);
  const roles = createColorRoles({
    foreground,
    background,
    border,
    accent
  });

  return {
    ...optionalString("foreground", foreground),
    ...optionalString("background", background),
    ...optionalString("border", border),
    ...optionalString("accent", accent),
    ...(roles.length > 0 ? { roles } : {})
  };
}

function createLayoutSummary(computed: NormalizedStyleSnapshot): LayoutSummary {
  const isFlex = computed.display ? FLEX_DISPLAYS.has(computed.display) : false;
  const isGrid = computed.display ? GRID_DISPLAYS.has(computed.display) : false;
  const alignment = isFlex || isGrid ? createAlignmentSummary(computed) : undefined;
  const density = createDensitySummary(computed);

  return {
    ...optionalString("display", computed.display),
    ...optionalString("direction", isFlex ? computed.flexDirection : isGrid ? "grid" : undefined),
    ...optionalString("alignment", alignment),
    ...(density ? { density } : {})
  };
}

function createSpacingSummary(computed: NormalizedStyleSnapshot): SpacingSummary {
  return {
    ...(computed.padding ? { padding: computed.padding } : {}),
    ...(computed.margin ? { margin: computed.margin } : {}),
    ...optionalString("gap", computed.gap)
  };
}

function sampleVisibleSubtree(root: Element, context: StyleReadContext) {
  const samples: Element[] = [];
  const pending: Element[] = [root];

  while (pending.length > 0 && samples.length < MAX_SAMPLED_ELEMENTS) {
    const element = pending.shift();
    if (!element || shouldSkipStyleSample(element, context)) {
      continue;
    }

    samples.push(element);

    for (const child of Array.from(element.children)) {
      if (samples.length + pending.length >= MAX_SAMPLED_ELEMENTS) {
        break;
      }

      pending.push(child);
    }
  }

  return samples;
}

function shouldSkipStyleSample(element: Element, context: StyleReadContext) {
  if (
    DROPPED_STYLE_TAG_NAMES.has(element.tagName.toLowerCase()) ||
    isElementCatcherOverlay(element) ||
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("inert")
  ) {
    return true;
  }

  const style = getCachedComputedStyle(element, context);
  return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
}

function getCachedComputedStyle(element: Element, context: StyleReadContext) {
  const existingStyle = context.computedStyles.get(element);
  if (existingStyle) {
    return existingStyle;
  }

  const style = window.getComputedStyle(element);
  context.computedStyles.set(element, style);
  return style;
}

function readBoxEdges(style: CSSStyleDeclaration, property: "padding" | "margin"): BoxEdges {
  return {
    top: readStyle(style, `${property}Top`) ?? "0px",
    right: readStyle(style, `${property}Right`) ?? "0px",
    bottom: readStyle(style, `${property}Bottom`) ?? "0px",
    left: readStyle(style, `${property}Left`) ?? "0px"
  };
}

function readRelevantGap(style: CSSStyleDeclaration, isLayoutContainer: boolean) {
  const gap = readStyle(style, "gap");
  return isLayoutContainer && gap !== "normal" ? gap : undefined;
}

function readStyle(style: CSSStyleDeclaration, property: string) {
  const value = style[property as keyof CSSStyleDeclaration];
  return typeof value === "string" ? normalizeStyleValue(value) : undefined;
}

function normalizeStyleValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, MAX_STYLE_VALUE_LENGTH) : undefined;
}

function sanitizePseudoContent(content: string | undefined, element: Element) {
  if (!content || content === "none" || content === "normal") {
    return undefined;
  }

  const lowered = content.toLowerCase();
  if (lowered.includes("url(") || lowered.includes("attr(")) {
    return undefined;
  }

  const unquoted = unquoteCssString(content);
  if (!unquoted || isSensitivePseudoContent(unquoted, element)) {
    return undefined;
  }

  return unquoted.slice(0, MAX_PSEUDO_CONTENT_LENGTH);
}

function unquoteCssString(value: string) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).trim();
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).trim();
  }

  return value.trim();
}

function isSensitivePseudoContent(value: string, element: Element) {
  if (/token|secret|password|credential|session|auth/i.test(value)) {
    return true;
  }

  return Array.from(element.attributes).some((attribute) => attribute.value.trim() === value);
}

function hasPositiveCssLength(value: string | undefined) {
  if (!value) {
    return false;
  }

  const numericValue = Number.parseFloat(value);
  return Number.isFinite(numericValue) && numericValue > 0;
}

function isTransparentColor(value: string) {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized === "hsla(0,0%,0%,0)" ||
    normalized.endsWith("/0)") ||
    normalized.endsWith("/0%)")
  );
}

function extractVisibleBorderColor(border: string | undefined) {
  if (!border || border.includes(" none ") || border.startsWith("0px ")) {
    return undefined;
  }

  const colorMatch = border.match(/(?:rgb|hsl|lab|lch|oklab|oklch|color)\([^)]+\)|#[\da-fA-F]{3,8}|[a-zA-Z]+$/);
  return colorMatch?.[0];
}

function findAccentColor(samples: Element[], context: StyleReadContext, rootColors: Array<string | undefined>) {
  const excludedColors = new Set(rootColors.filter((color): color is string => Boolean(color)));
  const candidates: string[] = [];

  for (const sample of samples.slice(1)) {
    const style = getCachedComputedStyle(sample, context);
    const colors = [readStyle(style, "color"), readStyle(style, "backgroundColor")];

    for (const color of colors) {
      if (!color || isTransparentColor(color) || excludedColors.has(color) || candidates.includes(color)) {
        continue;
      }

      candidates.push(color);
      if (candidates.length >= MAX_SUMMARY_COLORS) {
        return candidates[0];
      }
    }
  }

  return candidates[0];
}

function createColorRoles(colors: {
  foreground?: string;
  background?: string;
  border?: string;
  accent?: string;
}) {
  const roles: Array<{ role: string; value: string }> = [];
  const seenValues = new Set<string>();

  for (const [role, value] of Object.entries(colors)) {
    if (!value || seenValues.has(value) || roles.length >= MAX_COLOR_ROLES) {
      continue;
    }

    roles.push({ role, value });
    seenValues.add(value);
  }

  return roles;
}

function createAlignmentSummary(computed: NormalizedStyleSnapshot) {
  const parts = [
    computed.alignItems ? `align-items: ${computed.alignItems}` : undefined,
    computed.justifyContent ? `justify-content: ${computed.justifyContent}` : undefined
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join("; ") : undefined;
}

function createDensitySummary(computed: NormalizedStyleSnapshot) {
  const fontSize = parseCssLength(computed.fontSize);
  if (!fontSize || !computed.padding) {
    return undefined;
  }

  const paddingAverage =
    (parseCssLength(computed.padding.top) +
      parseCssLength(computed.padding.right) +
      parseCssLength(computed.padding.bottom) +
      parseCssLength(computed.padding.left)) /
    4;
  const gap = parseCssLength(computed.gap);
  const positiveSpacing = paddingAverage + gap;

  if (positiveSpacing <= 0) {
    return undefined;
  }

  const ratio = positiveSpacing / fontSize;
  if (ratio < 0.75) {
    return "compact";
  }

  if (ratio < 1.75) {
    return "comfortable";
  }

  return "spacious";
}

function parseCssLength(value: string | undefined) {
  if (!value || !value.endsWith("px")) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPrimaryFont(fontFamily: string | undefined) {
  const primaryFont = fontFamily?.split(",")[0]?.trim();
  return primaryFont ? unquoteCssString(primaryFont) : undefined;
}

function getComponentType(element: Element) {
  const role = getSemanticRole(element);
  return role && COMPONENT_TYPE_ROLES.has(role) ? role : undefined;
}

function uniqueLimited(values: Array<string | undefined>, limit: number, sort: (values: string[]) => string[]) {
  return sort(Array.from(new Set(values.filter((value): value is string => Boolean(value))))).slice(0, limit);
}

function sortCssLengths(values: string[]) {
  return values.sort((left, right) => {
    const leftNumber = parseCssLength(left);
    const rightNumber = parseCssLength(right);

    if (leftNumber && rightNumber) {
      return leftNumber - rightNumber;
    }

    if (leftNumber) {
      return -1;
    }

    if (rightNumber) {
      return 1;
    }

    return left.localeCompare(right);
  });
}

function sortNumericStrings(values: string[]) {
  return values.sort((left, right) => {
    const leftNumber = Number.parseFloat(left);
    const rightNumber = Number.parseFloat(right);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }

    return left.localeCompare(right);
  });
}

function optionalPseudo<Key extends "before" | "after">(key: Key, value: PseudoElementStyleSnapshot | undefined) {
  return value ? ({ [key]: value } as Record<Key, PseudoElementStyleSnapshot>) : {};
}

function optionalString<Key extends string>(key: Key, value: string | undefined) {
  return value ? ({ [key]: value } as Record<Key, string>) : {};
}

function isElementCatcherOverlay(element: Element) {
  return element instanceof HTMLElement && Boolean(element.dataset.elementCatcherOverlay);
}
