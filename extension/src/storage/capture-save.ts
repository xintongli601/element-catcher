import type { CaptureRecord, JsonObject, ScreenshotCaptureResult } from "../shared/capture-schema";
import {
  jsonValuesEqual,
  parseCaptureRecordV1,
  serializeCaptureRecordV1,
  validateCaptureRecordV1,
  validateNewCaptureRecordV1Candidate
} from "../capture/capture-record-v1";
import {
  normalizeLibraryMetadataInput,
  type LibraryMetadataInput
} from "../library/library-metadata";
import {
  addPersistenceBundle,
  deleteSavedCaptureBundle,
  deletePersistenceBundle,
  readLatestSavedRecordEntry,
  readRecordEntry,
  readSavedRecordEntries,
  readScreenshotAsset,
  replaceSavedRecordEntry,
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

export type DeletedSavedCaptureResult = {
  recordId: string;
  storageKey: string;
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

export async function updateSavedCaptureLibraryMetadata(
  recordId: string,
  input: LibraryMetadataInput,
  expectedSavedAt: string
): Promise<SavedCaptureReadModel> {
  const normalizedMetadata = normalizeLibraryMetadataInput(input);
  const original = await loadSavedCaptureById(recordId);
  if (original.savedAt !== expectedSavedAt) {
    throw new PersistenceError("readback", "Saved CaptureRecord changed before metadata update.");
  }

  const originalWrapper = await readOriginalWrapper(recordId, original.savedAt);
  const originalSerializedRecord = serializeCaptureRecordV1(original.record);
  const originalAssetDigest = await digestBlob(original.asset.blob);
  const expectedRecord: CaptureRecord = {
    ...original.record,
    library: normalizedMetadata
  };
  validateCaptureRecordV1(expectedRecord);

  const expectedSerializedRecord = serializeCaptureRecordV1(expectedRecord);
  const replacement: StoredRecordEntry = {
    id: original.record.id,
    value: expectedSerializedRecord,
    savedAt: original.savedAt
  };
  let committed = false;

  try {
    await replaceSavedRecordEntry({
      replacement,
      expectedSavedAt: original.savedAt
    });
    committed = true;

    return await verifyMetadataUpdateReadback({
      expectedRecord,
      expectedMetadata: normalizedMetadata,
      expectedAsset: original.asset,
      expectedAssetDigest: originalAssetDigest,
      expectedSavedAt: original.savedAt,
      expectedSerializedRecord
    });
  } catch (error) {
    const persistenceError = toPersistenceError(error);

    if (!committed) {
      throw persistenceError;
    }

    await restoreOriginalMetadataUpdateWrapper({
      recordId,
      originalWrapper,
      originalRecord: original.record,
      originalSerializedRecord,
      originalAsset: original.asset,
      originalAssetDigest,
      originalSavedAt: original.savedAt,
      originalError: persistenceError
    });
    throw persistenceError;
  }
}

export async function deleteSavedCapture(
  recordId: string,
  expectedSavedAt: string
): Promise<DeletedSavedCaptureResult> {
  const original = await loadSavedCaptureById(recordId);
  if (original.savedAt !== expectedSavedAt) {
    throw new PersistenceError("readback", "Saved CaptureRecord changed before deletion.");
  }

  const originalSerializedRecord = serializeCaptureRecordV1(original.record);
  const originalWrapper = await readExactOriginalWrapper(
    recordId,
    original.savedAt,
    originalSerializedRecord,
    "deletion"
  );
  const originalAssetDigest = await digestBlob(original.asset.blob);
  let committed = false;

  try {
    await deleteSavedCaptureBundle({
      expectedRecord: originalWrapper,
      expectedAsset: original.asset
    });
    committed = true;

    await verifyDeletedCaptureAbsent(recordId, original.asset.storageKey);
    return {
      recordId,
      storageKey: original.asset.storageKey
    };
  } catch (error) {
    const persistenceError = toPersistenceError(error);

    if (!committed) {
      throw persistenceError;
    }

    await restoreDeletedCaptureBundle({
      recordId,
      originalWrapper,
      originalRecord: original.record,
      originalSerializedRecord,
      originalAsset: original.asset,
      originalAssetDigest,
      originalSavedAt: original.savedAt,
      originalError: persistenceError
    });
    throw persistenceError;
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

async function readOriginalWrapper(recordId: string, expectedSavedAt: string, operation = "metadata update") {
  const originalWrapper = await readRecordEntry(recordId);

  if (!originalWrapper) {
    throw new PersistenceError("not-found", "Saved CaptureRecord was not found.");
  }

  if (originalWrapper.id !== recordId || originalWrapper.savedAt !== expectedSavedAt) {
    throw new PersistenceError("readback", `Saved CaptureRecord wrapper changed before ${operation}.`);
  }

  return originalWrapper;
}

async function readExactOriginalWrapper(
  recordId: string,
  expectedSavedAt: string,
  expectedSerializedRecord: JsonObject,
  operation: string
) {
  const originalWrapper = await readOriginalWrapper(recordId, expectedSavedAt, operation);

  if (!jsonValuesEqual(originalWrapper.value, expectedSerializedRecord)) {
    throw new PersistenceError("readback", `Saved CaptureRecord wrapper changed before ${operation}.`);
  }

  return originalWrapper;
}

async function verifyMetadataUpdateReadback({
  expectedRecord,
  expectedMetadata,
  expectedAsset,
  expectedAssetDigest,
  expectedSavedAt,
  expectedSerializedRecord
}: {
  expectedRecord: CaptureRecord;
  expectedMetadata: CaptureRecord["library"];
  expectedAsset: StoredScreenshotAsset;
  expectedAssetDigest: string;
  expectedSavedAt: string;
  expectedSerializedRecord: JsonObject;
}) {
  const readModel = await loadSavedCaptureById(expectedRecord.id);

  if (readModel.record.id !== expectedRecord.id) {
    throw new PersistenceError("readback", "Updated CaptureRecord id changed after read-back.");
  }

  if (readModel.savedAt !== expectedSavedAt) {
    throw new PersistenceError("readback", "Updated CaptureRecord savedAt changed after read-back.");
  }

  if (!jsonValuesEqual(serializeCaptureRecordV1(readModel.record), expectedSerializedRecord)) {
    throw new PersistenceError("readback", "Updated CaptureRecord did not match expected metadata.");
  }

  if (!libraryMetadataMatches(readModel.record.library, expectedMetadata)) {
    throw new PersistenceError("readback", "Updated library metadata did not match expected normalized metadata.");
  }

  verifyStoredScreenshotAsset(readModel.asset, expectedAsset);
  const readbackDigest = await digestBlob(readModel.asset.blob);
  if (readbackDigest !== expectedAssetDigest) {
    throw new PersistenceError("readback", "Updated capture screenshot asset digest changed.");
  }

  return readModel;
}

function libraryMetadataMatches(left: CaptureRecord["library"], right: CaptureRecord["library"]) {
  return (
    left.title === right.title &&
    left.componentType === right.componentType &&
    left.notes === right.notes &&
    left.tags.length === right.tags.length &&
    left.tags.every((tag, index) => tag === right.tags[index])
  );
}

async function restoreOriginalMetadataUpdateWrapper({
  recordId,
  originalWrapper,
  originalRecord,
  originalSerializedRecord,
  originalAsset,
  originalAssetDigest,
  originalSavedAt,
  originalError
}: {
  recordId: string;
  originalWrapper: StoredRecordEntry;
  originalRecord: CaptureRecord;
  originalSerializedRecord: JsonObject;
  originalAsset: StoredScreenshotAsset;
  originalAssetDigest: string;
  originalSavedAt: string;
  originalError: PersistenceError;
}) {
  try {
    await replaceSavedRecordEntry({
      replacement: originalWrapper,
      expectedSavedAt: originalSavedAt
    });
    await verifyMetadataUpdateReadback({
      expectedRecord: originalRecord,
      expectedMetadata: originalRecord.library,
      expectedAsset: originalAsset,
      expectedAssetDigest: originalAssetDigest,
      expectedSavedAt: originalSavedAt,
      expectedSerializedRecord: originalSerializedRecord
    });
  } catch (cleanupError) {
    throw new PersistenceError("cleanup", "Metadata update failed after commit and rollback also failed.", {
      recordId,
      originalError,
      cleanupError
    });
  }
}

async function verifyDeletedCaptureAbsent(recordId: string, storageKey: string) {
  const [storedRecord, storedAsset] = await Promise.all([readRecordEntry(recordId), readScreenshotAsset(storageKey)]);

  if (storedRecord || storedAsset) {
    throw new PersistenceError("readback", "Deleted capture remained in local persistence after deletion.");
  }
}

async function restoreDeletedCaptureBundle({
  recordId,
  originalWrapper,
  originalRecord,
  originalSerializedRecord,
  originalAsset,
  originalAssetDigest,
  originalSavedAt,
  originalError
}: {
  recordId: string;
  originalWrapper: StoredRecordEntry;
  originalRecord: CaptureRecord;
  originalSerializedRecord: JsonObject;
  originalAsset: StoredScreenshotAsset;
  originalAssetDigest: string;
  originalSavedAt: string;
  originalError: PersistenceError;
}) {
  try {
    await addPersistenceBundle({
      asset: originalAsset,
      record: originalWrapper
    });

    const restored = await loadSavedCaptureById(recordId);
    if (restored.savedAt !== originalSavedAt) {
      throw new PersistenceError("readback", "Restored deleted CaptureRecord savedAt did not match.");
    }

    if (!jsonValuesEqual(serializeCaptureRecordV1(restored.record), originalSerializedRecord)) {
      throw new PersistenceError("readback", "Restored deleted CaptureRecord JSON did not match.");
    }

    verifyStoredScreenshotAsset(restored.asset, originalAsset);
    const restoredDigest = await digestBlob(restored.asset.blob);
    if (restoredDigest !== originalAssetDigest) {
      throw new PersistenceError("readback", "Restored deleted screenshot asset digest did not match.");
    }

    verifyScreenshotReference(originalRecord, restored.asset);
  } catch (cleanupError) {
    throw new PersistenceError("cleanup", "Delete failed after commit and restore also failed.", {
      recordId,
      originalError,
      cleanupError
    });
  }
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
