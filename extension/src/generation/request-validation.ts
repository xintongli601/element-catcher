import { GenerationError } from "./errors";
import {
  BOX_EDGE_KEYS,
  COMPUTED_STYLE_KEYS,
  COMPONENT_NAME_PATTERN,
  GENERATION_CONTRACT_VERSION,
  GENERATION_LIMITS,
  PAGE_TITLE_POLICY_REASON,
  PNG_DATA_URL_PREFIX,
  PSEUDO_STYLE_KEYS,
  SOURCE_URL_POLICY_REASON,
  TAG_NAME_PATTERN,
  TRANSMITTED_ATTRIBUTE_NAMES
} from "./limits";
import type {
  ComponentGenerationRequestV1,
  ComponentGenerationRequestWithoutDataUrlV1,
  ComponentGenerationResponseV1
} from "./types";
import { getUtf8ByteLength } from "./canonical-json";
import { assertAllowedKeys, assertExactKeys, codePointLength, isPlainObject } from "./string-validation";
import { validatePngDataUrl } from "./screenshot";

export function validateRequestWithoutDataUrl(value: unknown): asserts value is ComponentGenerationRequestWithoutDataUrlV1 {
  validateRequestShape(value, false);
}

export async function validateFullRequest(value: unknown): Promise<ComponentGenerationRequestV1> {
  validateRequestShape(value, true);
  const request = value as ComponentGenerationRequestV1;
  await validatePngDataUrl(request.screenshot.dataUrl, request.screenshot);
  assertSerializedRequestSize(request);
  return request;
}

export async function createFullRequest(
  request: ComponentGenerationRequestWithoutDataUrlV1,
  dataUrl: string
): Promise<ComponentGenerationRequestV1> {
  const fullRequest = {
    ...request,
    screenshot: {
      ...request.screenshot,
      dataUrl
    }
  };
  return validateFullRequest(fullRequest);
}

export function assertSerializedRequestSize(request: ComponentGenerationRequestV1) {
  if (getUtf8ByteLength(JSON.stringify(request)) > GENERATION_LIMITS.serializedRequestBytes) {
    throw new GenerationError("request_too_large");
  }
}

export function validateGenerationResponse(value: unknown): asserts value is ComponentGenerationResponseV1 {
  assertAllowedKeys(value, [
    "contractVersion",
    "componentName",
    "framework",
    "styling",
    "code",
    "summary",
    "approximationNotes",
    "metadata"
  ], "malformed_response");

  const response = value as Record<string, unknown>;
  if (
    response.contractVersion !== GENERATION_CONTRACT_VERSION ||
    response.framework !== "react" ||
    response.styling !== "tailwind" ||
    typeof response.componentName !== "string" ||
    !COMPONENT_NAME_PATTERN.test(response.componentName) ||
    codePointLength(response.componentName) > GENERATION_LIMITS.componentNameCodePoints ||
    typeof response.code !== "string" ||
    response.code.trim().length === 0 ||
    codePointLength(response.code) > GENERATION_LIMITS.codeCodePoints ||
    typeof response.summary !== "string" ||
    response.summary.trim().length === 0 ||
    codePointLength(response.summary) > GENERATION_LIMITS.summaryCodePoints ||
    typeof response.approximationNotes !== "string" ||
    codePointLength(response.approximationNotes) > GENERATION_LIMITS.approximationNotesCodePoints
  ) {
    throw new GenerationError("malformed_response");
  }

  if (response.metadata !== undefined) {
    assertAllowedKeys(response.metadata, ["providerLabel", "providerModelLabel"], "malformed_response");
    for (const value of Object.values(response.metadata as Record<string, unknown>)) {
      if (typeof value !== "string" || codePointLength(value) > GENERATION_LIMITS.providerMetadataCodePoints) {
        throw new GenerationError("malformed_response");
      }
    }
  }
}

function validateRequestShape(value: unknown, requireDataUrl: boolean) {
  assertExactKeys(value, ["contractVersion", "screenshot", "captureContext", "requestedOutput"]);
  const request = value as Record<string, unknown>;
  if (request.contractVersion !== GENERATION_CONTRACT_VERSION) {
    throw new GenerationError("request_validation_failed");
  }

  validateScreenshotMetadata(request.screenshot, requireDataUrl);
  validateCaptureContext(request.captureContext);
  assertExactKeys(request.requestedOutput, ["framework", "styling", "fields"]);
  const output = request.requestedOutput as Record<string, unknown>;
  if (
    output.framework !== "react" ||
    output.styling !== "tailwind" ||
    !Array.isArray(output.fields) ||
    output.fields.length !== 4 ||
    output.fields[0] !== "componentName" ||
    output.fields[1] !== "code" ||
    output.fields[2] !== "summary" ||
    output.fields[3] !== "approximationNotes"
  ) {
    throw new GenerationError("request_validation_failed");
  }
}

function validateScreenshotMetadata(value: unknown, requireDataUrl: boolean) {
  assertExactKeys(value, requireDataUrl ? ["mediaType", "width", "height", "byteLength", "dataUrl"] : ["mediaType", "width", "height", "byteLength"]);
  const screenshot = value as Record<string, unknown>;
  if (
    screenshot.mediaType !== "image/png" ||
    !Number.isSafeInteger(screenshot.width) ||
    !Number.isSafeInteger(screenshot.height) ||
    !Number.isSafeInteger(screenshot.byteLength) ||
    (screenshot.width as number) < 1 ||
    (screenshot.height as number) < 1 ||
    (screenshot.byteLength as number) < 1 ||
    (screenshot.width as number) > GENERATION_LIMITS.screenshotMaxDimension ||
    (screenshot.height as number) > GENERATION_LIMITS.screenshotMaxDimension ||
    (screenshot.byteLength as number) > GENERATION_LIMITS.screenshotBytes
  ) {
    throw new GenerationError("request_validation_failed");
  }

  if (requireDataUrl && (typeof screenshot.dataUrl !== "string" || !screenshot.dataUrl.startsWith(PNG_DATA_URL_PREFIX))) {
    throw new GenerationError("request_validation_failed");
  }
}

function validateCaptureContext(value: unknown) {
  assertExactKeys(value, ["library", "element", "dom", "styles", "summaries", "pageTitlePolicy", "sourceUrlPolicy"]);
  const context = value as Record<string, unknown>;
  validateLibrary(context.library);
  validateElement(context.element);
  validateDom(context.dom);
  validateStyles(context.styles);
  validateSummaries(context.summaries);
  validatePolicy(context.pageTitlePolicy, PAGE_TITLE_POLICY_REASON);
  validatePolicy(context.sourceUrlPolicy, SOURCE_URL_POLICY_REASON);
}

function validateLibrary(value: unknown) {
  assertAllowedKeys(value, ["title", "componentType", "tags"]);
  const library = value as Record<string, unknown>;
  validateOptionalString(library.title, GENERATION_LIMITS.titleCodePoints);
  validateOptionalString(library.componentType, GENERATION_LIMITS.componentTypeCodePoints);
  validateStringArray(library.tags, GENERATION_LIMITS.tagsCount, GENERATION_LIMITS.tagCodePoints);
}

function validateElement(value: unknown) {
  assertAllowedKeys(value, ["tagName", "semanticRole", "rect"]);
  const element = value as Record<string, unknown>;
  validateTag(element.tagName);
  validateOptionalString(element.semanticRole, GENERATION_LIMITS.semanticRoleCodePoints);
  assertExactKeys(element.rect, ["width", "height"]);
  const rect = element.rect as Record<string, unknown>;
  validatePositiveNumber(rect.width);
  validatePositiveNumber(rect.height);
}

function validateDom(value: unknown) {
  assertExactKeys(value, ["sanitizedSnapshot", "childSummary"]);
  const dom = value as Record<string, unknown>;
  let count = 0;
  validateDomNode(dom.sanitizedSnapshot, 1, () => {
    count += 1;
    if (count > GENERATION_LIMITS.domNodeCount) {
      throw new GenerationError("request_validation_failed");
    }
  });
  if (!Array.isArray(dom.childSummary) || dom.childSummary.length > GENERATION_LIMITS.childSummaryCount) {
    throw new GenerationError("request_validation_failed");
  }
  for (const child of dom.childSummary) {
    assertAllowedKeys(child, ["tagName", "semanticRole", "textPreview", "childCount"]);
    const summary = child as Record<string, unknown>;
    validateTag(summary.tagName);
    validateOptionalString(summary.semanticRole, GENERATION_LIMITS.semanticRoleCodePoints);
    validateOptionalString(summary.textPreview, GENERATION_LIMITS.textPreviewCodePoints);
    if (!Number.isSafeInteger(summary.childCount) || (summary.childCount as number) < 0 || (summary.childCount as number) > GENERATION_LIMITS.childSummaryChildCount) {
      throw new GenerationError("request_validation_failed");
    }
  }
}

function validateDomNode(value: unknown, depth: number, increment: () => void) {
  if (depth > GENERATION_LIMITS.domDepth) {
    throw new GenerationError("request_validation_failed");
  }
  increment();
  assertExactKeys(value, ["tagName", "attributes", "children"].concat(isPlainObject(value) && "textPreview" in value ? ["textPreview"] : []));
  const node = value as Record<string, unknown>;
  validateTag(node.tagName);
  validateOptionalString(node.textPreview, GENERATION_LIMITS.textPreviewCodePoints);
  assertAllowedKeys(node.attributes, TRANSMITTED_ATTRIBUTE_NAMES);
  if (Object.keys(node.attributes as Record<string, unknown>).length > GENERATION_LIMITS.domAttributesPerNode) {
    throw new GenerationError("request_validation_failed");
  }
  for (const attrValue of Object.values(node.attributes as Record<string, unknown>)) {
    validateOptionalString(attrValue, GENERATION_LIMITS.attributeValueCodePoints);
  }
  if (!Array.isArray(node.children) || node.children.length > GENERATION_LIMITS.domChildrenPerNode) {
    throw new GenerationError("request_validation_failed");
  }
  for (const child of node.children) {
    validateDomNode(child, depth + 1, increment);
  }
}

function validateStyles(value: unknown) {
  assertAllowedKeys(value, ["computed", "before", "after"]);
  const styles = value as Record<string, unknown>;
  validateStyleObject(styles.computed, GENERATION_LIMITS.computedStyleCodePoints, false);
  if (styles.before !== undefined) {
    validateStyleObject(styles.before, GENERATION_LIMITS.pseudoStyleCodePoints, true);
  }
  if (styles.after !== undefined) {
    validateStyleObject(styles.after, GENERATION_LIMITS.pseudoStyleCodePoints, true);
  }
}

function validateStyleObject(value: unknown, stringLimit: number, pseudo: boolean) {
  if (!isPlainObject(value)) {
    throw new GenerationError("request_validation_failed");
  }
  const allowedKeys = pseudo ? ["exists", ...PSEUDO_STYLE_KEYS] : [...COMPUTED_STYLE_KEYS, "padding", "margin"];
  assertAllowedKeys(value, allowedKeys);
  if (pseudo && !("exists" in value)) {
    throw new GenerationError("request_validation_failed");
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "exists" && pseudo) {
      if (typeof child !== "boolean") {
        throw new GenerationError("request_validation_failed");
      }
    } else if (key === "padding" || key === "margin") {
      validateBoxEdges(child);
    } else if (key === "content" && pseudo) {
      validateOptionalString(child, GENERATION_LIMITS.pseudoContentCodePoints);
    } else {
      validateOptionalString(child, stringLimit);
    }
  }
}

function validateSummaries(value: unknown) {
  assertExactKeys(value, ["typography", "colors", "layout", "spacing"].concat(isPlainObject(value) && "componentType" in value ? ["componentType"] : []));
  const summaries = value as Record<string, unknown>;
  validateOptionalString(summaries.componentType, GENERATION_LIMITS.componentTypeCodePoints);
  validateTypography(summaries.typography);
  validateColors(summaries.colors);
  validateLayout(summaries.layout);
  validateSpacing(summaries.spacing);
}

function validateTypography(value: unknown) {
  assertAllowedKeys(value, ["primaryFont", "scale", "weights", "notes"]);
  const typography = value as Record<string, unknown>;
  validateOptionalString(typography.primaryFont, GENERATION_LIMITS.typographyPrimaryFontCodePoints);
  if (typography.scale !== undefined) {
    validateStringArray(typography.scale, GENERATION_LIMITS.typographyScaleCount, GENERATION_LIMITS.typographyScaleCodePoints);
  }
  if (typography.weights !== undefined) {
    validateStringArray(typography.weights, GENERATION_LIMITS.typographyWeightsCount, GENERATION_LIMITS.typographyWeightCodePoints);
  }
  validateOptionalString(typography.notes, GENERATION_LIMITS.summaryNotesCodePoints);
}

function validateColors(value: unknown) {
  assertAllowedKeys(value, ["foreground", "background", "accent", "border", "roles"]);
  const colors = value as Record<string, unknown>;
  for (const key of ["foreground", "background", "accent", "border"]) {
    validateOptionalString(colors[key], GENERATION_LIMITS.colorValueCodePoints);
  }
  if (colors.roles !== undefined) {
    if (!Array.isArray(colors.roles) || colors.roles.length > GENERATION_LIMITS.colorRolesCount) {
      throw new GenerationError("request_validation_failed");
    }
    for (const role of colors.roles) {
      assertExactKeys(role, ["role", "value"]);
      validateRequiredString((role as Record<string, unknown>).role, GENERATION_LIMITS.colorRoleNameCodePoints);
      validateRequiredString((role as Record<string, unknown>).value, GENERATION_LIMITS.colorValueCodePoints);
    }
  }
}

function validateLayout(value: unknown) {
  assertAllowedKeys(value, ["display", "direction", "alignment", "density", "notes"]);
  const layout = value as Record<string, unknown>;
  validateOptionalString(layout.display, GENERATION_LIMITS.layoutValueCodePoints);
  validateOptionalString(layout.direction, GENERATION_LIMITS.layoutValueCodePoints);
  validateOptionalString(layout.alignment, GENERATION_LIMITS.layoutValueCodePoints);
  if (layout.density !== undefined && !["compact", "comfortable", "spacious"].includes(String(layout.density))) {
    throw new GenerationError("request_validation_failed");
  }
  validateOptionalString(layout.notes, GENERATION_LIMITS.summaryNotesCodePoints);
}

function validateSpacing(value: unknown) {
  assertAllowedKeys(value, ["padding", "margin", "gap", "notes"]);
  const spacing = value as Record<string, unknown>;
  if (spacing.padding !== undefined) {
    validateBoxEdges(spacing.padding);
  }
  if (spacing.margin !== undefined) {
    validateBoxEdges(spacing.margin);
  }
  validateOptionalString(spacing.gap, GENERATION_LIMITS.spacingGapCodePoints);
  validateOptionalString(spacing.notes, GENERATION_LIMITS.summaryNotesCodePoints);
}

function validatePolicy(value: unknown, reason: string) {
  assertExactKeys(value, ["included", "reason"]);
  const policy = value as Record<string, unknown>;
  if (policy.included !== false || policy.reason !== reason) {
    throw new GenerationError("request_validation_failed");
  }
}

function validateBoxEdges(value: unknown) {
  assertAllowedKeys(value, BOX_EDGE_KEYS);
  for (const child of Object.values(value as Record<string, unknown>)) {
    validateOptionalString(child, GENERATION_LIMITS.boxEdgeCodePoints);
  }
}

function validateTag(value: unknown) {
  validateRequiredString(value, GENERATION_LIMITS.tagNameCodePoints);
  if (!TAG_NAME_PATTERN.test(value as string)) {
    throw new GenerationError("request_validation_failed");
  }
}

function validatePositiveNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > GENERATION_LIMITS.rectMaxCssPixels) {
    throw new GenerationError("request_validation_failed");
  }
}

function validateStringArray(value: unknown, countLimit: number, lengthLimit: number) {
  if (!Array.isArray(value) || value.length > countLimit) {
    throw new GenerationError("request_validation_failed");
  }
  for (const child of value) {
    validateRequiredString(child, lengthLimit);
  }
}

function validateOptionalString(value: unknown, limit: number) {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "" || codePointLength(value) > limit) {
    throw new GenerationError("request_validation_failed");
  }
}

function validateRequiredString(value: unknown, limit: number) {
  if (typeof value !== "string" || value.trim() === "" || codePointLength(value) > limit) {
    throw new GenerationError("request_validation_failed");
  }
}
