import type { JsonObject, SerializableRect } from "../shared/capture-schema";
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

export async function deleteRecordEntry(id: string) {
  await withDatabase(async (database) => {
    const transaction = database.transaction(CAPTURE_RECORD_STORE_NAME, "readwrite");
    transaction.objectStore(CAPTURE_RECORD_STORE_NAME).delete(id);
    await waitForTransaction(transaction, "cleanup");
  });
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

function isNormalizedIsoTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
