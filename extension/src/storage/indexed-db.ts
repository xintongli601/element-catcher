import type { JsonObject, JsonValue, SerializableRect } from "../shared/capture-schema";
import { validateCaptureRecordV1 } from "../capture/capture-record-v1";
import {
  GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME,
  GENERATED_COMPONENT_VERSION_STORE_NAME,
  isValidCaptureId,
  isValidGeneratedComponentVersionId,
  isValidLogicalAttemptId,
  isValidSha256Hex,
  validateGeneratedComponentVersionEntry,
  validateGeneratedComponentVersionEntryV1,
  type GeneratedComponentVersionEntry,
  type GeneratedComponentVersionEntryV1
} from "../shared/generated-version-contract";
import { REQUESTED_OUTPUT } from "../shared/generation-contract";
import {
  INTERACTIVE_RECONSTRUCTION_STORE_NAME,
  validateInteractionReconstructionEntryV1,
  type InteractionReconstructionEntryV1
} from "../shared/interactive-reconstruction-contract";
import { validateInteractionPairV1, type InteractionPairV1 } from "../shared/interaction-pair-contract";
import { assertJsonCompatible } from "../shared/json";
import { createScreenshotStorageKey } from "../shared/screenshot-storage";
import { canonicalJsonStringify, type CanonicalJsonValue } from "../generation/canonical-json";
import { buildExactCaptureContextProjection } from "../generation/projection";
import {
  computeCurrentCaptureProjectionFingerprint,
  computeSourceGeneratedVersionFingerprint,
  deriveRevisionGeneratedVersionId
} from "../generation/revision-contract";
import { PersistenceError, toPersistenceError } from "./persistence-errors";

declare global {
  interface Window {
    __EC_GENERATED_VERSION_PERSISTENCE_TEST_HARNESS__?: {
      failBeforeAddCount?: number;
      pauseBeforeAdd?: boolean;
      releaseBeforeAdd?: boolean;
      beforeAddCalls: number;
      attempts: Array<{
        id: string;
        createdAt: string;
        componentName: string;
      }>;
    };
    __EC_GENERATED_VERSION_V2_PERSISTENCE_TEST_HARNESS__?: {
      enabled: true;
      failBeforeAddCount?: number;
      pauseBeforeAdd?: boolean;
      releaseBeforeAdd?: boolean;
      failAfterCommitCount?: number;
      pauseAfterCommit?: boolean;
      releaseAfterCommit?: boolean;
      beforeAddCalls: number;
      afterCommitCalls: number;
      attempts: Array<{
        id: string;
        logicalAttemptId: string;
        sourceGeneratedVersionId: string;
        componentName: string;
      }>;
    };
    __EC_GENERATED_VERSION_V2_TRANSACTION_COMPLETE_HOOK__?: () => void;
    __EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE_ENABLED__?: true;
    __EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__?: {
      addGeneratedComponentVersion(input: {
        entry: GeneratedComponentVersionEntryV1;
        expectedSourceSavedAt: string;
        expectedReviewFingerprint: string;
        expectedSourceRecordValue: JsonObject;
      }): Promise<GeneratedVersionStorageBridgeResult<GeneratedComponentVersionEntryV1>>;
      persistPendingGeneratedComponentVersionV2(input: Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">): Promise<GeneratedVersionStorageBridgeResult<GeneratedVersionEntryV2>>;
      persistPendingGeneratedComponentVersionV2PreAborted(input: Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">): Promise<GeneratedVersionStorageBridgeResult<GeneratedVersionEntryV2>>;
      persistPendingGeneratedComponentVersionV2AbortBeforeAdd(input: Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">): Promise<GeneratedVersionStorageBridgeResult<GeneratedVersionEntryV2>>;
      persistPendingGeneratedComponentVersionV2AbortAtCommitBoundary(input: Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">): Promise<GeneratedVersionStorageBridgeResult<GeneratedVersionEntryV2>>;
      persistPendingGeneratedComponentVersionV2ReadBackMismatch(input: Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">): Promise<GeneratedVersionStorageBridgeResult<GeneratedVersionEntryV2>>;
      persistPendingGeneratedComponentVersionV2MutateDuringDigest(input: Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">, mutation: GeneratedVersionV2DigestMutation): Promise<GeneratedVersionStorageBridgeResult<GeneratedVersionEntryV2>>;
      persistPendingGeneratedComponentVersionV2ProbeReturnedMutation(input: Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">): Promise<GeneratedVersionStorageBridgeResult<{ value: GeneratedVersionEntryV2; summaryAfterMutation: string; mutationThrew: boolean }>>;
      recoverGeneratedComponentVersionV2(input: RecoverGeneratedComponentVersionV2Input): Promise<GeneratedVersionStorageBridgeResult<GeneratedVersionEntryV2 | undefined>>;
      getGeneratedComponentVersionUnionById(id: string): Promise<GeneratedVersionStorageBridgeResult<GeneratedComponentVersionEntry | undefined>>;
      listGeneratedComponentVersionUnionBySourceCaptureId(sourceCaptureId: string): Promise<GeneratedVersionStorageBridgeResult<GeneratedComponentVersionEntry[]>>;
      getGeneratedComponentVersionById(id: string): Promise<GeneratedVersionStorageBridgeResult<GeneratedComponentVersionEntryV1 | undefined>>;
      listGeneratedComponentVersionsBySourceCaptureId(sourceCaptureId: string): Promise<GeneratedVersionStorageBridgeResult<GeneratedComponentVersionEntryV1[]>>;
    };
  }
}

type GeneratedVersionStorageBridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; name: string; message: string };

type GeneratedVersionEntryV2 = Extract<GeneratedComponentVersionEntry, { contractVersion: 2 }>;
type PersistPendingGeneratedComponentVersionV2Data = Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">;
type PreparedPendingGeneratedComponentVersionV2Input = PersistPendingGeneratedComponentVersionV2Data & { signal: AbortSignal };

type GeneratedVersionV2DigestMutation =
  | { kind: "logicalAttemptId"; value: string }
  | { kind: "sourceGeneratedVersionFingerprint"; value: string }
  | { kind: "sourceReviewFingerprint"; value: string }
  | { kind: "canonicalSourceGeneratedVersionEntry"; value: string }
  | { kind: "canonicalCurrentCaptureProjection"; value: string }
  | { kind: "pendingSummary"; value: string };

export const ELEMENT_CATCHER_DATABASE_NAME = "element-catcher-local-persistence";
export const ELEMENT_CATCHER_DATABASE_VERSION = 4;
export const SCREENSHOT_ASSET_STORE_NAME = "screenshotAssets";
export const CAPTURE_RECORD_STORE_NAME = "captureRecords";
export const INTERACTION_PAIR_STORE_NAME = "interactionPairs";
export const INTERACTION_RECONSTRUCTION_PAIR_INDEX_NAME = "sourceInteractionPairId";
export { GENERATED_COMPONENT_VERSION_STORE_NAME };
export { createScreenshotStorageKey };

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

export type StoredInteractionPairEntry = InteractionPairV1;
export type StoredInteractionReconstructionEntry = InteractionReconstructionEntryV1;

export type PersistPendingGeneratedComponentVersionV2Input = {
  pendingEntry: GeneratedVersionEntryV2;
  sourceCaptureId: string;
  sourceCaptureSavedAt: string;
  sourceGeneratedVersionId: string;
  canonicalSourceGeneratedVersionEntry: string;
  canonicalCurrentCaptureProjection: string;
  screenshotIncluded: boolean;
  expectedScreenshotStorageKey: string;
  screenshot?: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
  };
  targetGeneratedVersionId: string;
  signal: AbortSignal;
};

export type RecoverGeneratedComponentVersionV2Input = {
  targetGeneratedVersionId: string;
  expectedSourceCaptureId?: string;
  expectedSourceGeneratedVersionId?: string;
  expectedLogicalAttemptId?: string;
  expectedReviewAttemptFingerprint?: string;
};

export type PersistenceBundle = {
  asset: StoredScreenshotAsset;
  record: StoredRecordEntry;
};

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
        const transaction = database.transaction([CAPTURE_RECORD_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME], "readwrite");
        const recordStore = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const assetStore = transaction.objectStore(SCREENSHOT_ASSET_STORE_NAME);
        const generatedStore = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME);
        const generatedIndex = generatedStore.index(GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME);
        const recordRequest = recordStore.get(expectedRecord.id);
        const assetRequest = assetStore.get(expectedAsset.storageKey);
        const versionsRequest = generatedIndex.getAllKeys(expectedRecord.id);
        let currentRecord: StoredRecordEntry | undefined;
        let currentAsset: StoredScreenshotAsset | undefined;
        let generatedVersionKeys: IDBValidKey[] = [];
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
          if (completedReads !== 3) {
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

          try {
            for (const key of generatedVersionKeys) {
              generatedStore.delete(key);
            }
            recordStore.delete(expectedRecord.id);
            assetStore.delete(expectedAsset.storageKey);
          } catch (error) {
            failAndAbort(toPersistenceError(error, "transaction"));
          }
        };

        recordRequest.onsuccess = () => {
          currentRecord = recordRequest.result as StoredRecordEntry | undefined;
          maybeDelete();
        };
        assetRequest.onsuccess = () => {
          currentAsset = assetRequest.result as StoredScreenshotAsset | undefined;
          maybeDelete();
        };
        versionsRequest.onsuccess = () => {
          generatedVersionKeys = versionsRequest.result;
          maybeDelete();
        };
        recordRequest.onerror = () => {
          requestError = recordRequest.error;
        };
        assetRequest.onerror = () => {
          requestError = assetRequest.error;
        };
        versionsRequest.onerror = () => {
          requestError = versionsRequest.error;
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

export async function addGeneratedComponentVersion({
  entry,
  expectedSourceSavedAt,
  expectedReviewFingerprint,
  expectedSourceRecordValue,
  signal
}: {
  entry: GeneratedComponentVersionEntryV1;
  expectedSourceSavedAt: string;
  expectedReviewFingerprint: string;
  expectedSourceRecordValue: JsonObject;
  signal: AbortSignal;
}) {
  throwIfAborted(signal);
  validateGeneratedComponentVersionEntryV1(entry);
  assertJsonCompatible(expectedSourceRecordValue);
  if (entry.sourceCaptureSavedAt !== expectedSourceSavedAt || entry.sourceReviewFingerprint !== expectedReviewFingerprint) {
    throw new PersistenceError("validation", "Generated version source linkage did not match.");
  }

  return withDatabase(
    (database) =>
      new Promise<GeneratedComponentVersionEntryV1>((resolve, reject) => {
        throwIfAborted(signal);
        const transaction = database.transaction([CAPTURE_RECORD_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME], "readwrite");
        const recordStore = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const assetStore = transaction.objectStore(SCREENSHOT_ASSET_STORE_NAME);
        const versionStore = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME);
        const sourceRequest = recordStore.get(entry.sourceCaptureId);
        let settled = false;
        let confirmedEntry: GeneratedComponentVersionEntryV1 | undefined;
        let requestError: DOMException | null = null;
        let abortError: DOMException | null = null;

        const cleanupAbortListener = () => signal.removeEventListener("abort", abortTransaction);
        const abortTransaction = () => {
          abortError = createAbortError();
          try {
            transaction.abort();
          } catch {
            // The transaction may have already completed or aborted.
          }
        };
        signal.addEventListener("abort", abortTransaction, { once: true });

        const confirmAfterReadBack = (confirmed: GeneratedComponentVersionEntryV1) => {
          confirmedEntry = confirmed;
        };

        const failAndAbort = (error: PersistenceError) => {
          cleanupAbortListener();
          settled = true;
          try {
            transaction.abort();
          } catch {
            // The transaction may already be inactive after a request error.
          }
          reject(error);
        };

        sourceRequest.onsuccess = () => {
          if (signal.aborted) {
            abortTransaction();
            return;
          }
          const source = sourceRequest.result as StoredRecordEntry | undefined;
          try {
            if (!source) {
              throw new PersistenceError("not-found", "Generated version source capture was not found.");
            }
            validateGeneratedVersionSource(source, entry.sourceCaptureId);
            if (source.id !== entry.sourceCaptureId || source.savedAt !== expectedSourceSavedAt) {
              throw new PersistenceError("readback", "Generated version source capture changed before persistence.");
            }
            if (!jsonValuesEqual(source.value, expectedSourceRecordValue)) {
              throw new PersistenceError("readback", "Generated version source content changed before persistence.");
            }
            const screenshotKey = getScreenshotStorageKeyFromRecordValue(source.value);
            if (!screenshotKey) {
              throw new PersistenceError("reference-mismatch", "Generated version source screenshot reference was invalid.");
            }
            const assetRequest = assetStore.get(screenshotKey);
            assetRequest.onsuccess = () => {
              if (signal.aborted) {
                abortTransaction();
                return;
              }
              try {
                validateScreenshotAsset(assetRequest.result as StoredScreenshotAsset | undefined);
              } catch (error) {
                failAndAbort(toPersistenceError(error, "not-found"));
                return;
              }
              const addEntry = () => {
                const addRequest = versionStore.add(entry);
                addRequest.onsuccess = () => {
                  if (signal.aborted) {
                    abortTransaction();
                    return;
                  }
                  const readbackRequest = versionStore.get(entry.id);
                  readbackRequest.onsuccess = () => {
                    if (signal.aborted) {
                      abortTransaction();
                      return;
                    }
                    try {
                      const readback = readbackRequest.result as GeneratedComponentVersionEntryV1 | undefined;
                      validateGeneratedComponentVersionEntryV1(readback);
                      if (!generatedComponentVersionEntriesCanonicalEqual(readback, entry)) {
                        throw new PersistenceError("readback", "Generated version read-back did not match.");
                      }
                      confirmAfterReadBack(readback);
                    } catch (error) {
                      failAndAbort(toPersistenceError(error, "readback"));
                    }
                  };
                  readbackRequest.onerror = () => {
                    requestError = readbackRequest.error;
                  };
                };
                addRequest.onerror = (event) => {
                  event.preventDefault();
                  const existingRequest = versionStore.get(entry.id);
                  existingRequest.onsuccess = () => {
                    try {
                      const existing = existingRequest.result as GeneratedComponentVersionEntryV1 | undefined;
                      validateGeneratedComponentVersionEntryV1(existing);
                      if (!generatedComponentVersionEntriesCanonicalEqual(existing, entry)) {
                        throw new PersistenceError("persistence-conflict", "Generated version id conflicted.");
                      }
                      confirmAfterReadBack(existing);
                    } catch (error) {
                      failAndAbort(toPersistenceError(error, "persistence-conflict"));
                    }
                  };
                  existingRequest.onerror = () => {
                    requestError = existingRequest.error;
                  };
                };
              };
              try {
                const paused = applyGeneratedVersionPersistenceTestHarness({
                  entry,
                  recordStore,
                  onContinue: addEntry,
                  onError: (error) => {
                    requestError = error instanceof DOMException ? error : null;
                    failAndAbort(toPersistenceError(error, "persistence-failed"));
                  },
                  signal,
                  abortTransaction
                });
                if (paused) {
                  return;
                }
              } catch (error) {
                failAndAbort(toPersistenceError(error, "persistence-failed"));
                return;
              }
              addEntry();
            };
            assetRequest.onerror = () => {
              requestError = assetRequest.error;
            };
          } catch (error) {
            failAndAbort(toPersistenceError(error, "persistence-failed"));
          }
        };
        sourceRequest.onerror = () => {
          requestError = sourceRequest.error;
        };
        transaction.onerror = (event) => {
          const target = event.target;
          if (!requestError && target instanceof IDBRequest && target.error) {
            requestError = target.error;
          }
        };
        transaction.onabort = () => {
          cleanupAbortListener();
          if (!settled) {
            reject(abortError ?? toPersistenceError(transaction.error ?? requestError, "persistence-failed"));
          }
        };
        transaction.oncomplete = () => {
          cleanupAbortListener();
          if (settled) {
            return;
          }
          if (!confirmedEntry) {
            reject(new PersistenceError("readback", "Generated version persistence completed without a validated read-back."));
            return;
          }
          settled = true;
          resolve(confirmedEntry);
        };
      })
  );
}

export async function persistPendingGeneratedComponentVersionV2(input: PersistPendingGeneratedComponentVersionV2Input) {
  const prepared = await preparePendingGeneratedComponentVersionV2Input(input);
  throwIfAborted(prepared.signal);

  return withDatabase(
    (database) =>
      new Promise<GeneratedVersionEntryV2>((resolve, reject) => {
        throwIfAborted(prepared.signal);
        const transaction = database.transaction([CAPTURE_RECORD_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME], "readwrite");
        const recordStore = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const assetStore = transaction.objectStore(SCREENSHOT_ASSET_STORE_NAME);
        const versionStore = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME);
        const recordRequest = recordStore.get(prepared.sourceCaptureId);
        const sourceRequest = versionStore.get(prepared.sourceGeneratedVersionId);
        const targetRequest = versionStore.get(prepared.targetGeneratedVersionId);
        let currentRecord: StoredRecordEntry | undefined;
        let currentSource: GeneratedComponentVersionEntry | undefined;
        let existingTarget: unknown;
        let confirmedEntry: GeneratedVersionEntryV2 | undefined;
        let completedReads = 0;
        let requestError: DOMException | null = null;
        let abortError: DOMException | null = null;
        let settled = false;

        const cleanupAbortListener = () => prepared.signal.removeEventListener("abort", abortTransaction);
        const abortTransaction = () => {
          abortError = createAbortError();
          try {
            transaction.abort();
          } catch {
            // The transaction may already be inactive after completion or abort.
          }
        };
        prepared.signal.addEventListener("abort", abortTransaction, { once: true });

        const failAndAbort = (error: PersistenceError) => {
          settled = true;
          cleanupAbortListener();
          try {
            transaction.abort();
          } catch {
            // The transaction may already be inactive after a request error.
          }
          reject(error);
        };

        const maybeValidateAndPersist = () => {
          completedReads += 1;
          if (completedReads !== 3) {
            return;
          }
          if (prepared.signal.aborted) {
            abortTransaction();
            return;
          }

          try {
            validateStoredV2Preconditions({
              prepared,
              currentRecord,
              currentSource
            });
          } catch (error) {
            failAndAbort(toPersistenceError(error, "persistence-failed"));
            return;
          }

          const screenshotKey = getScreenshotStorageKeyFromRecordValue(currentRecord!.value);
          const assetRequest = assetStore.get(screenshotKey!);
          assetRequest.onsuccess = () => {
            if (prepared.signal.aborted) {
              abortTransaction();
              return;
            }
            try {
              validateStoredV2ScreenshotPreconditions({
                prepared,
                currentRecord: currentRecord!,
                currentAsset: assetRequest.result as StoredScreenshotAsset | undefined
              });
              persistOrConfirmTarget();
            } catch (error) {
              failAndAbort(toPersistenceError(error, "persistence-failed"));
            }
          };
          assetRequest.onerror = () => {
            requestError = assetRequest.error;
          };
        };

        const persistOrConfirmTarget = () => {
          if (existingTarget !== undefined) {
            try {
              validateGeneratedVersionEntryV2(existingTarget);
              if (!generatedComponentVersionEntriesCanonicalEqual(existingTarget, prepared.pendingEntry)) {
                throw new PersistenceError("persistence-conflict", "Generated version id conflicted.");
              }
              const readbackRequest = versionStore.get(prepared.targetGeneratedVersionId);
              readbackRequest.onsuccess = () => confirmReadBack(readbackRequest.result);
              readbackRequest.onerror = () => {
                requestError = readbackRequest.error;
              };
            } catch (error) {
              failAndAbort(toPersistenceError(error, "persistence-conflict"));
            }
            return;
          }

          const addEntry = () => {
            const addRequest = versionStore.add(prepared.pendingEntry);
            addRequest.onsuccess = () => {
              if (prepared.signal.aborted) {
                abortTransaction();
                return;
              }
              const readbackRequest = versionStore.get(prepared.targetGeneratedVersionId);
              readbackRequest.onsuccess = () => confirmReadBack(readbackRequest.result);
              readbackRequest.onerror = () => {
                requestError = readbackRequest.error;
              };
            };
            addRequest.onerror = (event) => {
              event.preventDefault();
              failAndAbort(new PersistenceError("persistence-conflict", "Generated version id conflicted."));
            };
          };

          try {
            if (
              applyGeneratedVersionV2PersistenceTestHarness({
                prepared,
                recordStore,
                onContinue: addEntry,
                onError: (error) => failAndAbort(toPersistenceError(error, "persistence-failed")),
                signal: prepared.signal,
                abortTransaction
              })
            ) {
              return;
            }
          } catch (error) {
            failAndAbort(toPersistenceError(error, "persistence-failed"));
            return;
          }
          addEntry();
        };

        const confirmReadBack = (value: unknown) => {
          if (prepared.signal.aborted) {
            abortTransaction();
            return;
          }
          try {
            validateGeneratedVersionEntryV2(value);
            if (!generatedComponentVersionEntriesCanonicalEqual(value, prepared.pendingEntry)) {
              throw new PersistenceError("readback", "Generated version read-back did not match.");
            }
            confirmedEntry = value;
          } catch (error) {
            failAndAbort(toPersistenceError(error, "readback"));
          }
        };

        recordRequest.onsuccess = () => {
          currentRecord = recordRequest.result as StoredRecordEntry | undefined;
          maybeValidateAndPersist();
        };
        recordRequest.onerror = () => {
          requestError = recordRequest.error;
        };
        sourceRequest.onsuccess = () => {
          currentSource = sourceRequest.result as GeneratedComponentVersionEntry | undefined;
          maybeValidateAndPersist();
        };
        sourceRequest.onerror = () => {
          requestError = sourceRequest.error;
        };
        targetRequest.onsuccess = () => {
          existingTarget = targetRequest.result;
          maybeValidateAndPersist();
        };
        targetRequest.onerror = () => {
          requestError = targetRequest.error;
        };
        transaction.onerror = (event) => {
          const target = event.target;
          if (!requestError && target instanceof IDBRequest && target.error) {
            requestError = target.error;
          }
        };
        transaction.onabort = () => {
          cleanupAbortListener();
          if (!settled) {
            settled = true;
            reject(abortError ?? toPersistenceError(transaction.error ?? requestError, "persistence-failed"));
          }
        };
        transaction.oncomplete = () => {
          runGeneratedVersionV2TransactionCompleteHook();
          cleanupAbortListener();
          if (settled) {
            return;
          }
          if (!confirmedEntry) {
            reject(new PersistenceError("readback", "Generated version persistence completed without a validated read-back."));
            return;
          }
          applyGeneratedVersionV2PostCommitTestHarness({
            confirmedEntry,
            resolve: (entry) => {
              settled = true;
              resolve(entry);
            },
            reject: (error) => {
              settled = true;
              reject(error);
            }
          });
        };
      })
  );
}

export async function recoverGeneratedComponentVersionV2(input: RecoverGeneratedComponentVersionV2Input) {
  validateRecoveryInput(input);
  return withDatabase(
    (database) =>
      new Promise<GeneratedVersionEntryV2 | undefined>((resolve, reject) => {
        const transaction = database.transaction(GENERATED_COMPONENT_VERSION_STORE_NAME, "readonly");
        const request = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME).get(input.targetGeneratedVersionId);
        let result: GeneratedVersionEntryV2 | undefined;
        let requestError: DOMException | null = null;

        request.onsuccess = () => {
          const value = request.result as unknown;
          if (value === undefined) {
            result = undefined;
            return;
          }
          try {
            validateGeneratedVersionEntryV2(value);
            assertRecoveryLineage(value, input);
            result = deepFreeze(cloneJson(value));
          } catch (error) {
            transaction.abort();
            reject(toPersistenceError(error, "persistence-conflict"));
          }
        };
        request.onerror = () => {
          requestError = request.error;
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => {
          if (requestError) {
            reject(toPersistenceError(requestError, "transaction"));
          }
        };
      })
  );
}

export async function getGeneratedComponentVersionUnionById(id: string) {
  if (!isValidGeneratedComponentVersionId(id)) {
    throw new PersistenceError("validation", "Generated version id was invalid.");
  }
  return withDatabase(
    (database) =>
      new Promise<GeneratedComponentVersionEntry | undefined>((resolve, reject) => {
        const transaction = database.transaction(GENERATED_COMPONENT_VERSION_STORE_NAME, "readonly");
        const request = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME).get(id);
        let result: GeneratedComponentVersionEntry | undefined;
        let requestError: DOMException | null = null;

        request.onsuccess = () => {
          if (request.result === undefined) {
            result = undefined;
            return;
          }
          try {
            validateGeneratedComponentVersionEntry(request.result);
            result = deepFreeze(cloneJson(request.result as GeneratedComponentVersionEntry));
          } catch (error) {
            transaction.abort();
            reject(toPersistenceError(error, "validation"));
          }
        };
        request.onerror = () => {
          requestError = request.error;
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => {
          if (requestError) {
            reject(toPersistenceError(requestError, "transaction"));
          }
        };
      })
  );
}

export async function listGeneratedComponentVersionUnionBySourceCaptureId(sourceCaptureId: string) {
  if (!isValidCaptureId(sourceCaptureId)) {
    throw new PersistenceError("validation", "Source capture id was invalid.");
  }
  return withDatabase(
    (database) =>
      new Promise<GeneratedComponentVersionEntry[]>((resolve, reject) => {
        const transaction = database.transaction(GENERATED_COMPONENT_VERSION_STORE_NAME, "readonly");
        const request = transaction
          .objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME)
          .index(GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME)
          .getAll(sourceCaptureId);
        let entries: GeneratedComponentVersionEntry[] = [];
        let requestError: DOMException | null = null;
        let settled = false;

        request.onsuccess = () => {
          entries = (request.result as unknown[]).flatMap((candidate) => {
            try {
              validateGeneratedComponentVersionEntry(candidate);
              return candidate.sourceCaptureId === sourceCaptureId ? [deepFreeze(cloneJson(candidate))] : [];
            } catch {
              return [];
            }
          });
        };
        request.onerror = () => {
          requestError = request.error;
        };
        transaction.oncomplete = () => {
          if (!settled) {
            resolve(entries.sort(compareGeneratedVersionsNewestFirst));
          }
        };
        transaction.onabort = () => {
          if (!settled) {
            settled = true;
            reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
          }
        };
      })
  );
}

export async function getGeneratedComponentVersionById(id: string) {
  if (!isValidGeneratedComponentVersionId(id)) {
    throw new PersistenceError("validation", "Generated version id was invalid.");
  }
  return withDatabase(
    (database) =>
      new Promise<GeneratedComponentVersionEntryV1 | undefined>((resolve, reject) => {
        const transaction = database.transaction([CAPTURE_RECORD_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME], "readwrite");
        const versionStore = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME);
        const recordStore = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const request = versionStore.get(id);
        let result: GeneratedComponentVersionEntryV1 | undefined;
        let requestError: DOMException | null = null;

        request.onsuccess = () => {
          try {
            const entry = request.result as GeneratedComponentVersionEntryV1 | undefined;
            if (!entry) {
              result = undefined;
              return;
            }
            validateGeneratedComponentVersionEntryV1(entry);
            const sourceRequest = recordStore.get(entry.sourceCaptureId);
            sourceRequest.onsuccess = () => {
              try {
                validateGeneratedVersionSource(sourceRequest.result as StoredRecordEntry | undefined, entry.sourceCaptureId);
                result = entry;
              } catch {
                versionStore.delete(entry.id);
                result = undefined;
              }
            };
            sourceRequest.onerror = () => {
              requestError = sourceRequest.error;
            };
          } catch {
            try {
              validateGeneratedVersionEntryV2(request.result);
            } catch {
              if (typeof id === "string") {
                versionStore.delete(id);
              }
            }
            result = undefined;
          }
        };
        request.onerror = () => {
          requestError = request.error;
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
      })
  );
}

export async function listGeneratedComponentVersionsBySourceCaptureId(sourceCaptureId: string) {
  if (!isValidCaptureId(sourceCaptureId)) {
    throw new PersistenceError("validation", "Source capture id was invalid.");
  }
  return withDatabase(
    (database) =>
      new Promise<GeneratedComponentVersionEntryV1[]>((resolve, reject) => {
        const transaction = database.transaction([CAPTURE_RECORD_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME], "readwrite");
        const recordStore = transaction.objectStore(CAPTURE_RECORD_STORE_NAME);
        const versionStore = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME);
        const index = versionStore.index(GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME);
        const sourceRequest = recordStore.get(sourceCaptureId);
        const valuesRequest = index.getAll(sourceCaptureId);
        const keysRequest = index.getAllKeys(sourceCaptureId);
        let entries: GeneratedComponentVersionEntryV1[] = [];
        let sourceValid = false;
        let requestError: DOMException | null = null;
        let completedReads = 0;

        const maybeProcess = () => {
          completedReads += 1;
          if (completedReads !== 3) {
            return;
          }

          try {
            validateGeneratedVersionSource(sourceRequest.result as StoredRecordEntry | undefined, sourceCaptureId);
            sourceValid = true;
          } catch {
            sourceValid = false;
          }

          const candidates = valuesRequest.result as unknown[];
          if (!sourceValid) {
            candidates.forEach((candidate, index) => {
              try {
                validateGeneratedVersionEntryV2(candidate);
              } catch {
                versionStore.delete(keysRequest.result[index]);
              }
            });
            entries = [];
            return;
          }

          entries = candidates.flatMap((candidate) => {
            try {
              validateGeneratedComponentVersionEntryV1(candidate);
              return candidate.sourceCaptureId === sourceCaptureId ? [candidate] : [];
            } catch {
              try {
                validateGeneratedVersionEntryV2(candidate);
              } catch {
                // Malformed generated-version entries remain hidden from the V1 compatibility reader.
              }
              return [];
            }
          });
        };
        sourceRequest.onsuccess = maybeProcess;
        sourceRequest.onerror = () => {
          requestError = sourceRequest.error;
        };
        valuesRequest.onsuccess = maybeProcess;
        valuesRequest.onerror = () => {
          requestError = valuesRequest.error;
        };
        keysRequest.onsuccess = maybeProcess;
        keysRequest.onerror = () => {
          requestError = keysRequest.error;
        };
        transaction.oncomplete = () => resolve(entries.sort(compareGeneratedVersionsNewestFirst));
        transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
      })
  );
}

export async function deleteGeneratedComponentVersionsBySourceCaptureId(sourceCaptureId: string) {
  await withDatabase(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(GENERATED_COMPONENT_VERSION_STORE_NAME, "readwrite");
        const store = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME);
        const request = store.index(GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME).getAllKeys(sourceCaptureId);
        let requestError: DOMException | null = null;

        request.onsuccess = () => {
          for (const key of request.result) {
            store.delete(key);
          }
        };
        request.onerror = () => {
          requestError = request.error;
        };
        transaction.onerror = (event) => {
          const target = event.target;
          if (!requestError && target instanceof IDBRequest && target.error) {
            requestError = target.error;
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requestError, "cleanup"));
      })
  );
}

export async function addInteractionPairEntry(entry: StoredInteractionPairEntry) {
  validateInteractionPairV1(entry);
  await withDatabase(async (database) => {
    const transaction = database.transaction(INTERACTION_PAIR_STORE_NAME, "readwrite");
    transaction.objectStore(INTERACTION_PAIR_STORE_NAME).add(entry);
    await waitForTransaction(transaction);
  });
}

export async function readInteractionPairEntry(id: string) {
  return withDatabase((database) =>
    requestResult<StoredInteractionPairEntry | undefined>(
      database.transaction(INTERACTION_PAIR_STORE_NAME, "readonly").objectStore(INTERACTION_PAIR_STORE_NAME).get(id)
    )
  );
}

export async function readInteractionPairEntries() {
  return withDatabase(
    (database) =>
      new Promise<StoredInteractionPairEntry[]>((resolve, reject) => {
        const transaction = database.transaction(INTERACTION_PAIR_STORE_NAME, "readonly");
        const store = transaction.objectStore(INTERACTION_PAIR_STORE_NAME);
        const request = store.openCursor();
        const entries: StoredInteractionPairEntry[] = [];
        let requestError: DOMException | null = null;
        let settled = false;

        request.onsuccess = () => {
          const cursor = request.result;

          if (!cursor) {
            return;
          }

          try {
            validateInteractionPairV1(cursor.value);
            entries.push(cursor.value as StoredInteractionPairEntry);
          } catch (error) {
            settled = true;
            requestError = error instanceof DOMException ? error : null;
            transaction.abort();
            reject(toPersistenceError(error, "validation"));
            return;
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

export async function deleteInteractionPairEntry(id: string) {
  await withDatabase(async (database) => {
    const transaction = database.transaction(INTERACTION_PAIR_STORE_NAME, "readwrite");
    transaction.objectStore(INTERACTION_PAIR_STORE_NAME).delete(id);
    await waitForTransaction(transaction, "cleanup");
  });
}

export async function addInteractionReconstructionEntry(entry: StoredInteractionReconstructionEntry) {
  validateInteractionReconstructionEntryV1(entry);
  return withDatabase(
    (database) =>
      new Promise<StoredInteractionReconstructionEntry>((resolve, reject) => {
        const transaction = database.transaction(INTERACTIVE_RECONSTRUCTION_STORE_NAME, "readwrite");
        const store = transaction.objectStore(INTERACTIVE_RECONSTRUCTION_STORE_NAME);
        let confirmed: StoredInteractionReconstructionEntry | undefined;
        let requestError: DOMException | null = null;
        const addRequest = store.add(entry);
        addRequest.onsuccess = () => {
          const readBack = store.get(entry.id);
          readBack.onsuccess = () => {
            try {
              validateInteractionReconstructionEntryV1(readBack.result);
              confirmed = deepFreeze(cloneJson(readBack.result as StoredInteractionReconstructionEntry));
            } catch (error) {
              transaction.abort();
              reject(toPersistenceError(error, "readback"));
            }
          };
          readBack.onerror = () => {
            requestError = readBack.error;
          };
        };
        addRequest.onerror = (event) => {
          event.preventDefault();
          reject(new PersistenceError("persistence-conflict", "Interactive reconstruction id conflicted."));
        };
        transaction.onerror = (event) => {
          const target = event.target;
          if (!requestError && target instanceof IDBRequest && target.error) {
            requestError = target.error;
          }
        };
        transaction.oncomplete = () => {
          if (!confirmed) {
            reject(new PersistenceError("readback", "Interactive reconstruction read-back did not complete."));
            return;
          }
          resolve(confirmed);
        };
        transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
      })
  );
}

export async function readInteractionReconstructionEntry(id: string) {
  return withDatabase(
    (database) =>
      new Promise<StoredInteractionReconstructionEntry | undefined>((resolve, reject) => {
        const transaction = database.transaction(INTERACTIVE_RECONSTRUCTION_STORE_NAME, "readonly");
        const request = transaction.objectStore(INTERACTIVE_RECONSTRUCTION_STORE_NAME).get(id);
        let result: StoredInteractionReconstructionEntry | undefined;
        let requestError: DOMException | null = null;
        request.onsuccess = () => {
          if (request.result === undefined) {
            result = undefined;
            return;
          }
          try {
            validateInteractionReconstructionEntryV1(request.result);
            result = deepFreeze(cloneJson(request.result as StoredInteractionReconstructionEntry));
          } catch (error) {
            transaction.abort();
            reject(toPersistenceError(error, "validation"));
          }
        };
        request.onerror = () => {
          requestError = request.error;
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
      })
  );
}

export async function listInteractionReconstructionEntriesByPairId(sourceInteractionPairId: string) {
  return withDatabase(
    (database) =>
      new Promise<StoredInteractionReconstructionEntry[]>((resolve, reject) => {
        const transaction = database.transaction(INTERACTIVE_RECONSTRUCTION_STORE_NAME, "readonly");
        const request = transaction
          .objectStore(INTERACTIVE_RECONSTRUCTION_STORE_NAME)
          .index(INTERACTION_RECONSTRUCTION_PAIR_INDEX_NAME)
          .getAll(sourceInteractionPairId);
        let entries: StoredInteractionReconstructionEntry[] = [];
        let requestError: DOMException | null = null;
        request.onsuccess = () => {
          entries = (request.result as unknown[]).flatMap((candidate) => {
            try {
              validateInteractionReconstructionEntryV1(candidate);
              return candidate.sourceInteractionPairId === sourceInteractionPairId ? [deepFreeze(cloneJson(candidate))] : [];
            } catch {
              return [];
            }
          });
        };
        request.onerror = () => {
          requestError = request.error;
        };
        transaction.oncomplete = () => resolve(entries.sort(compareInteractionReconstructionsNewestFirst));
        transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requestError, "transaction"));
      })
  );
}

export async function deleteInteractionReconstructionEntry(id: string) {
  await withDatabase(async (database) => {
    const transaction = database.transaction(INTERACTIVE_RECONSTRUCTION_STORE_NAME, "readwrite");
    transaction.objectStore(INTERACTIVE_RECONSTRUCTION_STORE_NAME).delete(id);
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
    let settled = false;
    let upgradeError: PersistenceError | undefined;

    const settleReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(toPersistenceError(error, "database-upgrade"));
    };

    const settleResolve = (database: IDBDatabase) => {
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      resolve(database);
    };

    request.onupgradeneeded = (event) => {
      try {
        const database = request.result;

        if (!database.objectStoreNames.contains(SCREENSHOT_ASSET_STORE_NAME)) {
          database.createObjectStore(SCREENSHOT_ASSET_STORE_NAME, { keyPath: "storageKey" });
        }

        if (!database.objectStoreNames.contains(CAPTURE_RECORD_STORE_NAME)) {
          database.createObjectStore(CAPTURE_RECORD_STORE_NAME, { keyPath: "id" });
        }

        if (event.oldVersion < 2 && !database.objectStoreNames.contains(GENERATED_COMPONENT_VERSION_STORE_NAME)) {
          const store = database.createObjectStore(GENERATED_COMPONENT_VERSION_STORE_NAME, { keyPath: "id" });
          store.createIndex(GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME, "sourceCaptureId", { unique: false });
        }

        if (event.oldVersion >= 2) {
          const transaction = request.transaction;
          if (!transaction || !database.objectStoreNames.contains(GENERATED_COMPONENT_VERSION_STORE_NAME)) {
            throw new PersistenceError("database-upgrade", "Unexpected generated-version store schema.");
          }
          validateGeneratedVersionStoreSchema(transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME));
        }

        if (event.oldVersion < 3 && !database.objectStoreNames.contains(INTERACTION_PAIR_STORE_NAME)) {
          database.createObjectStore(INTERACTION_PAIR_STORE_NAME, { keyPath: "id" });
        }

        if (event.oldVersion < 4 && !database.objectStoreNames.contains(INTERACTIVE_RECONSTRUCTION_STORE_NAME)) {
          const store = database.createObjectStore(INTERACTIVE_RECONSTRUCTION_STORE_NAME, { keyPath: "id" });
          store.createIndex(INTERACTION_RECONSTRUCTION_PAIR_INDEX_NAME, "sourceInteractionPairId", { unique: false });
        }
      } catch (error) {
        upgradeError = new PersistenceError("database-upgrade", undefined, error);
        try {
          request.transaction?.abort();
        } catch {
          // The version-change transaction may already be inactive.
        }
        settleReject(upgradeError);
      }
    };

    request.onblocked = () => settleReject(new PersistenceError("blocked"));
    request.onerror = () => settleReject(upgradeError ?? toPersistenceError(request.error, "database-open"));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (upgradeError) {
        database.close();
        settleReject(upgradeError);
        return;
      }
      try {
        validateDatabaseSchema(database);
      } catch (error) {
        database.close();
        settleReject(error);
        return;
      }
      settleResolve(database);
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

async function preparePendingGeneratedComponentVersionV2Input(input: PersistPendingGeneratedComponentVersionV2Input) {
  const signal = captureAbortSignal(input);
  const screenshotIncluded = captureScreenshotIncluded(input);
  assertExactKeys(input, [
    "pendingEntry",
    "sourceCaptureId",
    "sourceCaptureSavedAt",
    "sourceGeneratedVersionId",
    "canonicalSourceGeneratedVersionEntry",
    "canonicalCurrentCaptureProjection",
    "screenshotIncluded",
    "expectedScreenshotStorageKey",
    ...(screenshotIncluded ? ["screenshot"] : []),
    "targetGeneratedVersionId",
    "signal"
  ]);
  throwIfAborted(signal);
  const data = deepFreeze(strictJsonSnapshotWithoutSignal(input, screenshotIncluded));
  if (!isValidGeneratedComponentVersionId(data.targetGeneratedVersionId) || !isValidGeneratedComponentVersionId(data.sourceGeneratedVersionId)) {
    throw new PersistenceError("validation", "Generated version id was invalid.");
  }
  validateGeneratedVersionEntryV2(data.pendingEntry);
  throwIfAborted(signal);
  const derivedTargetGeneratedVersionId = await deriveRevisionGeneratedVersionId(data.pendingEntry.operation.logicalAttemptId);
  throwIfAborted(signal);
  if (derivedTargetGeneratedVersionId !== data.pendingEntry.id || derivedTargetGeneratedVersionId !== data.targetGeneratedVersionId) {
    throw new PersistenceError("validation", "Generated version V2 deterministic target id was invalid.");
  }
  const sourceEntry = parseCanonicalGeneratedVersionEntry(data.canonicalSourceGeneratedVersionEntry);
  throwIfAborted(signal);
  const sourceGeneratedVersionFingerprint = await computeSourceGeneratedVersionFingerprint(sourceEntry);
  throwIfAborted(signal);
  if (sourceGeneratedVersionFingerprint !== data.pendingEntry.operation.sourceGeneratedVersionFingerprint) {
    throw new PersistenceError("validation", "Generated version V2 source fingerprint was invalid.");
  }
  const currentCaptureProjection = parseCanonicalCurrentCaptureProjection(data.canonicalCurrentCaptureProjection);
  throwIfAborted(signal);
  const currentCaptureProjectionFingerprint = await computeCurrentCaptureProjectionFingerprint(currentCaptureProjection);
  throwIfAborted(signal);
  if (currentCaptureProjectionFingerprint !== data.pendingEntry.sourceReviewFingerprint) {
    throw new PersistenceError("validation", "Generated version V2 capture projection fingerprint was invalid.");
  }
  if (
    data.pendingEntry.id !== data.targetGeneratedVersionId ||
    data.pendingEntry.sourceCaptureId !== data.sourceCaptureId ||
    data.pendingEntry.sourceCaptureSavedAt !== data.sourceCaptureSavedAt ||
    data.pendingEntry.operation.sourceGeneratedVersionId !== data.sourceGeneratedVersionId ||
    data.pendingEntry.operation.screenshotIncluded !== data.screenshotIncluded ||
    sourceEntry.id !== data.sourceGeneratedVersionId ||
    sourceEntry.sourceCaptureId !== data.sourceCaptureId
  ) {
    throw new PersistenceError("validation", "Generated version V2 persistence input linkage was invalid.");
  }
  if (!data.expectedScreenshotStorageKey || !data.expectedScreenshotStorageKey.startsWith("screenshots/") || !data.expectedScreenshotStorageKey.endsWith(".png")) {
    throw new PersistenceError("validation", "Expected screenshot storage key was invalid.");
  }
  if (data.screenshotIncluded) {
    validateExpectedScreenshotPrecondition(data.screenshot);
  } else if ("screenshot" in data) {
    throw new PersistenceError("validation", "Unexpected screenshot metadata for screenshot-excluded persistence.");
  }
  throwIfAborted(signal);
  return {
    ...data,
    signal
  };
}

function captureAbortSignal(input: PersistPendingGeneratedComponentVersionV2Input) {
  const descriptor = getDataPropertyDescriptor(input, "signal");
  const signal = descriptor.value as AbortSignal | undefined;
  if (!signal || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function") {
    throw new PersistenceError("validation", "AbortSignal was invalid.");
  }
  return signal;
}

function captureScreenshotIncluded(input: PersistPendingGeneratedComponentVersionV2Input) {
  const descriptor = getDataPropertyDescriptor(input, "screenshotIncluded");
  if (typeof descriptor.value !== "boolean") {
    throw new PersistenceError("validation", "Screenshot inclusion state was invalid.");
  }
  return descriptor.value;
}

function strictJsonSnapshotWithoutSignal(
  input: PersistPendingGeneratedComponentVersionV2Input,
  screenshotIncluded: boolean
): PersistPendingGeneratedComponentVersionV2Data {
  const keys = [
    "pendingEntry",
    "sourceCaptureId",
    "sourceCaptureSavedAt",
    "sourceGeneratedVersionId",
    "canonicalSourceGeneratedVersionEntry",
    "canonicalCurrentCaptureProjection",
    "screenshotIncluded",
    "expectedScreenshotStorageKey",
    ...(screenshotIncluded ? ["screenshot"] : []),
    "targetGeneratedVersionId"
  ] as const;
  const snapshot: Partial<PersistPendingGeneratedComponentVersionV2Data> = {};
  const seen = new WeakSet<object>();
  for (const key of keys) {
    const descriptor = getDataPropertyDescriptor(input, key);
    (snapshot as Record<string, unknown>)[key] = strictJsonCloneValue(descriptor.value, seen);
  }
  try {
    JSON.stringify(snapshot);
  } catch (error) {
    throw new PersistenceError("validation", "Generated version V2 persistence input was not JSON serializable.", error);
  }
  return snapshot as PersistPendingGeneratedComponentVersionV2Data;
}

function getDataPropertyDescriptor(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PersistenceError("validation", "Object shape was invalid.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) {
    throw new PersistenceError("validation", "Object shape was invalid.");
  }
  return descriptor;
}

function strictJsonCloneValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new PersistenceError("validation", "JSON number was invalid.");
    }
    return value;
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new PersistenceError("validation", "JSON value was invalid.");
  }
  if (!value || typeof value !== "object") {
    throw new PersistenceError("validation", "JSON value was invalid.");
  }
  if (seen.has(value)) {
    throw new PersistenceError("validation", "JSON value was cyclic.");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return cloneJsonArray(value, seen);
    }
    return cloneJsonObject(value, seen);
  } finally {
    seen.delete(value);
  }
}

function cloneJsonArray(value: unknown[], seen: WeakSet<object>) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new PersistenceError("validation", "JSON array prototype was invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const clone: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index];
    if (!descriptor || !("value" in descriptor)) {
      throw new PersistenceError("validation", "JSON array value was invalid.");
    }
    clone.push(strictJsonCloneValue(descriptor.value, seen));
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || (!/^(0|[1-9]\d*)$/.test(key) && key !== "length")) {
      throw new PersistenceError("validation", "JSON array shape was invalid.");
    }
  }
  return clone;
}

function cloneJsonObject(value: object, seen: WeakSet<object>) {
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new PersistenceError("validation", "JSON object prototype was invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const clone: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      throw new PersistenceError("validation", "JSON object symbol key was invalid.");
    }
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) {
      throw new PersistenceError("validation", "JSON object accessor was invalid.");
    }
    clone[key] = strictJsonCloneValue(descriptor.value, seen);
  }
  return clone;
}

function validateStoredV2Preconditions({
  prepared,
  currentRecord,
  currentSource
}: {
  prepared: PreparedPendingGeneratedComponentVersionV2Input;
  currentRecord: StoredRecordEntry | undefined;
  currentSource: GeneratedComponentVersionEntry | undefined;
}) {
  validateGeneratedVersionSource(currentRecord, prepared.sourceCaptureId);
  if (currentRecord!.savedAt !== prepared.sourceCaptureSavedAt) {
    throw new PersistenceError("readback", "Revision source capture changed before V2 persistence.");
  }
  validateGeneratedComponentVersionEntry(currentSource);
  if (currentSource.id !== prepared.sourceGeneratedVersionId || currentSource.sourceCaptureId !== prepared.sourceCaptureId) {
    throw new PersistenceError("reference-mismatch", "Revision source generated version linkage was invalid.");
  }
  if (canonicalJsonStringify(currentSource as unknown as CanonicalJsonValue) !== prepared.canonicalSourceGeneratedVersionEntry) {
    throw new PersistenceError("readback", "Revision source generated version changed before V2 persistence.");
  }
  const currentProjection = canonicalJsonStringify({
    captureContext: buildExactCaptureContextProjection(currentRecord!.value as unknown as Parameters<typeof buildExactCaptureContextProjection>[0]),
    requestedOutput: REQUESTED_OUTPUT
  } as CanonicalJsonValue);
  if (currentProjection !== prepared.canonicalCurrentCaptureProjection) {
    throw new PersistenceError("readback", "Revision current capture projection changed before V2 persistence.");
  }
}

function validateStoredV2ScreenshotPreconditions({
  prepared,
  currentRecord,
  currentAsset
}: {
  prepared: PreparedPendingGeneratedComponentVersionV2Input;
  currentRecord: StoredRecordEntry;
  currentAsset: StoredScreenshotAsset | undefined;
}) {
  validateScreenshotAsset(currentAsset);
  const screenshotReference = getScreenshotReferenceFromRecordValue(currentRecord.value);
  if (
    !screenshotReference ||
    !screenshotReference.crop ||
    screenshotReference.storageKey !== currentAsset.storageKey ||
    screenshotReference.storageKey !== prepared.expectedScreenshotStorageKey ||
    screenshotReference.mediaType !== currentAsset.mediaType ||
    screenshotReference.width !== currentAsset.width ||
    screenshotReference.height !== currentAsset.height ||
    (screenshotReference.byteLength !== undefined && screenshotReference.byteLength !== currentAsset.byteLength) ||
    !rectsEqual(screenshotReference.crop, currentAsset.crop)
  ) {
    throw new PersistenceError("reference-mismatch", "Revision source screenshot reference changed before V2 persistence.");
  }
  if (screenshotReference.mediaType !== "image/png" || currentAsset.mediaType !== "image/png") {
    throw new PersistenceError("reference-mismatch", "Revision source screenshot media type was invalid.");
  }
  if (!prepared.screenshotIncluded) {
    return;
  }
  if (!prepared.screenshot) {
    throw new PersistenceError("validation", "Expected screenshot metadata was missing.");
  }
  if (
    screenshotReference.storageKey !== prepared.expectedScreenshotStorageKey ||
    screenshotReference.mediaType !== prepared.screenshot.mediaType ||
    screenshotReference.width !== prepared.screenshot.width ||
    screenshotReference.height !== prepared.screenshot.height ||
    screenshotReference.byteLength !== prepared.screenshot.byteLength ||
    currentAsset.mediaType !== prepared.screenshot.mediaType ||
    currentAsset.width !== prepared.screenshot.width ||
    currentAsset.height !== prepared.screenshot.height ||
    currentAsset.byteLength !== prepared.screenshot.byteLength
  ) {
    throw new PersistenceError("readback", "Revision source screenshot metadata changed before V2 persistence.");
  }
}

function parseCanonicalGeneratedVersionEntry(value: string): GeneratedComponentVersionEntry {
  const parsed = parseCanonicalJson(value);
  validateGeneratedComponentVersionEntry(parsed);
  if (canonicalJsonStringify(parsed as CanonicalJsonValue) !== value) {
    throw new PersistenceError("validation", "Generated version source entry was not canonical.");
  }
  return parsed;
}

function parseCanonicalCurrentCaptureProjection(value: string): Parameters<typeof computeCurrentCaptureProjectionFingerprint>[0] {
  const parsed = parseCanonicalJson(value);
  assertExactKeys(parsed, ["captureContext", "requestedOutput"]);
  if (canonicalJsonStringify(parsed as CanonicalJsonValue) !== value) {
    throw new PersistenceError("validation", "Current capture projection was not canonical.");
  }
  const projection = parsed as Parameters<typeof computeCurrentCaptureProjectionFingerprint>[0];
  return {
    captureContext: projection.captureContext,
    requestedOutput: projection.requestedOutput
  };
}

function validateGeneratedVersionEntryV2(value: unknown): asserts value is GeneratedVersionEntryV2 {
  validateGeneratedComponentVersionEntry(value);
  if ((value as { contractVersion?: unknown }).contractVersion !== 2) {
    throw new PersistenceError("validation", "Generated version entry was not V2.");
  }
}

function parseCanonicalJson(value: string) {
  if (typeof value !== "string") {
    throw new PersistenceError("validation", "Canonical JSON text was invalid.");
  }
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new PersistenceError("validation", "Canonical JSON text was invalid.", error);
  }
}

function validateExpectedScreenshotPrecondition(value: PersistPendingGeneratedComponentVersionV2Input["screenshot"]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PersistenceError("validation", "Expected screenshot metadata was invalid.");
  }
  assertExactKeys(value, ["mediaType", "width", "height", "byteLength"]);
  if (
    value.mediaType !== "image/png" ||
    !Number.isSafeInteger(value.width) ||
    !Number.isSafeInteger(value.height) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.byteLength <= 0
  ) {
    throw new PersistenceError("validation", "Expected screenshot metadata was invalid.");
  }
}

function validateRecoveryInput(input: RecoverGeneratedComponentVersionV2Input) {
  assertExactKeys(input, [
    "targetGeneratedVersionId",
    ...(input.expectedSourceCaptureId !== undefined ? ["expectedSourceCaptureId"] : []),
    ...(input.expectedSourceGeneratedVersionId !== undefined ? ["expectedSourceGeneratedVersionId"] : []),
    ...(input.expectedLogicalAttemptId !== undefined ? ["expectedLogicalAttemptId"] : []),
    ...(input.expectedReviewAttemptFingerprint !== undefined ? ["expectedReviewAttemptFingerprint"] : [])
  ]);
  if (
    !isValidGeneratedComponentVersionId(input.targetGeneratedVersionId) ||
    (input.expectedSourceCaptureId !== undefined && !isValidCaptureId(input.expectedSourceCaptureId)) ||
    (input.expectedSourceGeneratedVersionId !== undefined && !isValidGeneratedComponentVersionId(input.expectedSourceGeneratedVersionId)) ||
    (input.expectedLogicalAttemptId !== undefined && !isValidLogicalAttemptId(input.expectedLogicalAttemptId)) ||
    (input.expectedReviewAttemptFingerprint !== undefined && !isValidSha256Hex(input.expectedReviewAttemptFingerprint))
  ) {
    throw new PersistenceError("validation", "Generated version recovery input was invalid.");
  }
}

function assertRecoveryLineage(entry: GeneratedVersionEntryV2, input: RecoverGeneratedComponentVersionV2Input) {
  if (
    (input.expectedSourceCaptureId !== undefined && entry.sourceCaptureId !== input.expectedSourceCaptureId) ||
    (input.expectedSourceGeneratedVersionId !== undefined && entry.operation.sourceGeneratedVersionId !== input.expectedSourceGeneratedVersionId) ||
    (input.expectedLogicalAttemptId !== undefined && entry.operation.logicalAttemptId !== input.expectedLogicalAttemptId) ||
    (input.expectedReviewAttemptFingerprint !== undefined && entry.operation.reviewAttemptFingerprint !== input.expectedReviewAttemptFingerprint)
  ) {
    throw new PersistenceError("persistence-conflict", "Recovered generated version lineage did not match.");
  }
}

function runGeneratedVersionV2TransactionCompleteHook() {
  if (typeof window === "undefined") {
    return;
  }
  window.__EC_GENERATED_VERSION_V2_TRANSACTION_COMPLETE_HOOK__?.();
}

function generatedComponentVersionEntriesCanonicalEqual(left: GeneratedComponentVersionEntry, right: GeneratedComponentVersionEntry) {
  return canonicalJsonStringify(left as unknown as CanonicalJsonValue) === canonicalJsonStringify(right as unknown as CanonicalJsonValue);
}

function assertExactKeys(value: unknown, expected: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PersistenceError("validation", "Object shape was invalid.");
  }
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) {
    throw new PersistenceError("validation", "Object shape was invalid.");
  }
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (sortedActual.length !== sortedExpected.length || sortedActual.some((key, index) => key !== sortedExpected[index])) {
    throw new PersistenceError("validation", "Object shape was invalid.");
  }
}

function applyGeneratedVersionPersistenceTestHarness({
  entry,
  recordStore,
  onContinue,
  onError,
  signal,
  abortTransaction
}: {
  entry: GeneratedComponentVersionEntryV1;
  recordStore: IDBObjectStore;
  onContinue: () => void;
  onError: (error: unknown) => void;
  signal: AbortSignal;
  abortTransaction: () => void;
}) {
  const harness = typeof window !== "undefined" ? window.__EC_GENERATED_VERSION_PERSISTENCE_TEST_HARNESS__ : undefined;
  if (!harness) {
    return false;
  }
  harness.beforeAddCalls += 1;
  harness.attempts.push({
    id: entry.id,
    createdAt: entry.createdAt,
    componentName: entry.value.componentName
  });
  if ((harness.failBeforeAddCount ?? 0) > 0) {
    harness.failBeforeAddCount = (harness.failBeforeAddCount ?? 0) - 1;
    throw new PersistenceError("persistence-failed", "Injected generated-version persistence failure.");
  }
  if (!harness.pauseBeforeAdd) {
    return false;
  }

  const pump = () => {
    if (signal.aborted) {
      abortTransaction();
      return;
    }
    if (harness.releaseBeforeAdd) {
      harness.pauseBeforeAdd = false;
      onContinue();
      return;
    }
    try {
      const keepAliveRequest = recordStore.get(entry.sourceCaptureId);
      keepAliveRequest.onsuccess = pump;
      keepAliveRequest.onerror = () => onError(keepAliveRequest.error);
    } catch (error) {
      onError(error);
    }
  };
  pump();
  return true;
}

function getGeneratedVersionV2PersistenceTestHarness() {
  if (typeof window === "undefined" || window.navigator.webdriver !== true) {
    return undefined;
  }
  const harness = window.__EC_GENERATED_VERSION_V2_PERSISTENCE_TEST_HARNESS__;
  return harness?.enabled === true ? harness : undefined;
}

function applyGeneratedVersionV2PersistenceTestHarness({
  prepared,
  recordStore,
  onContinue,
  onError,
  signal,
  abortTransaction
}: {
  prepared: PreparedPendingGeneratedComponentVersionV2Input;
  recordStore: IDBObjectStore;
  onContinue: () => void;
  onError: (error: unknown) => void;
  signal: AbortSignal;
  abortTransaction: () => void;
}) {
  const harness = getGeneratedVersionV2PersistenceTestHarness();
  if (!harness) {
    return false;
  }
  harness.beforeAddCalls += 1;
  harness.attempts.push({
    id: prepared.pendingEntry.id,
    logicalAttemptId: prepared.pendingEntry.operation.logicalAttemptId,
    sourceGeneratedVersionId: prepared.pendingEntry.operation.sourceGeneratedVersionId,
    componentName: prepared.pendingEntry.value.componentName
  });
  if ((harness.failBeforeAddCount ?? 0) > 0) {
    harness.failBeforeAddCount = (harness.failBeforeAddCount ?? 0) - 1;
    throw new PersistenceError("persistence-failed", "Injected generated-version V2 persistence failure.");
  }
  if (!harness.pauseBeforeAdd) {
    return false;
  }

  const pump = () => {
    if (signal.aborted) {
      abortTransaction();
      return;
    }
    if (harness.releaseBeforeAdd) {
      harness.pauseBeforeAdd = false;
      onContinue();
      return;
    }
    try {
      const keepAliveRequest = recordStore.get(prepared.sourceCaptureId);
      keepAliveRequest.onsuccess = pump;
      keepAliveRequest.onerror = () => onError(keepAliveRequest.error);
    } catch (error) {
      onError(error);
    }
  };

  pump();
  return true;
}

function applyGeneratedVersionV2PostCommitTestHarness({
  confirmedEntry,
  resolve,
  reject
}: {
  confirmedEntry: GeneratedVersionEntryV2;
  resolve: (entry: GeneratedVersionEntryV2) => void;
  reject: (error: unknown) => void;
}) {
  const complete = () => resolve(deepFreeze(cloneJson(confirmedEntry)));
  const harness = getGeneratedVersionV2PersistenceTestHarness();
  if (!harness) {
    complete();
    return;
  }
  harness.afterCommitCalls += 1;

  const completeAfterHarness = () => {
    if ((harness.failAfterCommitCount ?? 0) > 0) {
      harness.failAfterCommitCount = (harness.failAfterCommitCount ?? 0) - 1;
      reject(new PersistenceError("persistence-failed", "Injected generated-version V2 post-commit confirmation failure."));
      return;
    }
    complete();
  };

  if (!harness.pauseAfterCommit) {
    completeAfterHarness();
    return;
  }

  const pump = () => {
    if (harness.releaseAfterCommit) {
      harness.pauseAfterCommit = false;
      completeAfterHarness();
      return;
    }
    window.setTimeout(pump, 25);
  };
  pump();
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function createAbortError() {
  return new DOMException("Operation aborted.", "AbortError");
}

function validateDatabaseSchema(database: IDBDatabase) {
  if (database.version !== ELEMENT_CATCHER_DATABASE_VERSION) {
    throw new PersistenceError("database-upgrade", "Unexpected local persistence database version.");
  }

  const stores = Array.from(database.objectStoreNames).sort();
  const expectedStores = [
    CAPTURE_RECORD_STORE_NAME,
    GENERATED_COMPONENT_VERSION_STORE_NAME,
    INTERACTIVE_RECONSTRUCTION_STORE_NAME,
    INTERACTION_PAIR_STORE_NAME,
    SCREENSHOT_ASSET_STORE_NAME
  ].sort();
  if (JSON.stringify(stores) !== JSON.stringify(expectedStores)) {
    throw new PersistenceError("database-upgrade", "Unexpected local persistence database stores.");
  }

  const transaction = database.transaction(
    [GENERATED_COMPONENT_VERSION_STORE_NAME, INTERACTION_PAIR_STORE_NAME, INTERACTIVE_RECONSTRUCTION_STORE_NAME],
    "readonly"
  );
  const store = transaction.objectStore(GENERATED_COMPONENT_VERSION_STORE_NAME);
  try {
    validateGeneratedVersionStoreSchema(store);
  } catch (error) {
    transaction.abort();
    throw error;
  }

  const interactionStore = transaction.objectStore(INTERACTION_PAIR_STORE_NAME);
  if (interactionStore.keyPath !== "id") {
    transaction.abort();
    throw new PersistenceError("database-upgrade", "Unexpected interaction-pair store keyPath.");
  }

  if (interactionStore.indexNames.length !== 0) {
    transaction.abort();
    throw new PersistenceError("database-upgrade", "Unexpected interaction-pair indexes.");
  }

  const reconstructionStore = transaction.objectStore(INTERACTIVE_RECONSTRUCTION_STORE_NAME);
  if (reconstructionStore.keyPath !== "id") {
    transaction.abort();
    throw new PersistenceError("database-upgrade", "Unexpected interaction-reconstruction store keyPath.");
  }
  const reconstructionIndexes = Array.from(reconstructionStore.indexNames);
  if (reconstructionIndexes.length !== 1 || reconstructionIndexes[0] !== INTERACTION_RECONSTRUCTION_PAIR_INDEX_NAME) {
    transaction.abort();
    throw new PersistenceError("database-upgrade", "Unexpected interaction-reconstruction indexes.");
  }
  const reconstructionPairIndex = reconstructionStore.index(INTERACTION_RECONSTRUCTION_PAIR_INDEX_NAME);
  if (reconstructionPairIndex.keyPath !== "sourceInteractionPairId" || reconstructionPairIndex.unique) {
    transaction.abort();
    throw new PersistenceError("database-upgrade", "Unexpected interaction-reconstruction pair index schema.");
  }
}

function validateGeneratedVersionStoreSchema(store: IDBObjectStore) {
  if (store.keyPath !== "id") {
    throw new PersistenceError("database-upgrade", "Unexpected generated-version store keyPath.");
  }

  const indexes = Array.from(store.indexNames);
  if (indexes.length !== 1 || indexes[0] !== GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME) {
    throw new PersistenceError("database-upgrade", "Unexpected generated-version indexes.");
  }

  const index = store.index(GENERATED_COMPONENT_VERSION_SOURCE_INDEX_NAME);
  if (index.keyPath !== "sourceCaptureId" || index.unique) {
    throw new PersistenceError("database-upgrade", "Unexpected generated-version source index schema.");
  }
}

function validateScreenshotAsset(asset: StoredScreenshotAsset | undefined): asserts asset is StoredScreenshotAsset {
  if (!asset) {
    throw new PersistenceError("not-found", "Saved screenshot asset was not found.");
  }
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

function compareGeneratedVersionsNewestFirst(left: GeneratedComponentVersionEntry, right: GeneratedComponentVersionEntry) {
  if (left.createdAt !== right.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }
  return left.id.localeCompare(right.id);
}

function compareInteractionReconstructionsNewestFirst(left: StoredInteractionReconstructionEntry, right: StoredInteractionReconstructionEntry) {
  if (left.createdAt !== right.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }
  return left.id.localeCompare(right.id);
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

function validateGeneratedVersionSource(source: StoredRecordEntry | undefined, sourceCaptureId: string) {
  if (!source) {
    throw new PersistenceError("not-found", "Generated version source capture was not found.");
  }

  validateRecordEntry(source);
  try {
    validateCaptureRecordV1(source.value);
  } catch (error) {
    throw toPersistenceError(error, "validation");
  }

  if (source.id !== source.value.id || source.value.id !== sourceCaptureId) {
    throw new PersistenceError("validation", "Generated version source capture linkage was invalid.");
  }

  if (
    source.value.assets.screenshot.mediaType !== "image/png" ||
    source.value.assets.screenshot.storageKey !== createScreenshotStorageKey(source.value.id)
  ) {
    throw new PersistenceError("reference-mismatch", "Generated version source screenshot reference was invalid.");
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
  return getScreenshotReferenceFromRecordValue(value)?.storageKey;
}

function getScreenshotReferenceFromRecordValue(value: JsonObject) {
  const assets = value.assets;
  if (!assets || typeof assets !== "object" || Array.isArray(assets)) {
    return undefined;
  }

  const screenshot = (assets as JsonObject).screenshot;
  if (!screenshot || typeof screenshot !== "object" || Array.isArray(screenshot)) {
    return undefined;
  }

  return {
    storageKey: typeof screenshot.storageKey === "string" ? screenshot.storageKey : undefined,
    mediaType: typeof screenshot.mediaType === "string" ? screenshot.mediaType : undefined,
    width: typeof screenshot.width === "number" ? screenshot.width : undefined,
    height: typeof screenshot.height === "number" ? screenshot.height : undefined,
    byteLength: typeof screenshot.byteLength === "number" ? screenshot.byteLength : undefined,
    crop: screenshot.crop && typeof screenshot.crop === "object" && !Array.isArray(screenshot.crop) ? (screenshot.crop as SerializableRect) : undefined
  };
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as { [key: string]: unknown })) {
      deepFreeze(child);
    }
  }
  return value;
}

function installGeneratedVersionStorageTestBridge() {
  if (
    typeof window === "undefined" ||
    (window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE_ENABLED__ !== true && window.navigator.webdriver !== true)
  ) {
    return;
  }

  window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__ = {
    async addGeneratedComponentVersion(input) {
      return bridgeResult(() =>
        addGeneratedComponentVersion({
          ...input,
          signal: new AbortController().signal
        })
      );
    },
    async persistPendingGeneratedComponentVersionV2(input) {
      return bridgeResult(() =>
        persistPendingGeneratedComponentVersionV2({
          ...input,
          signal: new AbortController().signal
        })
      );
    },
    async persistPendingGeneratedComponentVersionV2PreAborted(input) {
      return bridgeResult(() => {
        const controller = new AbortController();
        controller.abort();
        return persistPendingGeneratedComponentVersionV2({
          ...input,
          signal: controller.signal
        });
      });
    },
    async persistPendingGeneratedComponentVersionV2AbortBeforeAdd(input) {
      return bridgeResult(async () => {
        const controller = new AbortController();
        const originalAdd = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function patchedAdd(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
          if (this.name === GENERATED_COMPONENT_VERSION_STORE_NAME && (value as { id?: unknown }).id === input.targetGeneratedVersionId) {
            controller.abort();
          }
          return key === undefined ? originalAdd.call(this, value) : originalAdd.call(this, value, key);
        };
        try {
          return await persistPendingGeneratedComponentVersionV2({
            ...input,
            signal: controller.signal
          });
        } finally {
          IDBObjectStore.prototype.add = originalAdd;
        }
      });
    },
    async persistPendingGeneratedComponentVersionV2AbortAtCommitBoundary(input) {
      return bridgeResult(async () => {
        const controller = new AbortController();
        window.__EC_GENERATED_VERSION_V2_TRANSACTION_COMPLETE_HOOK__ = () => controller.abort();
        try {
          return await persistPendingGeneratedComponentVersionV2({
            ...input,
            signal: controller.signal
          });
        } finally {
          delete window.__EC_GENERATED_VERSION_V2_TRANSACTION_COMPLETE_HOOK__;
        }
      });
    },
    async persistPendingGeneratedComponentVersionV2ReadBackMismatch(input) {
      return bridgeResult(async () => {
        const originalGet = IDBObjectStore.prototype.get;
        const originalPut = IDBObjectStore.prototype.put;
        let targetGetCount = 0;
        IDBObjectStore.prototype.get = function patchedGet(this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
          if (this.name === GENERATED_COMPONENT_VERSION_STORE_NAME && query === input.targetGeneratedVersionId) {
            targetGetCount += 1;
            if (targetGetCount === 2) {
              originalPut.call(this, {
                ...input.pendingEntry,
                value: {
                  ...input.pendingEntry.value,
                  summary: "Injected read-back mismatch"
                }
              });
            }
          }
          return originalGet.call(this, query);
        };
        try {
          return await persistPendingGeneratedComponentVersionV2({
            ...input,
            signal: new AbortController().signal
          });
        } finally {
          IDBObjectStore.prototype.get = originalGet;
          IDBObjectStore.prototype.put = originalPut;
        }
      });
    },
    async persistPendingGeneratedComponentVersionV2MutateDuringDigest(input, mutation) {
      return bridgeResult(async () => {
        const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
        let mutated = false;
        crypto.subtle.digest = (async (...args: Parameters<SubtleCrypto["digest"]>) => {
          if (!mutated) {
            mutated = true;
            applyGeneratedVersionV2DigestMutation(input, mutation);
          }
          return originalDigest(...args);
        }) as SubtleCrypto["digest"];
        try {
          return await persistPendingGeneratedComponentVersionV2({
            ...input,
            signal: new AbortController().signal
          });
        } finally {
          crypto.subtle.digest = originalDigest;
        }
      });
    },
    async persistPendingGeneratedComponentVersionV2ProbeReturnedMutation(input) {
      return bridgeResult(async () => {
        const value = await persistPendingGeneratedComponentVersionV2({
          ...input,
          signal: new AbortController().signal
        });
        let mutationThrew = false;
        try {
          value.value.summary = "Mutated returned result";
        } catch {
          mutationThrew = true;
        }
        input.pendingEntry.value.summary = "Mutated caller after successful persistence";
        return {
          value,
          summaryAfterMutation: value.value.summary,
          mutationThrew
        };
      });
    },
    async recoverGeneratedComponentVersionV2(input) {
      return bridgeResult(() => recoverGeneratedComponentVersionV2(input));
    },
    async getGeneratedComponentVersionUnionById(id) {
      return bridgeResult(() => getGeneratedComponentVersionUnionById(id));
    },
    async listGeneratedComponentVersionUnionBySourceCaptureId(sourceCaptureId) {
      return bridgeResult(() => listGeneratedComponentVersionUnionBySourceCaptureId(sourceCaptureId));
    },
    async getGeneratedComponentVersionById(id) {
      return bridgeResult(() => getGeneratedComponentVersionById(id));
    },
    async listGeneratedComponentVersionsBySourceCaptureId(sourceCaptureId) {
      return bridgeResult(() => listGeneratedComponentVersionsBySourceCaptureId(sourceCaptureId));
    }
  };
}

async function bridgeResult<T>(operation: () => Promise<T>): Promise<GeneratedVersionStorageBridgeResult<T>> {
  try {
    return {
      ok: true,
      value: await operation()
    };
  } catch (error) {
    const normalized = toPersistenceError(error);
    return {
      ok: false,
      code: normalized.code,
      name: normalized.name,
      message: normalized.message
    };
  }
}

function applyGeneratedVersionV2DigestMutation(input: Omit<PersistPendingGeneratedComponentVersionV2Input, "signal">, mutation: GeneratedVersionV2DigestMutation) {
  switch (mutation.kind) {
    case "logicalAttemptId":
      input.pendingEntry.operation.logicalAttemptId = mutation.value;
      return;
    case "sourceGeneratedVersionFingerprint":
      input.pendingEntry.operation.sourceGeneratedVersionFingerprint = mutation.value;
      return;
    case "sourceReviewFingerprint":
      input.pendingEntry.sourceReviewFingerprint = mutation.value;
      return;
    case "canonicalSourceGeneratedVersionEntry":
      input.canonicalSourceGeneratedVersionEntry = mutation.value;
      return;
    case "canonicalCurrentCaptureProjection":
      input.canonicalCurrentCaptureProjection = mutation.value;
      return;
    case "pendingSummary":
      input.pendingEntry.value.summary = mutation.value;
      return;
  }
}

installGeneratedVersionStorageTestBridge();

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
