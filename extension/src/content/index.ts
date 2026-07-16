import type {
  ElementSelection,
  ExtensionMessage,
  LockedSelectionState,
  SelectionRect
} from "../shared/messages";

let isSelectionActive = false;
let highlightedElement: Element | null = null;
let lockedElement: Element | null = null;
let descendantPath: Element[] = [];
let overlayElement: HTMLDivElement | null = null;
let labelElement: HTMLDivElement | null = null;
let previousCursor = "";

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isExtensionMessage(message)) {
    return false;
  }

  if (message.type === "EC_CONTENT_START_SELECTION") {
    startSelectionMode();
    return false;
  }

  if (message.type === "EC_CONTENT_CANCEL_SELECTION") {
    cancelSelectionMode();
    return false;
  }

  if (message.type === "EC_CONTENT_REFINE_PARENT") {
    refineToParent();
    return false;
  }

  if (message.type === "EC_CONTENT_REFINE_CHILD") {
    refineToChild();
    return false;
  }

  if (message.type === "EC_CONTENT_CONFIRM_SELECTION") {
    confirmLockedSelection();
    return false;
  }

  return false;
});

function startSelectionMode() {
  if (isSelectionActive) {
    cleanupSelectionMode();
  }

  isSelectionActive = true;
  highlightedElement = null;
  lockedElement = null;
  descendantPath = [];
  previousCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = "crosshair";

  ensureOverlay();
  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("click", handleSelectionClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("scroll", updateOverlayPosition, true);
  window.addEventListener("resize", updateOverlayPosition, true);
  notifyStarted();
}

function cancelSelectionMode() {
  if (!isSelectionActive) {
    cleanupSelectionMode();
    return;
  }

  cleanupSelectionMode();
  chrome.runtime.sendMessage({ type: "EC_SELECTION_CANCELLED" } satisfies ExtensionMessage);
}

function confirmLockedSelection() {
  if (!isSelectionActive || !lockedElement) {
    failSelection("No locked element is available. Start capture again and lock an element before confirming.");
    return;
  }

  if (!validateLockedElement()) {
    return;
  }

  const selection = createSelection(lockedElement);
  cleanupSelectionMode();
  chrome.runtime.sendMessage({
    type: "EC_SELECTION_COMPLETED",
    selection
  } satisfies ExtensionMessage);
}

function cleanupSelectionMode() {
  isSelectionActive = false;
  highlightedElement = null;
  lockedElement = null;
  descendantPath = [];
  document.removeEventListener("pointermove", handlePointerMove, true);
  document.removeEventListener("click", handleSelectionClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);
  window.removeEventListener("scroll", updateOverlayPosition, true);
  window.removeEventListener("resize", updateOverlayPosition, true);
  document.documentElement.style.cursor = previousCursor;
  overlayElement?.remove();
  labelElement?.remove();
  overlayElement = null;
  labelElement = null;
}

function handlePointerMove(event: PointerEvent) {
  if (!isSelectionActive || lockedElement) {
    return;
  }

  const target = getUnderlyingElement(event.clientX, event.clientY);
  if (!target || !isEligibleSelectionTarget(target)) {
    highlightedElement = null;
    hideOverlay();
    return;
  }

  highlightedElement = target;
  updateOverlayPosition();
}

function handleSelectionClick(event: MouseEvent) {
  if (!isSelectionActive) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (lockedElement || !highlightedElement) {
    return;
  }

  lockElement(highlightedElement);
}

function handleKeyDown(event: KeyboardEvent) {
  if (!isSelectionActive || event.key !== "Escape") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  cancelSelectionMode();
}

function lockElement(element: Element) {
  if (!isEligibleSelectionTarget(element)) {
    failSelection("The selected element is no longer available. Start capture again and select another element.");
    return;
  }

  lockedElement = element;
  highlightedElement = element;
  descendantPath = [];
  document.documentElement.style.cursor = "default";
  updateOverlayPosition();
  notifyLockedSelection();
}

function refineToParent() {
  if (!isSelectionActive || !lockedElement) {
    return;
  }

  if (!validateLockedElement()) {
    return;
  }

  const parent = findEligibleAncestor(lockedElement);
  if (!parent) {
    notifyLockedSelection();
    return;
  }

  descendantPath.push(lockedElement);
  lockedElement = parent;
  highlightedElement = parent;
  updateOverlayPosition();
  notifyLockedSelection();
}

function refineToChild() {
  if (!isSelectionActive || !lockedElement || descendantPath.length === 0) {
    notifyLockedSelection();
    return;
  }

  if (!validateLockedElement()) {
    return;
  }

  const child = descendantPath[descendantPath.length - 1];
  if (!isValidRefinementChild(lockedElement, child)) {
    descendantPath = [];
    notifyLockedSelection();
    return;
  }

  descendantPath.pop();
  lockedElement = child;
  highlightedElement = child;
  updateOverlayPosition();
  notifyLockedSelection();
}

function ensureOverlay() {
  if (!overlayElement) {
    overlayElement = document.createElement("div");
    overlayElement.dataset.elementCatcherOverlay = "highlight";
    overlayElement.style.position = "fixed";
    overlayElement.style.pointerEvents = "none";
    overlayElement.style.zIndex = "2147483646";
    overlayElement.style.border = "2px solid #2563eb";
    overlayElement.style.background = "rgba(37, 99, 235, 0.08)";
    overlayElement.style.boxShadow = "0 0 0 2px rgba(255, 255, 255, 0.85)";
    overlayElement.style.borderRadius = "4px";
    overlayElement.style.display = "none";
    document.documentElement.append(overlayElement);
  }

  if (!labelElement) {
    labelElement = document.createElement("div");
    labelElement.dataset.elementCatcherOverlay = "label";
    labelElement.style.position = "fixed";
    labelElement.style.pointerEvents = "none";
    labelElement.style.zIndex = "2147483647";
    labelElement.style.maxWidth = "260px";
    labelElement.style.padding = "4px 7px";
    labelElement.style.borderRadius = "4px";
    labelElement.style.background = "#172033";
    labelElement.style.color = "#ffffff";
    labelElement.style.font = "12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    labelElement.style.display = "none";
    document.documentElement.append(labelElement);
  }
}

function updateOverlayPosition() {
  const target = lockedElement ?? highlightedElement;
  if (!isSelectionActive || !target || !overlayElement || !labelElement) {
    hideOverlay();
    return;
  }

  if (lockedElement && !validateLockedElement()) {
    return;
  }

  const rect = target.getBoundingClientRect();
  if (!isUsableRect(rect)) {
    hideOverlay();
    return;
  }

  overlayElement.style.display = "block";
  overlayElement.style.left = `${Math.max(0, rect.left)}px`;
  overlayElement.style.top = `${Math.max(0, rect.top)}px`;
  overlayElement.style.width = `${rect.width}px`;
  overlayElement.style.height = `${rect.height}px`;

  if (lockedElement) {
    overlayElement.style.border = "2px solid #15803d";
    overlayElement.style.background = "rgba(21, 128, 61, 0.1)";
    overlayElement.style.boxShadow = "0 0 0 2px rgba(255, 255, 255, 0.9)";
  } else {
    overlayElement.style.border = "2px solid #2563eb";
    overlayElement.style.background = "rgba(37, 99, 235, 0.08)";
    overlayElement.style.boxShadow = "0 0 0 2px rgba(255, 255, 255, 0.85)";
  }

  const labelTop = rect.top > 28 ? rect.top - 28 : rect.bottom + 6;
  labelElement.style.display = "block";
  labelElement.style.left = `${Math.max(6, rect.left)}px`;
  labelElement.style.top = `${Math.max(6, labelTop)}px`;
  labelElement.textContent = `${lockedElement ? "Locked: " : ""}${target.tagName.toLowerCase()} ${Math.round(rect.width)} x ${Math.round(rect.height)}`;
}

function hideOverlay() {
  if (overlayElement) {
    overlayElement.style.display = "none";
  }

  if (labelElement) {
    labelElement.style.display = "none";
  }
}

function getUnderlyingElement(clientX: number, clientY: number) {
  const elements = document.elementsFromPoint(clientX, clientY);
  return elements.find((element) => !isElementCatcherOverlay(element));
}

function findEligibleAncestor(element: Element) {
  let parent = element.parentElement;

  while (parent) {
    if (isEligibleSelectionTarget(parent)) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return null;
}

function isValidRefinementChild(parent: Element, child: Element | undefined) {
  return Boolean(
    child &&
      child.isConnected &&
      parent.isConnected &&
      parent.contains(child) &&
      isEligibleSelectionTarget(child)
  );
}

function canSelectParent(element: Element) {
  return Boolean(findEligibleAncestor(element));
}

function canSelectChild() {
  return descendantPath.length > 0;
}

function validateLockedElement() {
  if (!lockedElement || !lockedElement.isConnected || isElementCatcherOverlay(lockedElement)) {
    failSelection("The locked element is no longer available. Start capture again to select the element.");
    return false;
  }

  const rect = lockedElement.getBoundingClientRect();
  if (!isUsableRect(rect)) {
    failSelection("The locked element is no longer visible enough to refine. Start capture again to select the element.");
    return false;
  }

  return true;
}

function isEligibleSelectionTarget(element: Element | null | undefined) {
  if (!element || !element.isConnected || isElementCatcherOverlay(element)) {
    return false;
  }

  if (element === document.documentElement || element === document.body) {
    return false;
  }

  return isUsableRect(element.getBoundingClientRect());
}

function isElementCatcherOverlay(element: Element) {
  return element instanceof HTMLElement && Boolean(element.dataset.elementCatcherOverlay);
}

function isUsableRect(rect: DOMRect) {
  return rect.width > 0 && rect.height > 0;
}

function createLockedSelectionState(element: Element): LockedSelectionState {
  return {
    selection: createSelection(element),
    canSelectParent: canSelectParent(element),
    canSelectChild: canSelectChild()
  };
}

function createSelection(element: Element): ElementSelection {
  const rect = element.getBoundingClientRect();
  const textPreview = getTextPreview(element);
  const id = element instanceof HTMLElement && element.id ? element.id : undefined;
  const classNames = element instanceof HTMLElement ? Array.from(element.classList).slice(0, 8) : undefined;
  const semanticRole = getSemanticRole(element);

  return {
    tagName: element.tagName.toLowerCase(),
    rect: toSelectionRect(rect),
    pageUrl: window.location.href,
    ...(textPreview ? { textPreview } : {}),
    ...(id ? { id } : {}),
    ...(classNames && classNames.length > 0 ? { classNames } : {}),
    ...(semanticRole ? { semanticRole } : {})
  };
}

function toSelectionRect(rect: DOMRect): SelectionRect {
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

function getTextPreview(element: Element) {
  if (element.matches("input, textarea, select, option")) {
    return undefined;
  }

  const text = element.textContent?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 120) : undefined;
}

function getSemanticRole(element: Element) {
  if (element instanceof HTMLElement || element instanceof SVGElement) {
    const explicitRole = element.getAttribute("role")?.trim();
    if (explicitRole && /^[a-zA-Z][\w-]*$/.test(explicitRole)) {
      return explicitRole.toLowerCase();
    }
  }

  const tagName = element.tagName.toLowerCase();

  if (tagName === "a" && element instanceof HTMLAnchorElement && element.href) {
    return "link";
  }

  if (tagName === "input" && element instanceof HTMLInputElement) {
    if (element.type === "button" || element.type === "submit" || element.type === "reset") {
      return "button";
    }

    return "textbox";
  }

  const nativeRoles: Record<string, string> = {
    aside: "complementary",
    button: "button",
    footer: "contentinfo",
    form: "form",
    header: "banner",
    img: "img",
    main: "main",
    nav: "navigation",
    select: "combobox",
    textarea: "textbox"
  };

  return nativeRoles[tagName];
}

function notifyStarted() {
  chrome.runtime.sendMessage({ type: "EC_SELECTION_STARTED" } satisfies ExtensionMessage);
}

function notifyLockedSelection() {
  if (!lockedElement) {
    return;
  }

  chrome.runtime.sendMessage({
    type: "EC_SELECTION_LOCKED",
    lockedSelection: createLockedSelectionState(lockedElement)
  } satisfies ExtensionMessage);
}

function failSelection(message: string) {
  cleanupSelectionMode();
  chrome.runtime.sendMessage({
    type: "EC_SELECTION_ERROR",
    message
  } satisfies ExtensionMessage);
}

function isExtensionMessage(message: unknown): message is ExtensionMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    typeof (message as { type: unknown }).type === "string" &&
    (message as { type: string }).type.startsWith("EC_")
  );
}
