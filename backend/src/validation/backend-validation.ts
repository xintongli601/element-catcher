import { PNG } from "pngjs";
import {
  BACKEND_ERROR_CODES,
  BOX_EDGE_KEYS,
  COMPUTED_STYLE_KEYS,
  COMPONENT_NAME_PATTERN,
  GENERATION_CONTRACT_VERSION,
  GENERATION_LIMITS,
  PAGE_TITLE_POLICY_REASON,
  PNG_DATA_URL_PREFIX,
  PNG_SIGNATURE,
  PSEUDO_STYLE_KEYS,
  REQUESTED_OUTPUT,
  REQUESTED_OUTPUT_FIELDS,
  RESPONSE_JSON_SCHEMA,
  SOURCE_URL_POLICY_REASON,
  TAG_NAME_PATTERN,
  TRANSMITTED_ATTRIBUTE_NAMES,
  assertAllowedObjectKeys,
  assertExactObjectKeys,
  codePointLength,
  getUtf8ByteLength,
  isPlainObject
} from "../../../extension/src/shared/generation-contract.js";
import type { ComponentGenerationRequestV1, ComponentGenerationResponseV1 } from "../contracts/contracts.js";
import { BackendSafeError } from "../contracts/contracts.js";

const RESPONSE_MAX_BYTES = 80_000;

export function validateBackendRequest(value: unknown): ComponentGenerationRequestV1 {
  try {
    assertExactObjectKeys(value, ["contractVersion", "screenshot", "captureContext", "requestedOutput"]);
    const request = value as ComponentGenerationRequestV1;
    if (request.contractVersion !== GENERATION_CONTRACT_VERSION) {
      throw new Error();
    }
    validateScreenshot(request);
    validateRequestedOutput(request.requestedOutput);
    validateCaptureContext(request.captureContext);
    if (getUtf8ByteLength(JSON.stringify(request)) > GENERATION_LIMITS.serializedRequestBytes) {
      throw new BackendSafeError("request_too_large", 413);
    }
    return request;
  } catch (error) {
    if (error instanceof BackendSafeError) {
      throw error;
    }
    throw new BackendSafeError("request_validation_failed", 400);
  }
}

export function validateBackendResponse(value: unknown): ComponentGenerationResponseV1 {
  try {
    assertAllowedObjectKeys(value, ["contractVersion", "componentName", "framework", "styling", "code", "summary", "approximationNotes", "metadata"]);
    const response = value as ComponentGenerationResponseV1;
    if (
      response.contractVersion !== 1 ||
      response.framework !== "react" ||
      response.styling !== "tailwind" ||
      typeof response.componentName !== "string" ||
      !COMPONENT_NAME_PATTERN.test(response.componentName) ||
      codePointLength(response.componentName) > GENERATION_LIMITS.componentNameCodePoints ||
      typeof response.code !== "string" ||
      response.code.trim() === "" ||
      codePointLength(response.code) > GENERATION_LIMITS.codeCodePoints ||
      typeof response.summary !== "string" ||
      response.summary.trim() === "" ||
      codePointLength(response.summary) > GENERATION_LIMITS.summaryCodePoints ||
      typeof response.approximationNotes !== "string" ||
      codePointLength(response.approximationNotes) > GENERATION_LIMITS.approximationNotesCodePoints
    ) {
      throw new Error();
    }
    if (response.metadata !== undefined) {
      assertAllowedObjectKeys(response.metadata, ["providerLabel", "providerModelLabel"]);
      for (const metadataValue of Object.values(response.metadata as Record<string, unknown>)) {
        if (typeof metadataValue !== "string" || codePointLength(metadataValue) > GENERATION_LIMITS.providerMetadataCodePoints) {
          throw new Error();
        }
      }
    }
    return response;
  } catch {
    throw new BackendSafeError("malformed_response", 502);
  }
}

export function validateSafeErrorEnvelope(value: unknown) {
  assertExactObjectKeys(value, ["contractVersion", "error"]);
  const envelope = value as Record<string, unknown>;
  if (envelope.contractVersion !== GENERATION_CONTRACT_VERSION) {
    throw new Error("bad error envelope");
  }
  assertExactObjectKeys(envelope.error, ["code", "message"]);
  const error = envelope.error as Record<string, unknown>;
  if (typeof error.code !== "string" || !BACKEND_ERROR_CODES.includes(error.code as never) || typeof error.message !== "string") {
    throw new Error("bad error envelope");
  }
}

export function getResponseMaxBytes() {
  return RESPONSE_MAX_BYTES;
}

function validateScreenshot(request: ComponentGenerationRequestV1) {
  assertExactObjectKeys(request.screenshot, ["mediaType", "width", "height", "byteLength", "dataUrl"]);
  const { mediaType, width, height, byteLength, dataUrl } = request.screenshot;
  if (
    mediaType !== "image/png" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    !Number.isSafeInteger(byteLength) ||
    width < 1 ||
    height < 1 ||
    width > GENERATION_LIMITS.screenshotMaxDimension ||
    height > GENERATION_LIMITS.screenshotMaxDimension ||
    byteLength < 1 ||
    byteLength > GENERATION_LIMITS.screenshotBytes ||
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith(PNG_DATA_URL_PREFIX)
  ) {
    throw new BackendSafeError("invalid_screenshot", 400);
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), "base64");
  } catch {
    throw new BackendSafeError("invalid_screenshot", 400);
  }
  if (decoded.byteLength !== byteLength || decoded.byteLength > GENERATION_LIMITS.screenshotBytes || !hasPngSignature(decoded)) {
    throw new BackendSafeError("invalid_screenshot", 400);
  }
  try {
    const png = PNG.sync.read(decoded);
    if (png.width !== width || png.height !== height || png.width > GENERATION_LIMITS.screenshotMaxDimension || png.height > GENERATION_LIMITS.screenshotMaxDimension) {
      throw new Error();
    }
  } catch {
    throw new BackendSafeError("invalid_screenshot", 400);
  }
}

function validateRequestedOutput(value: unknown) {
  assertExactObjectKeys(value, ["framework", "styling", "fields"]);
  const output = value as Record<string, unknown>;
  if (
    output.framework !== REQUESTED_OUTPUT.framework ||
    output.styling !== REQUESTED_OUTPUT.styling ||
    !Array.isArray(output.fields) ||
    output.fields.length !== REQUESTED_OUTPUT_FIELDS.length ||
    output.fields.some((field, index) => field !== REQUESTED_OUTPUT_FIELDS[index])
  ) {
    throw new Error();
  }
}

function validateCaptureContext(value: unknown) {
  assertExactObjectKeys(value, ["library", "element", "dom", "styles", "summaries", "pageTitlePolicy", "sourceUrlPolicy"]);
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
  assertAllowedObjectKeys(value, ["title", "componentType", "tags"]);
  const library = value as Record<string, unknown>;
  validateOptionalString(library.title, GENERATION_LIMITS.titleCodePoints);
  validateOptionalString(library.componentType, GENERATION_LIMITS.componentTypeCodePoints);
  validateStringArray(library.tags, GENERATION_LIMITS.tagsCount, GENERATION_LIMITS.tagCodePoints);
}

function validateElement(value: unknown) {
  assertAllowedObjectKeys(value, ["tagName", "semanticRole", "rect"]);
  const element = value as Record<string, unknown>;
  validateTag(element.tagName);
  validateOptionalString(element.semanticRole, GENERATION_LIMITS.semanticRoleCodePoints);
  assertExactObjectKeys(element.rect, ["width", "height"]);
  const rect = element.rect as Record<string, unknown>;
  validatePositiveNumber(rect.width);
  validatePositiveNumber(rect.height);
}

function validateDom(value: unknown) {
  assertExactObjectKeys(value, ["sanitizedSnapshot", "childSummary"]);
  const dom = value as Record<string, unknown>;
  let nodeCount = 0;
  validateDomNode(dom.sanitizedSnapshot, 1, () => {
    nodeCount += 1;
    if (nodeCount > GENERATION_LIMITS.domNodeCount) {
      throw new Error();
    }
  });
  if (!Array.isArray(dom.childSummary) || dom.childSummary.length > GENERATION_LIMITS.childSummaryCount) {
    throw new Error();
  }
  for (const child of dom.childSummary) {
    assertAllowedObjectKeys(child, ["tagName", "semanticRole", "textPreview", "childCount"]);
    const summary = child as Record<string, unknown>;
    validateTag(summary.tagName);
    validateOptionalString(summary.semanticRole, GENERATION_LIMITS.semanticRoleCodePoints);
    validateOptionalString(summary.textPreview, GENERATION_LIMITS.textPreviewCodePoints);
    if (!Number.isSafeInteger(summary.childCount) || (summary.childCount as number) < 0 || (summary.childCount as number) > GENERATION_LIMITS.childSummaryChildCount) {
      throw new Error();
    }
  }
}

function validateDomNode(value: unknown, depth: number, increment: () => void) {
  if (depth > GENERATION_LIMITS.domDepth) {
    throw new Error();
  }
  increment();
  assertExactObjectKeys(value, ["tagName", "attributes", "children"].concat(isPlainObject(value) && "textPreview" in value ? ["textPreview"] : []));
  const node = value as Record<string, unknown>;
  validateTag(node.tagName);
  validateOptionalString(node.textPreview, GENERATION_LIMITS.textPreviewCodePoints);
  assertAllowedObjectKeys(node.attributes, TRANSMITTED_ATTRIBUTE_NAMES);
  if (Object.keys(node.attributes as Record<string, unknown>).length > GENERATION_LIMITS.domAttributesPerNode) {
    throw new Error();
  }
  for (const attrValue of Object.values(node.attributes as Record<string, unknown>)) {
    validateOptionalString(attrValue, GENERATION_LIMITS.attributeValueCodePoints);
  }
  if (!Array.isArray(node.children) || node.children.length > GENERATION_LIMITS.domChildrenPerNode) {
    throw new Error();
  }
  for (const child of node.children) {
    validateDomNode(child, depth + 1, increment);
  }
}

function validateStyles(value: unknown) {
  assertAllowedObjectKeys(value, ["computed", "before", "after"]);
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
    throw new Error();
  }
  const allowedKeys = pseudo ? ["exists", ...PSEUDO_STYLE_KEYS] : [...COMPUTED_STYLE_KEYS, "padding", "margin"];
  assertAllowedObjectKeys(value, allowedKeys);
  if (pseudo && !("exists" in value)) {
    throw new Error();
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "exists" && pseudo) {
      if (typeof child !== "boolean") {
        throw new Error();
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
  assertExactObjectKeys(value, ["typography", "colors", "layout", "spacing"].concat(isPlainObject(value) && "componentType" in value ? ["componentType"] : []));
  const summaries = value as Record<string, unknown>;
  validateOptionalString(summaries.componentType, GENERATION_LIMITS.componentTypeCodePoints);
  validateTypography(summaries.typography);
  validateColors(summaries.colors);
  validateLayout(summaries.layout);
  validateSpacing(summaries.spacing);
}

function validateTypography(value: unknown) {
  assertAllowedObjectKeys(value, ["primaryFont", "scale", "weights", "notes"]);
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
  assertAllowedObjectKeys(value, ["foreground", "background", "accent", "border", "roles"]);
  const colors = value as Record<string, unknown>;
  for (const key of ["foreground", "background", "accent", "border"]) {
    validateOptionalString(colors[key], GENERATION_LIMITS.colorValueCodePoints);
  }
  if (colors.roles !== undefined) {
    if (!Array.isArray(colors.roles) || colors.roles.length > GENERATION_LIMITS.colorRolesCount) {
      throw new Error();
    }
    for (const role of colors.roles) {
      assertExactObjectKeys(role, ["role", "value"]);
      validateRequiredString((role as Record<string, unknown>).role, GENERATION_LIMITS.colorRoleNameCodePoints);
      validateRequiredString((role as Record<string, unknown>).value, GENERATION_LIMITS.colorValueCodePoints);
    }
  }
}

function validateLayout(value: unknown) {
  assertAllowedObjectKeys(value, ["display", "direction", "alignment", "density", "notes"]);
  const layout = value as Record<string, unknown>;
  validateOptionalString(layout.display, GENERATION_LIMITS.layoutValueCodePoints);
  validateOptionalString(layout.direction, GENERATION_LIMITS.layoutValueCodePoints);
  validateOptionalString(layout.alignment, GENERATION_LIMITS.layoutValueCodePoints);
  if (layout.density !== undefined && !["compact", "comfortable", "spacious"].includes(String(layout.density))) {
    throw new Error();
  }
  validateOptionalString(layout.notes, GENERATION_LIMITS.summaryNotesCodePoints);
}

function validateSpacing(value: unknown) {
  assertAllowedObjectKeys(value, ["padding", "margin", "gap", "notes"]);
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
  assertExactObjectKeys(value, ["included", "reason"]);
  const policy = value as Record<string, unknown>;
  if (policy.included !== false || policy.reason !== reason) {
    throw new Error();
  }
}

function validateBoxEdges(value: unknown) {
  assertAllowedObjectKeys(value, BOX_EDGE_KEYS);
  for (const child of Object.values(value as Record<string, unknown>)) {
    validateOptionalString(child, GENERATION_LIMITS.boxEdgeCodePoints);
  }
}

function validateTag(value: unknown) {
  validateRequiredString(value, GENERATION_LIMITS.tagNameCodePoints);
  if (!TAG_NAME_PATTERN.test(value as string)) {
    throw new Error();
  }
}

function validatePositiveNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > GENERATION_LIMITS.rectMaxCssPixels) {
    throw new Error();
  }
}

function validateStringArray(value: unknown, countLimit: number, lengthLimit: number) {
  if (!Array.isArray(value) || value.length > countLimit) {
    throw new Error();
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
    throw new Error();
  }
}

function validateRequiredString(value: unknown, limit: number) {
  if (typeof value !== "string" || value.trim() === "" || codePointLength(value) > limit) {
    throw new Error();
  }
}

function hasPngSignature(bytes: Uint8Array) {
  if (bytes.length < PNG_SIGNATURE.length) {
    return false;
  }
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export { RESPONSE_JSON_SCHEMA };
