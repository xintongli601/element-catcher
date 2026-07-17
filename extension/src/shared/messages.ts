import type { DomCaptureExtraction, SerializableRect, StructuredCaptureExtraction } from "./capture-schema";

export type SelectionRect = SerializableRect;
export type { DomCaptureExtraction, SerializableRect, StructuredCaptureExtraction };

export type ElementSelection = {
  tagName: string;
  rect: SerializableRect;
  pageUrl: string;
  textPreview?: string;
  id?: string;
  classNames?: string[];
  semanticRole?: string;
};

export type LockedSelectionState = {
  selection: ElementSelection;
  canSelectParent: boolean;
  canSelectChild: boolean;
};

export type SidePanelStatus =
  | "idle"
  | "starting"
  | "active"
  | "locked"
  | "capturing"
  | "selected"
  | "cancelled"
  | "error";

export type StartSelectionRequest = {
  type: "EC_START_SELECTION";
};

export type CancelSelectionRequest = {
  type: "EC_CANCEL_SELECTION";
};

export type RefineParentRequest = {
  type: "EC_REFINE_PARENT";
};

export type RefineChildRequest = {
  type: "EC_REFINE_CHILD";
};

export type ConfirmSelectionRequest = {
  type: "EC_CONFIRM_SELECTION";
};

export type ContentStartSelectionRequest = {
  type: "EC_CONTENT_START_SELECTION";
};

export type ContentCancelSelectionRequest = {
  type: "EC_CONTENT_CANCEL_SELECTION";
};

export type ContentRefineParentRequest = {
  type: "EC_CONTENT_REFINE_PARENT";
};

export type ContentRefineChildRequest = {
  type: "EC_CONTENT_REFINE_CHILD";
};

export type ContentConfirmSelectionRequest = {
  type: "EC_CONTENT_CONFIRM_SELECTION";
};

export type SelectionStartedEvent = {
  type: "EC_SELECTION_STARTED";
};

export type SelectionLockedEvent = {
  type: "EC_SELECTION_LOCKED";
  lockedSelection: LockedSelectionState;
};

export type SelectionCancelledEvent = {
  type: "EC_SELECTION_CANCELLED";
};

export type SelectionPreparedForScreenshotEvent = {
  type: "EC_SELECTION_PREPARED_FOR_SCREENSHOT";
  selection: ElementSelection;
  extraction: StructuredCaptureExtraction;
  screenshotCropRect: SerializableRect;
};

export type SelectionCompletedEvent = {
  type: "EC_SELECTION_COMPLETED";
  selection: ElementSelection;
  extraction: StructuredCaptureExtraction;
  screenshotCropRect: SerializableRect;
  screenshotDataUrl: string;
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
  | RefineParentRequest
  | RefineChildRequest
  | ConfirmSelectionRequest
  | ContentStartSelectionRequest
  | ContentCancelSelectionRequest
  | ContentRefineParentRequest
  | ContentRefineChildRequest
  | ContentConfirmSelectionRequest
  | SelectionStartedEvent
  | SelectionLockedEvent
  | SelectionCancelledEvent
  | SelectionPreparedForScreenshotEvent
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
