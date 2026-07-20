import type { CaptureRecord, JsonObject } from "../shared/capture-schema";
import {
  BOX_EDGE_KEYS,
  COMPUTED_STYLE_KEYS,
  GENERATION_CONTRACT_VERSION,
  GENERATION_LIMITS,
  PAGE_TITLE_POLICY_REASON,
  PSEUDO_STYLE_KEYS,
  SOURCE_TO_TRANSMITTED_ATTRIBUTES,
  SOURCE_URL_POLICY_REASON,
  TAG_NAME_PATTERN
} from "./limits";
import type {
  ComponentGenerationRequestWithoutDataUrlV1,
  ExactCaptureContextProjectionV1,
  TransmittedBoxEdgesV1,
  TransmittedChildSummaryV1,
  TransmittedColorSummaryV1,
  TransmittedComputedStylesV1,
  TransmittedDomNodeV1,
  TransmittedLayoutSummaryV1,
  TransmittedPseudoStylesV1,
  TransmittedSpacingSummaryV1,
  TransmittedTypographySummaryV1
} from "./types";
import { GenerationError } from "./errors";
import { optionalString, requiredString } from "./string-validation";

export function buildGenerationRequestWithoutDataUrl({
  record,
  screenshot
}: {
  record: CaptureRecord;
  screenshot: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
  };
}): ComponentGenerationRequestWithoutDataUrlV1 {
  const request: ComponentGenerationRequestWithoutDataUrlV1 = {
    contractVersion: GENERATION_CONTRACT_VERSION,
    screenshot: {
      mediaType: screenshot.mediaType,
      width: screenshot.width,
      height: screenshot.height,
      byteLength: screenshot.byteLength
    },
    captureContext: buildExactCaptureContextProjection(record),
    requestedOutput: {
      framework: "react",
      styling: "tailwind",
      fields: ["componentName", "code", "summary", "approximationNotes"]
    }
  };

  return request;
}

export function buildExactCaptureContextProjection(record: CaptureRecord): ExactCaptureContextProjectionV1 {
  return {
    library: buildLibraryProjection(record),
    element: {
      tagName: validateTagName(record.element.tagName),
      ...(optionalString(record.element.semanticRole, GENERATION_LIMITS.semanticRoleCodePoints)
        ? { semanticRole: optionalString(record.element.semanticRole, GENERATION_LIMITS.semanticRoleCodePoints) }
        : {}),
      rect: {
        width: validateFinitePositiveNumber(record.element.rect.width),
        height: validateFinitePositiveNumber(record.element.rect.height)
      }
    },
    dom: {
      sanitizedSnapshot: projectDomNode(record.dom.sanitizedSnapshot, 1, { count: 0 }),
      childSummary: projectChildSummaries(record.dom.childSummary)
    },
    styles: {
      computed: projectComputedStyles(record.styles.computed),
      ...(record.styles.before ? { before: projectPseudoStyles(record.styles.before) } : {}),
      ...(record.styles.after ? { after: projectPseudoStyles(record.styles.after) } : {})
    },
    summaries: {
      ...(optionalString(record.summaries.componentType, GENERATION_LIMITS.componentTypeCodePoints)
        ? { componentType: optionalString(record.summaries.componentType, GENERATION_LIMITS.componentTypeCodePoints) }
        : {}),
      typography: projectTypography(record.summaries.typography),
      colors: projectColors(record.summaries.colors),
      layout: projectLayout(record.summaries.layout),
      spacing: projectSpacing(record.summaries.spacing)
    },
    pageTitlePolicy: {
      included: false,
      reason: PAGE_TITLE_POLICY_REASON
    },
    sourceUrlPolicy: {
      included: false,
      reason: SOURCE_URL_POLICY_REASON
    }
  };
}

function buildLibraryProjection(record: CaptureRecord) {
  const title = optionalString(record.library.title, GENERATION_LIMITS.titleCodePoints);
  const componentType = optionalString(record.library.componentType, GENERATION_LIMITS.componentTypeCodePoints);
  const tags = record.library.tags.map((tag) => requiredString(tag, GENERATION_LIMITS.tagCodePoints));

  if (tags.length > GENERATION_LIMITS.tagsCount) {
    throw new GenerationError("request_validation_failed");
  }

  return {
    ...(title ? { title } : {}),
    ...(componentType ? { componentType } : {}),
    tags
  };
}

function projectDomNode(
  node: CaptureRecord["dom"]["sanitizedSnapshot"],
  depth: number,
  counter: { count: number }
): TransmittedDomNodeV1 {
  counter.count += 1;
  if (counter.count > GENERATION_LIMITS.domNodeCount || depth > GENERATION_LIMITS.domDepth) {
    throw new GenerationError("request_validation_failed");
  }

  if (node.children.length > GENERATION_LIMITS.domChildrenPerNode) {
    throw new GenerationError("request_validation_failed");
  }

  return {
    tagName: validateTagName(node.tagName),
    attributes: projectAttributes(node.attributes),
    ...(optionalString(node.textPreview, GENERATION_LIMITS.textPreviewCodePoints)
      ? { textPreview: optionalString(node.textPreview, GENERATION_LIMITS.textPreviewCodePoints) }
      : {}),
    children: node.children.map((child) => projectDomNode(child, depth + 1, counter))
  };
}

function projectAttributes(attributes: Record<string, string>) {
  const projected: TransmittedDomNodeV1["attributes"] = {};

  for (const [sourceName, value] of Object.entries(attributes)) {
    const targetName = SOURCE_TO_TRANSMITTED_ATTRIBUTES[sourceName];
    if (!targetName) {
      continue;
    }

    const normalized = optionalString(value, GENERATION_LIMITS.attributeValueCodePoints);
    if (normalized) {
      projected[targetName] = normalized;
    }
  }

  if (Object.keys(projected).length > GENERATION_LIMITS.domAttributesPerNode) {
    throw new GenerationError("request_validation_failed");
  }

  return projected;
}

function projectChildSummaries(summaries: CaptureRecord["dom"]["childSummary"]): TransmittedChildSummaryV1[] {
  if (summaries.length > GENERATION_LIMITS.childSummaryCount) {
    throw new GenerationError("request_validation_failed");
  }

  return summaries.map((child) => {
    if (!Number.isSafeInteger(child.childCount) || child.childCount < 0 || child.childCount > GENERATION_LIMITS.childSummaryChildCount) {
      throw new GenerationError("request_validation_failed");
    }

    const semanticRole = optionalString(child.semanticRole, GENERATION_LIMITS.semanticRoleCodePoints);
    const textPreview = optionalString(child.textPreview, GENERATION_LIMITS.textPreviewCodePoints);
    return {
      tagName: validateTagName(child.tagName),
      ...(semanticRole ? { semanticRole } : {}),
      ...(textPreview ? { textPreview } : {}),
      childCount: child.childCount
    };
  });
}

function projectComputedStyles(styles: CaptureRecord["styles"]["computed"]): TransmittedComputedStylesV1 {
  const projected: TransmittedComputedStylesV1 = {};
  for (const key of COMPUTED_STYLE_KEYS) {
    const value = optionalString(styles[key], GENERATION_LIMITS.computedStyleCodePoints);
    if (value) {
      projected[key] = value;
    }
  }

  const padding = projectBoxEdges(styles.padding);
  const margin = projectBoxEdges(styles.margin);
  if (padding) {
    projected.padding = padding;
  }
  if (margin) {
    projected.margin = margin;
  }
  return projected;
}

function projectPseudoStyles(styles: CaptureRecord["styles"]["before"]): TransmittedPseudoStylesV1 {
  if (!styles) {
    throw new GenerationError("request_validation_failed");
  }
  const projected: TransmittedPseudoStylesV1 = {
    exists: Boolean(styles.exists)
  };

  for (const key of PSEUDO_STYLE_KEYS) {
    const limit = key === "content" ? GENERATION_LIMITS.pseudoContentCodePoints : GENERATION_LIMITS.pseudoStyleCodePoints;
    const value = optionalString(styles[key], limit);
    if (value) {
      projected[key] = value;
    }
  }
  return projected;
}

function projectBoxEdges(value: unknown): TransmittedBoxEdgesV1 | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const projected: TransmittedBoxEdgesV1 = {};
  for (const key of BOX_EDGE_KEYS) {
    const edge = optionalString(source[key], GENERATION_LIMITS.boxEdgeCodePoints);
    if (edge) {
      projected[key] = edge;
    }
  }

  return Object.keys(projected).length ? projected : undefined;
}

function projectTypography(value: CaptureRecord["summaries"]["typography"]): TransmittedTypographySummaryV1 {
  const primaryFont = optionalString(value.primaryFont, GENERATION_LIMITS.typographyPrimaryFontCodePoints);
  const notes = optionalString(value.notes, GENERATION_LIMITS.summaryNotesCodePoints);
  return {
    ...(primaryFont ? { primaryFont } : {}),
    ...(value.scale ? { scale: projectStringArray(value.scale, GENERATION_LIMITS.typographyScaleCount, GENERATION_LIMITS.typographyScaleCodePoints) } : {}),
    ...(value.weights
      ? { weights: projectStringArray(value.weights, GENERATION_LIMITS.typographyWeightsCount, GENERATION_LIMITS.typographyWeightCodePoints) }
      : {}),
    ...(notes ? { notes } : {})
  };
}

function projectColors(value: CaptureRecord["summaries"]["colors"]): TransmittedColorSummaryV1 {
  const roles = value.roles?.map((role) => ({
    role: requiredString(role.role, GENERATION_LIMITS.colorRoleNameCodePoints),
    value: requiredString(role.value, GENERATION_LIMITS.colorValueCodePoints)
  }));
  if (roles && roles.length > GENERATION_LIMITS.colorRolesCount) {
    throw new GenerationError("request_validation_failed");
  }

  return {
    ...optionalKey("foreground", value.foreground, GENERATION_LIMITS.colorValueCodePoints),
    ...optionalKey("background", value.background, GENERATION_LIMITS.colorValueCodePoints),
    ...optionalKey("accent", value.accent, GENERATION_LIMITS.colorValueCodePoints),
    ...optionalKey("border", value.border, GENERATION_LIMITS.colorValueCodePoints),
    ...(roles?.length ? { roles } : {})
  };
}

function projectLayout(value: CaptureRecord["summaries"]["layout"]): TransmittedLayoutSummaryV1 {
  return {
    ...optionalKey("display", value.display, GENERATION_LIMITS.layoutValueCodePoints),
    ...optionalKey("direction", value.direction, GENERATION_LIMITS.layoutValueCodePoints),
    ...optionalKey("alignment", value.alignment, GENERATION_LIMITS.layoutValueCodePoints),
    ...(value.density ? { density: value.density } : {}),
    ...optionalKey("notes", value.notes, GENERATION_LIMITS.summaryNotesCodePoints)
  };
}

function projectSpacing(value: CaptureRecord["summaries"]["spacing"]): TransmittedSpacingSummaryV1 {
  return {
    ...(projectBoxEdges(value.padding) ? { padding: projectBoxEdges(value.padding) } : {}),
    ...(projectBoxEdges(value.margin) ? { margin: projectBoxEdges(value.margin) } : {}),
    ...optionalKey("gap", value.gap, GENERATION_LIMITS.spacingGapCodePoints),
    ...optionalKey("notes", value.notes, GENERATION_LIMITS.summaryNotesCodePoints)
  };
}

function projectStringArray(values: string[], countLimit: number, lengthLimit: number) {
  if (values.length > countLimit) {
    throw new GenerationError("request_validation_failed");
  }

  return values.map((value) => requiredString(value, lengthLimit));
}

function optionalKey<TKey extends string>(key: TKey, value: unknown, limit: number) {
  const normalized = optionalString(value, limit);
  return normalized ? ({ [key]: normalized } as Record<TKey, string>) : {};
}

function validateTagName(value: unknown) {
  const tagName = requiredString(value, GENERATION_LIMITS.tagNameCodePoints);
  if (!TAG_NAME_PATTERN.test(tagName)) {
    throw new GenerationError("request_validation_failed");
  }
  return tagName;
}

function validateFinitePositiveNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > GENERATION_LIMITS.rectMaxCssPixels) {
    throw new GenerationError("request_validation_failed");
  }
  return value;
}

export function cloneJsonObject<T extends JsonObject>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
