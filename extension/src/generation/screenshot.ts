import type { StoredScreenshotAsset } from "../storage/indexed-db";
import { PNG_DATA_URL_PREFIX, PNG_SIGNATURE, GENERATION_LIMITS } from "./limits";
import { GenerationError } from "./errors";
import { sha256HexBytes } from "./canonical-json";

export type VerifiedScreenshot = {
  mediaType: "image/png";
  width: number;
  height: number;
  byteLength: number;
  digest: string;
  blob: Blob;
};

export async function verifyScreenshotAsset(asset: StoredScreenshotAsset): Promise<VerifiedScreenshot> {
  if (asset.mediaType !== "image/png" || asset.blob.type !== "image/png") {
    throw new GenerationError("invalid_screenshot");
  }

  const bytes = new Uint8Array(await asset.blob.arrayBuffer());
  assertPngByteLength(bytes.byteLength);
  assertPngSignature(bytes);
  const dimensions = await decodePngBlob(asset.blob);
  if (
    bytes.byteLength !== asset.byteLength ||
    dimensions.width !== asset.width ||
    dimensions.height !== asset.height ||
    !isValidPngDimension(asset.width) ||
    !isValidPngDimension(asset.height)
  ) {
    throw new GenerationError("invalid_screenshot");
  }

  return {
    mediaType: "image/png",
    width: dimensions.width,
    height: dimensions.height,
    byteLength: bytes.byteLength,
    digest: await sha256HexBytes(bytes),
    blob: asset.blob
  };
}

export function parsePngDimensions(bytes: Uint8Array) {
  assertPngSignature(bytes);

  return {
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20)
  };
}

export async function validatePngDataUrl(dataUrl: string, expected: Pick<VerifiedScreenshot, "byteLength" | "width" | "height">) {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new GenerationError("invalid_screenshot");
  }

  let binary = "";
  try {
    binary = atob(dataUrl.slice(PNG_DATA_URL_PREFIX.length));
  } catch {
    throw new GenerationError("invalid_screenshot");
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  assertPngByteLength(bytes.byteLength);
  assertPngSignature(bytes);
  const dimensions = await decodePngBlob(new Blob([bytes], { type: "image/png" }));
  if (bytes.byteLength !== expected.byteLength || dimensions.width !== expected.width || dimensions.height !== expected.height) {
    throw new GenerationError("invalid_screenshot");
  }
}

export async function blobToPngDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return `${PNG_DATA_URL_PREFIX}${btoa(binary)}`;
}

export function assertPngByteLength(byteLength: number) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > GENERATION_LIMITS.screenshotBytes) {
    throw new GenerationError("invalid_screenshot");
  }
}

export function isPngByteLengthAllowed(byteLength: number) {
  return Number.isSafeInteger(byteLength) && byteLength >= 1 && byteLength <= GENERATION_LIMITS.screenshotBytes;
}

function assertPngSignature(bytes: Uint8Array) {
  if (bytes.length < 24) {
    throw new GenerationError("invalid_screenshot");
  }

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      throw new GenerationError("invalid_screenshot");
    }
  }
}

async function decodePngBlob(blob: Blob) {
  if (typeof createImageBitmap !== "function") {
    throw new GenerationError("invalid_screenshot");
  }

  let image: ImageBitmap | undefined;
  try {
    image = await createImageBitmap(blob);
    const dimensions = {
      width: image.width,
      height: image.height
    };
    if (!isValidPngDimension(dimensions.width) || !isValidPngDimension(dimensions.height)) {
      throw new GenerationError("invalid_screenshot");
    }
    return dimensions;
  } catch (error) {
    if (error instanceof GenerationError) {
      throw error;
    }
    throw new GenerationError("invalid_screenshot", undefined, error);
  } finally {
    image?.close();
  }
}

function isValidPngDimension(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= GENERATION_LIMITS.screenshotMaxDimension;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}
