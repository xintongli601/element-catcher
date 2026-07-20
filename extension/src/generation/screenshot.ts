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
  const dimensions = parsePngDimensions(bytes);
  if (
    bytes.byteLength !== asset.byteLength ||
    bytes.byteLength < 1 ||
    bytes.byteLength > GENERATION_LIMITS.screenshotBytes ||
    dimensions.width !== asset.width ||
    dimensions.height !== asset.height ||
    !Number.isSafeInteger(asset.width) ||
    !Number.isSafeInteger(asset.height) ||
    asset.width < 1 ||
    asset.height < 1 ||
    asset.width > GENERATION_LIMITS.screenshotMaxDimension ||
    asset.height > GENERATION_LIMITS.screenshotMaxDimension
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
  if (bytes.length < 24) {
    throw new GenerationError("invalid_screenshot");
  }

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      throw new GenerationError("invalid_screenshot");
    }
  }

  return {
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20)
  };
}

export function validatePngDataUrl(dataUrl: string, expected: Pick<VerifiedScreenshot, "byteLength" | "width" | "height">) {
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
  const dimensions = parsePngDimensions(bytes);
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

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}
