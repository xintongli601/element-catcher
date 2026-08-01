import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Download, Page } from "@playwright/test";
import { expect, getObjectUrlSnapshot, test } from "./extension-fixture";
import {
  deleteGeneratedVersion,
  putGeneratedVersion,
  readAllRecordWrappers,
  readAllScreenshotAssetSnapshots,
  readGeneratedStoreInfo,
  readGeneratedVersions,
  readPersistenceCounts,
  resetAndSeedSavedCaptures,
  type SeededCapture
} from "./indexed-db-fixtures";
import { createGeneratedSourceExportFilename } from "../../extension/src/export/generated-source-export";
import type {
  GeneratedComponentVersionEntry,
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";

test.describe("Milestone 7A Slice 3 generated source export real download and hardening", () => {
  test("real Chromium downloads exact UTF-8 bytes and deterministic filenames for persisted V1 and V2 sources", async ({
    sidePanelPage
  }) => {
    const { target, versions } = await seedHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    const cases = [
      { entry: versions.crlf, filename: "ExportCrlfCard.tsx" },
      { entry: versions.revisionUnicode, filename: "ExportRevisionUnicodeCard.tsx" },
      { entry: versions.regenerationTailwind, filename: "ExportRegenerationTailwindCard.tsx" },
      { entry: versions.noFinalNewline, filename: "ExportNoFinalNewlineCard.tsx" },
      { entry: versions.oneFinalNewline, filename: "ExportOneFinalNewlineCard.tsx" },
      { entry: versions.previewRejected, filename: "ExportPreviewRejectedCard.tsx" },
      { entry: versions.maxName, filename: `${"A".repeat(64)}.tsx` }
    ];

    for (const { entry, filename } of cases) {
      const download = await exportWithRealDownload(sidePanelPage, entry);
      await expectDownloadBytes(download, filename, entry.value.code);
    }

    expect(createGeneratedSourceExportFilename("组件Card")).toEqual({ ok: true, value: "组件Card.tsx" });
    expect(createGeneratedSourceExportFilename("Export/Card")).toMatchObject({ ok: false, code: "unsafe" });
    expect(createGeneratedSourceExportFilename("EmptyCodeCard")).toEqual({ ok: true, value: "EmptyCodeCard.tsx" });
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("repeated real exports keep the same suggested filename and rely on browser-owned duplicate handling", async ({ sidePanelPage }) => {
    const { target, versions } = await seedHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    const first = await exportWithRealDownload(sidePanelPage, versions.crlf);
    await expectDownloadBytes(first, "ExportCrlfCard.tsx", versions.crlf.value.code);
    const second = await exportWithRealDownload(sidePanelPage, versions.crlf);
    await expectDownloadBytes(second, "ExportCrlfCard.tsx", versions.crlf.value.code);

    const urls = await eventuallyCleanExportUrls(sidePanelPage);
    expect(urls.created.filter((event) => event.type === "text/typescript;charset=utf-8")).toHaveLength(2);
  });

  test("stale, wrong-capture, invalid, and unsafe rereads do not emit real downloads and can recover", async ({ sidePanelPage }) => {
    const { target, otherTarget, versions } = await seedHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await expandVersion(sidePanelPage, versions.crlf);
    await deleteGeneratedVersion(sidePanelPage, versions.crlf.id);
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: exportLabel(versions.crlf) }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    });

    await putGeneratedVersion(sidePanelPage, versions.crlf);
    const recovered = await exportWithRealDownload(sidePanelPage, versions.crlf);
    await expectDownloadBytes(recovered, "ExportCrlfCard.tsx", versions.crlf.value.code);

    await expandVersion(sidePanelPage, versions.revisionUnicode);
    await putGeneratedVersion(sidePanelPage, {
      ...versions.revisionUnicode,
      value: { ...versions.revisionUnicode.value, code: `${versions.revisionUnicode.value.code}\n// altered` }
    });
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: exportLabel(versions.revisionUnicode) }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    });

    await putGeneratedVersion(sidePanelPage, versions.revisionUnicode);
    await expandVersion(sidePanelPage, versions.regenerationTailwind);
    await putGeneratedVersion(sidePanelPage, { ...versions.regenerationTailwind, sourceCaptureId: otherTarget.record.id });
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: exportLabel(versions.regenerationTailwind) }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    });

    await putGeneratedVersion(sidePanelPage, versions.regenerationTailwind);
    await expandVersion(sidePanelPage, versions.noFinalNewline);
    await putGeneratedVersion(sidePanelPage, { ...versions.noFinalNewline, value: { ...versions.noFinalNewline.value, code: "" } });
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: exportLabel(versions.noFinalNewline) }).click();
      await expect(sidePanelPage.getByRole("alert")).toHaveText(
        "Could not prepare export. Refresh or reopen the generated-version list before trying again."
      );
    });

    await putGeneratedVersion(sidePanelPage, versions.noFinalNewline);
    await expandVersion(sidePanelPage, versions.oneFinalNewline);
    await putGeneratedVersion(sidePanelPage, { ...versions.oneFinalNewline, value: { ...versions.oneFinalNewline.value, componentName: "Unsafe/Card" } });
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: exportLabel(versions.oneFinalNewline) }).click();
      await expect(sidePanelPage.getByRole("alert")).toHaveText(
        "Could not prepare export. Refresh or reopen the generated-version list before trying again."
      );
    });
  });

  test("pending export attempts are retired across capture switches, library unmount, and generated-list refreshes", async ({ sidePanelPage }) => {
    const { target, otherTarget, versions } = await seedHardeningVersions(sidePanelPage);
    await installDeferredExportGate(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await expandVersion(sidePanelPage, versions.crlf);

    await sidePanelPage.getByRole("button", { name: exportLabel(versions.crlf) }).click();
    await expectExportGateCount(sidePanelPage, "beforeReread", 1);
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await releaseExportGate(sidePanelPage, "beforeReread", 0);
    await expect(sidePanelPage.getByRole("heading", { name: "Capture Library" })).toBeVisible();
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toHaveCount(0);

    await openCapture(sidePanelPage, target);
    await expandVersion(sidePanelPage, versions.revisionUnicode);
    await sidePanelPage.getByRole("button", { name: exportLabel(versions.revisionUnicode) }).click();
    await expectExportGateCount(sidePanelPage, "beforeReread", 2);
    await releaseExportGate(sidePanelPage, "beforeReread", 1);
    await expectExportGateCount(sidePanelPage, "beforeInitiate", 1);
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, otherTarget);
    await releaseExportGate(sidePanelPage, "beforeInitiate", 0);
    await expect(sidePanelPage.getByRole("heading", { name: otherTarget.title })).toBeVisible();
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, target);
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toHaveCount(0);
  });

  test("object URL ownership is bounded for rapid activation, two rows, failures, and unrelated object URLs", async ({ sidePanelPage }) => {
    const { target, versions } = await seedHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const unrelatedUrl = await sidePanelPage.evaluate(() => URL.createObjectURL(new Blob(["not export"], { type: "text/plain" })));
    await expandVersion(sidePanelPage, versions.crlf);

    const downloads: Download[] = [];
    sidePanelPage.on("download", (download) => downloads.push(download));
    const downloadPromise = sidePanelPage.waitForEvent("download");
    await sidePanelPage.getByRole("button", { name: exportLabel(versions.crlf) }).click();
    await sidePanelPage.getByRole("button", { name: exportLabel(versions.crlf) }).click({ force: true });
    await expectDownloadBytes(await downloadPromise, "ExportCrlfCard.tsx", versions.crlf.value.code);
    expect(downloads).toHaveLength(1);

    const second = await exportWithRealDownload(sidePanelPage, versions.revisionUnicode);
    await expectDownloadBytes(second, "ExportRevisionUnicodeCard.tsx", versions.revisionUnicode.value.code);

    const afterSuccess = await eventuallyCleanExportUrls(sidePanelPage);
    expect(afterSuccess.active).toContain(unrelatedUrl);
    expect(afterSuccess.revoked).not.toContain(unrelatedUrl);

    await installOneShotBrowserFailure(sidePanelPage, "click");
    await expandVersion(sidePanelPage, versions.regenerationTailwind);
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: exportLabel(versions.regenerationTailwind) }).click();
      await expect(sidePanelPage.getByRole("alert")).toHaveText(
        "Could not prepare export. Refresh or reopen the generated-version list before trying again."
      );
    });
    const afterFailure = await eventuallyCleanExportUrls(sidePanelPage);
    expect(activeExportUrls(afterFailure)).toEqual([]);
    expect(afterFailure.active).toContain(unrelatedUrl);

    const retry = await exportWithRealDownload(sidePanelPage, versions.regenerationTailwind);
    await expectDownloadBytes(retry, "ExportRegenerationTailwindCard.tsx", versions.regenerationTailwind.value.code);
    await sidePanelPage.evaluate((url) => URL.revokeObjectURL(url), unrelatedUrl);
    await eventuallyCleanExportUrls(sidePanelPage);
  });

  test("export is local, read-only, source-only, and coexists with Comparison, Preview, and Revision state", async ({ sidePanelPage }) => {
    const { target, versions } = await seedHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const activity = await installExportActivityProbe(sidePanelPage);
    const beforeCounts = await readPersistenceCounts(sidePanelPage);
    const beforeStoreInfo = await readGeneratedStoreInfo(sidePanelPage);
    const beforeWrappers = await readAllRecordWrappers(sidePanelPage);
    const beforeAssets = await readAllScreenshotAssetSnapshots(sidePanelPage);
    const beforeVersions = await readGeneratedVersions(sidePanelPage, target.record.id);

    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    await sidePanelPage.getByLabel("Baseline version").selectOption(versions.crlf.id);
    await sidePanelPage.getByLabel("Candidate version").selectOption(versions.revisionUnicode.id);
    await sidePanelPage.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();

    await expandVersion(sidePanelPage, versions.previewRejected);
    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();

    const download = await exportWithRealDownload(sidePanelPage, versions.previewRejected);
    const bytes = await expectDownloadBytes(download, "ExportPreviewRejectedCard.tsx", versions.previewRejected.value.code);
    expect(bytes.toString("utf8")).not.toContain(target.record.id);
    expect(bytes.toString("utf8")).not.toContain(versions.previewRejected.id);
    expect(bytes.toString("utf8")).not.toContain(target.record.source.url);
    expect(bytes.toString("utf8")).not.toContain(target.record.source.pageTitle);
    expect(bytes.toString("utf8")).not.toContain("SENTINEL_METADATA_SHOULD_NOT_EXPORT");
    expect(bytes.toString("utf8")).not.toContain("revision-attempt");

    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(versions.crlf.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(versions.revisionUnicode.id);
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    expect(await activity()).toEqual({ httpRequests: [], runtimeMessages: [], tabMessages: [], writes: [], clipboardWrites: 0, filePickers: 0 });
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
    expect(await readGeneratedStoreInfo(sidePanelPage)).toEqual(beforeStoreInfo);
    expect(await readAllRecordWrappers(sidePanelPage)).toEqual(beforeWrappers);
    expect(await readAllScreenshotAssetSnapshots(sidePanelPage)).toEqual(beforeAssets);
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual(beforeVersions);
  });

  for (const failure of ["createObjectURL", "createElement", "append", "click", "remove"] as const) {
    test(`handles one-shot ${failure} failure without raw errors and remains retryable`, async ({ sidePanelPage }) => {
      const { target, versions } = await seedHardeningVersions(sidePanelPage);
      await openCapture(sidePanelPage, target);
      await expandVersion(sidePanelPage, versions.crlf);
      await installOneShotBrowserFailure(sidePanelPage, failure);

      await sidePanelPage.getByRole("button", { name: exportLabel(versions.crlf) }).click();
      await expect(sidePanelPage.getByRole("alert")).toHaveText(
        "Could not prepare export. Refresh or reopen the generated-version list before trying again."
      );
      const afterFailure = await eventuallyCleanExportUrls(sidePanelPage);
      expect(activeExportUrls(afterFailure)).toEqual([]);

      const retry = await exportWithRealDownload(sidePanelPage, versions.crlf);
      await expectDownloadBytes(retry, "ExportCrlfCard.tsx", versions.crlf.value.code);
    });
  }
});

async function seedHardeningVersions(page: Page) {
  const seeded = await resetAndSeedSavedCaptures(page, [
    {
      id: "capture-00000000-0000-0000-0000-000000000011",
      title: "Export Alpha",
      tagName: "article",
      semanticRole: "card",
      sourceUrl: "https://private.example.test/export-alpha?token=SENTINEL_METADATA_SHOULD_NOT_EXPORT",
      pageTitle: "SENTINEL_METADATA_SHOULD_NOT_EXPORT",
      savedAt: "2026-07-18T12:00:00.000Z",
      width: 80,
      height: 48,
      color: "#2563eb",
      libraryTags: ["SENTINEL_METADATA_SHOULD_NOT_EXPORT"],
      libraryNotes: "SENTINEL_METADATA_SHOULD_NOT_EXPORT"
    },
    {
      id: "capture-00000000-0000-0000-0000-000000000012",
      title: "Export Beta",
      tagName: "section",
      semanticRole: "banner",
      sourceUrl: "https://private.example.test/export-beta",
      pageTitle: "Export Beta",
      savedAt: "2026-07-18T11:00:00.000Z",
      width: 96,
      height: 52,
      color: "#0f766e"
    }
  ]);
  await page.reload();
  const target = seeded[0];
  const otherTarget = seeded[1];
  const crlf = createV1(target, "00000000000000000000000000000011", "ExportCrlfCard", {
    code: "export function ExportCrlfCard() {\r\n  return <div className=\"px-4 py-2\">CRLF</div>;\r\n}"
  });
  const revisionUnicode = createV2(target, "00000000000000000000000000000012", "ExportRevisionUnicodeCard", crlf.id, "revision", {
    code: "export function ExportRevisionUnicodeCard() {\n  return <button>保存 ✓</button>;\n}"
  });
  const regenerationTailwind = createV2(target, "00000000000000000000000000000013", "ExportRegenerationTailwindCard", crlf.id, "regeneration", {
    code: "export function ExportRegenerationTailwindCard() {\n  return <section className=\"flex rounded-lg bg-blue-600 px-4 py-2 text-white\" />;\n}"
  });
  const noFinalNewline = createV1(target, "00000000000000000000000000000014", "ExportNoFinalNewlineCard", {
    code: "export function ExportNoFinalNewlineCard() {\n  return <div />;\n}"
  });
  const oneFinalNewline = createV1(target, "00000000000000000000000000000015", "ExportOneFinalNewlineCard", {
    code: "export function ExportOneFinalNewlineCard() {\n  return <div />;\n}\n"
  });
  const previewRejected = createV1(target, "00000000000000000000000000000016", "ExportPreviewRejectedCard", {
    code: "export function ExportPreviewRejectedCard() {\n  alert(\"not previewable\");\n  return <div />;\n}"
  });
  const maxName = createV1(target, "00000000000000000000000000000017", "A".repeat(64), {
    code: `export function ${"A".repeat(64)}() {\n  return <div />;\n}`
  });

  const entries = { crlf, revisionUnicode, regenerationTailwind, noFinalNewline, oneFinalNewline, previewRejected, maxName };
  for (const entry of Object.values(entries)) {
    await putGeneratedVersion(page, entry);
  }
  return { target, otherTarget, versions: entries };
}

async function openCapture(page: Page, target: SeededCapture) {
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
  await expect(page.getByRole("heading", { name: target.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Generated versions" })).toBeVisible();
}

async function expandVersion(page: Page, entry: GeneratedComponentVersionEntry) {
  const item = page.locator(".generated-version-item", {
    has: page.getByRole("button", { name: versionLabel(entry), exact: true })
  });
  if (await item.locator(".generated-version-details").isVisible()) {
    return item;
  }
  await item.getByRole("button", { name: versionLabel(entry), exact: true }).click();
  await expect(item.locator(".generated-version-details")).toBeVisible();
  return item;
}

async function exportWithRealDownload(page: Page, entry: GeneratedComponentVersionEntry) {
  await expandVersion(page, entry);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: exportLabel(entry) }).click();
  await expect(page.getByRole("status").filter({ hasText: "Browser download initiated" })).toBeVisible();
  return downloadPromise;
}

async function expectDownloadBytes(download: Download, expectedFilename: string, expectedSource: string) {
  expect(download.suggestedFilename()).toBe(expectedFilename);
  const directory = await mkdtemp(join(tmpdir(), "element-catcher-download-"));
  const filePath = join(directory, expectedFilename);
  try {
    await download.saveAs(filePath);
    const bytes = await readFile(filePath);
    expect(bytes).toEqual(Buffer.from(expectedSource, "utf8"));
    return bytes;
  } finally {
    await download.delete().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}

async function expectNoRealDownload(page: Page, action: () => Promise<void>) {
  const downloads: Download[] = [];
  const listener = (download: Download) => downloads.push(download);
  page.on("download", listener);
  try {
    await action();
    expect(downloads).toEqual([]);
  } finally {
    page.off("download", listener);
    for (const download of downloads) {
      await download.delete().catch(() => undefined);
    }
  }
}

async function eventuallyCleanExportUrls(page: Page) {
  await expect
    .poll(async () => activeExportUrls(await getObjectUrlSnapshot(page)))
    .toEqual([]);
  return getObjectUrlSnapshot(page);
}

function activeExportUrls(snapshot: Awaited<ReturnType<typeof getObjectUrlSnapshot>>) {
  return snapshot.active.filter((url) => {
    const event = snapshot.created.find((created) => created.url === url);
    return event?.type === "text/typescript;charset=utf-8";
  });
}

async function installDeferredExportGate(page: Page) {
  await page.evaluate(() => {
    type GateName = "beforeReread" | "beforeInitiate";
    const held: Record<GateName, Array<() => void>> = { beforeReread: [], beforeInitiate: [] };
    const hold = (name: GateName) =>
      new Promise<void>((resolve) => {
        held[name].push(resolve);
      });
    (window as unknown as {
      __ecGeneratedSourceExportGate?: {
        held: Record<GateName, Array<() => void>>;
      };
    }).__ecGeneratedSourceExportGate = { held };
    window.__EC_GENERATED_SOURCE_EXPORT_TEST_HARNESS__ = {
      beforeReread: () => hold("beforeReread"),
      beforeInitiate: () => hold("beforeInitiate")
    };
  });
}

async function expectExportGateCount(page: Page, name: "beforeReread" | "beforeInitiate", count: number) {
  await expect
    .poll(async () =>
      page.evaluate((gateName) => {
        return (
          (window as unknown as {
            __ecGeneratedSourceExportGate?: { held: Record<"beforeReread" | "beforeInitiate", unknown[]> };
          }).__ecGeneratedSourceExportGate?.held[gateName].length ?? 0
        );
      }, name)
    )
    .toBe(count);
}

async function releaseExportGate(page: Page, name: "beforeReread" | "beforeInitiate", index: number) {
  await page.evaluate(
    ({ name: gateName, index: gateIndex }) => {
      const gate = (window as unknown as {
        __ecGeneratedSourceExportGate?: { held: Record<"beforeReread" | "beforeInitiate", Array<() => void>> };
      }).__ecGeneratedSourceExportGate;
      const release = gate?.held[gateName][gateIndex];
      if (!release) {
        throw new Error(`Missing generated source export gate ${gateName} at ${gateIndex}.`);
      }
      release();
    },
    { name, index }
  );
}

async function installOneShotBrowserFailure(page: Page, failure: "createObjectURL" | "createElement" | "append" | "click" | "remove") {
  await page.evaluate((failureMode) => {
    let used = false;
    const shouldFail = () => {
      if (used) {
        return false;
      }
      used = true;
      return true;
    };

    if (failureMode === "createObjectURL") {
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (object: Blob | MediaSource) => {
        if (shouldFail()) {
          throw new Error("Synthetic createObjectURL failure.");
        }
        return original(object);
      };
      return;
    }

    if (failureMode === "createElement") {
      const original = document.createElement.bind(document);
      document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
        if (tagName.toLowerCase() === "a" && shouldFail()) {
          throw new Error("Synthetic anchor creation failure.");
        }
        return original(tagName, options);
      }) as typeof document.createElement;
      return;
    }

    if (failureMode === "append") {
      const original = Element.prototype.append;
      Element.prototype.append = function patchedAppend(this: Element, ...nodes: (Node | string)[]) {
        if (this === document.body && nodes.some((node) => node instanceof HTMLAnchorElement && node.download.endsWith(".tsx")) && shouldFail()) {
          throw new Error("Synthetic anchor append failure.");
        }
        return original.call(this, ...nodes);
      };
      return;
    }

    if (failureMode === "click") {
      const original = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
        if (this.download.endsWith(".tsx") && shouldFail()) {
          throw new Error("Synthetic anchor click failure.");
        }
        return original.call(this);
      };
      return;
    }

    const original = HTMLAnchorElement.prototype.remove;
    HTMLAnchorElement.prototype.remove = function patchedRemove(this: HTMLAnchorElement) {
      if (this.download.endsWith(".tsx") && shouldFail()) {
        throw new Error("Synthetic anchor remove failure.");
      }
      return original.call(this);
    };
  }, failure);
}

async function installExportActivityProbe(page: Page) {
  const httpRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:\/\//.test(request.url())) {
      httpRequests.push(request.url());
    }
  });

  await page.evaluate(() => {
    const runtimeMessages: unknown[] = [];
    const tabMessages: unknown[] = [];
    const writes: Array<{ method: string; store: string }> = [];
    const state = {
      runtimeMessages,
      tabMessages,
      writes,
      clipboardWrites: 0,
      filePickers: 0
    };
    const global = window as unknown as {
      chrome?: {
        runtime?: { sendMessage?: (...args: unknown[]) => unknown };
        tabs?: { sendMessage?: (...args: unknown[]) => unknown };
      };
      __ecExportActivity?: typeof state;
      showOpenFilePicker?: (...args: unknown[]) => unknown;
      showSaveFilePicker?: (...args: unknown[]) => unknown;
      showDirectoryPicker?: (...args: unknown[]) => unknown;
    };

    if (global.chrome?.runtime?.sendMessage) {
      const original = global.chrome.runtime.sendMessage.bind(global.chrome.runtime);
      global.chrome.runtime.sendMessage = (...args: unknown[]) => {
        runtimeMessages.push(args);
        return original(...args);
      };
    }
    if (global.chrome?.tabs?.sendMessage) {
      const original = global.chrome.tabs.sendMessage.bind(global.chrome.tabs);
      global.chrome.tabs.sendMessage = (...args: unknown[]) => {
        tabMessages.push(args);
        return original(...args);
      };
    }

    const originalAdd = IDBObjectStore.prototype.add;
    const originalPut = IDBObjectStore.prototype.put;
    const originalDelete = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.add = function patchedAdd(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      writes.push({ method: "add", store: this.name });
      return originalAdd.call(this, value, key);
    };
    IDBObjectStore.prototype.put = function patchedPut(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      writes.push({ method: "put", store: this.name });
      return originalPut.call(this, value, key);
    };
    IDBObjectStore.prototype.delete = function patchedDelete(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      writes.push({ method: "delete", store: this.name });
      return originalDelete.call(this, key);
    };

    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard?.writeText) {
      const originalWriteText = clipboard.writeText.bind(clipboard);
      clipboard.writeText = (text: string) => {
        state.clipboardWrites += 1;
        return originalWriteText(text);
      };
    }

    for (const name of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"] as const) {
      const original = global[name];
      if (original) {
        global[name] = (...args: unknown[]) => {
          state.filePickers += 1;
          return original(...args);
        };
      }
    }

    global.__ecExportActivity = state;
  });

  return async () => {
    const activity = await page.evaluate(() => {
      const state = (window as unknown as {
        __ecExportActivity?: {
          runtimeMessages: unknown[];
          tabMessages: unknown[];
          writes: Array<{ method: string; store: string }>;
          clipboardWrites: number;
          filePickers: number;
        };
      }).__ecExportActivity;
      if (!state) {
        throw new Error("Export activity probe was not installed.");
      }
      return state;
    });
    return { httpRequests, ...activity };
  };
}

function versionLabel(entry: GeneratedComponentVersionEntry) {
  return `${entry.value.componentName} - ${entry.createdAt}`;
}

function exportLabel(entry: GeneratedComponentVersionEntry) {
  return `Export .tsx for ${entry.value.componentName} - ${entry.createdAt}`;
}

function createV1(
  target: SeededCapture,
  idSuffix: string,
  componentName: string,
  options: Partial<GeneratedComponentVersionEntryV1["value"]> & { createdAt?: string } = {}
): GeneratedComponentVersionEntryV1 {
  return {
    id: `generated-version-${idSuffix}`,
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: options.createdAt ?? "2026-07-18T12:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName,
      framework: "react",
      styling: "tailwind",
      code: options.code ?? `export function ${componentName}() {\n  return <button>Export</button>;\n}`,
      summary: options.summary ?? `${componentName} summary.`,
      approximationNotes: options.approximationNotes ?? `${componentName} notes.`
    }
  };
}

function createV2(
  target: SeededCapture,
  idSuffix: string,
  componentName: string,
  sourceGeneratedVersionId: string,
  kind: "revision" | "regeneration",
  options: Partial<GeneratedComponentVersionEntryV1["value"]> & { createdAt?: string } = {}
): GeneratedComponentVersionEntryV2 {
  const base = createV1(target, idSuffix, componentName, options);
  const operation: GeneratedComponentVersionEntryV2["operation"] =
    kind === "revision"
      ? {
          kind,
          logicalAttemptId: `revision-attempt-${idSuffix}`,
          reviewAttemptFingerprint: "b".repeat(64),
          sourceGeneratedVersionId,
          sourceGeneratedVersionFingerprint: "c".repeat(64),
          instruction: "Make export focused.",
          instructionFingerprint: "d".repeat(64),
          screenshotIncluded: false
        }
      : {
          kind,
          logicalAttemptId: `revision-attempt-${idSuffix}`,
          reviewAttemptFingerprint: "b".repeat(64),
          sourceGeneratedVersionId,
          sourceGeneratedVersionFingerprint: "c".repeat(64),
          screenshotIncluded: false
        };
  return {
    ...base,
    contractVersion: 2,
    operation
  };
}
