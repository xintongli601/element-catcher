import type {
  CaptureRecord,
  CaptureSchemaVersion,
  ChildElementSummary,
  JsonObject,
  JsonValue,
  SanitizedDomNode,
  ScreenshotCaptureResult,
  SerializableRect,
  StructuredCaptureExtraction
} from "../shared/capture-schema";
import { assertJsonCompatible } from "../shared/json";
import { createScreenshotStorageKey } from "../storage/indexed-db";
import { PersistenceError } from "../storage/persistence-errors";

const CAPTURE_SCHEMA_VERSION = 1 satisfies CaptureSchemaVersion;
const CAPTURE_ID_PATTERN =
  /^capture-[0-9a-f]{32}$|^capture-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORBIDDEN_PAYLOAD_KEYS = new Set(["dataUrl", "blob", "arrayBuffer"]);
const SCREENSHOT_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const STYLE_STRING_KEYS = new Set([
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
]);

export function createCaptureRecordId() {
  const randomId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackRandomId();
  return `capture-${randomId}`;
}

export function createCaptureRecordTimestamp() {
  return new Date().toISOString();
}

function fallbackRandomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function assembleCaptureRecordV1({
  extraction,
  screenshotCapture,
  id,
  createdAt
}: {
  extraction: StructuredCaptureExtraction;
  screenshotCapture: ScreenshotCaptureResult;
  id: string;
  createdAt: string;
}) {
  const storageKey = createScreenshotStorageKey(id);
  const record: CaptureRecord = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id,
    createdAt,
    source: {
      url: extraction.source.url,
      pageTitle: extraction.source.pageTitle,
      ...(extraction.source.faviconUrl ? { faviconUrl: extraction.source.faviconUrl } : {})
    },
    environment: {
      viewport: {
        width: extraction.environment.viewport.width,
        height: extraction.environment.viewport.height
      },
      devicePixelRatio: extraction.environment.devicePixelRatio
    },
    element: {
      tagName: extraction.element.tagName,
      rect: copyRect(extraction.element.rect),
      ...(extraction.element.semanticRole ? { semanticRole: extraction.element.semanticRole } : {}),
      ...(extraction.element.textPreview ? { textPreview: extraction.element.textPreview } : {}),
      ...(extraction.element.id ? { id: extraction.element.id } : {}),
      ...(extraction.element.classNames ? { classNames: [...extraction.element.classNames] } : {})
    },
    dom: {
      sanitizedSnapshot: copySanitizedDomNode(extraction.dom.sanitizedSnapshot),
      childSummary: extraction.dom.childSummary.map(copyChildSummary)
    },
    styles: {
      computed: copyJsonObject(extraction.styles.computed),
      ...(extraction.styles.before ? { before: copyJsonObject(extraction.styles.before) } : {}),
      ...(extraction.styles.after ? { after: copyJsonObject(extraction.styles.after) } : {})
    },
    summaries: {
      ...(extraction.summaries.componentType ? { componentType: extraction.summaries.componentType } : {}),
      typography: copyJsonObject(extraction.summaries.typography),
      colors: copyJsonObject(extraction.summaries.colors),
      layout: copyJsonObject(extraction.summaries.layout),
      spacing: copyJsonObject(extraction.summaries.spacing)
    },
    assets: {
      screenshot: {
        storageKey,
        mediaType: "image/png",
        width: screenshotCapture.width,
        height: screenshotCapture.height,
        byteLength: screenshotCapture.byteLength,
        crop: copyRect(screenshotCapture.crop)
      }
    },
    library: {
      tags: []
    },
    generatedVersions: []
  };

  validateNewCaptureRecordV1Candidate(record);
  return record;
}

export function validateCaptureRecordV1(value: unknown): asserts value is CaptureRecord {
  assertPlainObject(value, "$");
  assertNoForbiddenPayload(value, "$", new WeakSet<object>());
  assertCaptureRecordJsonCompatible(value);

  const record = value as Record<string, unknown>;
  expectExactKeys(record, "$", [
    "schemaVersion",
    "id",
    "createdAt",
    "source",
    "environment",
    "element",
    "dom",
    "styles",
    "summaries",
    "assets",
    "library",
    "generatedVersions"
  ]);

  if (record.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throwValidation("schemaVersion must be exactly 1.");
  }

  assertBoundedRecordId(record.id, "$.id");
  assertNormalizedIsoTimestamp(record.createdAt, "$.createdAt");
  validateSource(record.source, "$.source");
  validateEnvironment(record.environment, "$.environment");
  validateElement(record.element, "$.element");
  validateDom(record.dom, "$.dom");
  validateStyles(record.styles, "$.styles");
  validateSummaries(record.summaries, "$.summaries");
  validateAssets(record.assets, "$.assets");
  validateLibrary(record.library, "$.library");
  validateGeneratedVersions(record.generatedVersions, "$.generatedVersions");
}

export function validateNewCaptureRecordV1Candidate(value: unknown): asserts value is CaptureRecord {
  validateCaptureRecordV1(value);

  const record = value as CaptureRecord;
  if (!CAPTURE_ID_PATTERN.test(record.id)) {
    throwValidation("$.id is not a valid generated capture id.");
  }

  const screenshot = record.assets.screenshot;
  const expectedStorageKey = createScreenshotStorageKey(record.id);
  if (screenshot.storageKey !== expectedStorageKey) {
    throwValidation("$.assets.screenshot.storageKey must match the generated CaptureRecord id.");
  }

  if (screenshot.mediaType !== "image/png") {
    throwValidation("$.assets.screenshot.mediaType must be image/png for a new CaptureRecord candidate.");
  }

  assertPositiveSafeInteger(screenshot.byteLength, "$.assets.screenshot.byteLength");

  if (record.library.tags.length !== 0) {
    throwValidation("$.library.tags must initialize as an empty array for a new CaptureRecord candidate.");
  }

  if (record.generatedVersions.length !== 0) {
    throwValidation("$.generatedVersions must initialize as an empty array for a new CaptureRecord candidate.");
  }
}

export function serializeCaptureRecordV1(record: CaptureRecord): JsonObject {
  validateCaptureRecordV1(record);

  try {
    const serialized = JSON.stringify(record);
    const parsed = JSON.parse(serialized) as unknown;
    validateCaptureRecordV1(parsed);
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof PersistenceError) {
      throw error;
    }

    throw new PersistenceError("serialization", "CaptureRecord JSON serialization failed.", error);
  }
}

export function parseCaptureRecordV1(value: unknown) {
  try {
    validateCaptureRecordV1(value);
    const serialized = JSON.stringify(value);
    const parsed = JSON.parse(serialized) as unknown;
    validateCaptureRecordV1(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof PersistenceError) {
      throw error;
    }

    throw new PersistenceError("serialization", "CaptureRecord JSON parse validation failed.", error);
  }
}

export function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => jsonValuesEqual(item, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) {
      return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonValuesEqual(left[key], right[key]))
    );
  }

  return false;
}

function validateSource(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["url", "pageTitle", "faviconUrl"]);
  assertString(value.url, `${path}.url`);
  assertString(value.pageTitle, `${path}.pageTitle`);
  assertOptionalString(value.faviconUrl, `${path}.faviconUrl`);
}

function validateEnvironment(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectExactKeys(value, path, ["viewport", "devicePixelRatio"]);
  assertPlainObject(value.viewport, `${path}.viewport`);
  expectExactKeys(value.viewport, `${path}.viewport`, ["width", "height"]);
  assertPositiveFiniteNumber(value.viewport.width, `${path}.viewport.width`);
  assertPositiveFiniteNumber(value.viewport.height, `${path}.viewport.height`);
  assertPositiveFiniteNumber(value.devicePixelRatio, `${path}.devicePixelRatio`);
}

function validateElement(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["tagName", "rect", "semanticRole", "textPreview", "id", "classNames"]);
  assertNonEmptyString(value.tagName, `${path}.tagName`);
  validateRect(value.rect, `${path}.rect`);
  assertOptionalString(value.semanticRole, `${path}.semanticRole`);
  assertOptionalString(value.textPreview, `${path}.textPreview`);
  assertOptionalString(value.id, `${path}.id`);

  if (value.classNames !== undefined) {
    assertStringArray(value.classNames, `${path}.classNames`);
  }
}

function validateDom(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectExactKeys(value, path, ["sanitizedSnapshot", "childSummary"]);
  validateSanitizedDomNode(value.sanitizedSnapshot, `${path}.sanitizedSnapshot`);

  if (!Array.isArray(value.childSummary)) {
    throwValidation(`${path}.childSummary must be an array.`);
  }

  value.childSummary.forEach((child, index) => validateChildSummary(child, `${path}.childSummary[${index}]`));
}

function validateSanitizedDomNode(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["tagName", "attributes", "textPreview", "children"]);
  assertNonEmptyString(value.tagName, `${path}.tagName`);
  assertPlainObject(value.attributes, `${path}.attributes`);

  for (const [key, attributeValue] of Object.entries(value.attributes)) {
    assertNonEmptyString(key, `${path}.attributes key`);
    assertString(attributeValue, `${path}.attributes.${key}`);
  }

  assertOptionalString(value.textPreview, `${path}.textPreview`);

  if (!Array.isArray(value.children)) {
    throwValidation(`${path}.children must be an array.`);
  }

  value.children.forEach((child, index) => validateSanitizedDomNode(child, `${path}.children[${index}]`));
}

function validateChildSummary(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["tagName", "semanticRole", "textPreview", "childCount"]);
  assertNonEmptyString(value.tagName, `${path}.tagName`);
  assertOptionalString(value.semanticRole, `${path}.semanticRole`);
  assertOptionalString(value.textPreview, `${path}.textPreview`);
  assertNonNegativeSafeInteger(value.childCount, `${path}.childCount`);
}

function validateStyles(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["computed", "before", "after"]);
  validateNormalizedStyle(value.computed, `${path}.computed`);

  if (value.before !== undefined) {
    validatePseudoElementStyle(value.before, `${path}.before`);
  }

  if (value.after !== undefined) {
    validatePseudoElementStyle(value.after, `${path}.after`);
  }
}

function validateNormalizedStyle(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, [
    ...STYLE_STRING_KEYS,
    "padding",
    "margin"
  ]);

  for (const [key, childValue] of Object.entries(value)) {
    if (key === "padding" || key === "margin") {
      validateBoxEdges(childValue, `${path}.${key}`);
    } else {
      assertString(childValue, `${path}.${key}`);
    }
  }
}

function validatePseudoElementStyle(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["exists", "content", "display", "color", "backgroundColor", "width", "height"]);

  if (typeof value.exists !== "boolean") {
    throwValidation(`${path}.exists must be a boolean.`);
  }

  assertOptionalString(value.content, `${path}.content`);
  assertOptionalString(value.display, `${path}.display`);
  assertOptionalString(value.color, `${path}.color`);
  assertOptionalString(value.backgroundColor, `${path}.backgroundColor`);
  assertOptionalString(value.width, `${path}.width`);
  assertOptionalString(value.height, `${path}.height`);
}

function validateSummaries(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["componentType", "typography", "colors", "layout", "spacing"]);
  assertOptionalString(value.componentType, `${path}.componentType`);
  validateTypographySummary(value.typography, `${path}.typography`);
  validateColorSummary(value.colors, `${path}.colors`);
  validateLayoutSummary(value.layout, `${path}.layout`);
  validateSpacingSummary(value.spacing, `${path}.spacing`);
}

function validateTypographySummary(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["primaryFont", "scale", "weights", "notes"]);
  assertOptionalString(value.primaryFont, `${path}.primaryFont`);
  assertOptionalString(value.notes, `${path}.notes`);

  if (value.scale !== undefined) {
    assertStringArray(value.scale, `${path}.scale`);
  }

  if (value.weights !== undefined) {
    assertStringArray(value.weights, `${path}.weights`);
  }
}

function validateColorSummary(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["foreground", "background", "accent", "border", "roles"]);
  assertOptionalString(value.foreground, `${path}.foreground`);
  assertOptionalString(value.background, `${path}.background`);
  assertOptionalString(value.accent, `${path}.accent`);
  assertOptionalString(value.border, `${path}.border`);

  if (value.roles !== undefined) {
    if (!Array.isArray(value.roles)) {
      throwValidation(`${path}.roles must be an array.`);
    }

    value.roles.forEach((role, index) => {
      assertPlainObject(role, `${path}.roles[${index}]`);
      expectExactKeys(role, `${path}.roles[${index}]`, ["role", "value"]);
      assertString(role.role, `${path}.roles[${index}].role`);
      assertString(role.value, `${path}.roles[${index}].value`);
    });
  }
}

function validateLayoutSummary(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["display", "direction", "alignment", "density", "notes"]);
  assertOptionalString(value.display, `${path}.display`);
  assertOptionalString(value.direction, `${path}.direction`);
  assertOptionalString(value.alignment, `${path}.alignment`);
  assertOptionalString(value.notes, `${path}.notes`);

  if (
    value.density !== undefined &&
    value.density !== "compact" &&
    value.density !== "comfortable" &&
    value.density !== "spacious"
  ) {
    throwValidation(`${path}.density is invalid.`);
  }
}

function validateSpacingSummary(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["padding", "margin", "gap", "notes"]);
  assertOptionalString(value.gap, `${path}.gap`);
  assertOptionalString(value.notes, `${path}.notes`);

  if (value.padding !== undefined) {
    validateBoxEdges(value.padding, `${path}.padding`);
  }

  if (value.margin !== undefined) {
    validateBoxEdges(value.margin, `${path}.margin`);
  }
}

function validateBoxEdges(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectExactKeys(value, path, ["top", "right", "bottom", "left"]);
  assertString(value.top, `${path}.top`);
  assertString(value.right, `${path}.right`);
  assertString(value.bottom, `${path}.bottom`);
  assertString(value.left, `${path}.left`);
}

function validateAssets(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectExactKeys(value, path, ["screenshot"]);
  assertPlainObject(value.screenshot, `${path}.screenshot`);
  expectRequiredAndAllowedKeys(value.screenshot, `${path}.screenshot`, [
    "storageKey",
    "mediaType",
    "width",
    "height",
    "crop"
  ], [
    "byteLength"
  ]);

  assertNonEmptyString(value.screenshot.storageKey, `${path}.screenshot.storageKey`);

  if (typeof value.screenshot.mediaType !== "string" || !SCREENSHOT_MEDIA_TYPES.has(value.screenshot.mediaType)) {
    throwValidation(`${path}.screenshot.mediaType is invalid.`);
  }

  assertPositiveSafeInteger(value.screenshot.width, `${path}.screenshot.width`);
  assertPositiveSafeInteger(value.screenshot.height, `${path}.screenshot.height`);

  if (value.screenshot.byteLength !== undefined) {
    assertPositiveSafeInteger(value.screenshot.byteLength, `${path}.screenshot.byteLength`);
  }

  validateRect(value.screenshot.crop, `${path}.screenshot.crop`);
}

function validateLibrary(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, ["title", "componentType", "tags", "notes"]);
  assertOptionalString(value.title, `${path}.title`);
  assertOptionalString(value.componentType, `${path}.componentType`);
  assertOptionalString(value.notes, `${path}.notes`);

  assertStringArray(value.tags, `${path}.tags`);
}

function validateGeneratedVersions(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    throwValidation(`${path} must be an array.`);
  }

  value.forEach((version, index) => validateGeneratedVersion(version, `${path}[${index}]`));
}

function validateGeneratedVersion(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectAllowedKeys(value, path, [
    "id",
    "createdAt",
    "generator",
    "model",
    "componentName",
    "framework",
    "styling",
    "code",
    "summary",
    "approximationNotes",
    "userInstruction"
  ]);
  assertString(value.id, `${path}.id`);
  assertNormalizedIsoTimestamp(value.createdAt, `${path}.createdAt`);

  if (value.generator !== "placeholder" && value.generator !== "ai") {
    throwValidation(`${path}.generator is invalid.`);
  }

  assertOptionalString(value.model, `${path}.model`);
  assertString(value.componentName, `${path}.componentName`);

  if (value.framework !== "react") {
    throwValidation(`${path}.framework must be react.`);
  }

  if (value.styling !== "tailwind") {
    throwValidation(`${path}.styling must be tailwind.`);
  }

  assertString(value.code, `${path}.code`);
  assertString(value.summary, `${path}.summary`);
  assertOptionalString(value.approximationNotes, `${path}.approximationNotes`);
  assertOptionalString(value.userInstruction, `${path}.userInstruction`);
}

function validateRect(value: unknown, path: string) {
  assertPlainObject(value, path);
  expectExactKeys(value, path, ["x", "y", "width", "height", "top", "right", "bottom", "left"]);
  assertFiniteNumber(value.x, `${path}.x`);
  assertFiniteNumber(value.y, `${path}.y`);
  assertFiniteNumber(value.width, `${path}.width`);
  assertFiniteNumber(value.height, `${path}.height`);
  assertFiniteNumber(value.top, `${path}.top`);
  assertFiniteNumber(value.right, `${path}.right`);
  assertFiniteNumber(value.bottom, `${path}.bottom`);
  assertFiniteNumber(value.left, `${path}.left`);
}

function assertNoForbiddenPayload(value: unknown, path: string, seen: WeakSet<object>) {
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) {
      throwValidation(`${path} must not contain inline image data.`);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    throwValidation(`${path} contains a circular reference.`);
  }

  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenPayload(item, `${path}[${index}]`, seen));
  } else {
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
      throwValidation(`${path}.toJSON is not allowed in CaptureRecord v1.`);
    }

    for (const [key, childValue] of Object.entries(value)) {
      if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
        throwValidation(`${path}.${key} is not allowed in CaptureRecord v1.`);
      }

      assertNoForbiddenPayload(childValue, `${path}.${key}`, seen);
    }
  }

  seen.delete(value);
}

function assertCaptureRecordJsonCompatible(value: unknown) {
  try {
    assertJsonCompatible(value);
  } catch (error) {
    throwValidation(error instanceof Error ? error.message : "CaptureRecord must be JSON-compatible.");
  }
}

function copyRect(rect: SerializableRect): SerializableRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left
  };
}

function copySanitizedDomNode(node: SanitizedDomNode): SanitizedDomNode {
  return {
    tagName: node.tagName,
    attributes: { ...node.attributes },
    ...(node.textPreview ? { textPreview: node.textPreview } : {}),
    children: node.children.map(copySanitizedDomNode)
  };
}

function copyChildSummary(summary: ChildElementSummary): ChildElementSummary {
  return {
    tagName: summary.tagName,
    ...(summary.semanticRole ? { semanticRole: summary.semanticRole } : {}),
    ...(summary.textPreview ? { textPreview: summary.textPreview } : {}),
    childCount: summary.childCount
  };
}

function copyJsonObject<T extends JsonObject>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertBoundedRecordId(value: unknown, path: string) {
  assertNonEmptyString(value, path);

  if (value.length > 200) {
    throwValidation(`${path} is too long.`);
  }
}

function assertNormalizedIsoTimestamp(value: unknown, path: string) {
  assertString(value, path);
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throwValidation(`${path} must be a normalized ISO timestamp.`);
  }
}

function assertPlainObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throwValidation(`${path} must be a plain JSON object.`);
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function expectExactKeys(value: Record<string, unknown>, path: string, keys: string[]) {
  const expected = new Set(keys);
  const actualKeys = Object.keys(value);

  if (actualKeys.length !== expected.size || actualKeys.some((key) => !expected.has(key))) {
    throwValidation(`${path} does not match the required CaptureRecord v1 fields.`);
  }
}

function expectAllowedKeys(value: Record<string, unknown>, path: string, keys: string[]) {
  const allowed = new Set(keys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));

  if (unknownKey) {
    throwValidation(`${path}.${unknownKey} is not part of CaptureRecord v1.`);
  }
}

function expectRequiredAndAllowedKeys(
  value: Record<string, unknown>,
  path: string,
  requiredKeys: string[],
  optionalKeys: string[]
) {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const actualKeys = Object.keys(value);
  const missingKey = requiredKeys.find((key) => !actualKeys.includes(key));

  if (missingKey) {
    throwValidation(`${path}.${missingKey} is required by CaptureRecord v1.`);
  }

  const unknownKey = actualKeys.find((key) => !allowed.has(key));
  if (unknownKey) {
    throwValidation(`${path}.${unknownKey} is not part of CaptureRecord v1.`);
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") {
    throwValidation(`${path} must be a string.`);
  }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  assertString(value, path);

  if (!value) {
    throwValidation(`${path} must not be empty.`);
  }
}

function assertOptionalString(value: unknown, path: string) {
  if (value !== undefined) {
    assertString(value, path);
  }
}

function assertStringArray(value: unknown, path: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throwValidation(`${path} must be an array of strings.`);
  }
}

function assertFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throwValidation(`${path} must be a finite number.`);
  }
}

function assertPositiveFiniteNumber(value: unknown, path: string) {
  assertFiniteNumber(value, path);

  if (value <= 0) {
    throwValidation(`${path} must be positive.`);
  }
}

function assertPositiveSafeInteger(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throwValidation(`${path} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throwValidation(`${path} must be a non-negative safe integer.`);
  }
}

function throwValidation(message: string): never {
  throw new PersistenceError("validation", message);
}
