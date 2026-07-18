import type { CaptureRecord, JsonObject, ScreenshotCaptureResult } from "../shared/capture-schema";
import {
  jsonValuesEqual,
  parseCaptureRecordV1,
  serializeCaptureRecordV1,
  validateNewCaptureRecordV1Candidate
} from "../capture/capture-record-v1";
import {
  addPersistenceBundle,
  deletePersistenceBundle,
  readRecordEntry,
  readScreenshotAsset,
  type StoredRecordEntry
} from "./indexed-db";
import { PersistenceError, toPersistenceError } from "./persistence-errors";
import {
  digestBlob,
  rectsMatch,
  screenshotCaptureResultToBlob,
  screenshotCaptureResultToStoredAsset,
  verifyStoredScreenshotAsset
} from "./screenshot-asset";

export type CaptureRecordAssemblyCheckResult = {
  ok: true;
  id: string;
  createdAt: string;
  storageKey: string;
  schemaVersion: 1;
  checks: {
    requiredFields: true;
    jsonCompatibility: true;
    serializationRoundTrip: true;
    screenshotDataUrlExcluded: true;
    screenshotReferenceMatchedAsset: true;
    recordReadback: true;
    screenshotDigest: true;
    cleanup: true;
    currentCaptureNotSaved: true;
  };
};

export async function runCaptureRecordAssemblyCheck(
  captureRecord: CaptureRecord,
  screenshotCapture: ScreenshotCaptureResult
) {
  const storageKey = captureRecord.assets.screenshot.storageKey;

  try {
    validateNewCaptureRecordV1Candidate(captureRecord);
    const blob = await screenshotCaptureResultToBlob(screenshotCapture);
    const asset = screenshotCaptureResultToStoredAsset(storageKey, blob, screenshotCapture);
    verifyScreenshotReference(captureRecord, asset);

    const expectedDigest = await digestBlob(blob);
    const serializedRecord = serializeCaptureRecordV1(captureRecord);
    const serializedRoundTripRecord = parseCaptureRecordV1(serializedRecord);
    validateNewCaptureRecordV1Candidate(serializedRoundTripRecord);
    verifyRecordsEqual(captureRecord, serializedRoundTripRecord, "Serialized CaptureRecord did not match.");

    const storedRecordEntry: StoredRecordEntry = {
      id: captureRecord.id,
      value: serializedRecord
    };

    try {
      await addPersistenceBundle({ asset, record: storedRecordEntry });
      await verifyReadback(captureRecord, asset, expectedDigest, serializedRecord);
      await cleanupCandidate(storageKey, captureRecord.id);
      await verifyCleanup(storageKey, captureRecord.id);
    } catch (error) {
      await cleanupAfterFailure(storageKey, captureRecord.id, error);
      throw error;
    }

    return {
      ok: true,
      id: captureRecord.id,
      createdAt: captureRecord.createdAt,
      storageKey,
      schemaVersion: 1,
      checks: {
        requiredFields: true,
        jsonCompatibility: true,
        serializationRoundTrip: true,
        screenshotDataUrlExcluded: true,
        screenshotReferenceMatchedAsset: true,
        recordReadback: true,
        screenshotDigest: true,
        cleanup: true,
        currentCaptureNotSaved: true
      }
    } satisfies CaptureRecordAssemblyCheckResult;
  } catch (error) {
    throw toPersistenceError(error);
  }
}

async function verifyReadback(
  captureRecord: CaptureRecord,
  expectedAsset: ReturnType<typeof screenshotCaptureResultToStoredAsset>,
  expectedDigest: string,
  serializedRecord: JsonObject
) {
  const [storedAsset, storedRecord] = await Promise.all([
    readScreenshotAsset(expectedAsset.storageKey),
    readRecordEntry(captureRecord.id)
  ]);

  verifyStoredScreenshotAsset(storedAsset, expectedAsset);

  const storedDigest = await digestBlob(storedAsset.blob);
  if (storedDigest !== expectedDigest) {
    throw new PersistenceError("readback", "Stored screenshot asset digest did not match.");
  }

  if (!storedRecord) {
    throw new PersistenceError("not-found", "Stored CaptureRecord was not found.");
  }

  const parsedStoredRecord = parseCaptureRecordV1(storedRecord.value);
  validateNewCaptureRecordV1Candidate(parsedStoredRecord);
  verifyRecordsEqual(captureRecord, parsedStoredRecord, "Stored CaptureRecord did not match the assembled record.");

  if (!jsonValuesEqual(serializedRecord, storedRecord.value)) {
    throw new PersistenceError("readback", "Stored CaptureRecord JSON did not match the serialized record.");
  }
}

function verifyScreenshotReference(
  captureRecord: CaptureRecord,
  expectedAsset: ReturnType<typeof screenshotCaptureResultToStoredAsset>
) {
  const reference = captureRecord.assets.screenshot;

  if (
    reference.storageKey !== expectedAsset.storageKey ||
    reference.mediaType !== expectedAsset.mediaType ||
    reference.width !== expectedAsset.width ||
    reference.height !== expectedAsset.height ||
    reference.byteLength !== expectedAsset.byteLength ||
    !rectsMatch(reference.crop, expectedAsset.crop)
  ) {
    throw new PersistenceError("reference-mismatch", "CaptureRecord screenshot reference did not match the asset.");
  }
}

function verifyRecordsEqual(left: CaptureRecord, right: CaptureRecord, message: string) {
  const leftJson = serializeCaptureRecordV1(left);
  const rightJson = serializeCaptureRecordV1(right);

  if (!jsonValuesEqual(leftJson, rightJson)) {
    throw new PersistenceError("readback", message);
  }
}

async function cleanupCandidate(storageKey: string, recordId: string) {
  await deletePersistenceBundle({ storageKey, recordId });
}

async function verifyCleanup(storageKey: string, recordId: string) {
  const [asset, record] = await Promise.all([readScreenshotAsset(storageKey), readRecordEntry(recordId)]);

  if (asset || record) {
    throw new PersistenceError("cleanup", "Temporary CaptureRecord check data was not fully removed.");
  }
}

async function cleanupAfterFailure(storageKey: string, recordId: string, originalError: unknown) {
  try {
    await cleanupCandidate(storageKey, recordId);
    await verifyCleanup(storageKey, recordId);
  } catch (cleanupError) {
    throw new PersistenceError("cleanup", "CaptureRecord check failed and cleanup also failed.", {
      originalError,
      cleanupError
    });
  }
}
