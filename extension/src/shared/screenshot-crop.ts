import type { SerializableRect } from "./capture-schema";

export const MAX_SCREENSHOT_SOURCE_DIMENSION = 12000;
export const MAX_SCREENSHOT_SOURCE_PIXEL_AREA = 60000000;
export const MAX_SCREENSHOT_CROP_DIMENSION = 12000;
export const MAX_SCREENSHOT_CROP_PIXEL_AREA = 60000000;

export type ScreenshotCropGeometry = {
  cssCrop: SerializableRect;
  imageCrop: SerializableRect;
  scaleX: number;
  scaleY: number;
  wasClipped: boolean;
};

export function calculateScreenshotCropGeometry({
  rect,
  viewportWidth,
  viewportHeight,
  sourceWidth,
  sourceHeight
}: {
  rect: SerializableRect;
  viewportWidth: number;
  viewportHeight: number;
  sourceWidth: number;
  sourceHeight: number;
}): ScreenshotCropGeometry {
  assertPositiveFinite("viewport width", viewportWidth);
  assertPositiveFinite("viewport height", viewportHeight);
  assertPositiveFinite("source image width", sourceWidth);
  assertPositiveFinite("source image height", sourceHeight);
  assertFiniteRect(rect);
  assertImageSafetyLimits(sourceWidth, sourceHeight, "Source screenshot");

  const visibleLeft = Math.max(0, Math.min(viewportWidth, rect.left));
  const visibleTop = Math.max(0, Math.min(viewportHeight, rect.top));
  const visibleRight = Math.max(visibleLeft, Math.min(viewportWidth, rect.right));
  const visibleBottom = Math.max(visibleTop, Math.min(viewportHeight, rect.bottom));
  const visibleWidth = visibleRight - visibleLeft;
  const visibleHeight = visibleBottom - visibleTop;

  if (visibleWidth <= 0 || visibleHeight <= 0) {
    throw new Error("The selected element is outside the visible viewport. Start capture again with a visible element.");
  }

  const cssCrop = toSerializableRectFromBounds(visibleLeft, visibleTop, visibleRight, visibleBottom);
  const scaleX = sourceWidth / viewportWidth;
  const scaleY = sourceHeight / viewportHeight;
  const imageLeft = clampInteger(Math.floor(visibleLeft * scaleX), 0, sourceWidth);
  const imageTop = clampInteger(Math.floor(visibleTop * scaleY), 0, sourceHeight);
  const imageRight = clampInteger(Math.ceil(visibleRight * scaleX), imageLeft, sourceWidth);
  const imageBottom = clampInteger(Math.ceil(visibleBottom * scaleY), imageTop, sourceHeight);
  const imageWidth = imageRight - imageLeft;
  const imageHeight = imageBottom - imageTop;

  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error("Element Catcher could not calculate a non-empty screenshot crop.");
  }

  assertCropSafetyLimits(imageWidth, imageHeight);

  return {
    cssCrop,
    imageCrop: toSerializableRectFromBounds(imageLeft, imageTop, imageRight, imageBottom),
    scaleX,
    scaleY,
    wasClipped:
      visibleLeft !== rect.left ||
      visibleTop !== rect.top ||
      visibleRight !== rect.right ||
      visibleBottom !== rect.bottom
  };
}

function assertPositiveFinite(label: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${label} for screenshot crop.`);
  }
}

function assertFiniteRect(rect: SerializableRect) {
  for (const value of [rect.x, rect.y, rect.width, rect.height, rect.top, rect.right, rect.bottom, rect.left]) {
    if (!Number.isFinite(value)) {
      throw new Error("Invalid selected element rectangle for screenshot crop.");
    }
  }
}

function assertImageSafetyLimits(width: number, height: number, label: string) {
  if (width > MAX_SCREENSHOT_SOURCE_DIMENSION || height > MAX_SCREENSHOT_SOURCE_DIMENSION) {
    throw new Error(`${label} exceeds the maximum supported image dimension.`);
  }

  if (width * height > MAX_SCREENSHOT_SOURCE_PIXEL_AREA) {
    throw new Error(`${label} exceeds the maximum supported image area.`);
  }
}

function assertCropSafetyLimits(width: number, height: number) {
  if (width > MAX_SCREENSHOT_CROP_DIMENSION || height > MAX_SCREENSHOT_CROP_DIMENSION) {
    throw new Error("Screenshot crop exceeds the maximum supported output dimension.");
  }

  if (width * height > MAX_SCREENSHOT_CROP_PIXEL_AREA) {
    throw new Error("Screenshot crop exceeds the maximum supported output area.");
  }
}

function toSerializableRectFromBounds(left: number, top: number, right: number, bottom: number): SerializableRect {
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    top,
    right,
    bottom,
    left
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
