import { createServer } from "node:http";
import { test, expect, getObjectUrlSnapshot, openSidePanelPage } from "./extension-fixture";
import {
  CAPTURE_RECORD_STORE_NAME,
  GENERATED_COMPONENT_VERSION_STORE_NAME,
  ELEMENT_CATCHER_DATABASE_VERSION,
  SCREENSHOT_ASSET_STORE_NAME,
  clearTestData,
  deleteRecordWrapper,
  deleteScreenshotAsset,
  readPersistenceCounts,
  readRecordWrapper,
  replaceWrapperWithIdMismatch,
  resetAndSeedSavedCaptures,
  restoreRecordWrapper,
  restoreScreenshotAsset,
  type SeededCapture
} from "./indexed-db-fixtures";

test.describe.configure({ mode: "serial" });

test.describe("Milestone 4B saved capture detail automated validation", () => {
  test("A - extension and Library boot loads seeded captures newest-first with Blob thumbnails", async ({ sidePanelPage, extensionId }) => {
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    const seeded = await seedAndReload(sidePanelPage);

    await expectLibraryOrder(sidePanelPage, seeded);
    await expectBlobThumbnails(sidePanelPage, seeded.length);

    const counts = await readPersistenceCounts(sidePanelPage);
    expect(counts).toEqual({
      version: ELEMENT_CATCHER_DATABASE_VERSION,
      stores: [CAPTURE_RECORD_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort(),
      captureRecords: seeded.length,
      screenshotAssets: seeded.length,
      generatedComponentVersions: 0
    });
  });

  test("B - native Library item interaction supports mouse, Enter and Space without source navigation", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const originalUrl = sidePanelPage.url();

    const buttons = sidePanelPage.getByRole("list", { name: "Saved captures" }).getByRole("button");
    await expect(buttons).toHaveCount(seeded.length);

    for (let index = 0; index < seeded.length; index += 1) {
      const button = buttons.nth(index);
      await expect(button).toHaveAttribute("type", "button");
      await expect(button).toHaveAccessibleName(`Open saved capture: ${seeded[index].title}`);
      await expect(button.evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("button");
    }

    await buttons.nth(0).click();
    await expectDetailLoaded(sidePanelPage, seeded[0]);
    expect(sidePanelPage.url()).toBe(originalUrl);
    await backToLibrary(sidePanelPage, seeded);

    await buttons.nth(1).focus();
    await sidePanelPage.keyboard.press("Enter");
    await expectDetailLoaded(sidePanelPage, seeded[1]);
    expect(sidePanelPage.url()).toBe(originalUrl);
    await backToLibrary(sidePanelPage, seeded);

    await buttons.nth(2).focus();
    await sidePanelPage.keyboard.press("Space");
    await expectDetailLoaded(sidePanelPage, seeded[2]);
    expect(sidePanelPage.url()).toBe(originalUrl);
  });

  test("C - loaded saved detail rereads persistence and switches captures without stale data", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const first = seeded[0];
    const wrapper = await readRecordWrapper(sidePanelPage, first.record.id) as { value: SeededCapture["record"] };
    const rereadTitle = "Gamma Modal Reread";
    wrapper.value.library.title = rereadTitle;
    await restoreRecordWrapper(sidePanelPage, wrapper);

    await openCapture(sidePanelPage, first.title);
    await expect(sidePanelPage.getByRole("heading", { name: rereadTitle })).toBeVisible();
    await expect(sidePanelPage.getByText(first.title, { exact: true })).toHaveCount(0);
    await expectDetailMetadata(sidePanelPage, {
      ...first,
      title: rereadTitle,
      record: {
        ...first.record,
        library: {
          ...first.record.library,
          title: rereadTitle
        }
      }
    });
    await backToLibrary(sidePanelPage, seeded);

    await openCapture(sidePanelPage, seeded[1].title);
    await expectDetailLoaded(sidePanelPage, seeded[1]);
    await expect(sidePanelPage.getByRole("heading", { name: rereadTitle })).toHaveCount(0);
  });

  test("D - Back restores the complete Library without mutation, duplicates, writes or navigation", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const beforeCounts = await readPersistenceCounts(sidePanelPage);
    const beforeWrapper = await readRecordWrapper(sidePanelPage, seeded[0].record.id);
    const originalUrl = sidePanelPage.url();

    await openCapture(sidePanelPage, seeded[0].title);
    await expectDetailLoaded(sidePanelPage, seeded[0]);
    await backToLibrary(sidePanelPage, seeded);

    await expectLibraryOrder(sidePanelPage, seeded);
    await expectBlobThumbnails(sidePanelPage, seeded.length);
    expect(sidePanelPage.url()).toBe(originalUrl);
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
    expect(await readRecordWrapper(sidePanelPage, seeded[0].record.id)).toEqual(beforeWrapper);
  });

  test("E - stale-list not-found failure is safe and Retry recovers after wrapper restoration", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const wrapper = await readRecordWrapper(sidePanelPage, target.record.id);

    await deleteRecordWrapper(sidePanelPage, target.record.id);
    await openCapture(sidePanelPage, target.title);
    await expectSafeDetailFailure(sidePanelPage, target);

    await sidePanelPage.getByRole("button", { name: "Retry loading" }).click();
    await expectSafeDetailFailure(sidePanelPage, target);

    await restoreRecordWrapper(sidePanelPage, wrapper);
    await sidePanelPage.getByRole("button", { name: "Retry loading" }).click();
    await expectDetailLoaded(sidePanelPage, target);
  });

  test("F - missing screenshot asset failure is safe and Retry recovers after asset restoration", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const beforeCounts = await readPersistenceCounts(sidePanelPage);

    await deleteScreenshotAsset(sidePanelPage, target.storageKey);
    await openCapture(sidePanelPage, target.title);
    await expectSafeDetailFailure(sidePanelPage, target);

    await sidePanelPage.getByRole("button", { name: "Retry loading" }).click();
    await expectSafeDetailFailure(sidePanelPage, target);

    await restoreScreenshotAsset(sidePanelPage, target);
    await sidePanelPage.getByRole("button", { name: "Retry loading" }).click();
    await expectDetailLoaded(sidePanelPage, target);
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
  });

  test("G - wrapper ID mismatch fails safely, Back restores Library and Retry succeeds after restoration", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const target = seeded[0];
    const wrapper = await readRecordWrapper(sidePanelPage, target.record.id);

    await replaceWrapperWithIdMismatch(sidePanelPage, target);
    await openCapture(sidePanelPage, target.title);
    await expectSafeDetailFailure(sidePanelPage, target);
    await backToLibrary(sidePanelPage, seeded);

    await replaceWrapperWithIdMismatch(sidePanelPage, target);
    await openCapture(sidePanelPage, target.title);
    await restoreRecordWrapper(sidePanelPage, wrapper);
    await sidePanelPage.getByRole("button", { name: "Retry loading" }).click();
    await expectDetailLoaded(sidePanelPage, target);
  });

  test("H - detail object URL lifecycle revokes list and detail URLs across Back and another open", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    await expectBlobThumbnails(sidePanelPage, seeded.length);

    const listSnapshot = await getObjectUrlSnapshot(sidePanelPage);
    expect(listSnapshot.active).toHaveLength(seeded.length);

    await openCapture(sidePanelPage, seeded[0].title);
    await expectDetailLoaded(sidePanelPage, seeded[0]);
    const firstDetailImage = sidePanelPage.locator("img.preview-image");
    const firstDetailUrl = await firstDetailImage.getAttribute("src");
    expect(firstDetailUrl).toMatch(/^blob:/);

    const firstDetailSnapshot = await getObjectUrlSnapshot(sidePanelPage);
    for (const listUrl of listSnapshot.active) {
      expect(firstDetailSnapshot.revoked).toContain(listUrl);
    }
    expect(firstDetailSnapshot.active).toEqual([firstDetailUrl]);

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await expectLibraryOrder(sidePanelPage, seeded);
    const secondListSnapshot = await getObjectUrlSnapshot(sidePanelPage);
    expect(secondListSnapshot.revoked).toContain(firstDetailUrl);
    expect(secondListSnapshot.active).toHaveLength(seeded.length);
    for (const url of secondListSnapshot.active) {
      expect(url).toMatch(/^blob:/);
      expect(url).not.toBe(firstDetailUrl);
    }

    await openCapture(sidePanelPage, seeded[1].title);
    await expectDetailLoaded(sidePanelPage, seeded[1]);
    const secondDetailUrl = await sidePanelPage.locator("img.preview-image").getAttribute("src");
    expect(secondDetailUrl).toMatch(/^blob:/);
    expect(secondDetailUrl).not.toBe(firstDetailUrl);

    const finalSnapshot = await getObjectUrlSnapshot(sidePanelPage);
    for (const url of secondListSnapshot.active) {
      expect(finalSnapshot.revoked).toContain(url);
    }
    expect(finalSnapshot.active).toEqual([secondDetailUrl]);
    await expect(sidePanelPage.locator("img.preview-image")).toHaveJSProperty("complete", true);
  });

  test("I - Side Panel page close and reopen restores Library and permits reopening saved detail", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await seedAndReload(page);
    await openCapture(page, seeded[0].title);
    await expectDetailLoaded(page, seeded[0]);
    await page.close();

    const reopened = await openSidePanelPage(context, extensionId);
    await expectLibraryOrder(reopened, seeded);
    await expectBlobThumbnails(reopened, seeded.length);
    expect(await readPersistenceCounts(reopened)).toMatchObject({
      captureRecords: seeded.length,
      screenshotAssets: seeded.length,
      generatedComponentVersions: 0
    });

    await openCapture(reopened, seeded[1].title);
    await expectDetailLoaded(reopened, seeded[1]);
    await reopened.close();
  });

  test("J/K - saved detail scope boundaries and persistence integrity include 4D and exclude Milestone 4E+ controls", async ({ sidePanelPage }) => {
    const seeded = await seedAndReload(sidePanelPage);
    const beforeCounts = await readPersistenceCounts(sidePanelPage);
    const beforeWrappers = await Promise.all(seeded.map((capture) => readRecordWrapper(sidePanelPage, capture.record.id)));

    await openCapture(sidePanelPage, seeded[0].title);
    await expectDetailLoaded(sidePanelPage, seeded[0]);

    await expect(sidePanelPage.getByRole("button", { name: "Edit metadata" })).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Delete capture" })).toBeVisible();

    for (const forbiddenName of [
      /search/i,
      /filter/i,
      /recapture/i,
      /cloud/i,
      /sign in/i,
      /authenticate/i,
      /collabor/i,
      /payment/i
    ]) {
      await expect(sidePanelPage.getByRole("button", { name: forbiddenName })).toHaveCount(0);
      await expect(sidePanelPage.getByRole("link", { name: forbiddenName })).toHaveCount(0);
    }

    await expect(sidePanelPage.locator("a")).toHaveCount(0);
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
    const afterWrappers = await Promise.all(seeded.map((capture) => readRecordWrapper(sidePanelPage, capture.record.id)));
    expect(afterWrappers).toEqual(beforeWrappers);

    await backToLibrary(sidePanelPage, seeded);
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
  });

  test("actual capture/save automation attempt records activeTab gap without production permission changes", async ({ context, extensionId }, testInfo) => {
    const server = await startFixtureServer();
    const page = await openSidePanelPage(context, extensionId);

    try {
      await clearTestData(page);
      const localhostPage = await context.newPage();
      await localhostPage.goto(server.url);
      await expect(localhostPage.getByRole("heading", { name: "Element Catcher E2E Target" })).toBeVisible();

      await page.bringToFront();
      await page.getByRole("button", { name: "Start Capture" }).click();

      const startedSelection = await page.locator(".notice-active").waitFor({ timeout: 3_000 }).then(
        () => true,
        () => false
      );
      const safeError = await page.locator(".notice-error").waitFor({ timeout: 500 }).then(
        () => true,
        () => false
      );

      if (!startedSelection) {
        await testInfo.attach("activeTab-capture-attempt.txt", {
          body: safeError
            ? "The automated direct extension-page attempt reached a safe Start Capture error before capture/save could proceed."
            : "The automated direct extension-page attempt left Start Capture in the starting state; Playwright did not reproduce the real Side Panel activeTab/action-click grant without adding production permissions or test hooks.",
          contentType: "text/plain"
        });
        await expect(page.locator(".notice")).toContainText(
          safeError
            ? /ordinary http and https webpages|could not reach this page|No active tab is available/
            : "Starting selection mode on the active webpage..."
        );
        expect(await readPersistenceCounts(page)).toMatchObject({
          captureRecords: 0,
          screenshotAssets: 0,
          generatedComponentVersions: 0
        });
        await localhostPage.close();
        return;
      }

      await localhostPage.bringToFront();
      await localhostPage.locator("#target-card").hover();
      await localhostPage.locator("#target-card").click();
      await page.bringToFront();
      await expect(page.getByRole("heading", { name: "Locked element" })).toBeVisible();
      await page.getByRole("button", { name: "Confirm" }).click();
      await expect(page.getByRole("heading", { name: "Current capture" })).toBeVisible();
      await page.getByRole("button", { name: "Save capture" }).click();
      await expect(page.getByText("Saved locally. The CaptureRecord and screenshot asset were verified after read-back.")).toBeVisible();

      expect(await readPersistenceCounts(page)).toMatchObject({
        captureRecords: 1,
        screenshotAssets: 1,
        generatedComponentVersions: 0
      });
      await localhostPage.close();
    } finally {
      await page.close();
      await server.close();
    }
  });
});

async function seedAndReload(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  await expectLibraryOrder(page, seeded);
  return seeded;
}

async function expectLibraryOrder(page: Parameters<typeof resetAndSeedSavedCaptures>[0], seeded: SeededCapture[]) {
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  await expect(page.locator(".library-count")).toHaveText(String(seeded.length));
  const titles = await page.locator(".library-item-title").allTextContents();
  expect(titles).toEqual(seeded.map((capture) => capture.title));
}

async function expectBlobThumbnails(page: Parameters<typeof resetAndSeedSavedCaptures>[0], expectedCount: number) {
  const thumbnails = page.locator("img.library-thumbnail");
  await expect(thumbnails).toHaveCount(expectedCount);

  for (let index = 0; index < expectedCount; index += 1) {
    const thumbnail = thumbnails.nth(index);
    await expect(thumbnail).toHaveJSProperty("complete", true);
    const src = await thumbnail.getAttribute("src");
    expect(src).toMatch(/^blob:/);
    expect(src).not.toMatch(/^data:/);
    expect(src).not.toMatch(/^https?:/);
    const naturalWidth = await thumbnail.evaluate((image) => (image as HTMLImageElement).naturalWidth);
    const naturalHeight = await thumbnail.evaluate((image) => (image as HTMLImageElement).naturalHeight);
    expect(naturalWidth).toBeGreaterThan(0);
    expect(naturalHeight).toBeGreaterThan(0);
  }
}

async function openCapture(page: Parameters<typeof resetAndSeedSavedCaptures>[0], title: string) {
  await page.getByRole("button", { name: `Open saved capture: ${title}` }).click();
}

async function expectDetailLoaded(page: Parameters<typeof resetAndSeedSavedCaptures>[0], capture: SeededCapture) {
  await expect(page.getByRole("button", { name: "Back to Library" })).toBeVisible();
  await expect(page.getByText("Stored locally")).toBeVisible();
  await expect(page.getByRole("heading", { name: capture.title })).toBeVisible();
  await expectDetailMetadata(page, capture);
}

async function expectDetailMetadata(page: Parameters<typeof resetAndSeedSavedCaptures>[0], capture: SeededCapture) {
  const image = page.locator("img.preview-image");
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty("complete", true);
  const src = await image.getAttribute("src");
  expect(src).toMatch(/^blob:/);
  expect(src).not.toMatch(/^data:/);
  expect(src).not.toMatch(/^https?:/);

  await expect(page.getByText(capture.record.source.pageTitle)).toBeVisible();
  await expect(page.getByText(capture.sourceDisplay)).toBeVisible();
  if (capture.record.source.url !== capture.sourceDisplay) {
    await expect(page.getByText(capture.record.source.url)).toHaveCount(0);
  }
  await expect(page.getByText(capture.record.element.tagName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(capture.record.element.semanticRole!, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`${capture.record.element.rect.width} x ${capture.record.element.rect.height} CSS px`).first()).toBeVisible();
  await expect(page.getByText(`${capture.record.assets.screenshot.width} x ${capture.record.assets.screenshot.height} px`).first()).toBeVisible();
  await expect(page.getByText(`${capture.record.assets.screenshot.crop.width} x ${capture.record.assets.screenshot.crop.height} CSS px`).first()).toBeVisible();
  await expect(page.getByText("Design summaries")).toBeVisible();
  await expect(page.getByText("Sanitized structure")).toBeVisible();
  await expect(page.getByText("Saved at")).toBeVisible();

  await page.getByText("Technical details").click();
  await expect(page.getByText(capture.record.id, { exact: true })).toBeVisible();
  await expect(page.getByText(capture.storageKey, { exact: true })).toBeVisible();
}

async function backToLibrary(page: Parameters<typeof resetAndSeedSavedCaptures>[0], seeded: SeededCapture[]) {
  await page.getByRole("button", { name: "Back to Library" }).click();
  await expectLibraryOrder(page, seeded);
}

async function expectSafeDetailFailure(page: Parameters<typeof resetAndSeedSavedCaptures>[0], capture: SeededCapture) {
  await expect(page.getByRole("heading", { name: "Saved capture unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry loading" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Capture" })).toBeVisible();
  await expect(page.getByText("Could not load the saved capture.")).toBeVisible();
  await expect(page.getByText(capture.record.id)).toHaveCount(0);
  await expect(page.getByText(capture.storageKey)).toHaveCount(0);
  await expect(page.getByText(/schemaVersion|generatedVersions|stack|Error:/)).toHaveCount(0);
}

async function startFixtureServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <body>
          <main>
            <h1>Element Catcher E2E Target</h1>
            <article id="target-card" role="region">Automated capture target</article>
          </main>
        </body>
      </html>`);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start localhost fixture server.");
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => error ? reject(error) : resolve());
      })
  };
}
