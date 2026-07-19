import { test, expect, openSidePanelPage } from "./extension-fixture";
import {
  CAPTURE_RECORD_STORE_NAME,
  ELEMENT_CATCHER_DATABASE_VERSION,
  SCREENSHOT_ASSET_STORE_NAME,
  deleteRecordWrapper,
  readPersistenceCounts,
  readRecordWrapper,
  readScreenshotAssetSnapshot,
  replaceWrapperSavedAt,
  resetAndSeedSavedCaptures,
  restoreRecordWrapper,
  type SeededCapture
} from "./indexed-db-fixtures";

type RecordWrapper = {
  id: string;
  value: SeededCapture["record"];
  savedAt: string;
};

test.describe.configure({ mode: "serial" });

test.describe("Milestone 4C saved capture metadata automated validation", () => {
  test("A - edit form boot prepopulates native accessible controls", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    await openEditor(sidePanelPage, seeded[0]);

    await expect(sidePanelPage.getByLabel("Title")).toHaveValue(seeded[0].record.library.title!);
    await expect(sidePanelPage.getByLabel("Component type")).toHaveValue(seeded[0].record.library.componentType!);
    await expect(sidePanelPage.getByLabel("Tags")).toHaveValue(seeded[0].record.library.tags.join(", "));
    await expect(sidePanelPage.getByLabel("Notes")).toHaveValue(seeded[0].record.library.notes!);

    await expect(sidePanelPage.getByRole("button", { name: "Save changes" })).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Cancel editing" })).toBeVisible();
    await expect(sidePanelPage.getByLabel("Title").evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("textarea");
    await expect(sidePanelPage.getByLabel("Component type").evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("textarea");
    await expect(sidePanelPage.getByLabel("Tags").evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("textarea");
    await expect(sidePanelPage.getByLabel("Notes").evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("textarea");
  });

  test("B - Cancel editing discards draft without writing wrapper or asset", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const beforeWrapper = await readWrapper(sidePanelPage, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "Draft title",
      componentType: "draft-component",
      tags: "draft, tag",
      notes: "Draft notes"
    });
    await sidePanelPage.getByRole("button", { name: "Cancel editing" }).click();

    await expect(sidePanelPage.getByRole("button", { name: "Edit metadata" })).toBeVisible();
    expect(await readWrapper(sidePanelPage, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(beforeAsset);

    await sidePanelPage.getByRole("button", { name: "Edit metadata" }).click();
    await expect(sidePanelPage.getByLabel("Title")).toHaveValue(target.record.library.title!);
    await expect(sidePanelPage.getByLabel("Component type")).toHaveValue(target.record.library.componentType!);
    await expect(sidePanelPage.getByLabel("Tags")).toHaveValue(target.record.library.tags.join(", "));
    await expect(sidePanelPage.getByLabel("Notes")).toHaveValue(target.record.library.notes!);
  });

  test("C - successful update of all four fields updates detail and Library without reordering", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const originalOrder = seeded.map((capture) => capture.title);

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "Updated Gamma Title",
      componentType: "updated-modal",
      tags: "alpha, beta\nGamma",
      notes: "First line\nSecond line"
    });
    await saveMetadata(sidePanelPage);

    await expect(sidePanelPage.getByText("Metadata saved locally.")).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Updated Gamma Title" })).toBeVisible();
    await expectMetadataView(sidePanelPage, {
      componentType: "updated-modal",
      tags: "alpha, beta, Gamma",
      notes: "First line\nSecond line"
    });

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await expect(sidePanelPage.locator(".library-count")).toHaveText(String(seeded.length));
    const updatedTitles = await sidePanelPage.locator(".library-item-title").allTextContents();
    expect(updatedTitles).toEqual(["Updated Gamma Title", ...originalOrder.slice(1)]);
    await expect(sidePanelPage.locator(".library-component-type").first()).toHaveText("updated-modal");
  });

  test("D - successful metadata persists across Side Panel close and reopen", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await seedAndReload(page);
    const target = seeded[0];

    await openEditor(page, target);
    await fillMetadata(page, {
      title: "Persistent Gamma",
      componentType: "persistent-modal",
      tags: "persisted, local",
      notes: "Persisted note"
    });
    await saveMetadata(page);
    await page.close();

    const reopened = await openSidePanelPage(context, extensionId);
    await expect(reopened.getByRole("button", { name: "Open saved capture: Persistent Gamma" })).toBeVisible();
    await openCapture(reopened, "Persistent Gamma");
    await expect(reopened.getByRole("heading", { name: "Persistent Gamma" })).toBeVisible();
    await expectMetadataView(reopened, {
      componentType: "persistent-modal",
      tags: "persisted, local",
      notes: "Persisted note"
    });
    await reopened.close();
  });

  test("E - metadata normalization trims fields, splits tags, deduplicates tags, and normalizes notes", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "   ",
      componentType: "   ",
      tags: "  One tag, two   spaces\nONE TAG, beta  tag,  ",
      notes: "  line one\r\nline two\rline three  "
    });
    await saveMetadata(sidePanelPage);

    await expect(sidePanelPage.getByRole("heading", { name: target.record.summaries.componentType! })).toBeVisible();
    await expectMetadataView(sidePanelPage, {
      componentType: "Not set",
      tags: "One tag, two spaces, beta tag",
      notes: "line one\nline two\nline three"
    });

    const wrapper = await readWrapper(sidePanelPage, target.record.id);
    expect(wrapper.value.library).toEqual({
      tags: ["One tag", "two spaces", "beta tag"],
      notes: "line one\nline two\nline three"
    });
  });

  test("F - validation failures retain drafts and perform no wrapper or asset writes", async ({ sidePanelPage }) => {
    const cases = [
      { field: "Title", value: "T".repeat(121), message: "Title must be 120 characters or fewer.", fixed: "Fixed title" },
      { field: "Title", value: "Bad\nTitle", message: "Title must be a single line.", fixed: "Fixed title" },
      { field: "Component type", value: "c".repeat(81), message: "Component type must be 80 characters or fewer.", fixed: "fixed-card" },
      { field: "Tags", value: Array.from({ length: 21 }, (_, index) => `tag-${index}`).join(","), message: "Use 20 tags or fewer.", fixed: "fixed, tags" },
      { field: "Tags", value: "x".repeat(41), message: "Each tag must be 40 characters or fewer.", fixed: "fixed, tags" },
      { field: "Notes", value: "n".repeat(1001), message: "Notes must be 1000 characters or fewer.", fixed: "Fixed notes" }
    ];

    for (const validationCase of cases) {
      const seeded = await seedAndReload(sidePanelPage);
      const target = seeded[0];
      const beforeWrapper = await readWrapper(sidePanelPage, target.record.id);
      const beforeAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);

      await openEditor(sidePanelPage, target);
      await fillMetadata(sidePanelPage, {
        title: "Valid title",
        componentType: "valid-card",
        tags: "valid, tags",
        notes: "Valid notes"
      });
      await sidePanelPage.getByLabel(validationCase.field).fill(validationCase.value);
      await sidePanelPage.getByRole("button", { name: "Save changes" }).click();

      await expect(sidePanelPage.getByText(validationCase.message)).toBeVisible();
      await expect(sidePanelPage.getByLabel(validationCase.field)).toHaveValue(validationCase.value);
      expect(await readWrapper(sidePanelPage, target.record.id)).toEqual(beforeWrapper);
      expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(beforeAsset);

      await sidePanelPage.getByLabel(validationCase.field).fill(validationCase.fixed);
      await saveMetadata(sidePanelPage);
      await expect(sidePanelPage.getByText("Metadata saved locally.")).toBeVisible();
    }
  });

  test("G - successful update mutates only library metadata and preserves savedAt", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const beforeWrapper = await readWrapper(sidePanelPage, target.record.id);

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "Immutable Boundary",
      componentType: "metadata-only",
      tags: "safe, local",
      notes: "Only library metadata changed."
    });
    await saveMetadata(sidePanelPage);

    const afterWrapper = await readWrapper(sidePanelPage, target.record.id);
    expect(afterWrapper.id).toBe(beforeWrapper.id);
    expect(afterWrapper.savedAt).toBe(beforeWrapper.savedAt);
    expect(afterWrapper.value.library).toEqual({
      title: "Immutable Boundary",
      componentType: "metadata-only",
      tags: ["safe", "local"],
      notes: "Only library metadata changed."
    });

    for (const key of [
      "schemaVersion",
      "id",
      "createdAt",
      "source",
      "environment",
      "element",
      "dom",
      "styles",
      "summaries",
      "assets",
      "generatedVersions"
    ] as const) {
      expect(afterWrapper.value[key]).toEqual(beforeWrapper.value[key]);
    }
    expect("modifiedAt" in afterWrapper.value).toBe(false);
  });

  test("H - screenshot asset metadata, digest, count, and storageKey remain unchanged", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const beforeCounts = await readPersistenceCounts(sidePanelPage);
    const beforeAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "Asset Stable",
      componentType: "asset-stable",
      tags: "asset",
      notes: "Asset must not change."
    });
    await saveMetadata(sidePanelPage);

    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(beforeAsset);
    const afterWrapper = await readWrapper(sidePanelPage, target.record.id);
    expect(afterWrapper.value.assets.screenshot.storageKey).toBe(target.storageKey);
  });

  test("I - missing record failure is safe and Retry saves the retained draft after restoration", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const originalWrapper = await readWrapper(sidePanelPage, target.record.id);

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "Retry Missing Record",
      componentType: "retry-card",
      tags: "retry",
      notes: "Draft survives missing wrapper."
    });
    await deleteRecordWrapper(sidePanelPage, target.record.id);
    await sidePanelPage.getByRole("button", { name: "Save changes" }).click();

    await expect(sidePanelPage.getByText("Could not save metadata.")).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Retry save" })).toBeVisible();
    await expect(sidePanelPage.getByText(target.record.id)).toHaveCount(0);
    await expect(sidePanelPage.getByText(target.storageKey)).toHaveCount(0);
    await expect(sidePanelPage.getByText(/schemaVersion|generatedVersions|stack|Error:/)).toHaveCount(0);
    expect(await readRecordWrapper(sidePanelPage, target.record.id)).toBeUndefined();

    await restoreRecordWrapper(sidePanelPage, originalWrapper);
    await sidePanelPage.getByRole("button", { name: "Retry save" }).click();
    await expect(sidePanelPage.getByText("Metadata saved locally.")).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Retry Missing Record" })).toBeVisible();
  });

  test("J - savedAt conflict is safe, preserves altered wrapper, and Retry succeeds after restoration", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const originalWrapper = await readWrapper(sidePanelPage, target.record.id);
    const conflictSavedAt = "2026-07-18T12:34:56.000Z";

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "Conflict Retry",
      componentType: "conflict-card",
      tags: "conflict",
      notes: "Draft survives savedAt conflict."
    });
    await replaceWrapperSavedAt(sidePanelPage, target.record.id, conflictSavedAt);
    await sidePanelPage.getByRole("button", { name: "Save changes" }).click();

    await expect(sidePanelPage.getByText("Could not save metadata.")).toBeVisible();
    const conflictedWrapper = await readWrapper(sidePanelPage, target.record.id);
    expect(conflictedWrapper.savedAt).toBe(conflictSavedAt);
    expect(conflictedWrapper.value.library).toEqual(originalWrapper.value.library);

    await restoreRecordWrapper(sidePanelPage, originalWrapper);
    await sidePanelPage.getByRole("button", { name: "Retry save" }).click();
    await expect(sidePanelPage.getByText("Metadata saved locally.")).toBeVisible();
    const finalWrapper = await readWrapper(sidePanelPage, target.record.id);
    expect(finalWrapper.savedAt).toBe(originalWrapper.savedAt);
    expect(finalWrapper.value.library.title).toBe("Conflict Retry");
  });

  test("K - rapid duplicate Save changes activation produces one record update and no new asset", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const beforeCounts = await readPersistenceCounts(sidePanelPage);
    const beforeAsset = await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey);

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "Duplicate Guard",
      componentType: "duplicate-guard",
      tags: "duplicate",
      notes: "One update only."
    });

    const saveButton = sidePanelPage.getByRole("button", { name: "Save changes" });
    await saveButton.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await expect(sidePanelPage.getByText("Metadata saved locally.")).toBeVisible();
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
    expect(await readScreenshotAssetSnapshot(sidePanelPage, target.storageKey)).toEqual(beforeAsset);
    const wrapper = await readWrapper(sidePanelPage, target.record.id);
    expect(wrapper.value.library.title).toBe("Duplicate Guard");
  });

  test("L - Back during save does not reopen detail and Library reflects committed metadata", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];

    await openEditor(sidePanelPage, target);
    await fillMetadata(sidePanelPage, {
      title: "Back During Save",
      componentType: "back-safe",
      tags: "back",
      notes: "Back should stay in Library."
    });
    await sidePanelPage.getByRole("button", { name: "Save changes" }).click();
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();

    await expect(sidePanelPage.getByRole("heading", { name: "Capture Library" })).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Open saved capture: Back During Save" })).toBeVisible();
    await expect(sidePanelPage.locator(".library-count")).toHaveText(String(seeded.length));
    const titles = await sidePanelPage.locator(".library-item-title").allTextContents();
    expect(titles).toEqual(["Back During Save", seeded[1].title, seeded[2].title]);
  });

  test("M - metadata editing scope excludes 4D, 4E, source navigation, AI, and modifiedAt", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    await openEditor(sidePanelPage, seeded[0]);

    for (const forbiddenName of [
      /source/i,
      /extract/i,
      /summary/i,
      /screenshot/i,
      /generated/i,
      /delete/i,
      /search/i,
      /filter/i,
      /navigate/i,
      /generate/i,
      /ai/i
    ]) {
      await expect(sidePanelPage.getByRole("button", { name: forbiddenName })).toHaveCount(0);
      await expect(sidePanelPage.getByRole("link", { name: forbiddenName })).toHaveCount(0);
    }

    await expect(sidePanelPage.locator("a")).toHaveCount(0);
    const wrapper = await readWrapper(sidePanelPage, seeded[0].record.id);
    expect("modifiedAt" in wrapper.value).toBe(false);
  });

  test("N - database stores and existing saved detail behavior remain intact", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const counts = await readPersistenceCounts(sidePanelPage);

    expect(counts).toEqual({
      version: ELEMENT_CATCHER_DATABASE_VERSION,
      stores: [CAPTURE_RECORD_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort(),
      captureRecords: seeded.length,
      screenshotAssets: seeded.length
    });
    await openCapture(sidePanelPage, seeded[1].title);
    await expect(sidePanelPage.getByRole("heading", { name: seeded[1].title })).toBeVisible();
    await expect(sidePanelPage.locator("img.preview-image")).toHaveJSProperty("complete", true);
    await expectMetadataView(sidePanelPage, {
      componentType: seeded[1].record.library.componentType!,
      tags: seeded[1].record.library.tags.join(", "),
      notes: seeded[1].record.library.notes!
    });
  });
});

async function seedAndReload(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  await expectLibraryOrder(page, seeded);
  return seeded;
}

async function openCapture(page: Parameters<typeof resetAndSeedSavedCaptures>[0], title: string) {
  await page.getByRole("button", { name: `Open saved capture: ${title}` }).click();
}

async function openEditor(page: Parameters<typeof resetAndSeedSavedCaptures>[0], capture: SeededCapture) {
  await openCapture(page, capture.title);
  await expect(page.getByRole("heading", { name: capture.title })).toBeVisible();
  await page.getByRole("button", { name: "Edit metadata" }).click();
}

async function fillMetadata(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  input: {
    title: string;
    componentType: string;
    tags: string;
    notes: string;
  }
) {
  await page.getByLabel("Title").fill(input.title);
  await page.getByLabel("Component type").fill(input.componentType);
  await page.getByLabel("Tags").fill(input.tags);
  await page.getByLabel("Notes").fill(input.notes);
}

async function saveMetadata(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Metadata saved locally.")).toBeVisible();
}

async function expectMetadataView(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  expected: {
    componentType: string;
    tags: string;
    notes: string;
  }
) {
  const metadataPanel = page.locator(".library-metadata-panel");
  await expect(metadataPanel.getByText(expected.componentType, { exact: true })).toBeVisible();
  await expect(metadataPanel.getByText(expected.tags, { exact: true })).toBeVisible();
  await expect(metadataPanel.getByText(expected.notes, { exact: true })).toBeVisible();
}

async function expectLibraryOrder(page: Parameters<typeof resetAndSeedSavedCaptures>[0], seeded: SeededCapture[]) {
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  await expect(page.locator(".library-count")).toHaveText(String(seeded.length));
  const titles = await page.locator(".library-item-title").allTextContents();
  expect(titles).toEqual(seeded.map((capture) => capture.title));
}

async function readWrapper(page: Parameters<typeof resetAndSeedSavedCaptures>[0], recordId: string) {
  return (await readRecordWrapper(page, recordId)) as RecordWrapper;
}
