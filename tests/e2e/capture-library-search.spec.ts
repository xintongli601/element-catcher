import type { Locator, Page } from "@playwright/test";
import { test, expect, getObjectUrlSnapshot, openSidePanelPage } from "./extension-fixture";
import {
  CAPTURE_RECORD_STORE_NAME,
  ELEMENT_CATCHER_DATABASE_VERSION,
  SCREENSHOT_ASSET_STORE_NAME,
  clearTestData,
  readAllRecordWrappers,
  readAllScreenshotAssetSnapshots,
  readPersistenceCounts,
  readRecordWrapper,
  readScreenshotAssetSnapshot,
  resetAndSeedSavedCaptures,
  type CaptureFixtureSpec
} from "./indexed-db-fixtures";

const SEARCH_FIXTURES: CaptureFixtureSpec[] = [
  createSearchFixture({
    id: "capture-00000000-0000-0000-0000-000000000101",
    title: "Alpha Pricing Card",
    libraryComponentType: "Pricing Card",
    summaryComponentType: "Summary Should Yield To Library",
    sourceUrl: "https://user-secret:pass-secret@example.test/library/alpha?query-secret=hidden#fragment-secret",
    pageTitle: "Alpha Pricing Source",
    savedAt: "2026-07-18T09:00:00.000Z",
    color: "#2563eb",
    libraryTags: ["Inspiration", "Cards"],
    libraryNotes: "notes-only-sentinel",
    elementTextPreview: "element-text-sentinel",
    elementId: "element-id-sentinel",
    elementClassNames: ["class-name-sentinel"],
    domTextPreview: "dom-snapshot-sentinel",
    childSummaryTextPreview: "child-summary-sentinel",
    styleSentinel: "style-computed-sentinel",
    generatedVersionCode: "generated-version-sentinel",
    typographyNotes: "typography-safe-sentinel",
    colorRole: { role: "brand-safe-role", value: "brand-safe-value" },
    layoutNotes: "layout-safe-sentinel",
    spacingNotes: "spacing-safe-sentinel",
    spacingGap: "13px"
  }),
  createSearchFixture({
    id: "capture-00000000-0000-0000-0000-000000000102",
    title: "Beta Pricing Card",
    libraryComponentType: "pricing card",
    summaryComponentType: "summary beta",
    sourceUrl: "https://example.test/library/beta",
    pageTitle: "Beta Campaign",
    savedAt: "2026-07-18T10:00:00.000Z",
    color: "#0f766e",
    libraryTags: ["inspiration", "Campaign"]
  }),
  createSearchFixture({
    id: "capture-00000000-0000-0000-0000-000000000103",
    title: "Gamma Modal",
    libraryComponentType: "Modal",
    summaryComponentType: "modal",
    sourceUrl: "https://example.test/library/gamma",
    pageTitle: "Gamma Fixture",
    savedAt: "2026-07-18T11:00:00.000Z",
    color: "#7c3aed",
    libraryTags: ["Dialog", "Reference"]
  }),
  createSearchFixture({
    id: "capture-00000000-0000-0000-0000-000000000104",
    title: "Delta Summary Tile",
    libraryComponentType: undefined,
    summaryComponentType: "Metric Tile",
    sourceUrl: "https://example.test/library/delta",
    pageTitle: "Delta Metrics",
    savedAt: "2026-07-18T12:00:00.000Z",
    color: "#dc2626",
    libraryTags: ["Metrics"]
  }),
  createSearchFixture({
    id: "capture-00000000-0000-0000-0000-000000000105",
    title: "Epsilon Untyped",
    libraryComponentType: undefined,
    summaryComponentType: undefined,
    sourceUrl: "not a valid url malformed-source-sentinel",
    pageTitle: "Epsilon Plain",
    savedAt: "2026-07-18T13:00:00.000Z",
    color: "#9333ea",
    libraryTags: []
  })
];

test.describe.configure({ mode: "serial" });

test.describe("Milestone 4E Capture Library search and filter automated validation", () => {
  test("A - search/filter controls boot as native accessible controls and hide for empty Library", async ({ sidePanelPage }) => {
    const seeded = await seedSearchLibrary(sidePanelPage);
    await expectTitles(sidePanelPage, seeded.map((capture) => capture.title));

    const search = sidePanelPage.getByLabel("Search captures");
    await expect(search).toHaveAttribute("type", "search");
    await expect(search.evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("input");
    await expect(sidePanelPage.getByLabel("Component type").evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("select");
    await expect(sidePanelPage.getByLabel("Tag").evaluate((element) => element.tagName.toLowerCase())).resolves.toBe("select");
    await expect(sidePanelPage.getByRole("button", { name: "Clear search and filters" })).toHaveAttribute("type", "button");

    await search.focus();
    await sidePanelPage.keyboard.type("gamma");
    await expectTitles(sidePanelPage, ["Gamma Modal"]);
    await sidePanelPage.keyboard.press("Tab");
    await expect(sidePanelPage.getByLabel("Component type")).toBeFocused();

    await clearTestData(sidePanelPage);
    await sidePanelPage.reload();
    await expect(sidePanelPage.getByText("No explicitly saved captures yet.")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Search captures")).toHaveCount(0);
  });

  test("B - title search is case-insensitive and preserves newest-first ordering among matches", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);

    await sidePanelPage.getByLabel("Search captures").fill("  PRICING   card  ");
    await expectTitles(sidePanelPage, ["Beta Pricing Card", "Alpha Pricing Card"]);
  });

  test("C - approved metadata search covers tags, component type, source, page title, and summaries", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);

    for (const { query, titles } of [
      { query: "campaign", titles: ["Beta Pricing Card"] },
      { query: "Pricing Card", titles: ["Beta Pricing Card", "Alpha Pricing Card"] },
      { query: "Alpha Pricing Source", titles: ["Alpha Pricing Card"] },
      { query: "https://example.test/library/alpha", titles: ["Alpha Pricing Card"] },
      { query: "Metric Tile", titles: ["Delta Summary Tile"] },
      { query: "typography-safe-sentinel", titles: ["Alpha Pricing Card"] },
      { query: "brand-safe-role", titles: ["Alpha Pricing Card"] },
      { query: "layout-safe-sentinel", titles: ["Alpha Pricing Card"] },
      { query: "13px", titles: ["Alpha Pricing Card"] }
    ]) {
      await sidePanelPage.getByLabel("Search captures").fill(query);
      await expectTitles(sidePanelPage, titles);
    }
  });

  test("D - source URL search strips credentials, query, fragment, and malformed non-http text", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);
    const originalUrl = sidePanelPage.url();

    await sidePanelPage.getByLabel("Search captures").fill("example.test/library/alpha");
    await expectTitles(sidePanelPage, ["Alpha Pricing Card"]);

    for (const forbidden of [
      "user-secret",
      "pass-secret",
      "query-secret",
      "hidden",
      "fragment-secret",
      "malformed-source-sentinel"
    ]) {
      await sidePanelPage.getByLabel("Search captures").fill(forbidden);
      await expectNoResults(sidePanelPage);
      expect(sidePanelPage.url()).toBe(originalUrl);
    }
  });

  test("E - explicit privacy exclusions never match hidden raw fields", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);

    for (const sentinel of [
      "notes-only-sentinel",
      "element-text-sentinel",
      "element-id-sentinel",
      "class-name-sentinel",
      "dom-snapshot-sentinel",
      "child-summary-sentinel",
      "style-computed-sentinel",
      "screenshots/capture-00000000-0000-0000-0000-000000000101.png",
      "generated-version-sentinel"
    ]) {
      await sidePanelPage.getByLabel("Search captures").fill(sentinel);
      await expectNoResults(sidePanelPage);
      await expect(sidePanelPage.getByText(sentinel, { exact: true })).toHaveCount(0);
    }
  });

  test("F - component-type filter uses library-first fallback, exact matching, dedupe, and sorted options", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);
    const component = sidePanelPage.getByLabel("Component type");

    expect(await selectOptions(component)).toEqual([
      "All component types",
      "Metric Tile",
      "Modal",
      "pricing card"
    ]);
    await component.selectOption("pricing card");
    await expectTitles(sidePanelPage, ["Beta Pricing Card", "Alpha Pricing Card"]);

    await component.selectOption("Metric Tile");
    await expectTitles(sidePanelPage, ["Delta Summary Tile"]);
    await component.selectOption("");
    await expect(sidePanelPage.getByRole("button", { name: "Open saved capture: Epsilon Untyped" })).toBeVisible();
  });

  test("G - tag filter derives from library tags only, exact matches, dedupes, and excludes untagged outside All", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);
    const tag = sidePanelPage.getByLabel("Tag");

    expect(await selectOptions(tag)).toEqual([
      "All tags",
      "Campaign",
      "Cards",
      "Dialog",
      "inspiration",
      "Metrics",
      "Reference"
    ]);
    await tag.selectOption("inspiration");
    await expectTitles(sidePanelPage, ["Beta Pricing Card", "Alpha Pricing Card"]);
    await tag.selectOption("Metrics");
    await expectTitles(sidePanelPage, ["Delta Summary Tile"]);
    await tag.selectOption("");
    await expect(sidePanelPage.getByRole("button", { name: "Open saved capture: Epsilon Untyped" })).toBeVisible();
  });

  test("H - search, component type, and tag filters combine with AND semantics", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);

    await sidePanelPage.getByLabel("Search captures").fill("pricing");
    await expectTitles(sidePanelPage, ["Beta Pricing Card", "Alpha Pricing Card"]);
    await sidePanelPage.getByLabel("Component type").selectOption("pricing card");
    await expectTitles(sidePanelPage, ["Beta Pricing Card", "Alpha Pricing Card"]);
    await sidePanelPage.getByLabel("Tag").selectOption("Campaign");
    await expectTitles(sidePanelPage, ["Beta Pricing Card"]);
    await sidePanelPage.getByLabel("Search captures").fill("alpha");
    await expectNoResults(sidePanelPage);
  });

  test("I - Clear search and filters restores ordering, summary, and persisted data", async ({ sidePanelPage }) => {
    const seeded = await seedSearchLibrary(sidePanelPage);
    const beforeWrappers = await readAllRecordWrappers(sidePanelPage);
    const beforeAssets = await readAllScreenshotAssetSnapshots(sidePanelPage);

    await sidePanelPage.getByLabel("Search captures").fill("pricing");
    await sidePanelPage.getByLabel("Component type").selectOption("pricing card");
    await sidePanelPage.getByLabel("Tag").selectOption("Campaign");
    await expect(sidePanelPage.getByText('Search: "pricing"')).toBeVisible();
    await expect(sidePanelPage.getByText("Component type: pricing card")).toBeVisible();
    await expect(sidePanelPage.getByText("Tag: Campaign")).toBeVisible();
    await expect(sidePanelPage.locator(".library-result-count")).toContainText("Showing 1 of 5 captures.");

    await sidePanelPage.getByRole("button", { name: "Clear search and filters" }).click();
    await expect(sidePanelPage.getByLabel("Search captures")).toHaveValue("");
    await expect(sidePanelPage.getByLabel("Component type")).toHaveValue("");
    await expect(sidePanelPage.getByLabel("Tag")).toHaveValue("");
    await expectTitles(sidePanelPage, seeded.map((capture) => capture.title));
    expect(await readAllRecordWrappers(sidePanelPage)).toEqual(beforeWrappers);
    expect(await readAllScreenshotAssetSnapshots(sidePanelPage)).toEqual(beforeAssets);
  });

  test("J - no-results state is distinct from genuine empty Library", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);

    await sidePanelPage.getByLabel("Search captures").fill("no-matching-safe-term");
    await expectNoResults(sidePanelPage);
    await expect(sidePanelPage.getByText("No explicitly saved captures yet.")).toHaveCount(0);
    await expect(sidePanelPage.getByRole("button", { name: "Clear search and filters" })).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Start Capture" })).toBeVisible();

    await clearTestData(sidePanelPage);
    await sidePanelPage.reload();
    await expect(sidePanelPage.getByText("No explicitly saved captures yet.")).toBeVisible();
    await expect(sidePanelPage.getByText("No captures match the current search and filters.")).toHaveCount(0);
  });

  test("K - opening detail and Back preserves search/filter state and matching result set", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);

    await sidePanelPage.getByLabel("Search captures").fill("pricing");
    await sidePanelPage.getByLabel("Tag").selectOption("Campaign");
    await expectTitles(sidePanelPage, ["Beta Pricing Card"]);
    await openCapture(sidePanelPage, "Beta Pricing Card");
    await expect(sidePanelPage.getByRole("heading", { name: "Beta Pricing Card" })).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await expect(sidePanelPage.getByLabel("Search captures")).toHaveValue("pricing");
    await expect(sidePanelPage.getByLabel("Tag")).toHaveValue("Campaign");
    await expectTitles(sidePanelPage, ["Beta Pricing Card"]);
  });

  test("L - metadata editing under active filters removes and adds matches from verified read-back models", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);

    await sidePanelPage.getByLabel("Component type").selectOption("Modal");
    await expectTitles(sidePanelPage, ["Gamma Modal"]);
    await openCapture(sidePanelPage, "Gamma Modal");
    await editMetadata(sidePanelPage, {
      title: "Gamma Is Now Toast",
      componentType: "Toast",
      tags: "Reference",
      notes: "Changed type."
    });
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await expect(sidePanelPage.getByLabel("Component type")).toHaveValue("Modal");
    await expectNoResults(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Clear search and filters" }).click();
    await expectTitles(sidePanelPage, ["Epsilon Untyped", "Delta Summary Tile", "Gamma Is Now Toast", "Beta Pricing Card", "Alpha Pricing Card"]);

    await sidePanelPage.getByLabel("Component type").selectOption("pricing card");
    await expectTitles(sidePanelPage, ["Beta Pricing Card", "Alpha Pricing Card"]);
    await sidePanelPage.getByRole("button", { name: "Open saved capture: Beta Pricing Card" }).click();
    await editMetadata(sidePanelPage, {
      title: "Newly Matching Beta",
      componentType: "Pricing Card",
      tags: "Campaign",
      notes: "The title now joins the active search."
    });
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await sidePanelPage.getByLabel("Search captures").fill("newly matching");
    await expectTitles(sidePanelPage, ["Newly Matching Beta"]);
  });

  test("M - deletion under active filters preserves controls, counts, ordering, and no-results", async ({ sidePanelPage }) => {
    const seeded = await seedSearchLibrary(sidePanelPage);

    await sidePanelPage.getByLabel("Component type").selectOption("pricing card");
    await sidePanelPage.getByLabel("Tag").selectOption("Campaign");
    await expectTitles(sidePanelPage, ["Beta Pricing Card"]);
    await deleteCapture(sidePanelPage, "Beta Pricing Card");
    await expect(sidePanelPage.getByText("Capture deleted locally.")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Component type")).toHaveValue("pricing card");
    await expect(sidePanelPage.getByLabel("Tag")).toHaveValue("Campaign");
    await expectNoResults(sidePanelPage);
    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({
      captureRecords: seeded.length - 1,
      screenshotAssets: seeded.length - 1
    });
    await sidePanelPage.getByRole("button", { name: "Clear search and filters" }).click();
    await expectTitles(sidePanelPage, ["Epsilon Untyped", "Delta Summary Tile", "Gamma Modal", "Alpha Pricing Card"]);
  });

  test("N - final persisted capture deletion hides controls and keeps success status", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage, [SEARCH_FIXTURES[0]]);

    await sidePanelPage.getByLabel("Search captures").fill("alpha");
    await deleteCapture(sidePanelPage, "Alpha Pricing Card");
    await expect(sidePanelPage.getByText("Capture deleted locally.")).toBeVisible();
    await expect(sidePanelPage.getByText("No explicitly saved captures yet.")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Search captures")).toHaveCount(0);
    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({
      captureRecords: 0,
      screenshotAssets: 0
    });
  });

  test("O - search/filter state is session-only and not written to storage or URL", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await seedSearchLibrary(page);

    await page.getByLabel("Search captures").fill("pricing");
    await page.getByLabel("Component type").selectOption("pricing card");
    await page.getByLabel("Tag").selectOption("Campaign");
    await expectTitles(page, ["Beta Pricing Card"]);
    expect(page.url()).not.toContain("pricing");
    expect(await readBrowserStorageSnapshot(page)).toEqual({
      localStorage: [],
      sessionStorage: [],
      chromeStorage: "unavailable"
    });
    await page.close();

    const reopened = await openSidePanelPage(context, extensionId);
    await expect(reopened.getByLabel("Search captures")).toHaveValue("");
    await expect(reopened.getByLabel("Component type")).toHaveValue("");
    await expect(reopened.getByLabel("Tag")).toHaveValue("");
    await expectTitles(reopened, seeded.map((capture) => capture.title));
    await reopened.close();
  });

  test("P - search/filter interactions perform no IndexedDB reread/write, network, messaging, or navigation", async ({ sidePanelPage }) => {
    const seeded = await seedSearchLibrary(sidePanelPage);
    const beforeWrappers = await readAllRecordWrappers(sidePanelPage);
    const beforeAssets = await readAllScreenshotAssetSnapshots(sidePanelPage);
    const originalUrl = sidePanelPage.url();
    await installInteractionGuards(sidePanelPage);

    await sidePanelPage.getByLabel("Search captures").fill("pricing");
    await sidePanelPage.getByLabel("Component type").selectOption("pricing card");
    await sidePanelPage.getByLabel("Tag").selectOption("Campaign");
    await sidePanelPage.getByRole("button", { name: "Clear search and filters" }).click();
    await expectTitles(sidePanelPage, seeded.map((capture) => capture.title));

    expect(await readInteractionGuardState(sidePanelPage)).toEqual({
      idbReads: 0,
      idbWrites: 0,
      fetchCalls: 0,
      xhrCalls: 0,
      websocketCalls: 0,
      eventSourceCalls: 0,
      sendMessageCalls: 0
    });
    expect(sidePanelPage.url()).toBe(originalUrl);
    await removeInteractionGuards(sidePanelPage);
    expect(await readAllRecordWrappers(sidePanelPage)).toEqual(beforeWrappers);
    expect(await readAllScreenshotAssetSnapshots(sidePanelPage)).toEqual(beforeAssets);
  });

  test("Q - object URL lifecycle revokes hidden thumbnails and remounts fresh URLs", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);
    await expect(sidePanelPage.locator("img.library-thumbnail")).toHaveCount(5);
    const initial = await getObjectUrlSnapshot(sidePanelPage);
    expect(initial.active).toHaveLength(5);

    await sidePanelPage.getByLabel("Search captures").fill("gamma");
    await expectTitles(sidePanelPage, ["Gamma Modal"]);
    const filtered = await getObjectUrlSnapshot(sidePanelPage);
    expect(filtered.active).toHaveLength(1);
    for (const url of initial.active) {
      if (!filtered.active.includes(url)) {
        expect(filtered.revoked).toContain(url);
      }
    }

    await sidePanelPage.getByRole("button", { name: "Clear search and filters" }).click();
    await expect(sidePanelPage.locator("img.library-thumbnail")).toHaveCount(5);
    const cleared = await getObjectUrlSnapshot(sidePanelPage);
    expect(cleared.active).toHaveLength(5);
    expect(cleared.active.some((url) => !initial.active.includes(url))).toBe(true);

    await sidePanelPage.getByLabel("Search captures").fill("gamma");
    await openCapture(sidePanelPage, "Gamma Modal");
    const detail = await getObjectUrlSnapshot(sidePanelPage);
    for (const url of cleared.active) {
      expect(detail.revoked).toContain(url);
    }
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await expectTitles(sidePanelPage, ["Gamma Modal"]);
    await expect(sidePanelPage.locator("img.library-thumbnail")).toHaveJSProperty("complete", true);
  });

  test("R - selected options remain active after the last matching option source mutates", async ({ sidePanelPage }) => {
    await seedSearchLibrary(sidePanelPage);

    await sidePanelPage.getByLabel("Component type").selectOption("Modal");
    await sidePanelPage.getByLabel("Tag").selectOption("Dialog");
    await openCapture(sidePanelPage, "Gamma Modal");
    await editMetadata(sidePanelPage, {
      title: "Gamma No Dialog",
      componentType: "Toast",
      tags: "Reference",
      notes: "Selected options disappeared from loaded captures."
    });
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await expect(sidePanelPage.getByLabel("Component type")).toHaveValue("Modal");
    await expect(sidePanelPage.getByLabel("Tag")).toHaveValue("Dialog");
    expect(await selectOptions(sidePanelPage.getByLabel("Component type"))).toContain("Modal");
    expect(await selectOptions(sidePanelPage.getByLabel("Tag"))).toContain("Dialog");
    await expectNoResults(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Clear search and filters" }).click();
    expect(await selectOptions(sidePanelPage.getByLabel("Component type"))).not.toContain("Modal");
    expect(await selectOptions(sidePanelPage.getByLabel("Tag"))).not.toContain("Dialog");
  });

  test("S - large deterministic multi-capture filtering preserves order without duplicate cards or database operations", async ({ sidePanelPage }) => {
    const specs = Array.from({ length: 60 }, (_, index) =>
      createSearchFixture({
        id: `capture-00000000-0000-0000-0000-${String(200 + index).padStart(12, "0")}`,
        title: `Bulk ${index % 2 === 0 ? "Even" : "Odd"} ${String(index).padStart(2, "0")}`,
        libraryComponentType: index % 3 === 0 ? "Bulk Card" : "Bulk Panel",
        summaryComponentType: "Bulk Summary",
        sourceUrl: `https://example.test/bulk/${index}`,
        pageTitle: `Bulk ${index}`,
        savedAt: `2026-07-18T12:${String(index).padStart(2, "0")}:00.000Z`,
        color: index % 2 === 0 ? "#2563eb" : "#0f766e",
        libraryTags: [index % 2 === 0 ? "even" : "odd"]
      })
    );
    await seedSearchLibrary(sidePanelPage, specs);
    await installInteractionGuards(sidePanelPage);

    await sidePanelPage.getByLabel("Search captures").fill("Even");
    await sidePanelPage.getByLabel("Component type").selectOption("Bulk Card");
    const titles = await sidePanelPage.locator(".library-item-title").allTextContents();
    expect(titles).toHaveLength(10);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).toEqual([...titles].sort((left, right) => right.localeCompare(left)));
    expect(await readInteractionGuardState(sidePanelPage)).toMatchObject({ idbReads: 0, idbWrites: 0 });
    await removeInteractionGuards(sidePanelPage);
  });

  test("T - final integrated Milestone 4 regression preserves edits, deletion, ordering, counts, and session reset", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await seedSearchLibrary(page);
    await expectTitles(page, seeded.map((capture) => capture.title));

    await page.getByLabel("Search captures").fill("pricing");
    await page.getByLabel("Component type").selectOption("pricing card");
    await expectTitles(page, ["Beta Pricing Card", "Alpha Pricing Card"]);
    await openCapture(page, "Beta Pricing Card");
    await expect(page.getByRole("heading", { name: "Beta Pricing Card" })).toBeVisible();
    await editMetadata(page, {
      title: "Beta Pricing Edited",
      componentType: "Pricing Card",
      tags: "Campaign, inspiration",
      notes: "Edited during final Milestone 4 regression."
    });
    await page.getByRole("button", { name: "Back to Library" }).click();
    await expect(page.getByLabel("Search captures")).toHaveValue("pricing");
    await expectTitles(page, ["Beta Pricing Edited", "Alpha Pricing Card"]);

    await openCapture(page, "Alpha Pricing Card");
    const alphaWrapper = await readRecordWrapper(page, SEARCH_FIXTURES[0].id);
    const alphaAsset = await readScreenshotAssetSnapshot(page, `screenshots/${SEARCH_FIXTURES[0].id}.png`);
    await page.getByRole("button", { name: "Delete capture" }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("Capture deleted locally.")).toBeVisible();
    await expectTitles(page, ["Beta Pricing Edited"]);
    expect(await readRecordWrapper(page, SEARCH_FIXTURES[0].id)).toBeUndefined();
    expect(await readScreenshotAssetSnapshot(page, `screenshots/${SEARCH_FIXTURES[0].id}.png`)).toBeUndefined();
    expect(alphaWrapper).toBeDefined();
    expect(alphaAsset).toBeDefined();
    await expect(page.locator("img.library-thumbnail")).toHaveJSProperty("complete", true);
    await page.close();

    const reopened = await openSidePanelPage(context, extensionId);
    await expect(reopened.getByLabel("Search captures")).toHaveValue("");
    await expect(reopened.getByLabel("Component type")).toHaveValue("");
    await expectTitles(reopened, ["Epsilon Untyped", "Delta Summary Tile", "Gamma Modal", "Beta Pricing Edited"]);
    expect(await readPersistenceCounts(reopened)).toEqual({
      version: ELEMENT_CATCHER_DATABASE_VERSION,
      stores: [CAPTURE_RECORD_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME].sort(),
      captureRecords: 4,
      screenshotAssets: 4
    });
    await openCapture(reopened, "Beta Pricing Edited");
    await expect(reopened.getByRole("heading", { name: "Beta Pricing Edited" })).toBeVisible();
    await reopened.close();
  });
});

function createSearchFixture(input: CaptureFixtureSpec): CaptureFixtureSpec {
  return {
    tagName: "article",
    semanticRole: "region",
    width: 80,
    height: 48,
    ...input
  };
}

async function seedSearchLibrary(page: Page, specs = SEARCH_FIXTURES) {
  const seeded = await resetAndSeedSavedCaptures(page, specs);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  return seeded;
}

async function expectTitles(page: Page, titles: string[]) {
  await expect(page.locator(".library-item-title")).toHaveCount(titles.length);
  expect(await page.locator(".library-item-title").allTextContents()).toEqual(titles);
}

async function expectNoResults(page: Page) {
  await expect(page.getByText("No captures match the current search and filters.")).toBeVisible();
  await expect(page.locator(".capture-library-list")).toHaveCount(0);
  await expect(page.locator(".library-item-title")).toHaveCount(0);
}

async function openCapture(page: Page, title: string) {
  await page.getByRole("button", { name: `Open saved capture: ${title}` }).click();
  await expect(page.getByRole("button", { name: "Back to Library" })).toBeVisible();
  await expect(page.locator("img.preview-image")).toHaveJSProperty("complete", true);
}

async function editMetadata(
  page: Page,
  input: {
    title: string;
    componentType: string;
    tags: string;
    notes: string;
  }
) {
  await page.getByRole("button", { name: "Edit metadata" }).click();
  const detail = page.locator(".saved-capture-detail");
  await detail.getByLabel("Title").fill(input.title);
  await detail.getByLabel("Component type").fill(input.componentType);
  await detail.getByLabel("Tags").fill(input.tags);
  await detail.getByLabel("Notes").fill(input.notes);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Metadata saved locally.")).toBeVisible();
  await expect(page.getByRole("heading", { name: input.title })).toBeVisible();
}

async function deleteCapture(page: Page, title: string) {
  await openCapture(page, title);
  await page.getByRole("button", { name: "Delete capture" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
}

async function selectOptions(locator: Locator) {
  return locator.evaluate((select) =>
    Array.from((select as HTMLSelectElement).options, (option) => option.textContent ?? "")
  );
}

async function readBrowserStorageSnapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        localStorage: string[];
        sessionStorage: string[];
        chromeStorage: Record<string, unknown> | "unavailable";
      }>((resolve) => {
        if (!chrome.storage?.local) {
          resolve({
            localStorage: Object.keys(localStorage).sort(),
            sessionStorage: Object.keys(sessionStorage).sort(),
            chromeStorage: "unavailable"
          });
          return;
        }

        chrome.storage.local.get(null, (chromeStorage) => {
          resolve({
            localStorage: Object.keys(localStorage).sort(),
            sessionStorage: Object.keys(sessionStorage).sort(),
            chromeStorage
          });
        });
      })
  );
}

async function installInteractionGuards(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as unknown as {
      __ecInteractionGuards?: InteractionGuardState;
      __ecOriginalGetAll?: IDBObjectStore["getAll"];
      __ecOriginalGet?: IDBObjectStore["get"];
      __ecOriginalCount?: IDBObjectStore["count"];
      __ecOriginalPut?: IDBObjectStore["put"];
      __ecOriginalAdd?: IDBObjectStore["add"];
      __ecOriginalDelete?: IDBObjectStore["delete"];
      __ecOriginalClear?: IDBObjectStore["clear"];
      __ecOriginalFetch?: typeof fetch;
      __ecOriginalXhrOpen?: XMLHttpRequest["open"];
      __ecOriginalWebSocket?: typeof WebSocket;
      __ecOriginalEventSource?: typeof EventSource;
      __ecOriginalSendMessage?: typeof chrome.runtime.sendMessage;
    };

    testWindow.__ecInteractionGuards = {
      idbReads: 0,
      idbWrites: 0,
      fetchCalls: 0,
      xhrCalls: 0,
      websocketCalls: 0,
      eventSourceCalls: 0,
      sendMessageCalls: 0
    };
    const state = testWindow.__ecInteractionGuards;

    testWindow.__ecOriginalGetAll ??= IDBObjectStore.prototype.getAll;
    testWindow.__ecOriginalGet ??= IDBObjectStore.prototype.get;
    testWindow.__ecOriginalCount ??= IDBObjectStore.prototype.count;
    testWindow.__ecOriginalPut ??= IDBObjectStore.prototype.put;
    testWindow.__ecOriginalAdd ??= IDBObjectStore.prototype.add;
    testWindow.__ecOriginalDelete ??= IDBObjectStore.prototype.delete;
    testWindow.__ecOriginalClear ??= IDBObjectStore.prototype.clear;
    testWindow.__ecOriginalFetch ??= window.fetch;
    testWindow.__ecOriginalXhrOpen ??= XMLHttpRequest.prototype.open;
    testWindow.__ecOriginalWebSocket ??= window.WebSocket;
    testWindow.__ecOriginalEventSource ??= window.EventSource;
    testWindow.__ecOriginalSendMessage ??= chrome.runtime.sendMessage;

    IDBObjectStore.prototype.getAll = function patchedGetAll(...args) {
      state.idbReads += 1;
      return testWindow.__ecOriginalGetAll!.apply(this, args);
    };
    IDBObjectStore.prototype.get = function patchedGet(...args) {
      state.idbReads += 1;
      return testWindow.__ecOriginalGet!.apply(this, args);
    };
    IDBObjectStore.prototype.count = function patchedCount(...args) {
      state.idbReads += 1;
      return testWindow.__ecOriginalCount!.apply(this, args);
    };
    IDBObjectStore.prototype.put = function patchedPut(...args) {
      state.idbWrites += 1;
      return testWindow.__ecOriginalPut!.apply(this, args);
    };
    IDBObjectStore.prototype.add = function patchedAdd(...args) {
      state.idbWrites += 1;
      return testWindow.__ecOriginalAdd!.apply(this, args);
    };
    IDBObjectStore.prototype.delete = function patchedDelete(...args) {
      state.idbWrites += 1;
      return testWindow.__ecOriginalDelete!.apply(this, args);
    };
    IDBObjectStore.prototype.clear = function patchedClear(...args) {
      state.idbWrites += 1;
      return testWindow.__ecOriginalClear!.apply(this, args);
    };
    window.fetch = ((...args) => {
      state.fetchCalls += 1;
      return testWindow.__ecOriginalFetch!(...args);
    }) as typeof fetch;
    XMLHttpRequest.prototype.open = function patchedOpen(...args) {
      state.xhrCalls += 1;
      return testWindow.__ecOriginalXhrOpen!.apply(this, args);
    };
    window.WebSocket = new Proxy(testWindow.__ecOriginalWebSocket!, {
      construct(target, args) {
        state.websocketCalls += 1;
        return Reflect.construct(target, args);
      }
    });
    window.EventSource = new Proxy(testWindow.__ecOriginalEventSource!, {
      construct(target, args) {
        state.eventSourceCalls += 1;
        return Reflect.construct(target, args);
      }
    });
    chrome.runtime.sendMessage = ((...args: unknown[]) => {
      state.sendMessageCalls += 1;
      return (testWindow.__ecOriginalSendMessage as (...input: unknown[]) => unknown)(...args);
    }) as typeof chrome.runtime.sendMessage;
  });
}

async function readInteractionGuardState(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __ecInteractionGuards?: InteractionGuardState }).__ecInteractionGuards;
    if (!state) {
      throw new Error("Interaction guards were not installed.");
    }
    return { ...state };
  });
}

async function removeInteractionGuards(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as unknown as {
      __ecInteractionGuards?: InteractionGuardState;
      __ecOriginalGetAll?: IDBObjectStore["getAll"];
      __ecOriginalGet?: IDBObjectStore["get"];
      __ecOriginalCount?: IDBObjectStore["count"];
      __ecOriginalPut?: IDBObjectStore["put"];
      __ecOriginalAdd?: IDBObjectStore["add"];
      __ecOriginalDelete?: IDBObjectStore["delete"];
      __ecOriginalClear?: IDBObjectStore["clear"];
      __ecOriginalFetch?: typeof fetch;
      __ecOriginalXhrOpen?: XMLHttpRequest["open"];
      __ecOriginalWebSocket?: typeof WebSocket;
      __ecOriginalEventSource?: typeof EventSource;
      __ecOriginalSendMessage?: typeof chrome.runtime.sendMessage;
    };

    if (testWindow.__ecOriginalGetAll) IDBObjectStore.prototype.getAll = testWindow.__ecOriginalGetAll;
    if (testWindow.__ecOriginalGet) IDBObjectStore.prototype.get = testWindow.__ecOriginalGet;
    if (testWindow.__ecOriginalCount) IDBObjectStore.prototype.count = testWindow.__ecOriginalCount;
    if (testWindow.__ecOriginalPut) IDBObjectStore.prototype.put = testWindow.__ecOriginalPut;
    if (testWindow.__ecOriginalAdd) IDBObjectStore.prototype.add = testWindow.__ecOriginalAdd;
    if (testWindow.__ecOriginalDelete) IDBObjectStore.prototype.delete = testWindow.__ecOriginalDelete;
    if (testWindow.__ecOriginalClear) IDBObjectStore.prototype.clear = testWindow.__ecOriginalClear;
    if (testWindow.__ecOriginalFetch) window.fetch = testWindow.__ecOriginalFetch;
    if (testWindow.__ecOriginalXhrOpen) XMLHttpRequest.prototype.open = testWindow.__ecOriginalXhrOpen;
    if (testWindow.__ecOriginalWebSocket) window.WebSocket = testWindow.__ecOriginalWebSocket;
    if (testWindow.__ecOriginalEventSource) window.EventSource = testWindow.__ecOriginalEventSource;
    if (testWindow.__ecOriginalSendMessage) chrome.runtime.sendMessage = testWindow.__ecOriginalSendMessage;
    testWindow.__ecInteractionGuards = undefined;
  });
}

type InteractionGuardState = {
  idbReads: number;
  idbWrites: number;
  fetchCalls: number;
  xhrCalls: number;
  websocketCalls: number;
  eventSourceCalls: number;
  sendMessageCalls: number;
};
