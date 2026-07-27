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
  computeRevisionInstructionFingerprint,
  deriveRevisionGeneratedVersionId
} from "../../extension/src/generation/revision-contract";
import { canonicalJsonStringify, type CanonicalJsonValue } from "../../extension/src/generation/canonical-json";
import { buildExactCaptureContextProjection } from "../../extension/src/generation/projection";
import type { GeneratedComponentVersionEntry, GeneratedComponentVersionEntryV1, GeneratedComponentVersionEntryV2 } from "../../extension/src/shared/generated-version-contract";

const sourceVersionId = "generated-version-11111111111111111111111111111111";
const targetAttemptId = "revision-attempt-22222222222222222222222222222222";
const secondAttemptId = "revision-attempt-33333333333333333333333333333333";
const reviewAttemptFingerprint = "a".repeat(64);
const sourceGeneratedVersionFingerprint = "b".repeat(64);
const currentCaptureProjectionFingerprint = "c".repeat(64);
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

  test("rejects changed CaptureRecord, source version, and source linkage before target add", async ({ sidePanelPage }) => {
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

    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", color: "#ff0000" });
    await instrumentNoTransactionAsyncWork(sidePanelPage);
    await expect(persistV2(sidePanelPage, falseInput)).resolves.toMatchObject({ ok: true });
    await expect(getInstrumentation(sidePanelPage)).resolves.toEqual({
      blobReads: 0,
      imageBitmapCalls: 0,
      digestCalls: 0,
      fetchCalls: 0,
      timerCalls: 0
    });

    const truePending = await pendingRevision(target, source, secondAttemptId, true);
    const trueInput = await persistenceInput(target, source, truePending, true);
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", declaredWidth: target.record.assets.screenshot.width + 1 });
    await expect(persistV2(sidePanelPage, trueInput)).resolves.toMatchObject({ ok: false });
    await replaceScreenshotAssetVariant(sidePanelPage, { seededCapture: target, variant: "valid-png", updateRecordReference: true, declaredWidth: target.record.assets.screenshot.width + 1 });
    await expect(persistV2(sidePanelPage, trueInput)).resolves.toMatchObject({ ok: false });
    await deleteScreenshotAsset(sidePanelPage, target.storageKey);
    await expect(persistV2(sidePanelPage, trueInput)).resolves.toMatchObject({ ok: false });
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

    await putGeneratedVersion(sidePanelPage, { ...pending, operation: { ...pending.operation, logicalAttemptId: "bad" } });
    await expect(persistV2(sidePanelPage, input)).resolves.toMatchObject({ ok: false });
    await expect(unionRead(sidePanelPage, source.id)).resolves.toMatchObject({ ok: true, value: source });

    await resetAndSeedSavedCaptures(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, source);
    await putGeneratedVersion(sidePanelPage, pending);
    await deleteRecordWrapper(sidePanelPage, target.record.id);
    await expect(v1Read(sidePanelPage, pending.id)).resolves.toEqual({ ok: true, value: undefined });
    expect(await readGeneratedVersions(sidePanelPage)).toContainEqual(pending);
    await putGeneratedVersion(sidePanelPage, { ...pending, contractVersion: 2, operation: { ...pending.operation, kind: "revision", instruction: "" } });
    await expect(v1Read(sidePanelPage, pending.id)).resolves.toEqual({ ok: true, value: undefined });
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
  return buildPendingRegenerationGeneratedVersionEntryV2({
    id: await deriveRevisionGeneratedVersionId("revision-attempt-44444444444444444444444444444444"),
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    currentCaptureProjectionFingerprint,
    createdAt: "2026-07-26T00:05:00.000Z",
    value: validResponse(),
    expectedSourceComponentName: "GeneratedFixture",
    logicalAttemptId: "revision-attempt-44444444444444444444444444444444",
    reviewAttemptFingerprint,
    sourceGeneratedVersionId: sourceVersionId,
    sourceGeneratedVersionFingerprint,
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
    currentCaptureProjectionFingerprint,
    createdAt,
    value: validResponse(),
    expectedSourceComponentName: "GeneratedFixture",
    logicalAttemptId,
    reviewAttemptFingerprint,
    sourceGeneratedVersionId: source.id,
    sourceGeneratedVersionFingerprint,
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
    currentCaptureProjectionFingerprint,
    createdAt,
    value: validResponse(),
    expectedSourceComponentName: "GeneratedFixture",
    logicalAttemptId: targetAttemptId,
    reviewAttemptFingerprint,
    sourceGeneratedVersionId: source.id,
    sourceGeneratedVersionFingerprint,
    screenshotIncluded: false
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

async function recoverV2(page: Parameters<typeof resetAndSeedSavedCaptures>[0], input: unknown) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.recoverGeneratedComponentVersionV2(value as never), input);
}

async function unionRead(page: Parameters<typeof resetAndSeedSavedCaptures>[0], id: string) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.getGeneratedComponentVersionUnionById(value), id);
}

async function v1Read(page: Parameters<typeof resetAndSeedSavedCaptures>[0], id: string) {
  return page.evaluate(async (value) => window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__!.getGeneratedComponentVersionById(value), id);
}

async function instrumentNoTransactionAsyncWork(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  await page.evaluate(() => {
    const counters = { blobReads: 0, imageBitmapCalls: 0, digestCalls: 0, fetchCalls: 0, timerCalls: 0 };
    (window as typeof window & { __EC_SLICE4_COUNTERS__?: typeof counters }).__EC_SLICE4_COUNTERS__ = counters;
    const originalArrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function patchedArrayBuffer(this: Blob) {
      counters.blobReads += 1;
      return originalArrayBuffer.call(this);
    };
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = ((...args: Parameters<SubtleCrypto["digest"]>) => {
      counters.digestCalls += 1;
      return originalDigest(...args);
    }) as SubtleCrypto["digest"];
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((...args: Parameters<typeof fetch>) => {
      counters.fetchCalls += 1;
      return originalFetch(...args);
    }) as typeof fetch;
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      counters.timerCalls += 1;
      return originalSetTimeout(...args);
    }) as typeof setTimeout;
    const originalCreateImageBitmap = window.createImageBitmap?.bind(window);
    if (originalCreateImageBitmap) {
      window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
        counters.imageBitmapCalls += 1;
        return originalCreateImageBitmap(...args);
      }) as typeof createImageBitmap;
    }
  });
}

async function getInstrumentation(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  return page.evaluate(() => (window as typeof window & { __EC_SLICE4_COUNTERS__?: unknown }).__EC_SLICE4_COUNTERS__);
}
