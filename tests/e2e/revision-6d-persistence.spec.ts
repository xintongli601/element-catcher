import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./extension-fixture";
import {
  deleteRecordWrapper,
  deleteScreenshotAsset,
  putGeneratedVersion,
  readGeneratedVersions,
  readPersistenceCounts,
  readRecordWrapper,
  readScreenshotAssetSnapshot,
  replaceRecordWrapper,
  replaceScreenshotAssetVariant,
  resetAndSeedSavedCaptures,
  type SeededCapture
} from "./indexed-db-fixtures";
import { REQUESTED_OUTPUT, type ComponentGenerationResponseV1 } from "../../extension/src/shared/generation-contract";
import {
  buildPendingRegenerationGeneratedVersionEntryV2,
  buildPendingRevisionGeneratedVersionEntryV2,
  computeCurrentCaptureProjectionFingerprint,
  computeRevisionInstructionFingerprint,
  computeSourceGeneratedVersionFingerprint,
  deriveRevisionGeneratedVersionId
} from "../../extension/src/generation/revision-contract";
import { canonicalJsonStringify, type CanonicalJsonValue } from "../../extension/src/generation/canonical-json";
import { buildExactCaptureContextProjection } from "../../extension/src/generation/projection";
import type { GeneratedComponentVersionEntry, GeneratedComponentVersionEntryV1, GeneratedComponentVersionEntryV2 } from "../../extension/src/shared/generated-version-contract";

const sourceVersionId = "generated-version-11111111111111111111111111111111";
const targetAttemptId = "revision-attempt-22222222222222222222222222222222";
const secondAttemptId = "revision-attempt-33333333333333333333333333333333";
const reviewAttemptFingerprint = "a".repeat(64);
const wrongSourceGeneratedVersionFingerprint = "b".repeat(64);
const wrongCurrentCaptureProjectionFingerprint = "c".repeat(64);
const createdAt = "2026-07-27T00:00:00.000Z";

test.describe("Milestone 6D Slice 4 atomic revision persistence", () => {
  test("atomically persists a V2 revision from a V1 source and recovers it deterministically", async ({ sidePanelPage }) => {
    const [target] = await resetAndSeedSavedCaptures(sidePanelPage);
    const source = sourceV1(target);
    await putGeneratedVersion(sidePanelPage, source);
    const pending = await pendingRevision(target, source);
    const input = await persistenceInput(target, source, pending, false);

    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: true, value: pending });
    await expect(recoverV2(sidePanelPage, {
      targetGeneratedVersionId: pending.id,
      expectedSourceCaptureId: target.record.id,
      expectedSourceGeneratedVersionId: source.id,
      expectedLogicalAttemptId: targetAttemptId,
      expectedReviewAttemptFingerprint: reviewAttemptFingerprint
    })).resolves.toMatchObject({ ok: true, value: pending });
    await expect(recoverV2(sidePanelPage, {
      targetGeneratedVersionId: pending.id,
      expectedSourceGeneratedVersionId: "generated-version-ffffffffffffffffffffffffffffffff"
    })).resolves.toMatchObject({ ok: false, code: "persistence-conflict" });
    await expect(unionRead(sidePanelPage, pending.id)).resolves.toMatchObject({ ok: true, value: pending });
  });

  test("rejects arbitrary target ids and fingerprint mismatches before target add", async ({ sidePanelPage }) => {
    const [target] = await resetAndSeedSavedCaptures(sidePanelPage);
    const source = sourceV1(target);
    await putGeneratedVersion(sidePanelPage, source);
    const pending = await pendingRevision(target, source);
    const input = await persistenceInput(target, source, pending, false);
    const arbitraryTargetId = await deriveRevisionGeneratedVersionId(secondAttemptId);

    await expect(persistV2(sidePanelPage, {
      ...input,
      targetGeneratedVersionId: arbitraryTargetId,
      pendingEntry: {
        ...pending,
        id: arbitraryTargetId
      }
    })).resolves.toMatchObject({ ok: false });
    await expect(recoverV2(sidePanelPage, { targetGeneratedVersionId: arbitraryTargetId })).resolves.toEqual({ ok: true, value: undefined });

    await expect(persistV2(sidePanelPage, {
      ...input,
      pendingEntry: {
        ...pending,
        operation: {
          ...pending.operation,
          sourceGeneratedVersionFingerprint: wrongSourceGeneratedVersionFingerprint
        }
      }
    })).resolves.toMatchObject({ ok: false });
    await expect(recoverV2(sidePanelPage, { targetGeneratedVersionId: pending.id })).resolves.toEqual({ ok: true, value: undefined });

    await expect(persistV2(sidePanelPage, {
      ...input,
      pendingEntry: {
        ...pending,
        sourceReviewFingerprint: wrongCurrentCaptureProjectionFingerprint
      }
    })).resolves.toMatchObject({ ok: false });
    await expect(recoverV2(sidePanelPage, { targetGeneratedVersionId: pending.id })).resolves.toEqual({ ok: true, value: undefined });
  });

  test("snapshots caller-owned V2 input before async preparation and persists only detached values", async ({ sidePanelPage }) => {
    const [target, alternate] = await resetAndSeedSavedCaptures(sidePanelPage);
    const source = sourceV1(target);
    await putGeneratedVersion(sidePanelPage, source);
    const alternateSource = {
      ...source,
      id: "generated-version-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceCaptureId: alternate.record.id,
      sourceCaptureSavedAt: alternate.savedAt
    };
    const alternateProjection = canonicalJsonStringify({
      captureContext: buildExactCaptureContextProjection(alternate.record),
      requestedOutput: REQUESTED_OUTPUT
    } as CanonicalJsonValue);
    const cases = [
      {
        attempt: "revision-attempt-01010101010101010101010101010101",
        mutation: { kind: "logicalAttemptId" as const, value: "revision-attempt-02020202020202020202020202020202" },
        inspect: (entry: GeneratedComponentVersionEntryV2, original: GeneratedComponentVersionEntryV2) => {
          expect(entry.operation.logicalAttemptId).toBe(original.operation.logicalAttemptId);
          expect(entry.id).toBe(original.id);
        }
      },
      {
        attempt: "revision-attempt-03030303030303030303030303030303",
        mutation: { kind: "sourceGeneratedVersionFingerprint" as const, value: wrongSourceGeneratedVersionFingerprint },
        inspect: (entry: GeneratedComponentVersionEntryV2, original: GeneratedComponentVersionEntryV2) => {
          expect(entry.operation.sourceGeneratedVersionFingerprint).toBe(original.operation.sourceGeneratedVersionFingerprint);
        }
      },
      {
        attempt: "revision-attempt-04040404040404040404040404040404",
        mutation: { kind: "sourceReviewFingerprint" as const, value: wrongCurrentCaptureProjectionFingerprint },
        inspect: (entry: GeneratedComponentVersionEntryV2, original: GeneratedComponentVersionEntryV2) => {
          expect(entry.sourceReviewFingerprint).toBe(original.sourceReviewFingerprint);
        }
      },
      {
        attempt: "revision-attempt-05050505050505050505050505050505",
        mutation: {
          kind: "canonicalSourceGeneratedVersionEntry" as const,
          value: canonicalJsonStringify(alternateSource as unknown as CanonicalJsonValue)
        },
        inspect: (entry: GeneratedComponentVersionEntryV2, original: GeneratedComponentVersionEntryV2) => {
          expect(entry.operation.sourceGeneratedVersionId).toBe(original.operation.sourceGeneratedVersionId);
          expect(entry.operation.sourceGeneratedVersionFingerprint).toBe(original.operation.sourceGeneratedVersionFingerprint);
        }
      },
      {
        attempt: "revision-attempt-06060606060606060606060606060606",
        mutation: { kind: "canonicalCurrentCaptureProjection" as const, value: alternateProjection },
        inspect: (entry: GeneratedComponentVersionEntryV2, original: GeneratedComponentVersionEntryV2) => {
          expect(entry.sourceReviewFingerprint).toBe(original.sourceReviewFingerprint);
        }
      },
      {
        attempt: "revision-attempt-07070707070707070707070707070707",
        mutation: { kind: "pendingSummary" as const, value: "Mutated caller response" },
        inspect: (entry: GeneratedComponentVersionEntryV2, original: GeneratedComponentVersionEntryV2) => {
          expect(entry.value.summary).toBe(original.value.summary);
          expect(entry.value.summary).not.toBe("Mutated caller response");
        }
      }
    ];

    for (const item of cases) {
      const pending = await pendingRevision(target, source, item.attempt);
      const input = await persistenceInput(target, source, pending, false);
      await expect(mutateDuringDigestPersistV2(sidePanelPage, input, item.mutation)).resolves.toMatchObject({ ok: true, value: pending });
      const stored = (await readGeneratedVersions(sidePanelPage, target.record.id)).find((entry) => (entry as { id?: string }).id === pending.id) as GeneratedComponentVersionEntryV2 | undefined;
      expect(stored).toEqual(pending);
      item.inspect(stored!, pending);
    }

    const returnedPending = await pendingRevision(target, source, "revision-attempt-08080808080808080808080808080808");
    const returnedInput = await persistenceInput(target, source, returnedPending, false);
    await expect(probeReturnedMutationPersistV2(sidePanelPage, returnedInput)).resolves.toMatchObject({
      ok: true,
      value: {
        value: returnedPending,
        summaryAfterMutation: returnedPending.value.summary,
        mutationThrew: true
      }
    });
    const storedReturned = (await readGeneratedVersions(sidePanelPage, target.record.id)).find((entry) => (entry as { id?: string }).id === returnedPending.id);
    expect(storedReturned).toEqual(returnedPending);

    const accessorPending = await pendingRevision(target, source, "revision-attempt-09090909090909090909090909090909");
    const accessorInput = await persistenceInput(target, source, accessorPending, false);
    await expect(accessorInputWithoutIndexedDb(sidePanelPage, accessorInput)).resolves.toEqual({ ok: false, opens: 0 });
  });

  test("accepts a V2 source, equal target idempotency, and conflicting target rejection", async ({ sidePanelPage }) => {
    const [target] = await resetAndSeedSavedCaptures(sidePanelPage);
    const source = await sourceV2(target);
    await putGeneratedVersion(sidePanelPage, source);
    const pending = await pendingRegeneration(target, source);
    const input = await persistenceInput(target, source, pending, false);

    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: true, value: pending });
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: true, value: pending });
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toHaveLength(2);

    const conflicting = {
      ...pending,
      value: {
        ...pending.value,
        summary: "Conflicting V2"
      }
    };
    await putGeneratedVersion(sidePanelPage, conflicting);
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false, code: "persistence-conflict" });
  });

  test("rejects changed CaptureRecord, missing source version, source tampering, and source linkage before target add", async ({ sidePanelPage }) => {
    const [target, other] = await resetAndSeedSavedCaptures(sidePanelPage);
    const source = sourceV1(target);
    await putGeneratedVersion(sidePanelPage, source);
    const pending = await pendingRevision(target, source);
    const input = await persistenceInput(target, source, pending, false);

    await deleteRecordWrapper(sidePanelPage, target.record.id);
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });
    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const wrapper = await readRecordWrapper(sidePanelPage, target.record.id) as { value: Record<string, unknown>; savedAt: string };
    await replaceRecordWrapper(sidePanelPage, { ...wrapper, savedAt: "2026-07-27T00:00:00.000Z" });
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, { ...source, value: { ...source.value, summary: "Tampered source" } });
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, { ...source, sourceCaptureId: other.record.id });
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([]);
  });

  test("requires exact transmitted projection while allowing notes-only local changes", async ({ sidePanelPage }) => {
    const [target] = await resetAndSeedSavedCaptures(sidePanelPage);
    const source = sourceV1(target);
    await putGeneratedVersion(sidePanelPage, source);
    const pending = await pendingRevision(target, source);
    const input = await persistenceInput(target, source, pending, false);
    const wrapper = await readRecordWrapper(sidePanelPage, target.record.id) as { value: typeof target.record; savedAt: string };
    await replaceRecordWrapper(sidePanelPage, {
      ...wrapper,
      value: {
        ...wrapper.value,
        library: {
          ...wrapper.value.library,
          notes: "Changed local notes only"
        }
      }
    });
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: true });

    const changedTitleInput = await persistenceInput(target, source, await pendingRevision(target, source, secondAttemptId), false);
    const changedWrapper = await readRecordWrapper(sidePanelPage, target.record.id) as { value: typeof target.record; savedAt: string };
    await replaceRecordWrapper(sidePanelPage, {
      ...changedWrapper,
      value: {
        ...changedWrapper.value,
        library: {
          ...changedWrapper.value.library,
          title: "Changed transmitted title"
        }
      }
    });
    await expect(persistV2(sidePanelPage, changedTitleInput)).resolves.toMatchObject({ ok: false });
  });

  test("enforces screenshot false and true transaction semantics without byte work", async ({ sidePanelPage }) => {
    const [target] = await resetAndSeedSavedCaptures(sidePanelPage);
    const source = sourceV1(target);
    await putGeneratedVersion(sidePanelPage, source);
    const falsePending = await pendingRevision(target, source);
    const falseInput = await persistenceInput(target, source, falsePending, false);

    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "corrupted-png" });
    await instrumentNoTransactionAsyncWork(sidePanelPage);
    await expect(persistV2(sidePanelPage, falseInput)).resolves.toMatchObject({ ok: true });
    await expect(getInstrumentation(sidePanelPage)).resolves.toEqual({
      blobReads: 0,
      imageBitmapCalls: 0,
      digestCalls: 0,
      fetchCalls: 0,
      timerCalls: 0
    });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const missingFalsePending = await pendingRevision(target, source, "revision-attempt-55555555555555555555555555555555");
    const missingFalseInput = await persistenceInput(target, source, missingFalsePending, false);
    await deleteScreenshotAsset(sidePanelPage, target.storageKey);
    await expect(persistV2(sidePanelPage, missingFalseInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const invalidFalsePending = await pendingRevision(target, source, "revision-attempt-66666666666666666666666666666666");
    const invalidFalseInput = await persistenceInput(target, source, invalidFalsePending, false);
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", declaredByteLength: 1 });
    await expect(persistV2(sidePanelPage, invalidFalseInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const driftFalsePending = await pendingRevision(target, source, "revision-attempt-77777777777777777777777777777777");
    const driftFalseInput = await persistenceInput(target, source, driftFalsePending, false);
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", declaredWidth: target.record.assets.screenshot.width + 1 });
    await expect(persistV2(sidePanelPage, driftFalseInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const linkedFalsePending = await pendingRevision(target, source, "revision-attempt-88888888888888888888888888888888");
    const linkedFalseInput = await persistenceInput(target, source, linkedFalsePending, false);
    await replaceScreenshotAssetVariant(sidePanelPage, {
      seededCapture: target,
      variant: "valid-png",
      declaredWidth: target.record.assets.screenshot.width + 1,
      updateRecordReference: true
    });
    await expect(persistV2(sidePanelPage, linkedFalseInput)).resolves.toMatchObject({ ok: true });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const truePending = await pendingRevision(target, source, secondAttemptId, true);
    const trueInput = await persistenceInput(target, source, truePending, true);
    await expect(persistV2(sidePanelPage, trueInput)).resolves.toMatchObject({ ok: true });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const referenceOnlyPending = await pendingRevision(target, source, "revision-attempt-99999999999999999999999999999999", true);
    const referenceOnlyInput = await persistenceInput(target, source, referenceOnlyPending, true);
    const referenceOnlyWrapper = await readRecordWrapper(sidePanelPage, target.record.id) as { value: typeof target.record; savedAt: string };
    await replaceRecordWrapper(sidePanelPage, {
      ...referenceOnlyWrapper,
      value: {
        ...referenceOnlyWrapper.value,
        assets: {
          ...referenceOnlyWrapper.value.assets,
          screenshot: {
            ...referenceOnlyWrapper.value.assets.screenshot,
            width: referenceOnlyWrapper.value.assets.screenshot.width + 1
          }
        }
      }
    });
    await expect(persistV2(sidePanelPage, referenceOnlyInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const widthPending = await pendingRevision(target, source, "revision-attempt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true);
    const widthInput = await persistenceInput(target, source, widthPending, true);
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", declaredWidth: target.record.assets.screenshot.width + 1 });
    await expect(persistV2(sidePanelPage, widthInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const heightPending = await pendingRevision(target, source, "revision-attempt-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", true);
    const heightInput = await persistenceInput(target, source, heightPending, true);
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", declaredHeight: target.record.assets.screenshot.height + 1 });
    await expect(persistV2(sidePanelPage, heightInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const mediaTypePending = await pendingRevision(target, source, "revision-attempt-cccccccccccccccccccccccccccccccc", true);
    const mediaTypeInput = await persistenceInput(target, source, mediaTypePending, true);
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", mediaType: "image/jpeg" });
    await expect(persistV2(sidePanelPage, mediaTypeInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const byteLengthPending = await pendingRevision(target, source, "revision-attempt-dddddddddddddddddddddddddddddddd", true);
    const byteLengthInput = await persistenceInput(target, source, byteLengthPending, true);
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", declaredByteLength: target.record.assets.screenshot.byteLength + 1 });
    await expect(persistV2(sidePanelPage, byteLengthInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const linkedTruePending = await pendingRevision(target, source, "revision-attempt-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", true);
    const linkedTrueInput = await persistenceInput(target, source, linkedTruePending, true);
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", updateRecordReference: true, declaredWidth: target.record.assets.screenshot.width + 1 });
    await expect(persistV2(sidePanelPage, linkedTrueInput)).resolves.toMatchObject({ ok: false });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    const storageKeyPending = await pendingRevision(target, source, "revision-attempt-ffffffffffffffffffffffffffffffff", true);
    const storageKeyInput = await persistenceInput(target, source, storageKeyPending, true);
    const storageKeyWrapper = await readRecordWrapper(sidePanelPage, target.record.id) as { value: typeof target.record; savedAt: string };
    await replaceRecordWrapper(sidePanelPage, {
      ...storageKeyWrapper,
      value: {
        ...storageKeyWrapper.value,
        assets: {
          ...storageKeyWrapper.value.assets,
          screenshot: {
            ...storageKeyWrapper.value.assets.screenshot,
            storageKey: "screenshots/capture-ffffffff-ffff-ffff-ffff-ffffffffffff.png"
          }
        }
      }
    });
    await expect(persistV2(sidePanelPage, storageKeyInput)).resolves.toMatchObject({ ok: false });

    await deleteScreenshotAsset(sidePanelPage, target.storageKey);
  });

  test("handles pre-abort, malformed existing target, recovery absence, and V1 compatibility readers", async ({ sidePanelPage }) => {
    const [target] = await resetAndSeedSavedCaptures(sidePanelPage);
    const source = sourceV1(target);
    await putGeneratedVersion(sidePanelPage, source);
    const pending = await pendingRevision(target, source);
    const input = await persistenceInput(target, source, pending, false);
    await expect(preAbortedPersistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false, name: "PersistenceError" });
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([source]);
    await expect(recoverV2(sidePanelPage, { targetGeneratedVersionId: pending.id })).resolves.toEqual({ ok: true, value: undefined });
    await expect(abortBeforeAddPersistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });
    await expect(recoverV2(sidePanelPage, { targetGeneratedVersionId: pending.id })).resolves.toEqual({ ok: true, value: undefined });

    await expect(readBackMismatchPersistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });
    await expect(recoverV2(sidePanelPage, { targetGeneratedVersionId: pending.id })).resolves.toEqual({ ok: true, value: undefined });

    const boundaryAbortPending = await pendingRevision(target, source, secondAttemptId);
    const boundaryAbortInput = await persistenceInput(target, source, boundaryAbortPending, false);
    await expect(abortAtCommitBoundaryPersistV2(sidePanelPage, boundaryAbortInput)).resolves.toMatchObject({ ok: true, value: boundaryAbortPending });
    await expect(recoverV2(sidePanelPage, { targetGeneratedVersionId: boundaryAbortPending.id })).resolves.toEqual({ ok: true, value: boundaryAbortPending });
    await expect(persistV2(sidePanelPage, boundaryAbortInput)).resolves.toMatchObject({ ok: true, value: boundaryAbortPending });
    expect((await readGeneratedVersions(sidePanelPage, target.record.id)).filter((entry) => (entry as { id?: string }).id === boundaryAbortPending.id)).toHaveLength(1);

    await putGeneratedVersion(sidePanelPage, { ...pending, operation: { ...pending.operation, logicalAttemptId: "bad" } });
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });
    await expect(unionRead(sidePanelPage, source.id)).resolves.toMatchObject({ ok: true, value: source });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    await putGeneratedVersion(sidePanelPage, pending);
    await expect(unionList(sidePanelPage, target.record.id)).resolves.toMatchObject({ ok: true, value: [pending, source] });
    await expect(v1List(sidePanelPage, target.record.id)).resolves.toEqual({ ok: true, value: [source] });
    await deleteRecordWrapper(sidePanelPage, target.record.id);
    await expect(v1Read(sidePanelPage, pending.id)).resolves.toEqual({ ok: true, value: undefined });
    await expect(unionList(sidePanelPage, target.record.id)).resolves.toMatchObject({ ok: true, value: [pending, source] });
    expect(await readGeneratedVersions(sidePanelPage)).toContainEqual(pending);
    await putGeneratedVersion(sidePanelPage, { ...pending, contractVersion: 2, operation: { ...pending.operation, kind: "revision", instruction: "" } });
    await expect(v1Read(sidePanelPage, pending.id)).resolves.toEqual({ ok: true, value: undefined });
  });

  test("validates union and recovery reader ids before IndexedDB access", async ({ sidePanelPage }) => {
    const [target] = await resetAndSeedSavedCaptures(sidePanelPage);
    await expect(unionList(sidePanelPage, target.record.id)).resolves.toEqual({ ok: true, value: [] });
    await expect(unionList(sidePanelPage, "capture-11111111111111111111111111111111")).resolves.toEqual({ ok: true, value: [] });

    await expect(invalidReaderCallWithoutIndexedDb(sidePanelPage, "unionList", "not-a-capture-id")).resolves.toEqual({ ok: false, opens: 0 });
    await expect(invalidReaderCallWithoutIndexedDb(sidePanelPage, "unionById", "not-a-generated-version-id")).resolves.toEqual({ ok: false, opens: 0 });
    await expect(invalidReaderCallWithoutIndexedDb(sidePanelPage, "recover", {
      targetGeneratedVersionId: "generated-version-11111111111111111111111111111111",
      expectedSourceCaptureId: "not-a-capture-id"
    })).resolves.toEqual({ ok: false, opens: 0 });
    await expect(invalidReaderCallWithoutIndexedDb(sidePanelPage, "v1Read", "not-a-generated-version-id")).resolves.toEqual({ ok: false, opens: 0 });
    await expect(invalidReaderCallWithoutIndexedDb(sidePanelPage, "v1List", "not-a-capture-id")).resolves.toEqual({ ok: false, opens: 0 });
  });

  test("keeps Slice 4 storage persistence unreachable from product boundaries", () => {
    const root = process.cwd();
    expect(readFileSync(join(root, "extension/src/sidepanel/GenerationWorkflow.tsx"), "utf8")).not.toContain("persistPendingGeneratedComponentVersionV2");
    expect(readFileSync(join(root, "extension/src/generation/revision-transport.ts"), "utf8")).not.toContain("persistPendingGeneratedComponentVersionV2");
    expect(readFileSync(join(root, "backend/src/app.ts"), "utf8")).not.toContain("persistPendingGeneratedComponentVersionV2");
    expect(readFileSync(join(root, "extension/src/preview/host.ts"), "utf8")).not.toContain("persistPendingGeneratedComponentVersionV2");
    expect(readFileSync(join(root, "extension/manifest.json"), "utf8")).not.toContain("revise-component");
    expect(readFileSync(join(root, "package.json"), "utf8")).not.toContain("revise-component");
  });
});

function sourceV1(target: SeededCapture): GeneratedComponentVersionEntryV1 {
  return {
    id: sourceVersionId,
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    sourceReviewFingerprint: "d".repeat(64),
    createdAt: "2026-07-26T00:00:00.000Z",
    value: validResponse()
  };
}

async function sourceV2(target: SeededCapture): Promise<GeneratedComponentVersionEntryV2> {
  const previousSource = sourceV1(target);
  return buildPendingRegenerationGeneratedVersionEntryV2({
    id: await deriveRevisionGeneratedVersionId("revision-attempt-44444444444444444444444444444444"),
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    currentCaptureProjectionFingerprint: await currentProjectionFingerprint(target),
    createdAt: "2026-07-26T00:05:00.000Z",
    value: validResponse(),
    expectedSourceComponentName: "GeneratedFixture",
    logicalAttemptId: "revision-attempt-44444444444444444444444444444444",
    reviewAttemptFingerprint,
    sourceGeneratedVersionId: sourceVersionId,
    sourceGeneratedVersionFingerprint: await computeSourceGeneratedVersionFingerprint(previousSource),
    screenshotIncluded: false
  });
}

async function pendingRevision(
  target: SeededCapture,
  source: GeneratedComponentVersionEntry,
  logicalAttemptId = targetAttemptId,
  screenshotIncluded = false
): Promise<GeneratedComponentVersionEntryV2> {
  const instruction = "Update primary label";
  return buildPendingRevisionGeneratedVersionEntryV2({
    id: await deriveRevisionGeneratedVersionId(logicalAttemptId),
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    currentCaptureProjectionFingerprint: await currentProjectionFingerprint(target),
    createdAt,
    value: validResponse(),
    expectedSourceComponentName: "GeneratedFixture",
    logicalAttemptId,
    reviewAttemptFingerprint,
    sourceGeneratedVersionId: source.id,
    sourceGeneratedVersionFingerprint: await computeSourceGeneratedVersionFingerprint(source),
    instruction,
    instructionFingerprint: await computeRevisionInstructionFingerprint(instruction),
    screenshotIncluded
  });
}

async function pendingRegeneration(target: SeededCapture, source: GeneratedComponentVersionEntry): Promise<GeneratedComponentVersionEntryV2> {
  return buildPendingRegenerationGeneratedVersionEntryV2({
    id: await deriveRevisionGeneratedVersionId(targetAttemptId),
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    currentCaptureProjectionFingerprint: await currentProjectionFingerprint(target),
    createdAt,
    value: validResponse(),
    expectedSourceComponentName: "GeneratedFixture",
    logicalAttemptId: targetAttemptId,
    reviewAttemptFingerprint,
    sourceGeneratedVersionId: source.id,
    sourceGeneratedVersionFingerprint: await computeSourceGeneratedVersionFingerprint(source),
    screenshotIncluded: false
  });
}

async function currentProjectionFingerprint(target: SeededCapture) {
  return computeCurrentCaptureProjectionFingerprint({
    captureContext: buildExactCaptureContextProjection(target.record),
    requestedOutput: REQUESTED_OUTPUT
  });
}

async function persistenceInput(target: SeededCapture, source: GeneratedComponentVersionEntry, pending: GeneratedComponentVersionEntryV2, screenshotIncluded: boolean) {
  const screenshot = await readScreenshotAssetSnapshotForInput(target, screenshotIncluded);
  return {
    pendingEntry: pending,
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    sourceGeneratedVersionId: source.id,
    canonicalSourceGeneratedVersionEntry: canonicalJsonStringify(source as unknown as CanonicalJsonValue),
    canonicalCurrentCaptureProjection: canonicalJsonStringify({
      captureContext: buildExactCaptureContextProjection(target.record),
      requestedOutput: REQUESTED_OUTPUT
    } as CanonicalJsonValue),
    screenshotIncluded,
    expectedScreenshotStorageKey: target.storageKey,
    ...(screenshot ? { screenshot } : {}),
    targetGeneratedVersionId: pending.id
  };
}

async function readScreenshotAssetSnapshotForInput(target: SeededCapture, screenshotIncluded: boolean) {
  if (!screenshotIncluded) {
    return undefined;
  }
  return {
    mediaType: "image/png" as const,
    width: target.record.assets.screenshot.width,
    height: target.record.assets.screenshot.height,
    byteLength: target.record.assets.screenshot.byteLength
  };
}

function validResponse(): ComponentGenerationResponseV1 {
  return {
    contractVersion: 1,
    componentName: "GeneratedFixture",
    framework: "react",
    styling: "tailwind",
    code: "export function GeneratedFixture() { return <button>Save</button>; }",
    summary: "Accessible button",
    approximationNotes: "None",
    metadata: { providerLabel: "mock", providerModelLabel: "fixture" }
  };
}

async function persistV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.persistPendingGeneratedComponentVersionV2(value as never), input);
}

async function preAbortedPersistV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.persistPendingGeneratedComponentVersionV2PreAborted(value as never), input);
}

async function abortBeforeAddPersistV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.persistPendingGeneratedComponentVersionV2AbortBeforeAdd(value as never), input);
}

async function abortAtCommitBoundaryPersistV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.persistPendingGeneratedComponentVersionV2AbortAtCommitBoundary(value as never), input);
}

async function readBackMismatchPersistV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.persistPendingGeneratedComponentVersionV2ReadBackMismatch(value as never), input);
}

async function mutateDuringDigestPersistV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown, mutation: unknown) {
  return page.evaluate(
    async ({ input, mutation }) =>
      window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.persistPendingGeneratedComponentVersionV2MutateDuringDigest(input as never, mutation as never),
    { input, mutation }
  );
}

async function probeReturnedMutationPersistV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.persistPendingGeneratedComponentVersionV2ProbeReturnedMutation(value as never), input);
}

async function accessorInputWithoutIndexedDb(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => {
    const originalOpen = indexedDB.open.bind(indexedDB);
    let opens = 0;
    indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
      opens += 1;
      return originalOpen(...args);
    }) as IDBFactory["open"];
    const mutableInput = value as Record<string, unknown>;
    const pendingEntry = mutableInput.pendingEntry as { value: Record<string, unknown> };
    Object.defineProperty(pendingEntry.value, "summary", {
      get() {
        return "Accessor summary";
      },
      enumerable: true
    });
    try {
      const result = await window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.persistPendingGeneratedComponentVersionV2(mutableInput as never);
      return { ok: result.ok, opens };
    } finally {
      indexedDB.open = originalOpen;
    }
  }, input);
}

async function recoverV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.recoverGeneratedComponentVersionV2(value as never), input);
}

async function unionRead(page: Parameters<typeof resetAndSeedSavedCaptures>[0], id: string) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.getGeneratedComponentVersionUnionById(value), id);
}

async function unionList(page: Parameters<typeof resetAndSeedSavedCaptures>[0], sourceCaptureId: string) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.listGeneratedComponentVersionUnionBySourceCaptureId(value), sourceCaptureId);
}

async function v1Read(page: Parameters<typeof resetAndSeedSavedCaptures>[0], id: string) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.getGeneratedComponentVersionById(value), id);
}

async function v1List(page: Parameters<typeof resetAndSeedSavedCaptures>[0], sourceCaptureId: string) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.listGeneratedComponentVersionsBySourceCaptureId(value), sourceCaptureId);
}

async function invalidReaderCallWithoutIndexedDb(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  kind: "unionList" | "unionById" | "recover" | "v1Read" | "v1List",
  value: unknown
) {
  return page.evaluate(async ({ kind, value }) => {
    const originalOpen = indexedDB.open.bind(indexedDB);
    let opens = 0;
    indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
      opens += 1;
      return originalOpen(...args);
    }) as IDBFactory["open"];
    try {
      let result: { ok: boolean };
      if (kind === "unionList") {
        result = await window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.listGeneratedComponentVersionUnionBySourceCaptureId(value as string);
      } else if (kind === "unionById") {
        result = await window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.getGeneratedComponentVersionUnionById(value as string);
      } else if (kind === "recover") {
        result = await window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.recoverGeneratedComponentVersionV2(value as never);
      } else if (kind === "v1Read") {
        result = await window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.getGeneratedComponentVersionById(value as string);
      } else {
        result = await window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.listGeneratedComponentVersionsBySourceCaptureId(value as string);
      }
      return { ok: result.ok, opens };
    } finally {
      indexedDB.open = originalOpen;
    }
  }, { kind, value });
}

async function instrumentNoTransactionAsyncWork(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  await page.evaluate(() => {
    const counters = { blobReads: 0, imageBitmapCalls: 0, digestCalls: 0, fetchCalls: 0, timerCalls: 0 };
    (window as typeof window & { __EC_SLICE4_COUNTERS__?: typeof counters }).__EC_SLICE4_COUNTERS__ = counters;
    let activePersistenceTransactionDepth = 0;
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function patchedTransaction(
      this: IDBDatabase,
      storeNames: string | string[],
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions
    ) {
      const transaction = originalTransaction.call(this, storeNames, mode, options);
      const names = Array.isArray(storeNames) ? [...storeNames].sort() : [storeNames];
      const isSlice4PersistenceTransaction =
        mode === "readwrite" &&
        JSON.stringify(names) === JSON.stringify(["captureRecords", "generatedComponentVersions", "screenshotAssets"].sort());
      if (isSlice4PersistenceTransaction) {
        activePersistenceTransactionDepth += 1;
        const clear = () => {
          activePersistenceTransactionDepth = Math.max(0, activePersistenceTransactionDepth - 1);
        };
        transaction.addEventListener("complete", clear, { once: true });
        transaction.addEventListener("abort", clear, { once: true });
        transaction.addEventListener("error", clear, { once: true });
      }
      return transaction;
    };
    const countIfActive = (key: keyof typeof counters) => {
      if (activePersistenceTransactionDepth > 0) {
        counters[key] += 1;
      }
    };
    const originalArrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function patchedArrayBuffer(this: Blob) {
      countIfActive("blobReads");
      return originalArrayBuffer.call(this);
    };
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = ((...args: Parameters<SubtleCrypto["digest"]>) => {
      countIfActive("digestCalls");
      return originalDigest(...args);
    }) as SubtleCrypto["digest"];
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((...args: Parameters<typeof fetch>) => {
      countIfActive("fetchCalls");
      return originalFetch(...args);
    }) as typeof fetch;
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      countIfActive("timerCalls");
      return originalSetTimeout(...args);
    }) as typeof setTimeout;
    const originalCreateImageBitmap = window.createImageBitmap?.bind(window);
    if (originalCreateImageBitmap) {
      window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
        countIfActive("imageBitmapCalls");
        return originalCreateImageBitmap(...args);
      }) as typeof createImageBitmap;
    }
  });
}

async function getInstrumentation(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  return page.evaluate(() => (window as typeof window & { __EC_SLICE4_COUNTERS__?: unknown }).__EC_SLICE4_COUNTERS__);
}
