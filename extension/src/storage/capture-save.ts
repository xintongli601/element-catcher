import type { CaptureRecord, JsonObject, ScreenshotCaptureResult } from "../shared/capture-schema";
import {
  jsonValuesEqual,
  parseCaptureRecordV1,
  serializeCaptureRecordV1,
  validateCaptureRecordV1,
  validateNewCaptureRecordV1Candidate
} from "../capture/capture-record-v1";
import {
  addPersistenceBundle,
  deletePersistenceBundle,
  readLatestSavedRecordEntry,
  readRecordEntry,
  readSavedRecordEntries,
  readScreenshotAsset,
  type StoredRecordEntry,
  type StoredScreenshotAsset
} from "./indexed-db";
import { PersistenceError, toPersistenceError } from "./persistence-errors";
import {
  digestBlob,
  rectsMatch,
  screenshotCaptureResultToBlob,
  screenshotCaptureResultToStoredAsset,
  verifyStoredScreenshotAsset
} from "./screenshot-asset";

export type SavedCaptureReadModel = {
  record: CaptureRecord;
  asset: StoredScreenshotAsset;
  savedAt: string;
};

export async function saveCaptureRecordV1(
  captureRecord: CaptureRecord,
  screenshotCapture: ScreenshotCaptureResult
): Promise<SavedCaptureReadModel> {
  const storageKey = captureRecord.assets.screenshot.storageKey;
  let committed = false;

  try {
    validateNewCaptureRecordV1Candidate(captureRecord);

    const blob = await screenshotCaptureResultToBlob(screenshotCapture);
    const asset = screenshotCaptureResultToStoredAsset(storageKey, blob, screenshotCapture);
    verifyScreenshotReference(captureRecord, asset);

    const expectedDigest = await digestBlob(blob);
    const serializedRecord = serializeCaptureRecordV1(captureRecord);
    const savedAt = createSavedAtTimestamp();
    const storedRecordEntry: StoredRecordEntry = {
      id: captureRecord.id,
      value: serializedRecord,
      savedAt
    };

    await addPersistenceBundle({ asset, record: storedRecordEntry });
    committed = true;

    return await verifySavedCaptureReadback({
      expectedRecord: captureRecord,
      expectedAsset: asset,
      expectedDigest,
      expectedSavedAt: savedAt,
      expectedSerializedRecord: serializedRecord
    });
  } catch (error) {
    const persistenceError = toPersistenceError(error);

    if (committed) {
      await cleanupCommittedSaveFailure(storageKey, captureRecord.id, persistenceError);
    }

    throw persistenceError;
  }
}

export async function loadLatestSavedCapture(): Promise<SavedCaptureReadModel | undefined> {
  try {
    const entry = await readLatestSavedRecordEntry();

    if (!entry) {
      return undefined;
    }

    return await readSavedCaptureEntry(entry);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function loadSavedCaptureLibrary(): Promise<SavedCaptureReadModel[]> {
  try {
    const entries = await readSavedRecordEntries();
    const readModels = await Promise.all(entries.map(readSavedCaptureEntry));

    return readModels.sort(compareSavedCapturesNewestFirst);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function loadSavedCaptureById(recordId: string): Promise<SavedCaptureReadModel> {
  try {
    const entry = await readRecordEntry(recordId);

    if (!entry) {
      throw new PersistenceError("not-found", "Saved CaptureRecord was not found.");
    }

    return await readSavedCaptureEntry(entry);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

async function verifySavedCaptureReadback({
  expectedRecord,
  expectedAsset,
  expectedDigest,
  expectedSavedAt,
  expectedSerializedRecord
}: {
  expectedRecord: CaptureRecord;
  expectedAsset: StoredScreenshotAsset;
  expectedDigest: string;
  expectedSavedAt: string;
  expectedSerializedRecord: JsonObject;
}) {
  const [storedRecord, storedAsset] = await Promise.all([
    readRecordEntry(expectedRecord.id),
    readScreenshotAsset(expectedAsset.storageKey)
  ]);

  if (!storedRecord) {
    throw new PersistenceError("not-found", "Saved CaptureRecord was not found.");
  }

  if (storedRecord.savedAt !== expectedSavedAt) {
    throw new PersistenceError("readback", "Saved CaptureRecord timestamp did not match.");
  }

  if (!jsonValuesEqual(storedRecord.value, expectedSerializedRecord)) {
    throw new PersistenceError("readback", "Saved CaptureRecord JSON did not match the serialized record.");
  }

  verifyStoredScreenshotAsset(storedAsset, expectedAsset);
  await verifyStoredAssetBlob(storedAsset);

  const storedDigest = await digestBlob(storedAsset.blob);
  if (storedDigest !== expectedDigest) {
    throw new PersistenceError("readback", "Saved screenshot asset digest did not match.");
  }

  const readModel = await readSavedCaptureEntry(storedRecord);

  if (!jsonValuesEqual(serializeCaptureRecordV1(expectedRecord), serializeCaptureRecordV1(readModel.record))) {
    throw new PersistenceError("readback", "Saved CaptureRecord read-back did not match the candidate.");
  }

  return readModel;
}

async function readSavedCaptureEntry(entry: StoredRecordEntry): Promise<SavedCaptureReadModel> {
  if (!entry.savedAt || !isNormalizedIsoTimestamp(entry.savedAt)) {
    throw new PersistenceError("validation", "Saved CaptureRecord entry is missing a valid savedAt timestamp.");
  }

  const parsedRecord = parseCaptureRecordV1(entry.value);
  validateCaptureRecordV1(parsedRecord);

  if (entry.id !== parsedRecord.id) {
    throw new PersistenceError("readback", "Saved CaptureRecord wrapper id did not match the record id.");
  }

  const asset = await readScreenshotAsset(parsedRecord.assets.screenshot.storageKey);
  if (!asset) {
    throw new PersistenceError("not-found", "Saved screenshot asset was not found.");
  }

  verifyScreenshotReference(parsedRecord, asset);
  await verifyStoredAssetBlob(asset);

  return {
    record: parsedRecord,
    asset,
    savedAt: entry.savedAt
  };
}

function compareSavedCapturesNewestFirst(left: SavedCaptureReadModel, right: SavedCaptureReadModel) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt);
  }

  return left.record.id.localeCompare(right.record.id);
}

function verifyScreenshotReference(captureRecord: CaptureRecord, expectedAsset: StoredScreenshotAsset) {
  const reference = captureRecord.assets.screenshot;

  if (
    reference.storageKey !== expectedAsset.storageKey ||
    reference.mediaType !== expectedAsset.mediaType ||
    reference.width !== expectedAsset.width ||
    reference.height !== expectedAsset.height ||
    (reference.byteLength !== undefined && reference.byteLength !== expectedAsset.byteLength) ||
    !rectsMatch(reference.crop, expectedAsset.crop)
  ) {
    throw new PersistenceError("reference-mismatch", "CaptureRecord screenshot reference did not match the asset.");
  }
}

async function verifyStoredAssetBlob(asset: StoredScreenshotAsset) {
  if (
    !(asset.blob instanceof Blob) ||
    asset.blob.type !== "image/png" ||
    asset.blob.size <= 0 ||
    asset.blob.size !== asset.byteLength
  ) {
    throw new PersistenceError("readback", "Saved screenshot asset blob did not match metadata.");
  }

  const dimensions = await decodeBlobDimensions(asset.blob);
  if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
    throw new PersistenceError("readback", "Saved screenshot decoded dimensions did not match metadata.");
  }
}

async function decodeBlobDimensions(blob: Blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dimensions = {
      width: bitmap.width,
      height: bitmap.height
    };
    bitmap.close();
    return dimensions;
  }

  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight
      };
      URL.revokeObjectURL(objectUrl);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new PersistenceError("readback", "Saved screenshot asset could not be decoded."));
    };
    image.src = objectUrl;
  });
}

async function cleanupCommittedSaveFailure(storageKey: string, recordId: string, originalError: PersistenceError) {
  try {
    await deletePersistenceBundle({ storageKey, recordId });
    await verifySaveCleanup(storageKey, recordId);
  } catch (cleanupError) {
    throw new PersistenceError("cleanup", "Save failed after commit and cleanup also failed.", {
      originalError,
      cleanupError
    });
  }
}

async function verifySaveCleanup(storageKey: string, recordId: string) {
  const [asset, record] = await Promise.all([readScreenshotAsset(storageKey), readRecordEntry(recordId)]);

  if (asset || record) {
    throw new PersistenceError("cleanup", "Failed save cleanup left local data behind.");
  }
}

function createSavedAtTimestamp() {
  return new Date().toISOString();
}

function isNormalizedIsoTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
