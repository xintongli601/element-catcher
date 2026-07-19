import type { JsonObject, JsonValue, SerializableRect } from "../shared/capture-schema";
import { assertJsonCompatible } from "../shared/json";
import { PersistenceError, toPersistenceError } from "./persistence-errors";

export const ELEMENT_CATCHER_DATABASE_NAME = "element-catcher-local-persistence";
export const ELEMENT_CATCHER_DATABASE_VERSION = 1;
export const SCREENSHOT_ASSET_STORE_NAME = "screenshotAssets";
export const CAPTURE_RECORD_STORE_NAME = "captureRecords";

export type StoredScreenshotAsset = {
  storageKey: string;
  blob: Blob;
  mediaType: "image/png";
  width: number;
  height: number;
  byteLength: number;
  crop: SerializableRect;
};

export type StoredRecordEntry = {
  id: string;
  value: JsonObject;
  savedAt?: string;
};

export type PersistenceBundle = {
  asset: StoredScreenshotAsset;
  record: StoredRecordEntry;
};

export function createScreenshotStorageKey(id: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    throw new PersistenceError("encoding", "Invalid screenshot storage id.");
  }

  return `screenshots/${id}.png`;
}

export async function addScreenshotAsset(asset: StoredScreenshotAsset) {
  validateScreenshotAsset(asset);
  await withDatabase(async (database) => {
    const transaction = database.transaction(SCREENSHOT_ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(SCREENSHOT_ASSET_STORE_NAME).add(asset);
    await waitForTransaction(transaction);
  });
}

export async function readScreenshotAsset(storageKey: string) {
  return withDatabase((database) =>
    requestResult<StoredScreenshotAsset | undefined>(
      database.transaction(SCREENSHOT_ASSET_STORE_NAME, "readonly").objectStore(SCREENSHOT_ASSET_STORE_NAME).get(storageKey)
    )
  );
}

export async function deleteScreenshotAsset(storageKey: string) {
  await withDatabase(async (database) => {
    const transaction = database.transaction(SCREENSHOT_ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(SCREENSHOT_ASSET_STORE_NAME).delete(storageKey);
    await waitForTransaction(transaction, "cleanup");
  });
}

export async function addRecordEntry(record: StoredRecordEntry) {
  validateRecordEntry(record);
  await withDatabase(async (database) => {
    const transaction = database.transaction(CAPTURE_RECORD_STORE_NAME, "readwrite");
    transaction.objectStore(CAPTURE_RECORD_STORE_NAME).add(record);
    await waitForTransaction(transaction);
  });
}

export async function readRecordEntry(id: string) {
  return withDatabase((database) =>
    requestResult<StoredRecordEntry | undefined>(
      database.transaction(CAPTURE_RECORD_STORE_NAME, "readonly").objectStore(CAPTURE_RECORD_STORE_NAME).get(id)
    )
  );
}

export async function readLatestSavedRecordEntry() {
  return withDatabase(
    (database) =>
      new Promise<StoredRecordEntry | undefined>((resolve, reject) => {
        const transaction = database.transaction(CAPTURE_RECORD_STORE_NAME, "readonly");
        const store = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const request = store.openCursor();
        let latest: StoredRecordEntry | undefined;
        let requestError: DOMException | null = null;

        request.onsuccess = () => {
          const cursor = request.result;

          if (!cursor) {
            return;
          }

          const entry = cursor.value as StoredRecordEntry;
          if (entry.savedAt !== undefined) {
            try {
              validateRecordEntry(entry);
            } catch (error) {
              requestError = error instanceof DOMException ? error : null;
              transaction.abort();
              reject(toPersistenceError(error, "validation"));
              return;
            }

            if (!latest || entry.savedAt > latest.savedAt!) {
              latest = entry;
            }
          }

          cursor.continue();
        };

        request.onerror = () => {
          requestError = request.error;
        };
        transaction.oncomplete = () => resolve(latest);
        transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
      })
  );
}

export async function readSavedRecordEntries() {
  return withDatabase(
    (database) =>
      new Promise<StoredRecordEntry[]>((resolve, reject) => {
        const transaction = database.transaction(CAPTURE_RECORD_STORE_NAME, "readonly");
        const store = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const request = store.openCursor();
        const entries: StoredRecordEntry[] = [];
        let requestError: DOMException | null = null;
        let settled = false;

        request.onsuccess = () => {
          const cursor = request.result;

          if (!cursor) {
            return;
          }

          const entry = cursor.value as StoredRecordEntry;
          if (entry.savedAt !== undefined) {
            try {
              validateRecordEntry(entry);
              entries.push(entry);
            } catch (error) {
              settled = true;
              requestError = error instanceof DOMException ? error : null;
              transaction.abort();
              reject(toPersistenceError(error, "validation"));
              return;
            }
          }

          cursor.continue();
        };

        request.onerror = () => {
          requestError = request.error;
        };
        transaction.oncomplete = () => {
          if (!settled) {
            resolve(entries);
          }
        };
        transaction.onabort = () => {
          if (!settled) {
            reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
          }
        };
      })
  );
}

export async function deleteRecordEntry(id: string) {
  await withDatabase(async (database) => {
    const transaction = database.transaction(CAPTURE_RECORD_STORE_NAME, "readwrite");
    transaction.objectStore(CAPTURE_RECORD_STORE_NAME).delete(id);
    await waitForTransaction(transaction, "cleanup");
  });
}

export async function replaceSavedRecordEntry({
  replacement,
  expectedSavedAt
}: {
  replacement: StoredRecordEntry;
  expectedSavedAt: string;
}) {
  validateRecordEntry(replacement);
  if (replacement.savedAt !== expectedSavedAt) {
    throw new PersistenceError("validation", "Replacement savedAt must match the expected savedAt.");
  }

  await withDatabase(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(CAPTURE_RECORD_STORE_NAME, "readwrite");
        const store = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const readRequest = store.get(replacement.id);
        let requestError: DOMException | null = null;
        let settled = false;

        const failAndAbort = (error: PersistenceError) => {
          settled = true;
          try {
            transaction.abort();
          } catch {
            // The transaction may already be inactive after a request error.
          }
          reject(error);
        };

        readRequest.onsuccess = () => {
          const current = readRequest.result as StoredRecordEntry | undefined;

          if (!current) {
            failAndAbort(new PersistenceError("not-found", "Saved CaptureRecord was not found."));
            return;
          }

          try {
            validateRecordEntry(current);
          } catch (error) {
            failAndAbort(toPersistenceError(error, "validation"));
            return;
          }

          if (current.savedAt !== expectedSavedAt) {
            failAndAbort(new PersistenceError("readback", "Saved CaptureRecord changed before metadata update."));
            return;
          }

          store.put(replacement);
        };

        readRequest.onerror = () => {
          requestError = readRequest.error;
        };
        transaction.onerror = (event) => {
          const target = event.target;

          if (!requestError && target instanceof IDBRequest && target.error) {
            requestError = target.error;
          }
        };
        transaction.oncomplete = () => {
          if (!settled) {
            resolve();
          }
        };
        transaction.onabort = () => {
          if (!settled) {
            reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
          }
        };
      })
  );
}

export async function addPersistenceBundle(bundle: PersistenceBundle) {
  validateScreenshotAsset(bundle.asset);
  validateRecordEntry(bundle.record);

  await withDatabase(async (database) => {
    const transaction = database.transaction([SCREENSHOT_ASSET_STORE_NAME, CAPTURE_RECORD_STORE_NAME], "readwrite");
    transaction.objectStore(SCREENSHOT_ASSET_STORE_NAME).add(bundle.asset);
    transaction.objectStore(CAPTURE_RECORD_STORE_NAME).add(bundle.record);
    await waitForTransaction(transaction);
  });
}

export async function deletePersistenceBundle({ storageKey, recordId }: { storageKey: string; recordId: string }) {
  await withDatabase(async (database) => {
    const transaction = database.transaction([SCREENSHOT_ASSET_STORE_NAME, CAPTURE_RECORD_STORE_NAME], "readwrite");
    transaction.objectStore(SCREENSHOT_ASSET_STORE_NAME).delete(storageKey);
    transaction.objectStore(CAPTURE_RECORD_STORE_NAME).delete(recordId);
    await waitForTransaction(transaction, "cleanup");
  });
}

export async function deleteSavedCaptureBundle({
  expectedRecord,
  expectedAsset
}: {
  expectedRecord: StoredRecordEntry;
  expectedAsset: StoredScreenshotAsset;
}) {
  validateRecordEntry(expectedRecord);
  validateScreenshotAsset(expectedAsset);

  if (!expectedRecord.savedAt) {
    throw new PersistenceError("validation", "Expected saved CaptureRecord is missing savedAt.");
  }

  await withDatabase(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction([CAPTURE_RECORD_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME], "readwrite");
        const recordStore = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const assetStore = transaction.objectStore(SCREENSHOT_ASSET_STORE_NAME);
        const recordRequest = recordStore.get(expectedRecord.id);
        const assetRequest = assetStore.get(expectedAsset.storageKey);
        let currentRecord: StoredRecordEntry | undefined;
        let currentAsset: StoredScreenshotAsset | undefined;
        let completedReads = 0;
        let requestError: DOMException | null = null;
        let settled = false;

        const failAndAbort = (error: PersistenceError) => {
          settled = true;
          try {
            transaction.abort();
          } catch {
            // The transaction may already be inactive after a request error.
          }
          reject(error);
        };

        const maybeDelete = () => {
          completedReads += 1;
          if (completedReads !== 2) {
            return;
          }

          try {
            assertDeletionPreconditions({
              currentRecord,
              currentAsset,
              expectedRecord,
              expectedAsset
            });
          } catch (error) {
            failAndAbort(toPersistenceError(error, "validation"));
            return;
          }

          recordStore.delete(expectedRecord.id);
          assetStore.delete(expectedAsset.storageKey);
        };

        recordRequest.onsuccess = () => {
          currentRecord = recordRequest.result as StoredRecordEntry | undefined;
          maybeDelete();
        };
        assetRequest.onsuccess = () => {
          currentAsset = assetRequest.result as StoredScreenshotAsset | undefined;
          maybeDelete();
        };
        recordRequest.onerror = () => {
          requestError = recordRequest.error;
        };
        assetRequest.onerror = () => {
          requestError = assetRequest.error;
        };
        transaction.onerror = (event) => {
          const target = event.target;

          if (!requestError && target instanceof IDBRequest && target.error) {
            requestError = target.error;
          }
        };
        transaction.oncomplete = () => {
          if (!settled) {
            resolve();
          }
        };
        transaction.onabort = () => {
          if (!settled) {
            reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
          }
        };
      })
  );
}

export async function getPersistenceDatabaseInfo() {
  return withDatabase((database) => ({
    name: database.name,
    version: database.version,
    stores: Array.from(database.objectStoreNames)
  }));
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(ELEMENT_CATCHER_DATABASE_NAME, ELEMENT_CATCHER_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      try {
        const database = request.result;

        if (!database.objectStoreNames.contains(SCREENSHOT_ASSET_STORE_NAME)) {
          database.createObjectStore(SCREENSHOT_ASSET_STORE_NAME, { keyPath: "storageKey" });
        }

        if (!database.objectStoreNames.contains(CAPTURE_RECORD_STORE_NAME)) {
          database.createObjectStore(CAPTURE_RECORD_STORE_NAME, { keyPath: "id" });
        }
      } catch (error) {
        reject(new PersistenceError("database-upgrade", undefined, error));
      }
    };

    request.onblocked = () => reject(new PersistenceError("blocked"));
    request.onerror = () => reject(toPersistenceError(request.error, "database-open"));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T> | T) {
  const database = await openDatabase();

  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

function waitForTransaction(transaction: IDBTransaction, fallbackCode: "transaction" | "cleanup" = "transaction") {
  return new Promise<void>((resolve, reject) => {
    let requestError: DOMException | null = null;

    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requestError, fallbackCode));
    transaction.onerror = (event) => {
      const target = event.target;

      if (!requestError && target instanceof IDBRequest && target.error) {
        requestError = target.error;
      }
    };
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toPersistenceError(request.error, "transaction"));
  });
}

function validateScreenshotAsset(asset: StoredScreenshotAsset) {
  if (!asset.storageKey || !asset.storageKey.startsWith("screenshots/") || !asset.storageKey.endsWith(".png")) {
    throw new PersistenceError("encoding", "Invalid screenshot storage key.");
  }

  if (!(asset.blob instanceof Blob) || asset.blob.type !== "image/png" || asset.blob.size <= 0) {
    throw new PersistenceError("encoding", "Invalid screenshot asset blob.");
  }

  if (
    asset.mediaType !== "image/png" ||
    asset.width <= 0 ||
    asset.height <= 0 ||
    asset.byteLength <= 0 ||
    asset.byteLength !== asset.blob.size
  ) {
    throw new PersistenceError("encoding", "Invalid screenshot asset metadata.");
  }
}

function validateRecordEntry(record: StoredRecordEntry) {
  if (!record.id) {
    throw new PersistenceError("encoding", "Invalid record id.");
  }

  assertJsonCompatible(record.value);

  if (record.savedAt !== undefined && !isNormalizedIsoTimestamp(record.savedAt)) {
    throw new PersistenceError("validation", "Invalid savedAt timestamp.");
  }
}

function assertDeletionPreconditions({
  currentRecord,
  currentAsset,
  expectedRecord,
  expectedAsset
}: {
  currentRecord: StoredRecordEntry | undefined;
  currentAsset: StoredScreenshotAsset | undefined;
  expectedRecord: StoredRecordEntry;
  expectedAsset: StoredScreenshotAsset;
}) {
  if (!currentRecord) {
    throw new PersistenceError("not-found", "Saved CaptureRecord was not found.");
  }

  if (!currentAsset) {
    throw new PersistenceError("not-found", "Saved screenshot asset was not found.");
  }

  validateRecordEntry(currentRecord);
  validateScreenshotAsset(currentAsset);

  if (currentRecord.id !== expectedRecord.id) {
    throw new PersistenceError("readback", "Saved CaptureRecord wrapper id changed before deletion.");
  }

  if (currentRecord.savedAt !== expectedRecord.savedAt) {
    throw new PersistenceError("readback", "Saved CaptureRecord changed before deletion.");
  }

  const currentStorageKey = getScreenshotStorageKeyFromRecordValue(currentRecord.value);
  if (currentStorageKey !== expectedAsset.storageKey) {
    throw new PersistenceError("reference-mismatch", "Saved CaptureRecord screenshot reference changed before deletion.");
  }

  if (!jsonValuesEqual(currentRecord.value, expectedRecord.value)) {
    throw new PersistenceError("readback", "Saved CaptureRecord JSON changed before deletion.");
  }

  if (!storedScreenshotAssetsMatch(currentAsset, expectedAsset)) {
    throw new PersistenceError("readback", "Saved screenshot asset changed before deletion.");
  }
}

function getScreenshotStorageKeyFromRecordValue(value: JsonObject) {
  const assets = value.assets;
  if (!assets || typeof assets !== "object" || Array.isArray(assets)) {
    return undefined;
  }

  const screenshot = (assets as JsonObject).screenshot;
  if (!screenshot || typeof screenshot !== "object" || Array.isArray(screenshot)) {
    return undefined;
  }

  return typeof screenshot.storageKey === "string" ? screenshot.storageKey : undefined;
}

function storedScreenshotAssetsMatch(left: StoredScreenshotAsset, right: StoredScreenshotAsset) {
  return (
    left.storageKey === right.storageKey &&
    left.mediaType === right.mediaType &&
    left.width === right.width &&
    left.height === right.height &&
    left.byteLength === right.byteLength &&
    left.blob.type === right.blob.type &&
    left.blob.size === right.blob.size &&
    rectsEqual(left.crop, right.crop)
  );
}

function rectsEqual(left: SerializableRect, right: SerializableRect) {
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

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => jsonValuesEqual(item, right[index]));
  }

  if (isPlainJsonObject(left) || isPlainJsonObject(right)) {
    if (!isPlainJsonObject(left) || !isPlainJsonObject(right)) {
      return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonValuesEqual(left[key], right[key]))
    );
  }

  return false;
}

function isPlainJsonObject(value: JsonValue): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNormalizedIsoTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
