import type {
  ContentCancelSelectionRequest,
  ContentConfirmSelectionRequest,
  ContentRefineChildRequest,
  ContentRefineParentRequest,
  ContentStartSelectionRequest,
  ExtensionMessage,
  SelectionCommandResponse,
  SelectionPreparedForScreenshotEvent
} from "../shared/messages";

void configureSidePanelActionBehavior();

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanelActionBehavior();
});

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    console.error("Element Catcher could not open the side panel because the clicked tab was unavailable.");
    return;
  }

  void chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
    console.error("Element Catcher could not open the side panel from the toolbar action.", error);
  });
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: SelectionCommandResponse) => void
  ) => {
    if (message.type === "EC_SELECTION_PREPARED_FOR_SCREENSHOT") {
      void completeSelectionWithScreenshot(message, sender);
      return false;
    }

    if (!isSidePanelCommand(message)) {
      return false;
    }

    void sendSelectionCommand(message.type).then(sendResponse);
    return true;
  }
);

const screenshotCapturesInFlight = new Set<number>();

type SidePanelCommand =
  | "EC_START_SELECTION"
  | "EC_CANCEL_SELECTION"
  | "EC_REFINE_PARENT"
  | "EC_REFINE_CHILD"
  | "EC_CONFIRM_SELECTION";

type ContentCommand =
  | ContentStartSelectionRequest
  | ContentCancelSelectionRequest
  | ContentRefineParentRequest
  | ContentRefineChildRequest
  | ContentConfirmSelectionRequest;

async function configureSidePanelActionBehavior() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (error) {
    console.error("Failed to configure Element Catcher side panel action behavior.", error);
  }
}

async function sendSelectionCommand(command: SidePanelCommand) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab?.id) {
    return {
      ok: false,
      message: "No active tab is available for selection."
    } satisfies SelectionCommandResponse;
  }

  if (activeTab.url && !isSupportedPageUrl(activeTab.url)) {
    return {
      ok: false,
      message: "Element selection is only available on ordinary http and https webpages."
    } satisfies SelectionCommandResponse;
  }

  const contentMessage = toContentCommand(command);

  try {
    await chrome.tabs.sendMessage(activeTab.id, contentMessage);
    return { ok: true } satisfies SelectionCommandResponse;
  } catch {
    return {
      ok: false,
      message:
        "Element Catcher could not reach this page. Reload the webpage and try again, or use an ordinary webpage where extensions can run."
    } satisfies SelectionCommandResponse;
  }
}

function isSupportedPageUrl(url: string | undefined) {
  return Boolean(url && (url.startsWith("http://") || url.startsWith("https://")));
}

function areSameDocumentUrls(first: string, second: string) {
  try {
    const firstUrl = new URL(first);
    const secondUrl = new URL(second);

    firstUrl.hash = "";
    secondUrl.hash = "";

    return firstUrl.href === secondUrl.href;
  } catch {
    return false;
  }
}

function isSidePanelCommand(message: ExtensionMessage): message is ExtensionMessage & { type: SidePanelCommand } {
  return (
    message.type === "EC_START_SELECTION" ||
    message.type === "EC_CANCEL_SELECTION" ||
    message.type === "EC_REFINE_PARENT" ||
    message.type === "EC_REFINE_CHILD" ||
    message.type === "EC_CONFIRM_SELECTION"
  );
}

function toContentCommand(command: SidePanelCommand): ContentCommand {
  if (command === "EC_START_SELECTION") {
    return { type: "EC_CONTENT_START_SELECTION" };
  }

  if (command === "EC_CANCEL_SELECTION") {
    return { type: "EC_CONTENT_CANCEL_SELECTION" };
  }

  if (command === "EC_REFINE_PARENT") {
    return { type: "EC_CONTENT_REFINE_PARENT" };
  }

  if (command === "EC_REFINE_CHILD") {
    return { type: "EC_CONTENT_REFINE_CHILD" };
  }

  return { type: "EC_CONTENT_CONFIRM_SELECTION" };
}

async function completeSelectionWithScreenshot(message: SelectionPreparedForScreenshotEvent, sender: chrome.runtime.MessageSender) {
  try {
    const tab = await validateScreenshotSender(message, sender);
    const screenshotDataUrl = await captureVisibleTabPng(tab.windowId);

    sendRuntimeEvent({
      type: "EC_SELECTION_COMPLETED",
      selection: message.selection,
      extraction: message.extraction,
      screenshotDataUrl
    } satisfies ExtensionMessage);
  } catch (error) {
    sendRuntimeEvent({
      type: "EC_SELECTION_ERROR",
      message: error instanceof Error ? error.message : "Element Catcher could not capture the selected element screenshot."
    } satisfies ExtensionMessage);
  } finally {
    if (typeof sender.tab?.id === "number") {
      screenshotCapturesInFlight.delete(sender.tab.id);
    }
  }
}

async function validateScreenshotSender(
  message: SelectionPreparedForScreenshotEvent,
  sender: chrome.runtime.MessageSender
) {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;
  const senderUrl = sender.tab?.url;

  if (typeof tabId !== "number" || typeof windowId !== "number") {
    throw new Error("Element Catcher could not identify the source tab. Restart capture and try again.");
  }

  if (screenshotCapturesInFlight.has(tabId)) {
    throw new Error("A screenshot capture is already in progress. Wait for it to finish and try again.");
  }

  if (!isSupportedPageUrl(senderUrl) || !isSupportedPageUrl(message.extraction.source.url)) {
    throw new Error("Screenshot capture is only available on ordinary http and https webpages.");
  }

  if (!senderUrl || !areSameDocumentUrls(senderUrl, message.extraction.source.url)) {
    throw new Error("The selected page changed before screenshot capture. Restart capture and try again.");
  }

  screenshotCapturesInFlight.add(tabId);

  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  if (!activeTab?.id || activeTab.id !== tabId) {
    throw new Error("The selected tab is no longer active. Restart capture before taking a screenshot.");
  }

  if (activeTab.url && !areSameDocumentUrls(activeTab.url, senderUrl)) {
    throw new Error("The selected page changed before screenshot capture. Restart capture and try again.");
  }

  if (activeTab.pendingUrl && !areSameDocumentUrls(activeTab.pendingUrl, senderUrl)) {
    throw new Error("The selected page changed before screenshot capture. Restart capture and try again.");
  }

  return {
    id: tabId,
    windowId
  };
}

async function captureVisibleTabPng(windowId: number) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });

  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Element Catcher received an invalid screenshot format from Chrome.");
  }

  return dataUrl;
}

function sendRuntimeEvent(message: ExtensionMessage) {
  void chrome.runtime.sendMessage(message).catch(() => {
    // The side panel may be closed before the asynchronous screenshot flow finishes.
  });
}
