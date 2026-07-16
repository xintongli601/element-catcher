import type { ElementSelection, ExtensionMessage, SelectionRect } from "../shared/messages";

let isSelectionActive = false;
let highlightedElement: Element | null = null;
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

  return false;
});

function startSelectionMode() {
  if (isSelectionActive) {
    notifyStarted();
    return;
  }

  isSelectionActive = true;
  highlightedElement = null;
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

function completeSelection(selection: ElementSelection) {
  cleanupSelectionMode();
  chrome.runtime.sendMessage({
    type: "EC_SELECTION_COMPLETED",
    selection
  } satisfies ExtensionMessage);
}

function cleanupSelectionMode() {
  isSelectionActive = false;
  highlightedElement = null;
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
  if (!isSelectionActive) {
    return;
  }

  const target = getUnderlyingElement(event.clientX, event.clientY);
  if (!target || target === document.documentElement || target === document.body) {
    highlightedElement = null;
    hideOverlay();
    return;
  }

  highlightedElement = target;
  updateOverlayPosition();
}

function handleSelectionClick(event: MouseEvent) {
  if (!isSelectionActive || !highlightedElement) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  completeSelection(createSelection(highlightedElement));
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
  if (!isSelectionActive || !highlightedElement || !overlayElement || !labelElement) {
    hideOverlay();
    return;
  }

  const rect = highlightedElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    hideOverlay();
    return;
  }

  overlayElement.style.display = "block";
  overlayElement.style.left = `${Math.max(0, rect.left)}px`;
  overlayElement.style.top = `${Math.max(0, rect.top)}px`;
  overlayElement.style.width = `${rect.width}px`;
  overlayElement.style.height = `${rect.height}px`;

  const labelTop = rect.top > 28 ? rect.top - 28 : rect.bottom + 6;
  labelElement.style.display = "block";
  labelElement.style.left = `${Math.max(6, rect.left)}px`;
  labelElement.style.top = `${Math.max(6, labelTop)}px`;
  labelElement.textContent = `${highlightedElement.tagName.toLowerCase()} ${Math.round(rect.width)} x ${Math.round(rect.height)}`;
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
  return elements.find((element) => !(element instanceof HTMLElement && element.dataset.elementCatcherOverlay));
}

function createSelection(element: Element): ElementSelection {
  const rect = element.getBoundingClientRect();
  const textPreview = getTextPreview(element);
  const id = element instanceof HTMLElement && element.id ? element.id : undefined;
  const classNames = element instanceof HTMLElement ? Array.from(element.classList).slice(0, 8) : undefined;

  return {
    tagName: element.tagName.toLowerCase(),
    rect: toSelectionRect(rect),
    pageUrl: window.location.href,
    ...(textPreview ? { textPreview } : {}),
    ...(id ? { id } : {}),
    ...(classNames && classNames.length > 0 ? { classNames } : {})
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

function notifyStarted() {
  chrome.runtime.sendMessage({ type: "EC_SELECTION_STARTED" } satisfies ExtensionMessage);
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
