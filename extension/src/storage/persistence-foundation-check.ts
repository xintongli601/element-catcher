import type { JsonObject, ScreenshotCaptureResult, SerializableRect } from "../shared/capture-schema";
import {
  addPersistenceBundle,
  addRecordEntry,
  CAPTURE_RECORD_STORE_NAME,
  createScreenshotStorageKey,
  deletePersistenceBundle,
  deleteRecordEntry,
  ELEMENT_CATCHER_DATABASE_VERSION,
  getPersistenceDatabaseInfo,
  readRecordEntry,
  readScreenshotAsset,
  SCREENSHOT_ASSET_STORE_NAME,
  type StoredRecordEntry,
  type StoredScreenshotAsset
} from "./indexed-db";
import { PersistenceError, toPersistenceError } from "./persistence-errors";

export type PersistenceFoundationCheckResult = {
  ok: true;
  databaseName: string;
  databaseVersion: number;
  stores: string[];
  checks: {
    assetIntegrity: true;
    recordReadback: true;
    rollback: true;
    cleanup: true;
  };
};

const PROBE_KIND = "milestone-3d1-persistence-probe";
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const MAX_PERSISTENCE_PROBE_PNG_BYTES = 60_000_000;
const MAX_PERSISTENCE_PROBE_BASE64_LENGTH = Math.ceil(MAX_PERSISTENCE_PROBE_PNG_BYTES / 3) * 4;

export async function runPersistenceFoundationCheck(screenshotCapture: ScreenshotCaptureResult) {
  const probeId = createProbeId();
  const rollbackRecordId = createProbeId();
  const storageKey = createScreenshotStorageKey(probeId);
  const rollbackStorageKey = createScreenshotStorageKey(createProbeId());
  const blob = await pngDataUrlToBlob(screenshotCapture.dataUrl, screenshotCapture.byteLength);
  const digest = await digestBlob(blob);
  const asset = createScreenshotAsset(storageKey, blob, screenshotCapture);
  const record = createProbeRecord(probeId, storageKey, screenshotCapture);
  const rollbackAsset = createScreenshotAsset(rollbackStorageKey, blob, screenshotCapture);
  const blockingRecord = createProbeRecord(rollbackRecordId, createScreenshotStorageKey(rollbackRecordId), screenshotCapture);
  const duplicateRecord = createProbeRecord(rollbackRecordId, rollbackStorageKey, screenshotCapture);

  try {
    const databaseInfo = await getPersistenceDatabaseInfo();
    verifyDatabaseInfo(databaseInfo);
    await addPersistenceBundle({ asset, record });
    await verifyStoredBundle(asset, record, digest);

    await addRecordEntry(blockingRecord);
    await verifyRollback(rollbackAsset, duplicateRecord, blockingRecord);

    await cleanupProbeEntries([
      { storageKey, recordId: record.id },
      { storageKey: rollbackStorageKey, recordId: duplicateRecord.id }
    ]);
    await deleteRecordEntry(blockingRecord.id);
    await verifyCleanup(storageKey, record.id, rollbackStorageKey, blockingRecord.id);

    return {
      ok: true,
      databaseName: databaseInfo.name,
      databaseVersion: databaseInfo.version,
      stores: databaseInfo.stores,
      checks: {
        assetIntegrity: true,
        recordReadback: true,
        rollback: true,
        cleanup: true
      }
    } satisfies PersistenceFoundationCheckResult;
  } catch (error) {
    await cleanupAfterFailure(storageKey, record.id, rollbackStorageKey, blockingRecord.id);
    throw toPersistenceError(error);
  }
}

function verifyDatabaseInfo(databaseInfo: { version: number; stores: string[] }) {
  if (
    databaseInfo.version !== ELEMENT_CATCHER_DATABASE_VERSION ||
    !databaseInfo.stores.includes(SCREENSHOT_ASSET_STORE_NAME) ||
    !databaseInfo.stores.includes(CAPTURE_RECORD_STORE_NAME)
  ) {
    throw new PersistenceError("database-open", "Local persistence database structure did not match.");
  }
}

async function pngDataUrlToBlob(dataUrl: string, expectedByteLength: number) {
  verifyExpectedPngByteLength(expectedByteLength);
  getBoundedPngBase64Payload(dataUrl);

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  if (
    blob.type !== "image/png" ||
    blob.size <= 0 ||
    blob.size !== expectedByteLength ||
    blob.size > MAX_PERSISTENCE_PROBE_PNG_BYTES
  ) {
    throw new PersistenceError("encoding", "Invalid PNG blob.");
  }

  return blob;
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

function createProbeId() {
  const randomId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackRandomId();
  return `probe-${randomId}`;
}

function fallbackRandomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createScreenshotAsset(
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

function createProbeRecord(
  id: string,
  storageKey: string,
  screenshotCapture: ScreenshotCaptureResult
): StoredRecordEntry {
  const value: JsonObject = {
    kind: PROBE_KIND,
    id,
    createdAt: new Date().toISOString(),
    screenshotStorageKey: storageKey,
    screenshot: {
      mediaType: "image/png",
      width: screenshotCapture.width,
      height: screenshotCapture.height,
      byteLength: screenshotCapture.byteLength,
      crop: toJsonRect(screenshotCapture.crop)
    }
  };

  return { id, value };
}

async function verifyStoredBundle(asset: StoredScreenshotAsset, record: StoredRecordEntry, expectedDigest: string) {
  const storedAsset = await readScreenshotAsset(asset.storageKey);
  if (!storedAsset) {
    throw new PersistenceError("not-found", "Stored screenshot asset was not found.");
  }

  if (
    storedAsset.mediaType !== asset.mediaType ||
    storedAsset.width !== asset.width ||
    storedAsset.height !== asset.height ||
    storedAsset.byteLength !== asset.byteLength ||
    !rectsMatch(storedAsset.crop, asset.crop)
  ) {
    throw new PersistenceError("readback", "Stored screenshot asset metadata did not match.");
  }

  const storedDigest = await digestBlob(storedAsset.blob);
  if (storedDigest !== expectedDigest) {
    throw new PersistenceError("readback", "Stored screenshot asset digest did not match.");
  }

  const storedRecord = await readRecordEntry(record.id);
  if (!storedRecord || JSON.stringify(storedRecord.value) !== JSON.stringify(record.value)) {
    throw new PersistenceError("readback", "Stored probe record did not match.");
  }
}

async function verifyRollback(
  rollbackAsset: StoredScreenshotAsset,
  duplicateRecord: StoredRecordEntry,
  blockingRecord: StoredRecordEntry
) {
  try {
    await addPersistenceBundle({ asset: rollbackAsset, record: duplicateRecord });
    throw new PersistenceError("transaction", "Rollback probe unexpectedly committed.");
  } catch (error) {
    const persistenceError = toPersistenceError(error);
    if (persistenceError.code !== "constraint") {
      throw persistenceError;
    }
  }

  const assetAfterRollback = await readScreenshotAsset(rollbackAsset.storageKey);
  if (assetAfterRollback) {
    throw new PersistenceError("readback", "Rollback probe left a screenshot asset behind.");
  }

  const blockingRecordAfterRollback = await readRecordEntry(blockingRecord.id);
  if (!blockingRecordAfterRollback || JSON.stringify(blockingRecordAfterRollback.value) !== JSON.stringify(blockingRecord.value)) {
    throw new PersistenceError("readback", "Rollback probe changed the blocking record.");
  }
}

async function cleanupProbeEntries(entries: Array<{ storageKey: string; recordId: string }>) {
  for (const entry of entries) {
    await deletePersistenceBundle(entry);
  }
}

async function verifyCleanup(
  storageKey: string,
  recordId: string,
  rollbackStorageKey: string,
  blockingRecordId: string
) {
  const [asset, record, rollbackAsset, blockingRecord] = await Promise.all([
    readScreenshotAsset(storageKey),
    readRecordEntry(recordId),
    readScreenshotAsset(rollbackStorageKey),
    readRecordEntry(blockingRecordId)
  ]);

  if (asset || record || rollbackAsset || blockingRecord) {
    throw new PersistenceError("cleanup", "Temporary persistence probe data was not fully removed.");
  }
}

async function cleanupAfterFailure(
  storageKey: string,
  recordId: string,
  rollbackStorageKey: string,
  blockingRecordId: string
) {
  try {
    await cleanupProbeEntries([
      { storageKey, recordId },
      { storageKey: rollbackStorageKey, recordId: blockingRecordId }
    ]);
    await deleteRecordEntry(blockingRecordId);
  } catch {
    // Keep failure reporting focused on the original persistence error.
  }
}

async function digestBlob(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toJsonRect(rect: SerializableRect): JsonObject {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left
  };
}

function rectsMatch(left: SerializableRect, right: SerializableRect) {
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
