import type { ScreenshotCaptureResult, StructuredCaptureExtraction } from "../shared/capture-schema";
import { calculateScreenshotCropGeometry } from "../shared/screenshot-crop";

export async function cropScreenshotDataUrl(
  screenshotDataUrl: string,
  extraction: StructuredCaptureExtraction
): Promise<ScreenshotCaptureResult> {
  if (!screenshotDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Element Catcher received an invalid screenshot format from Chrome.");
  }

  const image = await decodeImage(screenshotDataUrl);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Element Catcher received an empty screenshot from Chrome.");
  }

  const geometry = calculateScreenshotCropGeometry({
    rect: extraction.element.rect,
    viewportWidth: extraction.environment.viewport.width,
    viewportHeight: extraction.environment.viewport.height,
    sourceWidth,
    sourceHeight
  });

  const canvas = document.createElement("canvas");
  canvas.width = geometry.imageCrop.width;
  canvas.height = geometry.imageCrop.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Element Catcher could not prepare the screenshot crop.");
  }

  context.drawImage(
    image,
    geometry.imageCrop.left,
    geometry.imageCrop.top,
    geometry.imageCrop.width,
    geometry.imageCrop.height,
    0,
    0,
    geometry.imageCrop.width,
    geometry.imageCrop.height
  );

  const blob = await canvasToPngBlob(canvas);
  const dataUrl = await blobToDataUrl(blob);

  return {
    dataUrl,
    mediaType: "image/png",
    width: geometry.imageCrop.width,
    height: geometry.imageCrop.height,
    byteLength: blob.size,
    crop: geometry.cssCrop,
    sourceWidth,
    sourceHeight,
    scaleX: geometry.scaleX,
    scaleY: geometry.scaleY,
    wasClipped: geometry.wasClipped
  };
}

function decodeImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Element Catcher could not decode the screenshot from Chrome."));
    image.src = dataUrl;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Element Catcher could not encode the cropped screenshot."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.startsWith("data:image/png;base64,")) {
        resolve(reader.result);
        return;
      }

      reject(new Error("Element Catcher could not prepare the cropped screenshot result."));
    };
    reader.onerror = () => reject(new Error("Element Catcher could not read the cropped screenshot result."));
    reader.readAsDataURL(blob);
  });
}
