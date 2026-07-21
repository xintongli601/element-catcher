import { test, expect, openSidePanelPage } from "./extension-fixture";
import {
  CAPTURE_RECORD_STORE_NAME,
  ELEMENT_CATCHER_DATABASE_VERSION,
  GENERATED_COMPONENT_VERSION_STORE_NAME,
  createInvalidVersionTwoDatabase,
  deleteRecordWrapper,
  deleteScreenshotAsset,
  readAllRecordWrappers,
  readAllScreenshotAssetSnapshots,
  readGeneratedStoreInfo,
  readGeneratedVersionKeys,
  readGeneratedVersions,
  readRawDatabaseSnapshot,
  SCREENSHOT_ASSET_STORE_NAME,
  putGeneratedVersion,
  readPersistenceCounts,
  readRecordWrapper,
  replaceRecordWrapper,
  readVersionOneSnapshots,
  readScreenshotAssetSnapshot,
  resetAndSeedSavedCaptures,
  resetAndSeedVersionOneDatabase
} from "./indexed-db-fixtures";
import type { JsonObject } from "../../extension/src/shared/capture-schema";

test.describe("Milestone 5D generated component persistence", () => {
  test("migrates a real version 1 database without changing capture records or screenshots", async ({ sidePanelPage }) => {
    await resetAndSeedVersionOneDatabase(sidePanelPage);
    const before = await readVersionOneSnapshots(sidePanelPage);
    expect(before).toMatchObject({
      version: 1,
      stores: [CAPTURE_RECORD_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort()
    });

    const counts = await readPersistenceCounts(sidePanelPage);
    const storeInfo = await readGeneratedStoreInfo(sidePanelPage);

    expect(counts).toEqual({
      version: ELEMENT_CATCHER_DATABASE_VERSION,
      stores: [CAPTURE_RECORD_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort(),
      captureRecords: before.wrappers.length,
      screenshotAssets: before.assets.length,
      generatedComponentVersions: 0
    });
    expect(storeInfo).toEqual({
      keyPath: "id",
      indexes: [{ name: "sourceCaptureId", keyPath: "sourceCaptureId", unique: false }]
    });
    expect(await readAllRecordWrappers(sidePanelPage)).toEqual(before.wrappers);
    expect(await readAllScreenshotAssetSnapshots(sidePanelPage)).toEqual(before.assets);
  });

  test("database opens at version 2 with exact generated-version store and empty migration result", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    const counts = await readPersistenceCounts(sidePanelPage);
    const storeInfo = await readGeneratedStoreInfo(sidePanelPage);
    expect(counts).toEqual({
      version: ELEMENT_CATCHER_DATABASE_VERSION,
      stores: [CAPTURE_RECORD_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort(),
      captureRecords: seeded.length,
      screenshotAssets: seeded.length,
      generatedComponentVersions: 0
    });
    expect(storeInfo).toEqual({
      keyPath: "id",
      indexes: [{ name: "sourceCaptureId", keyPath: "sourceCaptureId", unique: false }]
    });
  });

  test("mock generation persists one validated version and survives side panel reopen", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    await installBase64Counter(context);
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];
    const beforeWrapper = await readRecordWrapper(page, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(page, target.storageKey);
    const beforeCounts = await readPersistenceCounts(page);

    await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await expect(page.getByRole("heading", { name: "Generated versions" })).toBeVisible();
    await expect(page.getByText("No generated versions saved yet.")).toBeVisible();
    await page.getByRole("button", { name: "Generate component" }).click();
    await page.getByLabel(/Data is leaving your device/).check();
    await page.getByRole("button", { name: "Send to AI and generate" }).click();
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toBeVisible();
    await expect(page.getByText("This generated component version was saved locally.")).toBeVisible();
    expect(await getMockCallCount(page)).toBe(1);
    expect(await getBase64Count(page)).toBe(1);

    expect(await readRecordWrapper(page, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(page, target.storageKey)).toEqual(beforeAsset);
    expect(await readPersistenceCounts(page)).toEqual({
      ...beforeCounts,
      generatedComponentVersions: beforeCounts.generatedComponentVersions + 1
    });

    await page.getByRole("button", { name: "Close result" }).click();
    await expect(page.getByText("1 generated version saved locally.")).toBeVisible();
    await expect(page.getByRole("button", { name: /GeneratedFixture/ })).toBeVisible();
    await page.getByRole("button", { name: /GeneratedFixture/ }).click();
    await expect(page.locator("pre.generated-code code")).toContainText("export function GeneratedFixture");
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator("[dangerouslySetInnerHTML]")).toHaveCount(0);

    await page.close();
    const reopened = await openSidePanelPage(context, extensionId);
    await reopened.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await expect(reopened.getByText("1 generated version saved locally.")).toBeVisible();
  });

  test("valid inert generated source text may contain internal-looking names without structural leakage", async ({ context, extensionId }) => {
    await installMockHarness(context, "success", 0, {
      contractVersion: 1,
      componentName: "GeneratedFixture",
      framework: "react",
      styling: "tailwind",
      code: [
        "export function GeneratedFixture() {",
        "  const dataUrl = \"\";",
        "  const blob = new Blob([]);",
        "  const response_id = \"local\";",
        "  return <pre>{dataUrl + response_id + blob.size}</pre>;",
        "}"
      ].join("\n"),
      summary: "Uses inert local variable names.",
      approximationNotes: "The generated code is source text only."
    });
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];

    await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await page.getByRole("button", { name: "Generate component" }).click();
    await page.getByLabel(/Data is leaving your device/).check();
    await page.getByRole("button", { name: "Send to AI and generate" }).click();
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toBeVisible();
    await expect(page.locator("pre.generated-code code")).toContainText("const dataUrl = \"\";");
    await expect(page.locator("pre.generated-code code")).toContainText("const blob = new Blob([]);");
    await expect(page.locator("pre.generated-code code")).toContainText("const response_id = \"local\";");
    const [entry] = await readGeneratedVersions(page, target.record.id) as Array<{ value: Record<string, unknown> }>;
    expect(Object.keys(entry)).toEqual(["id", "sourceCaptureId", "sourceCaptureSavedAt", "sourceReviewFingerprint", "createdAt", "value"]);
    expect(Object.keys(entry.value).sort()).toEqual(["approximationNotes", "code", "componentName", "contractVersion", "framework", "styling", "summary"].sort());
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator("[dangerouslySetInnerHTML]")).toHaveCount(0);
  });

  test("Retry saving reuses the pending version without another provider call, HTTP request, consent, or Base64 conversion", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    await installPersistenceHarness(context, { failBeforeAddCount: 1 });
    await installBase64Counter(context);
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) {
        httpRequests.push(request.url());
      }
    });
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];

    await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await page.getByRole("button", { name: "Generate component" }).click();
    await page.getByLabel(/Data is leaving your device/).check();
    await page.getByRole("button", { name: "Send to AI and generate" }).click();
    await expect(page.getByRole("button", { name: "Retry saving" })).toBeVisible();
    expect(await getMockCallCount(page)).toBe(1);
    expect(await getBase64Count(page)).toBe(1);
    expect(await readGeneratedVersions(page, target.record.id)).toEqual([]);
    const firstAttempts = await getPersistenceAttempts(page);
    expect(firstAttempts).toHaveLength(1);

    await page.getByRole("button", { name: "Retry saving" }).click();
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toBeVisible();
    expect(await getMockCallCount(page)).toBe(1);
    expect(await getBase64Count(page)).toBe(1);
    expect(httpRequests).toEqual([]);
    const attempts = await getPersistenceAttempts(page);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    const versions = await readGeneratedVersions(page, target.record.id) as unknown[];
    expect(versions).toHaveLength(1);
  });

  test("production add is idempotent for the same generated version entry", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const entry = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:00:00.000Z", "IdempotentVersion");

    await expect(addGeneratedVersionThroughProductionBridge(sidePanelPage, target, entry)).resolves.toMatchObject({ ok: true, value: entry });
    await expect(addGeneratedVersionThroughProductionBridge(sidePanelPage, target, entry)).resolves.toMatchObject({ ok: true, value: entry });

    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([entry]);
    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({ generatedComponentVersions: 1 });
  });

  test("production add rejects same generated id with different response content as a conflict", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const original = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:00:00.000Z", "ConflictOriginal");
    const conflicting = {
      ...original,
      value: {
        ...original.value,
        componentName: "ConflictChanged",
        code: "export function ConflictChanged() {\n  return <div>changed</div>;\n}"
      }
    };

    await expect(addGeneratedVersionThroughProductionBridge(sidePanelPage, target, original)).resolves.toMatchObject({ ok: true, value: original });
    await expect(addGeneratedVersionThroughProductionBridge(sidePanelPage, target, conflicting)).resolves.toMatchObject({
      ok: false,
      code: "persistence-conflict"
    });

    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([original]);
    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({ generatedComponentVersions: 1 });
  });

  test("production add source guards reject unsafe source mutations without writing generated entries", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const beforeWrapper = await readRecordWrapper(sidePanelPage, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);

    const cases: Array<{
      name: string;
      prepare: () => Promise<unknown>;
      entry?: ReturnType<typeof createGeneratedVersionEntry>;
      expectedRecordValue?: JsonObject;
      expectedSavedAt?: string;
      expectedReviewFingerprint?: string;
    }> = [
      {
        name: "missing source",
        prepare: async () => {
          await deleteRecordWrapper(sidePanelPage, target.record.id);
          return undefined;
        }
      },
      {
        name: "malformed source wrapper",
        prepare: async () => {
          const wrapper = {
            ...(beforeWrapper as Record<string, unknown>),
            savedAt: "not-a-normalized-timestamp"
          };
          await replaceRecordWrapper(sidePanelPage, wrapper);
          return wrapper;
        }
      },
      {
        name: "invalid complete CaptureRecord",
        prepare: async () => replaceSourceValue(sidePanelPage, beforeWrapper, ({ environment: _environment, ...record }) => record)
      },
      {
        name: "wrapper/record ID mismatch",
        prepare: async () => replaceSourceValue(sidePanelPage, beforeWrapper, (record) => ({
          ...record,
          id: "capture-ffffffff-ffff-ffff-ffff-ffffffffffff"
        }))
      },
      {
        name: "changed source JSON",
        prepare: async () => replaceSourceValue(sidePanelPage, beforeWrapper, (record) => ({
          ...record,
          library: {
            ...record.library,
            title: "Changed before generated version save"
          }
        })),
        expectedRecordValue: target.record as unknown as JsonObject
      },
      {
        name: "changed savedAt",
        prepare: async () => {
          const wrapper = {
            ...(beforeWrapper as Record<string, unknown>),
            savedAt: "2026-07-19T00:00:00.000Z"
          };
          await replaceRecordWrapper(sidePanelPage, wrapper);
          return wrapper;
        },
        expectedSavedAt: target.savedAt
      },
      {
        name: "missing screenshot asset",
        prepare: async () => {
          await deleteScreenshotAsset(sidePanelPage, target.storageKey);
          return beforeWrapper;
        }
      },
      {
        name: "invalid screenshot storage reference",
        prepare: async () => replaceSourceValue(sidePanelPage, beforeWrapper, (record) => ({
          ...record,
          assets: {
            ...record.assets,
            screenshot: {
              ...record.assets.screenshot,
              storageKey: "bad-reference"
            }
          }
        }))
      },
      {
        name: "fingerprint mismatch",
        prepare: async () => beforeWrapper,
        expectedReviewFingerprint: "b".repeat(64)
      }
    ];

    for (const [index, guard] of cases.entries()) {
      await resetAndSeedSavedCaptures(sidePanelPage);
      const preparedWrapper = await guard.prepare();
      const beforeCaseWrapper = await readRecordWrapper(sidePanelPage, target.record.id);
      const beforeCaseAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);
      const entry = guard.entry ?? createGeneratedVersionEntry(
        target.record.id,
        target.savedAt,
        `2026-07-18T13:${String(index).padStart(2, "0")}:00.000Z`,
        `SourceGuard${index}`
      );

      const result = await addGeneratedVersionThroughProductionBridge(sidePanelPage, target, entry, {
        expectedRecordValue: guard.expectedRecordValue,
        expectedSavedAt: guard.expectedSavedAt,
        expectedReviewFingerprint: guard.expectedReviewFingerprint
      });

      expect(result.ok, guard.name).toBe(false);
      expect(await readGeneratedVersions(sidePanelPage, target.record.id), guard.name).toEqual([]);
      expect(await readRecordWrapper(sidePanelPage, target.record.id), guard.name).toEqual(beforeCaseWrapper);
      expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey), guard.name).toEqual(beforeCaseAsset);
      if (preparedWrapper !== undefined) {
        expect(await readRecordWrapper(sidePanelPage, target.record.id), guard.name).toEqual(preparedWrapper);
      }
    }
  });

  test("production add entry guards reject malformed generated entries without writes", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const valid = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:30:00.000Z", "EntryGuard");
    const invalidEntries = [
      { ...valid, extra: true },
      { ...valid, id: "bad-generated-id" },
      { ...valid, createdAt: "not-a-timestamp" },
      { ...valid, sourceReviewFingerprint: "not-a-fingerprint" },
      { ...valid, value: { ...valid.value, code: "" } },
      { ...valid, value: { ...valid.value, extra: true } }
    ];

    for (const [index, entry] of invalidEntries.entries()) {
      const result = await addGeneratedVersionThroughProductionBridge(sidePanelPage, target, entry, {
        expectedReviewFingerprint: typeof entry.sourceReviewFingerprint === "string" && entry.sourceReviewFingerprint.length === 64
          ? entry.sourceReviewFingerprint
          : valid.sourceReviewFingerprint
      });
      expect(result.ok, `entry guard ${index}`).toBe(false);
      expect(await readGeneratedVersions(sidePanelPage, target.record.id), `entry guard ${index}`).toEqual([]);
    }
  });

  test("Cancel during active generated-version persistence aborts the transaction without a stale saved entry", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    await installPersistenceHarness(context, { pauseBeforeAdd: true });
    await installBase64Counter(context);
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests = trackHttpRequests(page);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];
    const beforeWrapper = await readRecordWrapper(page, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(page, target.storageKey);

    await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await page.getByRole("button", { name: "Generate component" }).click();
    await page.getByLabel(/Data is leaving your device/).check();
    await page.getByRole("button", { name: "Send to AI and generate" }).click();
    await expect.poll(() => getPersistenceAttempts(page)).toHaveLength(1);
    const mockCallsAtPause = await getMockCallCount(page);
    const base64AtPause = await getBase64Count(page);
    const httpAtPause = httpRequests.length;
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Generation cancelled.")).toBeVisible();
    await page.waitForTimeout(250);

    expect(await readGeneratedVersions(page, target.record.id)).toEqual([]);
    expect(await readRecordWrapper(page, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(page, target.storageKey)).toEqual(beforeAsset);
    expect(await getMockCallCount(page)).toBe(mockCallsAtPause);
    expect(await getBase64Count(page)).toBe(base64AtPause);
    expect(httpRequests).toHaveLength(httpAtPause);
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry saving" })).toHaveCount(0);
  });

  test("Cancel during Retry saving aborts persistence without new provider, HTTP, Base64, or delayed writes", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    await installPersistenceHarness(context, { failBeforeAddCount: 1, pauseBeforeAdd: true });
    await installBase64Counter(context);
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests = trackHttpRequests(page);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];
    const beforeWrapper = await readRecordWrapper(page, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(page, target.storageKey);

    await startGenerationAndConsent(page, target.title);
    await expect(page.getByRole("button", { name: "Retry saving" })).toBeVisible();
    const mockCallsBeforeRetry = await getMockCallCount(page);
    const base64BeforeRetry = await getBase64Count(page);
    const httpBeforeRetry = httpRequests.length;
    await page.getByRole("button", { name: "Retry saving" }).click();
    await expect.poll(() => getPersistenceAttempts(page)).toHaveLength(2);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(250);

    expect(await readGeneratedVersions(page, target.record.id)).toEqual([]);
    expect(await readRecordWrapper(page, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(page, target.storageKey)).toEqual(beforeAsset);
    expect(await getMockCallCount(page)).toBe(mockCallsBeforeRetry);
    expect(await getBase64Count(page)).toBe(base64BeforeRetry);
    expect(httpRequests).toHaveLength(httpBeforeRetry);
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toHaveCount(0);
  });

  test("Back to Library during active persistence aborts without delayed generated-version writes", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    await installPersistenceHarness(context, { pauseBeforeAdd: true });
    await installBase64Counter(context);
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests = trackHttpRequests(page);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];
    const beforeWrapper = await readRecordWrapper(page, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(page, target.storageKey);

    await startGenerationAndConsent(page, target.title);
    await expect.poll(() => getPersistenceAttempts(page)).toHaveLength(1);
    const mockCallsAtPause = await getMockCallCount(page);
    const base64AtPause = await getBase64Count(page);
    const httpAtPause = httpRequests.length;
    await page.getByRole("button", { name: "Back to Library" }).click();
    await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
    await page.waitForTimeout(250);

    expect(await readGeneratedVersions(page, target.record.id)).toEqual([]);
    expect(await readRecordWrapper(page, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(page, target.storageKey)).toEqual(beforeAsset);
    expect(await getMockCallCount(page)).toBe(mockCallsAtPause);
    expect(await getBase64Count(page)).toBe(base64AtPause);
    expect(httpRequests).toHaveLength(httpAtPause);
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toHaveCount(0);
  });

  test("capture switch during active persistence aborts the previous save and leaves both sources unchanged", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    await installPersistenceHarness(context, { pauseBeforeAdd: true });
    await installBase64Counter(context);
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests = trackHttpRequests(page);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];
    const other = seeded[1];
    const beforeWrapper = await readRecordWrapper(page, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(page, target.storageKey);
    const beforeOtherWrapper = await readRecordWrapper(page, other.record.id);
    const beforeOtherAsset = await readScreenshotAssetSnapshot(page, other.storageKey);

    await startGenerationAndConsent(page, target.title);
    await expect.poll(() => getPersistenceAttempts(page)).toHaveLength(1);
    const mockCallsAtPause = await getMockCallCount(page);
    const base64AtPause = await getBase64Count(page);
    const httpAtPause = httpRequests.length;
    await page.getByRole("button", { name: "Back to Library" }).click();
    await page.getByRole("button", { name: `Open saved capture: ${other.title}` }).click();
    await expect(page.getByRole("heading", { name: other.title })).toBeVisible();
    await page.waitForTimeout(250);

    expect(await readGeneratedVersions(page, target.record.id)).toEqual([]);
    expect(await readGeneratedVersions(page, other.record.id)).toEqual([]);
    expect(await readRecordWrapper(page, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(page, target.storageKey)).toEqual(beforeAsset);
    expect(await readRecordWrapper(page, other.record.id)).toEqual(beforeOtherWrapper);
    expect(await readScreenshotAssetSnapshot(page, other.storageKey)).toEqual(beforeOtherAsset);
    expect(await getMockCallCount(page)).toBe(mockCallsAtPause);
    expect(await getBase64Count(page)).toBe(base64AtPause);
    expect(httpRequests).toHaveLength(httpAtPause);
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toHaveCount(0);
  });

  test("Side Panel close during active persistence aborts without delayed writes after reopen", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    await installPersistenceHarness(context, { pauseBeforeAdd: true });
    await installBase64Counter(context);
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests = trackHttpRequests(page);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];
    const beforeWrapper = await readRecordWrapper(page, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(page, target.storageKey);

    await startGenerationAndConsent(page, target.title);
    await expect.poll(() => getPersistenceAttempts(page)).toHaveLength(1);
    const httpAtPause = httpRequests.length;
    await page.close();
    const reopened = await openSidePanelPage(context, extensionId);
    await reopened.waitForTimeout(250);

    expect(await readGeneratedVersions(reopened, target.record.id)).toEqual([]);
    expect(await readRecordWrapper(reopened, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(reopened, target.storageKey)).toEqual(beforeAsset);
    expect(httpRequests).toHaveLength(httpAtPause);
    await reopened.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await expect(reopened.getByText("0 generated versions saved locally.")).toBeVisible();
    await expect(reopened.getByRole("heading", { name: "Saved generated version" })).toHaveCount(0);
  });

  test("late close after committed persistence does not reinterpret the saved version as failed", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];

    await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await page.getByRole("button", { name: "Generate component" }).click();
    await page.getByLabel(/Data is leaving your device/).check();
    await page.getByRole("button", { name: "Send to AI and generate" }).click();
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toBeVisible();
    expect(await readGeneratedVersions(page, target.record.id)).toHaveLength(1);

    await page.getByRole("button", { name: "Close result" }).click();
    await expect(page.getByText("1 generated version saved locally.")).toBeVisible();
    expect(await readGeneratedVersions(page, target.record.id)).toHaveLength(1);
    await expect(page.getByText(/could not be saved|could not verify|cancelled/i)).toHaveCount(0);
  });

  test("version reads are newest-first, use id tie-breaks, and hide malformed entries", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const older = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T12:00:00.000Z", "AlphaOlder", "99999999-9999-9999-9999-999999999999");
    const tieB = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:00:00.000Z", "AlphaTieB", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    const tieA = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:00:00.000Z", "AlphaTieA", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    await putGeneratedVersion(sidePanelPage, older);
    await putGeneratedVersion(sidePanelPage, tieB);
    await putGeneratedVersion(sidePanelPage, tieA);
    await putGeneratedVersion(sidePanelPage, {
      id: "generated-version-cccccccc-cccc-cccc-cccc-cccccccccccc",
      sourceCaptureId: target.record.id,
      sourceCaptureSavedAt: target.savedAt,
      sourceReviewFingerprint: "c".repeat(64),
      createdAt: "2026-07-18T14:00:00.000Z",
      value: { componentName: "MalformedEntry" }
    });

    await sidePanelPage.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await expect(sidePanelPage.getByText("3 generated versions saved locally.")).toBeVisible();
    const buttons = sidePanelPage.locator(".generated-version-item > button");
    await expect(buttons).toHaveText([
      "AlphaTieA - 2026-07-18T13:00:00.000Z",
      "AlphaTieB - 2026-07-18T13:00:00.000Z",
      "AlphaOlder - 2026-07-18T12:00:00.000Z"
    ]);
    await expect(sidePanelPage.getByText("MalformedEntry")).toHaveCount(0);
  });

  test("source deletion cascades multiple generated versions and leaves another source intact", async ({ context, extensionId }) => {
    await installMockHarness(context, "success");
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];
    const other = seeded[1];
    const otherWrapper = await readRecordWrapper(page, other.record.id);
    const otherAsset = await readScreenshotAssetSnapshot(page, other.storageKey);
    const otherVersion = createGeneratedVersionEntry(other.record.id, other.savedAt, "2026-07-18T13:15:00.000Z", "OtherVersion", "22222222-2222-2222-2222-222222222222");
    await putGeneratedVersion(page, otherVersion);

    await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await page.getByRole("button", { name: "Generate component" }).click();
    await page.getByLabel(/Data is leaving your device/).check();
    await page.getByRole("button", { name: "Send to AI and generate" }).click();
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toBeVisible();
    await page.getByRole("button", { name: "Close result" }).click();

    await page.getByRole("button", { name: "Delete capture" }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("Capture deleted locally.")).toBeVisible();

    expect(await readRecordWrapper(page, target.record.id)).toBeUndefined();
    expect(await readScreenshotAssetSnapshot(page, target.storageKey)).toBeUndefined();
    expect(await readGeneratedVersions(page, target.record.id)).toEqual([]);
    expect(await readRecordWrapper(page, other.record.id)).toEqual(otherWrapper);
    expect(await readScreenshotAssetSnapshot(page, other.storageKey)).toEqual(otherAsset);
    expect(await readGeneratedVersions(page, other.record.id)).toEqual([otherVersion]);
    expect(await readPersistenceCounts(page)).toMatchObject({
      captureRecords: seeded.length - 1,
      screenshotAssets: seeded.length - 1,
      generatedComponentVersions: 1
    });
  });

  test("source deletion rolls back when generated-version deletion fails", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const other = seeded[1];
    const firstVersion = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:00:00.000Z", "RollbackOne", "33333333-3333-3333-3333-333333333333");
    const secondVersion = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:05:00.000Z", "RollbackTwo", "44444444-4444-4444-4444-444444444444");
    const otherVersion = createGeneratedVersionEntry(other.record.id, other.savedAt, "2026-07-18T13:10:00.000Z", "RollbackUnaffected", "55555555-5555-5555-5555-555555555555");
    await putGeneratedVersion(sidePanelPage, firstVersion);
    await putGeneratedVersion(sidePanelPage, secondVersion);
    await putGeneratedVersion(sidePanelPage, otherVersion);
    const beforeWrapper = await readRecordWrapper(sidePanelPage, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);
    const beforeOtherWrapper = await readRecordWrapper(sidePanelPage, other.record.id);
    const beforeOtherAsset = await readScreenshotAssetSnapshot(sidePanelPage, other.storageKey);
    const beforeCounts = await readPersistenceCounts(sidePanelPage);

    await sidePanelPage.evaluate(() => {
      const originalDelete = IDBObjectStore.prototype.delete;
      Object.defineProperty(window, "__EC_RESTORE_IDB_DELETE__", {
        configurable: true,
        value: () => {
          IDBObjectStore.prototype.delete = originalDelete;
        }
      });
      let generatedDeletes = 0;
      IDBObjectStore.prototype.delete = function patchedDelete(this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
        if (this.name === "generatedComponentVersions") {
          generatedDeletes += 1;
          if (generatedDeletes === 2) {
            throw new DOMException("Injected generated version deletion failure.", "AbortError");
          }
        }
        return originalDelete.call(this, query);
      };
    });

    await sidePanelPage.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await sidePanelPage.getByRole("button", { name: "Delete capture" }).click();
    await sidePanelPage.getByRole("button", { name: "Delete permanently" }).click();
    await expect(sidePanelPage.getByText(/Could not delete capture/)).toBeVisible();
    await sidePanelPage.evaluate(() => (window as unknown as { __EC_RESTORE_IDB_DELETE__: () => void }).__EC_RESTORE_IDB_DELETE__());

    expect(await readRecordWrapper(sidePanelPage, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(beforeAsset);
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([firstVersion, secondVersion]);
    expect(await readRecordWrapper(sidePanelPage, other.record.id)).toEqual(beforeOtherWrapper);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, other.storageKey)).toEqual(beforeOtherAsset);
    expect(await readGeneratedVersions(sidePanelPage, other.record.id)).toEqual([otherVersion]);
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
  });

  test("production direct read removes missing-source, malformed-source, and malformed-entry orphans", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const missingSourceVersion = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:00:00.000Z", "DirectMissing", "55555555-5555-5555-5555-555555555555");
    await putGeneratedVersion(sidePanelPage, missingSourceVersion);
    await deleteRecordWrapper(sidePanelPage, target.record.id);

    await expect(getGeneratedVersionThroughProductionBridge(sidePanelPage, missingSourceVersion.id)).resolves.toEqual({
      ok: true,
      value: undefined
    });
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([]);

    await resetAndSeedSavedCaptures(sidePanelPage);
    const malformedSourceVersion = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:05:00.000Z", "DirectMalformed", "66666666-6666-6666-6666-666666666666");
    await putGeneratedVersion(sidePanelPage, malformedSourceVersion);
    await replaceRecordWrapper(sidePanelPage, {
      id: target.record.id,
      value: {
        ...target.record,
        environment: undefined
      },
      savedAt: target.savedAt
    });
    await expect(getGeneratedVersionThroughProductionBridge(sidePanelPage, malformedSourceVersion.id)).resolves.toEqual({
      ok: true,
      value: undefined
    });
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([]);

    await resetAndSeedSavedCaptures(sidePanelPage);
    const malformedGeneratedEntry = {
      id: "generated-version-77777777-7777-7777-7777-777777777777",
      sourceCaptureId: target.record.id,
      sourceCaptureSavedAt: target.savedAt,
      sourceReviewFingerprint: "a".repeat(64),
      createdAt: "2026-07-18T13:10:00.000Z",
      value: { componentName: "MalformedDirectEntry" }
    };
    await putGeneratedVersion(sidePanelPage, malformedGeneratedEntry);
    await expect(getGeneratedVersionThroughProductionBridge(sidePanelPage, malformedGeneratedEntry.id)).resolves.toEqual({
      ok: true,
      value: undefined
    });
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([]);
  });

  test("production list removes missing-source orphans using actual keys and preserves another source", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const other = seeded[1];
    const orphanOne = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:00:00.000Z", "OrphanOne", "88888888-8888-8888-8888-888888888888");
    const orphanTwo = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:05:00.000Z", "OrphanTwo", "99999999-9999-9999-9999-999999999999");
    const malformedKeyOrphan = {
      ...createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T13:07:00.000Z", "MalformedPrimaryKey"),
      id: "not-a-valid-generated-version-primary-key"
    };
    const otherVersion = createGeneratedVersionEntry(other.record.id, other.savedAt, "2026-07-18T13:10:00.000Z", "OtherKept", "77777777-7777-7777-7777-777777777777");
    await putGeneratedVersion(sidePanelPage, orphanOne);
    await putGeneratedVersion(sidePanelPage, orphanTwo);
    await putGeneratedVersion(sidePanelPage, malformedKeyOrphan);
    await putGeneratedVersion(sidePanelPage, otherVersion);
    const otherBefore = await readGeneratedVersions(sidePanelPage, other.record.id);
    await deleteRecordWrapper(sidePanelPage, target.record.id);

    await expect(listGeneratedVersionsThroughProductionBridge(sidePanelPage, target.record.id)).resolves.toEqual({
      ok: true,
      value: []
    });
    expect(await readGeneratedVersionKeys(sidePanelPage, target.record.id)).toEqual([]);
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([]);
    expect(await readGeneratedVersions(sidePanelPage, other.record.id)).toEqual(otherBefore);
  });

  test("production list treats every malformed source fixture as invalid and deletes matching orphans", async ({ sidePanelPage }) => {
    const malformedSourceCases: Array<{
      name: string;
      mutate: (record: Record<string, unknown>) => Record<string, unknown>;
    }> = [
      { name: "missing environment", mutate: ({ environment: _environment, ...record }) => record },
      { name: "missing element", mutate: ({ element: _element, ...record }) => record },
      { name: "missing dom", mutate: ({ dom: _dom, ...record }) => record },
      { name: "missing styles", mutate: ({ styles: _styles, ...record }) => record },
      { name: "missing summaries", mutate: ({ summaries: _summaries, ...record }) => record },
      { name: "missing library", mutate: ({ library: _library, ...record }) => record },
      { name: "missing generatedVersions", mutate: ({ generatedVersions: _generatedVersions, ...record }) => record },
      { name: "invalid createdAt", mutate: (record) => ({ ...record, createdAt: "invalid-created-at" }) },
      { name: "unknown top-level field", mutate: (record) => ({ ...record, unexpected: true }) },
      {
        name: "invalid screenshot metadata",
        mutate: (record) => ({
          ...record,
          assets: {
            ...(record.assets as Record<string, unknown>),
            screenshot: {
              ...((record.assets as { screenshot: Record<string, unknown> }).screenshot),
              mediaType: "image/jpeg"
            }
          }
        })
      }
    ];

    for (const [index, variant] of malformedSourceCases.entries()) {
      const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
      const target = seeded[0];
      const other = seeded[1];
      const targetVersion = createGeneratedVersionEntry(
        target.record.id,
        target.savedAt,
        `2026-07-18T14:${String(index).padStart(2, "0")}:00.000Z`,
        `MalformedList${index}`
      );
      const otherVersion = createGeneratedVersionEntry(
        other.record.id,
        other.savedAt,
        `2026-07-18T15:${String(index).padStart(2, "0")}:00.000Z`,
        `UnaffectedList${index}`,
        `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa${index}`
      );
      await putGeneratedVersion(sidePanelPage, targetVersion);
      await putGeneratedVersion(sidePanelPage, otherVersion);
      const otherBefore = await readGeneratedVersions(sidePanelPage, other.record.id);
      await replaceSourceValue(sidePanelPage, await readRecordWrapper(sidePanelPage, target.record.id), variant.mutate);

      const result = await listGeneratedVersionsThroughProductionBridge(sidePanelPage, target.record.id);
      expect(result, variant.name).toEqual({ ok: true, value: [] });
      expect(await readGeneratedVersions(sidePanelPage, target.record.id), variant.name).toEqual([]);
      expect(await readGeneratedVersionKeys(sidePanelPage, target.record.id), variant.name).toEqual([]);
      expect(await readGeneratedVersions(sidePanelPage, other.record.id), variant.name).toEqual(otherBefore);
    }
  });

  test("production list removes missing-source orphans independently", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    const target = seeded[0];
    const version = createGeneratedVersionEntry(target.record.id, target.savedAt, "2026-07-18T16:00:00.000Z", "MissingSourceList");
    await putGeneratedVersion(sidePanelPage, version);
    await deleteRecordWrapper(sidePanelPage, target.record.id);

    await expect(listGeneratedVersionsThroughProductionBridge(sidePanelPage, target.record.id)).resolves.toEqual({ ok: true, value: [] });
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual([]);
  });

  test("migration failure during generated-version index creation aborts version 2 and preserves version 1 data", async ({ sidePanelPage }) => {
    await resetAndSeedVersionOneDatabase(sidePanelPage);
    const before = await readVersionOneSnapshots(sidePanelPage);
    await sidePanelPage.evaluate(() => {
      const originalCreateIndex = IDBObjectStore.prototype.createIndex;
      Object.defineProperty(window, "__EC_RESTORE_IDB_CREATE_INDEX__", {
        configurable: true,
        value: () => {
          IDBObjectStore.prototype.createIndex = originalCreateIndex;
        }
      });
      IDBObjectStore.prototype.createIndex = function patchedCreateIndex(
        this: IDBObjectStore,
        name: string,
        keyPath: string | string[],
        options?: IDBIndexParameters
      ) {
        if (this.name === "generatedComponentVersions" && name === "sourceCaptureId") {
          throw new DOMException("Injected generated-version index creation failure.", "InvalidStateError");
        }
        return originalCreateIndex.call(this, name, keyPath, options);
      };
    });

    await expect(readPersistenceCounts(sidePanelPage)).rejects.toThrow();
    await sidePanelPage.evaluate(() => (window as unknown as { __EC_RESTORE_IDB_CREATE_INDEX__: () => void }).__EC_RESTORE_IDB_CREATE_INDEX__());
    expect(await readVersionOneSnapshots(sidePanelPage)).toEqual(before);

    const counts = await readPersistenceCounts(sidePanelPage);
    expect(counts).toEqual({
      version: ELEMENT_CATCHER_DATABASE_VERSION,
      stores: [CAPTURE_RECORD_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort(),
      captureRecords: before.wrappers.length,
      screenshotAssets: before.assets.length,
      generatedComponentVersions: 0
    });
  });

  test("invalid version 2 generated-version schema fails closed without version 3 repair", async ({ sidePanelPage }) => {
    await createInvalidVersionTwoDatabase(sidePanelPage);
    const before = await readRawDatabaseSnapshot(sidePanelPage);
    expect(before.version).toBe(2);
    expect(before.stores).toEqual([CAPTURE_RECORD_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort());

    await sidePanelPage.reload();
    await expect(sidePanelPage.getByText(/Could not load the Capture Library/)).toBeVisible();
    const after = await readRawDatabaseSnapshot(sidePanelPage);
    expect(after).toEqual(before);
  });
});

function createGeneratedVersionEntry(
  sourceCaptureId: string,
  sourceCaptureSavedAt: string,
  createdAt: string,
  componentName: string,
  idSuffix = "11111111-1111-1111-1111-111111111111"
) {
  return {
    id: `generated-version-${idSuffix}`,
    sourceCaptureId,
    sourceCaptureSavedAt,
    sourceReviewFingerprint: "a".repeat(64),
    createdAt,
    value: {
      contractVersion: 1,
      componentName,
      framework: "react",
      styling: "tailwind",
      code: `export function ${componentName}() {\n  return <div>${componentName}</div>;\n}`,
      summary: `${componentName} summary.`,
      approximationNotes: ""
    }
  };
}

async function installMockHarness(context: Parameters<typeof openSidePanelPage>[0], scenario: string, delayMs = 0, response?: unknown) {
  await context.addInitScript(
    ({ scenario, delayMs, response }) => {
      window.__EC_GENERATION_TEST_HARNESS__ = {
        scenario: scenario as never,
        delayMs,
        response: response as never,
        calls: [],
        cancellations: 0
      };
    },
    { scenario, delayMs, response }
  );
}

async function installPersistenceHarness(
  context: Parameters<typeof openSidePanelPage>[0],
  options: { failBeforeAddCount?: number; pauseBeforeAdd?: boolean; releaseBeforeAdd?: boolean } = {}
) {
  await context.addInitScript(({ failBeforeAddCount, pauseBeforeAdd, releaseBeforeAdd }) => {
    window.__EC_GENERATED_VERSION_PERSISTENCE_TEST_HARNESS__ = {
      failBeforeAddCount,
      pauseBeforeAdd,
      releaseBeforeAdd,
      beforeAddCalls: 0,
      attempts: []
    };
  }, options);
}

async function installBase64Counter(context: Parameters<typeof openSidePanelPage>[0]) {
  await context.addInitScript(() => {
    const originalBtoa = window.btoa.bind(window);
    let count = 0;
    window.btoa = (value: string) => {
      count += 1;
      return originalBtoa(value);
    };
    Object.defineProperty(window, "__EC_BTOA_COUNT__", {
      value: () => count
    });
  });
}

async function getMockCallCount(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  return page.evaluate(() => window.__EC_GENERATION_TEST_HARNESS__?.calls.length ?? 0);
}

async function getBase64Count(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  return page.evaluate(() => ((window as unknown as { __EC_BTOA_COUNT__?: () => number }).__EC_BTOA_COUNT__?.() ?? 0));
}

async function getPersistenceAttempts(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  return page.evaluate(() => window.__EC_GENERATED_VERSION_PERSISTENCE_TEST_HARNESS__?.attempts ?? []);
}

async function addGeneratedVersionThroughProductionBridge(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  target: { record: { id: string }; savedAt: string },
  entry: unknown,
  options: {
    expectedRecordValue?: JsonObject;
    expectedSavedAt?: string;
    expectedReviewFingerprint?: string;
  } = {}
) {
  return page.evaluate(
    async ({ entry, expectedSourceSavedAt, expectedReviewFingerprint, expectedSourceRecordValue }) => {
      const bridge = window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__;
      if (!bridge) {
        throw new Error("Generated-version production storage bridge was not installed.");
      }
      return bridge.addGeneratedComponentVersion({
        entry: entry as never,
        expectedSourceSavedAt,
        expectedReviewFingerprint,
        expectedSourceRecordValue
      });
    },
    {
      entry,
      expectedSourceSavedAt: options.expectedSavedAt ?? target.savedAt,
      expectedReviewFingerprint: options.expectedReviewFingerprint ?? ((entry as { sourceReviewFingerprint?: string }).sourceReviewFingerprint ?? "a".repeat(64)),
      expectedSourceRecordValue: options.expectedRecordValue ?? (target as { record: JsonObject }).record
    }
  );
}

async function getGeneratedVersionThroughProductionBridge(page: Parameters<typeof resetAndSeedSavedCaptures>[0], id: string) {
  return page.evaluate(async (id) => {
    const bridge = window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__;
    if (!bridge) {
      throw new Error("Generated-version production storage bridge was not installed.");
    }
    return bridge.getGeneratedComponentVersionById(id);
  }, id);
}

async function listGeneratedVersionsThroughProductionBridge(page: Parameters<typeof resetAndSeedSavedCaptures>[0], sourceCaptureId: string) {
  return page.evaluate(async (sourceCaptureId) => {
    const bridge = window.__EC_GENERATED_VERSION_STORAGE_TEST_BRIDGE__;
    if (!bridge) {
      throw new Error("Generated-version production storage bridge was not installed.");
    }
    return bridge.listGeneratedComponentVersionsBySourceCaptureId(sourceCaptureId);
  }, sourceCaptureId);
}

async function replaceSourceValue(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  wrapper: unknown,
  mutate: (record: Record<string, unknown>) => Record<string, unknown>
) {
  const current = wrapper as { id: string; value: Record<string, unknown>; savedAt: string };
  const replacement = {
    ...current,
    value: mutate(JSON.parse(JSON.stringify(current.value)) as Record<string, unknown>)
  };
  await replaceRecordWrapper(page, replacement);
  return replacement;
}

async function startGenerationAndConsent(page: Parameters<typeof resetAndSeedSavedCaptures>[0], title: string) {
  await page.getByRole("button", { name: `Open saved capture: ${title}` }).click();
  await page.getByRole("button", { name: "Generate component" }).click();
  await page.getByLabel(/Data is leaving your device/).check();
  await page.getByRole("button", { name: "Send to AI and generate" }).click();
}

function trackHttpRequests(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  const httpRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) {
      httpRequests.push(request.url());
    }
  });
  return httpRequests;
}
