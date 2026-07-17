import type {
  ChildElementSummary,
  DomCaptureExtraction,
  SanitizedDomNode,
  SerializableRect
} from "../shared/capture-schema";
import { assertJsonCompatible } from "../shared/json";
import { getSemanticRole } from "./semantic-role";

const MAX_SNAPSHOT_DEPTH = 4;
const MAX_CHILDREN_PER_NODE = 20;
const MAX_TOTAL_NODES = 120;
const MAX_TEXT_PREVIEW_LENGTH = 160;
const MAX_ATTRIBUTE_VALUE_LENGTH = 200;
const MAX_CLASS_NAMES = 20;

const DROPPED_TAG_NAMES = new Set(["script", "style", "noscript", "template", "object", "embed"]);

const SAFE_ATTRIBUTE_NAMES = new Set([
  "id",
  "class",
  "role",
  "title",
  "alt",
  "type",
  "name",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-expanded",
  "aria-selected",
  "aria-checked",
  "aria-current",
  "aria-controls",
  "aria-haspopup",
  "aria-pressed",
  "aria-disabled"
]);

const SAFE_DATA_ATTRIBUTE_NAMES = new Set([
  "data-testid",
  "data-test",
  "data-component",
  "data-variant",
  "data-state",
  "data-slot"
]);

const SENSITIVE_FORM_TAG_NAMES = new Set(["input", "textarea", "select", "option"]);

type SanitizeContext = {
  totalNodes: number;
};

export function createDomCaptureExtraction(element: Element): DomCaptureExtraction {
  const extraction: DomCaptureExtraction = {
    source: createCaptureSource(),
    environment: createCaptureEnvironment(),
    element: {
      tagName: element.tagName.toLowerCase(),
      rect: toSerializableRect(element.getBoundingClientRect()),
      ...optionalString("semanticRole", getSemanticRole(element)),
      ...optionalString("textPreview", getElementTextPreview(element)),
      ...optionalString("id", element instanceof HTMLElement ? element.id : undefined),
      ...optionalClassNames(element)
    },
    dom: {
      sanitizedSnapshot: sanitizeElement(element, 0, { totalNodes: 0 }) ?? createFallbackSnapshot(element),
      childSummary: createChildSummaries(element)
    }
  };

  assertJsonCompatible(extraction);
  return extraction;
}

export function toSerializableRect(rect: DOMRect): SerializableRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    left: Math.round(rect.left)
  };
}

export function getElementTextPreview(element: Element) {
  if (isSensitiveFormControl(element)) {
    return undefined;
  }

  const text = collectVisibleText(element, MAX_TEXT_PREVIEW_LENGTH);
  return text || undefined;
}

function createCaptureSource() {
  return {
    url: window.location.href,
    pageTitle: document.title
  };
}

function createCaptureEnvironment() {
  const devicePixelRatio = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;

  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    devicePixelRatio
  };
}

function sanitizeElement(element: Element, depth: number, context: SanitizeContext): SanitizedDomNode | undefined {
  if (context.totalNodes >= MAX_TOTAL_NODES || shouldDropElement(element)) {
    return undefined;
  }

  context.totalNodes += 1;

  const children =
    depth >= MAX_SNAPSHOT_DEPTH ? [] : sanitizeChildren(element, depth + 1, context).slice(0, MAX_CHILDREN_PER_NODE);

  const textPreview = getDirectTextPreview(element);

  return {
    tagName: element.tagName.toLowerCase(),
    attributes: sanitizeAttributes(element),
    ...(textPreview ? { textPreview } : {}),
    children
  };
}

function sanitizeChildren(element: Element, depth: number, context: SanitizeContext) {
  const children: SanitizedDomNode[] = [];

  for (const child of Array.from(element.children)) {
    if (children.length >= MAX_CHILDREN_PER_NODE || context.totalNodes >= MAX_TOTAL_NODES) {
      break;
    }

    if (isHiddenElement(child) || isElementCatcherOverlay(child)) {
      continue;
    }

    const sanitizedChild = sanitizeElement(child, depth, context);
    if (sanitizedChild) {
      children.push(sanitizedChild);
    }
  }

  return children;
}

function createFallbackSnapshot(element: Element): SanitizedDomNode {
  return {
    tagName: element.tagName.toLowerCase(),
    attributes: sanitizeAttributes(element),
    children: []
  };
}

function createChildSummaries(element: Element): ChildElementSummary[] {
  return getEligibleDirectChildren(element).map((child) => ({
    tagName: child.tagName.toLowerCase(),
    ...optionalString("semanticRole", getSemanticRole(child)),
    ...optionalString("textPreview", getElementTextPreview(child)),
    childCount: getEligibleDirectChildren(child).length
  }));
}

function getEligibleDirectChildren(element: Element) {
  return Array.from(element.children)
    .filter((child) => !shouldDropElement(child) && !isHiddenElement(child) && !isElementCatcherOverlay(child))
    .slice(0, MAX_CHILDREN_PER_NODE);
}

function sanitizeAttributes(element: Element) {
  const attributes: Record<string, string> = {};

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();

    if (!shouldPreserveAttribute(name)) {
      continue;
    }

    const value = sanitizeAttributeValue(name, attribute.value);
    if (!value) {
      continue;
    }

    attributes[name] = value;
  }

  return attributes;
}

function shouldPreserveAttribute(name: string) {
  if (
    name.startsWith("on") ||
    name === "style" ||
    name === "value" ||
    name === "srcdoc" ||
    name === "formaction" ||
    name === "action" ||
    name === "href" ||
    name === "src" ||
    name === "defaultvalue"
  ) {
    return false;
  }

  if (name.startsWith("data-")) {
    return SAFE_DATA_ATTRIBUTE_NAMES.has(name);
  }

  return SAFE_ATTRIBUTE_NAMES.has(name);
}

function sanitizeAttributeValue(name: string, value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || containsSensitiveTokenName(name) || containsSensitiveTokenName(trimmed)) {
    return undefined;
  }

  if (name === "class") {
    return trimmed.split(/\s+/).slice(0, MAX_CLASS_NAMES).join(" ");
  }

  return trimmed.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH);
}

function containsSensitiveTokenName(name: string) {
  return /token|secret|password|credential|session|auth/i.test(name);
}

function shouldDropElement(element: Element) {
  return DROPPED_TAG_NAMES.has(element.tagName.toLowerCase()) || isElementCatcherOverlay(element);
}

function isHiddenElement(element: Element) {
  if (
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("inert")
  ) {
    return true;
  }

  const style = window.getComputedStyle(element);
  return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
}

function getDirectTextPreview(element: Element) {
  if (isSensitiveFormControl(element)) {
    return undefined;
  }

  const text = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ");

  return normalizeText(text, MAX_TEXT_PREVIEW_LENGTH);
}

function collectVisibleText(element: Element, maxLength: number) {
  const fragments: string[] = [];

  collectVisibleTextFragments(element, fragments, maxLength);
  return normalizeText(fragments.join(" "), maxLength);
}

function collectVisibleTextFragments(node: Node, fragments: string[], maxLength: number) {
  if (fragments.join(" ").length >= maxLength) {
    return;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    fragments.push(node.textContent ?? "");
    return;
  }

  if (!(node instanceof Element) || shouldDropElement(node) || isHiddenElement(node) || isSensitiveFormControl(node)) {
    return;
  }

  for (const child of Array.from(node.childNodes)) {
    collectVisibleTextFragments(child, fragments, maxLength);
    if (fragments.join(" ").length >= maxLength) {
      break;
    }
  }
}

function normalizeText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function isSensitiveFormControl(element: Element) {
  return SENSITIVE_FORM_TAG_NAMES.has(element.tagName.toLowerCase());
}

function optionalString<Key extends string>(key: Key, value: string | undefined) {
  return value ? ({ [key]: value } as Record<Key, string>) : {};
}

function optionalClassNames(element: Element) {
  if (!(element instanceof HTMLElement)) {
    return {};
  }

  const classNames = Array.from(element.classList).slice(0, MAX_CLASS_NAMES);
  return classNames.length > 0 ? { classNames } : {};
}

function isElementCatcherOverlay(element: Element) {
  return element instanceof HTMLElement && Boolean(element.dataset.elementCatcherOverlay);
}
