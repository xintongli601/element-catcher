import type { ScreenshotCaptureResult, SerializableRect } from "../shared/capture-schema";
import type { StoredScreenshotAsset } from "./indexed-db";
import { PersistenceError } from "./persistence-errors";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const MAX_PERSISTENCE_PROBE_PNG_BYTES = 60_000_000;
const MAX_PERSISTENCE_PROBE_BASE64_LENGTH = Math.ceil(MAX_PERSISTENCE_PROBE_PNG_BYTES / 3) * 4;

export async function screenshotCaptureResultToBlob(screenshotCapture: ScreenshotCaptureResult) {
  verifyExpectedPngByteLength(screenshotCapture.byteLength);
  getBoundedPngBase64Payload(screenshotCapture.dataUrl);

  const response = await fetch(screenshotCapture.dataUrl);
  const blob = await response.blob();

  if (
    blob.type !== "image/png" ||
    blob.size <= 0 ||
    blob.size !== screenshotCapture.byteLength ||
    blob.size > MAX_PERSISTENCE_PROBE_PNG_BYTES
  ) {
    throw new PersistenceError("encoding", "Invalid PNG blob.");
  }

  return blob;
}

export function screenshotCaptureResultToStoredAsset(
  storageKey: string,
  blob: Blob,
  screenshotCapture: ScreenshotCaptureResult
): StoredScreenshotAsset {
  return {
    storageKey,
    blob,
    mediaType: "image/png",
    width: screenshotCapture.width,
    height: screenshotCapture.height,
    byteLength: blob.size,
    crop: screenshotCapture.crop
  };
}

export async function digestBlob(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function verifyStoredScreenshotAsset(
  storedAsset: StoredScreenshotAsset | undefined,
  expectedAsset: StoredScreenshotAsset
): asserts storedAsset is StoredScreenshotAsset {
  if (!storedAsset) {
    throw new PersistenceError("not-found", "Stored screenshot asset was not found.");
  }

  if (
    storedAsset.storageKey !== expectedAsset.storageKey ||
    storedAsset.mediaType !== expectedAsset.mediaType ||
    storedAsset.width !== expectedAsset.width ||
    storedAsset.height !== expectedAsset.height ||
    storedAsset.byteLength !== expectedAsset.byteLength ||
    !rectsMatch(storedAsset.crop, expectedAsset.crop)
  ) {
    throw new PersistenceError("readback", "Stored screenshot asset metadata did not match.");
  }
}

export function rectsMatch(left: SerializableRect, right: SerializableRect) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left
  );
}

function verifyExpectedPngByteLength(byteLength: number) {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new PersistenceError("encoding", "Invalid PNG byte length.");
  }

  if (byteLength > MAX_PERSISTENCE_PROBE_PNG_BYTES) {
    throw new PersistenceError("encoding", "PNG asset exceeds the persistence probe byte limit.");
  }
}

function getBoundedPngBase64Payload(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new PersistenceError("encoding", "Invalid PNG data URL.");
  }

  const payload = dataUrl.slice(PNG_DATA_URL_PREFIX.length);

  if (
    payload.length <= 0 ||
    payload.length > MAX_PERSISTENCE_PROBE_BASE64_LENGTH ||
    payload.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)
  ) {
    throw new PersistenceError("encoding", "Invalid PNG data URL.");
  }

  return payload;
}
