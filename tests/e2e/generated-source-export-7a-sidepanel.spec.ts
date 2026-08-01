import type { Page } from "@playwright/test";
import { expect, getObjectUrlSnapshot, test } from "./extension-fixture";
import {
  deleteGeneratedVersion,
  putGeneratedVersion,
  readGeneratedVersions,
  readPersistenceCounts,
  resetAndSeedSavedCaptures,
  type SeededCapture
} from "./indexed-db-fixtures";
import type {
  GeneratedComponentVersionEntry,
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";

test.describe("Milestone 7A Slice 2 generated source export Side Panel workflow", () => {
  test("exports expanded V1, V2 Revision, and V2 Regeneration rows through one local anchor path", async ({ sidePanelPage }) => {
    const { target, v1, revision, regeneration } = await seedExportVersions(sidePanelPage);
    await installExportDownloadProbe(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await exportVersion(sidePanelPage, v1);
    await expectDownload(sidePanelPage, 1, {
      filename: "ExportBaseCard.tsx",
      source: v1.value.code
    });

    await exportVersion(sidePanelPage, revision);
    await expectDownload(sidePanelPage, 2, {
      filename: "ExportRevisionCard.tsx",
      source: revision.value.code
    });

    await exportVersion(sidePanelPage, regeneration);
    await expectDownload(sidePanelPage, 3, {
      filename: "ExportRegenerationCard.tsx",
      source: regeneration.value.code
    });

    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("rereads IndexedDB at activation and blocks missing, altered, and wrong-capture stale entries", async ({ sidePanelPage }) => {
    const { target, v1, revision, regeneration, otherTarget } = await seedExportVersions(sidePanelPage);
    await installExportDownloadProbe(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await expandVersion(sidePanelPage, v1);
    await deleteGeneratedVersion(sidePanelPage, v1.id);
    await sidePanelPage.getByRole("button", { name: exportLabel(v1) }).click();
    await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    expect(await readExportDownloads(sidePanelPage)).toEqual([]);

    await expandVersion(sidePanelPage, revision);
    await putGeneratedVersion(sidePanelPage, {
      ...revision,
      value: {
        ...revision.value,
        code: "export function ExportRevisionCard() {\n  return <button>Altered</button>;\n}"
      }
    });
    await sidePanelPage.getByRole("button", { name: exportLabel(revision) }).click();
    await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    expect(await readExportDownloads(sidePanelPage)).toEqual([]);

    await expandVersion(sidePanelPage, regeneration);
    await putGeneratedVersion(sidePanelPage, {
      ...regeneration,
      sourceCaptureId: otherTarget.record.id
    });
    await sidePanelPage.getByRole("button", { name: exportLabel(regeneration) }).click();
    await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    expect(await readExportDownloads(sidePanelPage)).toEqual([]);
  });

  test("reports bounded preparation failure without leaking errors or initiating download", async ({ sidePanelPage }) => {
    const { target, v1 } = await seedExportVersions(sidePanelPage);
    await installExportDownloadProbe(sidePanelPage, { failObjectUrlCreation: true });
    await openCapture(sidePanelPage, target);
    await expandVersion(sidePanelPage, v1);

    await sidePanelPage.getByRole("button", { name: exportLabel(v1) }).click();

    await expect(sidePanelPage.getByRole("alert")).toHaveText(
      "Could not prepare export. Refresh or reopen the generated-version list before trying again."
    );
    expect(await readExportDownloads(sidePanelPage)).toEqual([]);
  });

  test("keeps row-local active state, suppresses rapid duplicates, and pairs object URL cleanup", async ({ sidePanelPage }) => {
    const { target, v1 } = await seedExportVersions(sidePanelPage);
    await installExportDownloadProbe(sidePanelPage);
    await installDeferredBeforeInitiate(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await expandVersion(sidePanelPage, v1);
    const beforeUrls = await getObjectUrlSnapshot(sidePanelPage);

    await sidePanelPage.getByRole("button", { name: exportLabel(v1) }).click();
    await expect(sidePanelPage.getByRole("button", { name: exportLabel(v1) })).toBeDisabled();
    await expect(sidePanelPage.getByRole("button", { name: "Compare versions" })).toBeEnabled();
    await sidePanelPage.getByRole("button", { name: exportLabel(v1) }).click({ force: true });
    expect(await readExportDownloads(sidePanelPage)).toEqual([]);

    await releaseDeferredExport(sidePanelPage);
    await expectDownload(sidePanelPage, 1, {
      filename: "ExportBaseCard.tsx",
      source: v1.value.code
    });
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toBeVisible();
    await expect.poll(async () => (await getObjectUrlSnapshot(sidePanelPage)).revokeCount).toBeGreaterThan(beforeUrls.revokeCount);
    const afterUrls = await getObjectUrlSnapshot(sidePanelPage);
    expect(afterUrls.created.filter((event) => event.type === "text/typescript;charset=utf-8")).toHaveLength(1);
    expect(afterUrls.active).not.toContain(afterUrls.created.at(-1)?.url);
  });

  test("does not reset active Comparison, Preview, or Revision/Regeneration and performs no writes, messages, requests, or automatic iframes", async ({
    sidePanelPage
  }) => {
    const { target, v1, revision } = await seedExportVersions(sidePanelPage);
    await installExportDownloadProbe(sidePanelPage);
    await installMessageProbe(sidePanelPage);
    const httpRequests = trackHttpRequests(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const beforeCounts = await readPersistenceCounts(sidePanelPage);
    const beforeVersions = await readGeneratedVersions(sidePanelPage, target.record.id);

    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    await sidePanelPage.getByLabel("Baseline version").selectOption({ label: versionLabel(v1) });
    await sidePanelPage.getByLabel("Candidate version").selectOption({ label: versionLabel(revision) });
    await sidePanelPage.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();

    await expandVersion(sidePanelPage, v1);
    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();
    await sidePanelPage.getByRole("button", { name: exportLabel(v1) }).click();
    await expectDownload(sidePanelPage, 1, {
      filename: "ExportBaseCard.tsx",
      source: v1.value.code
    });

    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(v1.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(revision.id);
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual(beforeVersions);
    expect(httpRequests()).toEqual([]);
    expect(await readMessageProbe(sidePanelPage)).toEqual({ runtime: 0, tabs: 0 });
  });

  test("clears export state on Detail leave and retires stale completion after capture switch", async ({ sidePanelPage }) => {
    const { target, otherTarget, v1 } = await seedExportVersions(sidePanelPage);
    await installExportDownloadProbe(sidePanelPage);
    await installDeferredBeforeInitiate(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await expandVersion(sidePanelPage, v1);

    await sidePanelPage.getByRole("button", { name: exportLabel(v1) }).click();
    await expect(sidePanelPage.getByRole("button", { name: exportLabel(v1) })).toBeDisabled();
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, otherTarget);
    await releaseDeferredExport(sidePanelPage);

    expect(await readExportDownloads(sidePanelPage)).toEqual([]);
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });
});

async function seedExportVersions(page: Page) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  const target = seeded[0];
  const otherTarget = seeded[1];
  const v1 = createV1(target, "00000000000000000000000000000001", "ExportBaseCard", {
    code: "export function ExportBaseCard() {\r\n  return <div className=\"px-4 py-2\">Base</div>;\r\n}"
  });
  const revision = createV2(target, "00000000000000000000000000000002", "ExportRevisionCard", v1.id, "revision", {
    code: "export function ExportRevisionCard() {\n  return <button>保存</button>;\n}"
  });
  const regeneration = createV2(target, "00000000000000000000000000000003", "ExportRegenerationCard", v1.id, "regeneration", {
    code: "export function ExportRegenerationCard() {\n  return <section className=\"flex rounded-lg bg-blue-600\" />;\n}"
  });
  await putGeneratedVersion(page, v1);
  await putGeneratedVersion(page, revision);
  await putGeneratedVersion(page, regeneration);
  return { target, otherTarget, v1, revision, regeneration };
}

async function openCapture(page: Page, target: SeededCapture) {
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
  await expect(page.getByRole("heading", { name: target.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Generated versions" })).toBeVisible();
}

async function expandVersion(page: Page, entry: GeneratedComponentVersionEntry) {
  const item = page.locator(".generated-version-item", {
    has: page.getByRole("button", { name: versionLabel(entry) })
  });
  await item.getByRole("button", { name: versionLabel(entry) }).click();
  await expect(item.locator(".generated-version-details")).toBeVisible();
  return item;
}

async function exportVersion(page: Page, entry: GeneratedComponentVersionEntry) {
  await expandVersion(page, entry);
  await page.getByRole("button", { name: exportLabel(entry) }).click();
  await expect(page.getByRole("status").filter({ hasText: "Browser download initiated" })).toBeVisible();
}

async function installExportDownloadProbe(page: Page, options: { failObjectUrlCreation?: boolean } = {}) {
  await page.evaluate(({ failObjectUrlCreation }) => {
    const downloads: Array<{ href: string; download: string; body?: string; error?: string }> = [];
    const blobRecords = new Map<string, { body?: string; error?: string; size: number; type: string }>();
    Object.defineProperty(window, "__ecExportDownloads", { value: downloads, configurable: true });
    Object.defineProperty(window, "__ecExportBlobRecords", { value: blobRecords, configurable: true });

    const currentCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (failObjectUrlCreation) {
        throw new Error("Synthetic object URL failure.");
      }
      const objectUrl = currentCreateObjectURL(object);
      if (object instanceof Blob && object.type === "text/typescript;charset=utf-8") {
        const record = { size: object.size, type: object.type } as {
          body?: string;
          error?: string;
          size: number;
          type: string;
        };
        blobRecords.set(objectUrl, record);
        void object
          .text()
          .then((body) => {
            record.body = body;
          })
          .catch((error: unknown) => {
            record.error = error instanceof Error ? error.message : String(error);
          });
      }
      return objectUrl;
    };

    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      if (this.download.endsWith(".tsx") && this.href.startsWith("blob:")) {
        downloads.push({
          href: this.href,
          download: this.download
        });
        return;
      }
      originalAnchorClick.call(this);
    };
  }, options);
}

async function readExportDownloads(page: Page) {
  return page.evaluate(() => {
    const state = window as unknown as {
      __ecExportBlobRecords?: Map<string, { body?: string; error?: string; size: number; type: string }>;
      __ecExportDownloads?: Array<{ href: string; download: string }>;
    };
    return (state.__ecExportDownloads ?? []).map((download) => ({
      ...download,
      ...state.__ecExportBlobRecords?.get(download.href)
    }));
  });
}

async function expectDownload(page: Page, count: number, expected: { filename: string; source: string }) {
  await page.waitForFunction((expectedCount) => {
    const state = window as unknown as {
      __ecExportBlobRecords?: Map<string, { body?: string; error?: string }>;
      __ecExportDownloads?: Array<{ href: string }>;
    };
    const downloads = state.__ecExportDownloads ?? [];
    const expectedDownload = downloads[expectedCount - 1];
    return (
      downloads.length >= expectedCount &&
      expectedDownload !== undefined &&
      state.__ecExportBlobRecords?.get(expectedDownload.href)?.body !== undefined
    );
  }, count);
  const downloads = await readExportDownloads(page);
  expect(downloads).toHaveLength(count);
  expect(downloads[count - 1]).toMatchObject({
    download: expected.filename,
    body: expected.source
  });
  expect(downloads[count - 1].error).toBeUndefined();
}

async function installDeferredBeforeInitiate(page: Page) {
  await page.evaluate(() => {
    let releaseCurrent: (() => void) | null = null;
    (window as unknown as { __ecReleaseGeneratedSourceExport?: () => void }).__ecReleaseGeneratedSourceExport = () => {
      releaseCurrent?.();
      releaseCurrent = null;
    };
    window.__EC_GENERATED_SOURCE_EXPORT_TEST_HARNESS__ = {
      beforeInitiate: () =>
        new Promise<void>((resolve) => {
          releaseCurrent = resolve;
        })
    };
  });
}

async function releaseDeferredExport(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __ecReleaseGeneratedSourceExport?: () => void }).__ecReleaseGeneratedSourceExport?.();
  });
}

async function installMessageProbe(page: Page) {
  await page.evaluate(() => {
    const calls = { runtime: 0, tabs: 0 };
    Object.defineProperty(window, "__ecMessageProbe", { value: calls, configurable: true });
    chrome.runtime.sendMessage = (() => {
      calls.runtime += 1;
      return Promise.resolve(undefined);
    }) as typeof chrome.runtime.sendMessage;
    if (chrome.tabs?.sendMessage) {
      chrome.tabs.sendMessage = (() => {
        calls.tabs += 1;
        return Promise.resolve(undefined);
      }) as typeof chrome.tabs.sendMessage;
    }
  });
}

async function readMessageProbe(page: Page) {
  return page.evaluate(() => {
    return {
      ...((window as unknown as { __ecMessageProbe?: { runtime: number; tabs: number } }).__ecMessageProbe ?? {
        runtime: 0,
        tabs: 0
      })
    };
  });
}

function trackHttpRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:\/\//.test(request.url())) {
      requests.push(request.url());
    }
  });
  return () => requests;
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
  const operation =
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
