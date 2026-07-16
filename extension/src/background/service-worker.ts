import type {
  ContentCancelSelectionRequest,
  ContentStartSelectionRequest,
  ExtensionMessage,
  SelectionCommandResponse
} from "../shared/messages";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error("Failed to configure Element Catcher side panel.", error);
  });
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: SelectionCommandResponse) => void
  ) => {
    if (message.type !== "EC_START_SELECTION" && message.type !== "EC_CANCEL_SELECTION") {
      return false;
    }

    void sendSelectionCommand(message.type).then(sendResponse);
    return true;
  }
);

async function sendSelectionCommand(command: "EC_START_SELECTION" | "EC_CANCEL_SELECTION") {
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

  const contentMessage: ContentStartSelectionRequest | ContentCancelSelectionRequest =
    command === "EC_START_SELECTION"
      ? { type: "EC_CONTENT_START_SELECTION" }
      : { type: "EC_CONTENT_CANCEL_SELECTION" };

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
