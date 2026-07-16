export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ElementSelection = {
  tagName: string;
  rect: SelectionRect;
  pageUrl: string;
  textPreview?: string;
  id?: string;
  classNames?: string[];
};

export type SidePanelStatus =
  | "idle"
  | "starting"
  | "active"
  | "selected"
  | "cancelled"
  | "error";

export type StartSelectionRequest = {
  type: "EC_START_SELECTION";
};

export type CancelSelectionRequest = {
  type: "EC_CANCEL_SELECTION";
};

export type ContentStartSelectionRequest = {
  type: "EC_CONTENT_START_SELECTION";
};

export type ContentCancelSelectionRequest = {
  type: "EC_CONTENT_CANCEL_SELECTION";
};

export type SelectionStartedEvent = {
  type: "EC_SELECTION_STARTED";
};

export type SelectionCancelledEvent = {
  type: "EC_SELECTION_CANCELLED";
};

export type SelectionCompletedEvent = {
  type: "EC_SELECTION_COMPLETED";
  selection: ElementSelection;
};

export type SelectionErrorEvent = {
  type: "EC_SELECTION_ERROR";
  message: string;
};

export type SelectionCommandResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export type ExtensionMessage =
  | StartSelectionRequest
  | CancelSelectionRequest
  | ContentStartSelectionRequest
  | ContentCancelSelectionRequest
  | SelectionStartedEvent
  | SelectionCancelledEvent
  | SelectionCompletedEvent
  | SelectionErrorEvent;

export function isExtensionMessage(message: unknown): message is ExtensionMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    typeof (message as { type: unknown }).type === "string" &&
    (message as { type: string }).type.startsWith("EC_")
  );
}
