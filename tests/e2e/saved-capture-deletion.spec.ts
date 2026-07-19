import type { Page } from "@playwright/test";
import { test, expect, getObjectUrlSnapshot, openSidePanelPage } from "./extension-fixture";
import {
  CAPTURE_RECORD_STORE_NAME,
  DEFAULT_CAPTURE_FIXTURES,
  ELEMENT_CATCHER_DATABASE_VERSION,
  SCREENSHOT_ASSET_STORE_NAME,
  deleteRecordWrapper,
  deleteScreenshotAsset,
  readAllRecordWrappers,
  readAllScreenshotAssetSnapshots,
  readPersistenceCounts,
  readRecordWrapper,
  readScreenshotAssetSnapshot,
  replaceWrapperSavedAt,
  resetAndSeedSavedCaptures,
  restoreRecordWrapper,
  restoreScreenshotAsset,
  type SeededCapture
} from "./indexed-db-fixtures";

type RecordWrapper = {
  id: string;
  value: SeededCapture["record"];
  savedAt: string;
};

test.describe.configure({ mode: "serial" });

test.describe("Milestone 4D saved capture deletion automated validation", () => {
  test("A - loaded detail exposes Delete capture only outside metadata edit mode", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    await openCapture(sidePanelPage, seeded[0]);

    await expect(sidePanelPage.getByRole("button", { name: "Delete capture" })).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Edit metadata" })).toBeVisible();

    await sidePanelPage.getByRole("button", { name: "Edit metadata" }).click();
    await expect(sidePanelPage.getByRole("button", { name: "Delete capture" })).toHaveCount(0);
    await sidePanelPage.getByRole("button", { name: "Cancel editing" }).click();
    await expect(sidePanelPage.getByRole("button", { name: "Delete capture" })).toBeVisible();
  });

  test("B - Cancel deletion restores normal detail without deleting either store", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const beforeWrapper = await readWrapper(sidePanelPage, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);

    await openCapture(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Cancel deletion" }).click();

    await expectDetailLoaded(sidePanelPage, target);
    expect(await readWrapper(sidePanelPage, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(beforeAsset);
  });

  test("C - successful delete removes exactly one wrapper and one screenshot asset", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];

    await deleteThroughDetail(sidePanelPage, target);
    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));

    expect(await readRecordWrapper(sidePanelPage, target.record.id)).toBeUndefined();
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toBeUndefined();
    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({
      captureRecords: seeded.length - 1,
      screenshotAssets: seeded.length - 1
    });
  });

  test("D - successful delete preserves unrelated records, assets, order, and database metadata", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[1];
    const beforeWrappers = await readAllRecordWrappers(sidePanelPage);
    const beforeAssets = await readAllScreenshotAssetSnapshots(sidePanelPage);

    await deleteThroughDetail(sidePanelPage, target);
    await expectDeletionSuccess(sidePanelPage, [seeded[0], seeded[2]]);

    const afterWrappers = await readAllRecordWrappers(sidePanelPage);
    const afterAssets = await readAllScreenshotAssetSnapshots(sidePanelPage);
    expect(afterWrappers).toEqual((beforeWrappers as RecordWrapper[]).filter((wrapper) => wrapper.id !== target.record.id));
    expect(afterAssets).toEqual(beforeAssets.filter((asset) => asset.storageKey !== target.storageKey));
    expect(await readPersistenceCounts(sidePanelPage)).toEqual({
      version: ELEMENT_CATCHER_DATABASE_VERSION,
      stores: [CAPTURE_RECORD_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort(),
      captureRecords: seeded.length - 1,
      screenshotAssets: seeded.length - 1
    });
  });

  test("E - deletion persists across Side Panel close and reopen", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await seedAndReload(page);

    await deleteThroughDetail(page, seeded[0]);
    await expectDeletionSuccess(page, seeded.slice(1));
    await page.close();

    const reopened = await openSidePanelPage(context, extensionId);
    await expectLibraryOrder(reopened, seeded.slice(1));
    await expect(reopened.getByRole("button", { name: `Open saved capture: ${seeded[0].title}` })).toHaveCount(0);
    await reopened.close();
  });

  test("F - missing record aborts atomically, fails safely, and Retry succeeds after restoration", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const originalWrapper = await readWrapper(sidePanelPage, target.record.id);
    const originalAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);

    await openCapture(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    await deleteRecordWrapper(sidePanelPage, target.record.id);
    await sidePanelPage.getByRole("button", { name: "Delete permanently" }).click();

    await expectSafeDeleteFailure(sidePanelPage, target);
    expect(await readRecordWrapper(sidePanelPage, target.record.id)).toBeUndefined();
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(originalAsset);

    await restoreRecordWrapper(sidePanelPage, originalWrapper);
    await sidePanelPage.getByRole("button", { name: "Retry deletion" }).click();
    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));
  });

  test("G - missing screenshot asset aborts atomically, fails safely, and Retry succeeds after restoration", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const originalWrapper = await readWrapper(sidePanelPage, target.record.id);

    await openCapture(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    await deleteScreenshotAsset(sidePanelPage, target.storageKey);
    await sidePanelPage.getByRole("button", { name: "Delete permanently" }).click();

    await expectSafeDeleteFailure(sidePanelPage, target);
    expect(await readWrapper(sidePanelPage, target.record.id)).toEqual(originalWrapper);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toBeUndefined();

    await restoreScreenshotAsset(sidePanelPage, target);
    await sidePanelPage.getByRole("button", { name: "Retry deletion" }).click();
    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));
  });

  test("H - savedAt conflict aborts without deleting and preserves the conflicted wrapper", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const originalWrapper = await readWrapper(sidePanelPage, target.record.id);
    const originalAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);
    const conflictSavedAt = "2026-07-18T12:34:56.000Z";

    await openCapture(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    await replaceWrapperSavedAt(sidePanelPage, target.record.id, conflictSavedAt);
    await sidePanelPage.getByRole("button", { name: "Delete permanently" }).click();

    await expectSafeDeleteFailure(sidePanelPage, target);
    const conflictedWrapper = await readWrapper(sidePanelPage, target.record.id);
    expect(conflictedWrapper.savedAt).toBe(conflictSavedAt);
    expect(conflictedWrapper.value).toEqual(originalWrapper.value);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(originalAsset);

    await restoreRecordWrapper(sidePanelPage, originalWrapper);
    await sidePanelPage.getByRole("button", { name: "Retry deletion" }).click();
    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));
  });

  test("I - rapid duplicate Delete permanently activation commits one deletion only", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const beforeCounts = await readPersistenceCounts(sidePanelPage);

    await openCapture(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    const deleteButton = sidePanelPage.getByRole("button", { name: "Delete permanently" });
    await deleteButton.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));
    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({
      captureRecords: beforeCounts.captureRecords - 1,
      screenshotAssets: beforeCounts.screenshotAssets - 1
    });
  });

  test("J - Back during in-flight delete leaves Library visible and applies committed deletion", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];

    await openCapture(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    await sidePanelPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      buttons.find((button) => button.textContent === "Delete permanently")?.click();
      buttons.find((button) => button.textContent === "Back to Library")?.click();
    });

    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));
    await expect(sidePanelPage.getByRole("heading", { name: target.title })).toHaveCount(0);
  });

  test("K - post-commit absence verification failure restores the exact original bundle", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const originalWrapper = await readWrapper(sidePanelPage, target.record.id);
    const originalAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);

    await openCapture(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    await installPostDeleteReadFailure(sidePanelPage, target.record.id);
    await sidePanelPage.getByRole("button", { name: "Delete permanently" }).click();

    await expectSafeDeleteFailure(sidePanelPage, target);
    await removePostDeleteReadFailure(sidePanelPage);
    expect(await readWrapper(sidePanelPage, target.record.id)).toEqual(originalWrapper);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(originalAsset);

    await sidePanelPage.getByRole("button", { name: "Retry deletion" }).click();
    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));
  });

  test("L - object URL stays valid through cancel and failure, then is revoked after successful delete", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];

    await openCapture(sidePanelPage, target);
    const detailUrl = await sidePanelPage.locator("img.preview-image").getAttribute("src");
    expect(detailUrl).toMatch(/^blob:/);

    await openDeletionConfirmation(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Cancel deletion" }).click();
    await expect(sidePanelPage.locator("img.preview-image")).toHaveAttribute("src", detailUrl!);

    await openDeletionConfirmation(sidePanelPage);
    await deleteScreenshotAsset(sidePanelPage, target.storageKey);
    await sidePanelPage.getByRole("button", { name: "Delete permanently" }).click();
    await expectSafeDeleteFailure(sidePanelPage, target);
    const failureSnapshot = await getObjectUrlSnapshot(sidePanelPage);
    expect(failureSnapshot.active).toContain(detailUrl);

    await sidePanelPage.getByRole("button", { name: "Cancel deletion" }).click();
    await expect(sidePanelPage.locator("img.preview-image")).toHaveAttribute("src", detailUrl!);
    await restoreScreenshotAsset(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Delete permanently" }).click();
    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));

    const successSnapshot = await getObjectUrlSnapshot(sidePanelPage);
    expect(successSnapshot.revoked).toContain(detailUrl);
    expect(successSnapshot.active).not.toContain(detailUrl);
  });

  test("M - deleting the final capture returns to the existing empty Library state with success notice", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage, [DEFAULT_CAPTURE_FIXTURES[0]]);

    await deleteThroughDetail(sidePanelPage, seeded[0]);
    await expect(sidePanelPage.getByRole("heading", { name: "Capture Library" })).toBeVisible();
    await expect(sidePanelPage.getByText("Capture deleted locally.")).toBeVisible();
    await expect(sidePanelPage.getByText("No explicitly saved captures yet.")).toBeVisible();
    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({
      captureRecords: 0,
      screenshotAssets: 0
    });
  });

  test("N - confirmation uses native accessible controls and safe failure controls", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];

    await openCapture(sidePanelPage, target);
    await openDeletionConfirmation(sidePanelPage);
    const dialog = sidePanelPage.getByRole("alertdialog", { name: "Delete this capture?" });
    await expect(dialog).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Delete permanently" })).toBeFocused();
    await expect(sidePanelPage.getByRole("button", { name: "Delete permanently" }).evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("button");
    await expect(sidePanelPage.getByRole("button", { name: "Cancel deletion" }).evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("button");

    await deleteRecordWrapper(sidePanelPage, target.record.id);
    await sidePanelPage.getByRole("button", { name: "Delete permanently" }).click();
    await expectSafeDeleteFailure(sidePanelPage, target);
    await expect(sidePanelPage.getByRole("button", { name: "Retry deletion" })).toBeFocused();
    await restoreRecordWrapper(sidePanelPage, await createWrapperForTarget(sidePanelPage, target));
  });

  test("O - deleting one capture does not break metadata editing on another saved capture", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);

    await deleteThroughDetail(sidePanelPage, seeded[0]);
    await expectDeletionSuccess(sidePanelPage, seeded.slice(1));
    await openCapture(sidePanelPage, seeded[1]);
    await sidePanelPage.getByRole("button", { name: "Edit metadata" }).click();
    await sidePanelPage.getByLabel("Title").fill("Beta After Delete");
    await sidePanelPage.getByLabel("Component type").fill("post-delete-banner");
    await sidePanelPage.getByLabel("Tags").fill("delete, regression");
    await sidePanelPage.getByLabel("Notes").fill("Metadata still works after deleting another capture.");
    await sidePanelPage.getByRole("button", { name: "Save changes" }).click();

    await expect(sidePanelPage.getByText("Metadata saved locally.")).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Beta After Delete" })).toBeVisible();
    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({
      captureRecords: seeded.length - 1,
      screenshotAssets: seeded.length - 1
    });
  });
});

async function seedAndReload(page: Page, specs = DEFAULT_CAPTURE_FIXTURES) {
  const seeded = await resetAndSeedSavedCaptures(page, specs);
  await page.reload();
  await expectLibraryOrder(page, seeded);
  return seeded;
}

async function openCapture(page: Page, capture: SeededCapture) {
  await page.getByRole("button", { name: `Open saved capture: ${capture.title}` }).click();
  await expectDetailLoaded(page, capture);
}

async function expectDetailLoaded(page: Page, capture: SeededCapture) {
  await expect(page.getByRole("button", { name: "Back to Library" })).toBeVisible();
  await expect(page.getByRole("heading", { name: capture.title })).toBeVisible();
  await expect(page.locator("img.preview-image")).toHaveJSProperty("complete", true);
  await expect(page.getByText("Stored locally")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete capture" })).toBeVisible();
}

async function openDeletionConfirmation(page: Page) {
  await page.getByRole("button", { name: "Delete capture" }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete this capture?" })).toBeVisible();
  await expect(page.getByText("permanently removed from this browser and cannot be undone")).toBeVisible();
}

async function deleteThroughDetail(page: Page, capture: SeededCapture) {
  await openCapture(page, capture);
  await openDeletionConfirmation(page);
  await page.getByRole("button", { name: "Delete permanently" }).click();
}

async function expectDeletionSuccess(page: Page, remaining: SeededCapture[]) {
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  await expect(page.getByText("Capture deleted locally.")).toBeVisible();
  await expectLibraryOrder(page, remaining);
}

async function expectLibraryOrder(page: Page, seeded: SeededCapture[]) {
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  if (seeded.length === 0) {
    await expect(page.locator(".library-count")).toHaveCount(0);
    await expect(page.getByText("No explicitly saved captures yet.")).toBeVisible();
    return;
  }

  await expect(page.locator(".library-count")).toHaveText(String(seeded.length));
  const titles = await page.locator(".library-item-title").allTextContents();
  expect(titles).toEqual(seeded.map((capture) => capture.title));
}

async function expectSafeDeleteFailure(page: Page, capture: SeededCapture) {
  await expect(page.getByRole("alertdialog", { name: "Delete this capture?" })).toBeVisible();
  await expect(page.getByText("Could not delete capture.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry deletion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel deletion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Library" })).toBeVisible();
  await expect(page.getByText(capture.record.id)).toHaveCount(0);
  await expect(page.getByText(capture.storageKey)).toHaveCount(0);
  await expect(page.getByText(/schemaVersion|generatedVersions|stack|Error:/)).toHaveCount(0);
}

async function readWrapper(page: Page, recordId: string) {
  return (await readRecordWrapper(page, recordId)) as RecordWrapper;
}

async function createWrapperForTarget(_page: Page, target: SeededCapture): Promise<RecordWrapper> {
  return {
    id: target.record.id,
    value: JSON.parse(JSON.stringify(target.record)) as SeededCapture["record"],
    savedAt: target.savedAt
  };
}

async function installPostDeleteReadFailure(page: Page, recordId: string) {
  await page.evaluate((targetRecordId) => {
    const testWindow = window as unknown as {
      __ecDeleteFailure?: {
        enabled: boolean;
        armed: boolean;
        used: boolean;
        recordId: string;
      };
      __ecOriginalGet?: IDBObjectStore["get"];
      __ecOriginalDelete?: IDBObjectStore["delete"];
    };

    if (!testWindow.__ecOriginalGet) {
      testWindow.__ecOriginalGet = IDBObjectStore.prototype.get;
    }

    if (!testWindow.__ecOriginalDelete) {
      testWindow.__ecOriginalDelete = IDBObjectStore.prototype.delete;
    }

    testWindow.__ecDeleteFailure = {
      enabled: true,
      armed: false,
      used: false,
      recordId: targetRecordId
    };

    IDBObjectStore.prototype.delete = function patchedDelete(query: IDBValidKey | IDBKeyRange) {
      const gate = testWindow.__ecDeleteFailure;
      if (
        gate?.enabled &&
        this.name === "captureRecords" &&
        this.transaction.mode === "readwrite" &&
        query === gate.recordId
      ) {
        gate.armed = true;
      }

      return testWindow.__ecOriginalDelete!.call(this, query);
    };

    IDBObjectStore.prototype.get = function patchedGet(query: IDBValidKey | IDBKeyRange) {
      const request = testWindow.__ecOriginalGet!.call(this, query);
      const gate = testWindow.__ecDeleteFailure;
      if (
        gate?.enabled &&
        gate.armed &&
        !gate.used &&
        this.name === "captureRecords" &&
        this.transaction.mode === "readonly" &&
        query === gate.recordId
      ) {
        gate.used = true;
        try {
          this.transaction.abort();
        } catch {
          // The transaction may already have finished if the browser races the abort.
        }
      }

      return request;
    };
  }, recordId);
}

async function removePostDeleteReadFailure(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as unknown as {
      __ecDeleteFailure?: unknown;
      __ecOriginalGet?: IDBObjectStore["get"];
      __ecOriginalDelete?: IDBObjectStore["delete"];
    };

    if (testWindow.__ecOriginalGet) {
      IDBObjectStore.prototype.get = testWindow.__ecOriginalGet;
    }

    if (testWindow.__ecOriginalDelete) {
      IDBObjectStore.prototype.delete = testWindow.__ecOriginalDelete;
    }

    testWindow.__ecDeleteFailure = undefined;
  });
}
