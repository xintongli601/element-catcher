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

test.describe("Milestone 8 Slice 3 portable component bundle Side Panel workflow", () => {
  test("places Export bundle only in expanded rows and keeps adjacent controls accessible", async ({ sidePanelPage }) => {
    const { target, v1 } = await seedBundleVersions(sidePanelPage);
    await installBundleDownloadProbe(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await expect(sidePanelPage.getByRole("button", { name: bundleLabel(v1) })).toHaveCount(0);
    const item = await expandVersion(sidePanelPage, v1);
    const bundleButton = item.getByRole("button", { name: bundleLabel(v1) });
    await expect(bundleButton).toBeVisible();
    await expect(bundleButton).toHaveText("Export bundle");
    await bundleButton.focus();
    await expect(bundleButton).toBeFocused();
    await expect(item.getByRole("button", { name: exportLabel(v1) })).toBeEnabled();
    await expect(item.getByRole("button", { name: "Export to GitHub" })).toBeEnabled();
    await expect(item.getByRole("button", { name: "Preview" })).toBeEnabled();
    await expect(item.getByRole("button", { name: "Revise or regenerate" })).toBeEnabled();

    await installDeferredHarness(sidePanelPage, "beforeReread");
    await bundleButton.click();
    await expect(bundleButton).toHaveAttribute("aria-describedby", /.+/);
    const describedBy = await bundleButton.getAttribute("aria-describedby");
    await expect(sidePanelPage.locator(`#${describedBy}`)).toHaveText("Preparing bundle export...");
    await releaseDeferredHarness(sidePanelPage);
  });

  test("initiates one authoritative V1 bundle download with expected filename, type, anchor cleanup, and URL revocation", async ({
    sidePanelPage
  }) => {
    const { target, v1 } = await seedBundleVersions(sidePanelPage);
    await installBundleDownloadProbe(sidePanelPage);
    await installRereadProbe(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const item = await expandVersion(sidePanelPage, v1);
    const beforeUrls = await getObjectUrlSnapshot(sidePanelPage);

    await item.getByRole("button", { name: bundleLabel(v1) }).click();

    await expectDownload(sidePanelPage, 1, { filename: "BundleBaseCard.zip" });
    expect(await readRereadCount(sidePanelPage)).toBe(1);
    await expect(sidePanelPage.getByRole("status")).toContainText(
      "Browser download initiated for BundleBaseCard.zip. Bundle V1 is local source-only and is not a runnable or dependency-complete project."
    );
    await expect(sidePanelPage.getByText("saved successfully")).toHaveCount(0);
    await expect(sidePanelPage.locator('a[download="BundleBaseCard.zip"]')).toHaveCount(0);
    await expect.poll(async () => (await getObjectUrlSnapshot(sidePanelPage)).revokeCount).toBeGreaterThan(beforeUrls.revokeCount);
  });

  test("supports V2 Revision and V2 Regeneration bundle initiation", async ({ sidePanelPage }) => {
    const { target, revision, regeneration } = await seedBundleVersions(sidePanelPage);
    await installBundleDownloadProbe(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await exportBundle(sidePanelPage, revision, 1, "BundleRevisionCard.zip");
    await exportBundle(sidePanelPage, regeneration, 2, "BundleRegenerationCard.zip");
  });

  test("fails closed for missing, altered, and wrong-capture rereads without download initiation", async ({ sidePanelPage }) => {
    const { target, v1, revision, regeneration, otherTarget } = await seedBundleVersions(sidePanelPage);
    await installBundleDownloadProbe(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await expandVersion(sidePanelPage, v1);
    await deleteGeneratedVersion(sidePanelPage, v1.id);
    await sidePanelPage.getByRole("button", { name: bundleLabel(v1) }).click();
    await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    expect(await readBundleDownloads(sidePanelPage)).toEqual([]);

    await expandVersion(sidePanelPage, revision);
    await putGeneratedVersion(sidePanelPage, {
      ...revision,
      value: {
        ...revision.value,
        code: "export function BundleRevisionCard() {\n  return <button>Altered</button>;\n}"
      }
    });
    await sidePanelPage.getByRole("button", { name: bundleLabel(revision) }).click();
    await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    expect(await readBundleDownloads(sidePanelPage)).toEqual([]);

    await expandVersion(sidePanelPage, regeneration);
    await putGeneratedVersion(sidePanelPage, { ...regeneration, sourceCaptureId: otherTarget.record.id });
    await sidePanelPage.getByRole("button", { name: bundleLabel(regeneration) }).click();
    await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    expect(await readBundleDownloads(sidePanelPage)).toEqual([]);
  });

  test("suppresses same-row duplicates while another row remains independently operable", async ({ sidePanelPage }) => {
    const { target, v1, sibling } = await seedBundleVersions(sidePanelPage);
    await installBundleDownloadProbe(sidePanelPage);
    await installDeferredHarness(sidePanelPage, "beforeReread");
    await openCapture(sidePanelPage, target);
    const firstItem = await expandVersion(sidePanelPage, v1);
    const firstButton = firstItem.getByRole("button", { name: bundleLabel(v1) });

    await firstButton.click();
    await expect(firstButton).toBeDisabled();
    await firstButton.click({ force: true });
    await expect(sidePanelPage.getByRole("button", { name: versionLabel(sibling), exact: true })).toBeEnabled();
    await expectDeferredHarnessCount(sidePanelPage, "beforeReread", 1);

    await releaseDeferredHarness(sidePanelPage);
    await expectDownload(sidePanelPage, 1, { filename: "BundleBaseCard.zip" });
  });

  test("retires obsolete async work on collapse and capture switch without stale success", async ({ sidePanelPage }) => {
    const { target, otherTarget, v1 } = await seedBundleVersions(sidePanelPage);
    await installBundleDownloadProbe(sidePanelPage);
    await installDeferredHarness(sidePanelPage, "beforeInitiate");
    await openCapture(sidePanelPage, target);
    const item = await expandVersion(sidePanelPage, v1);

    await item.getByRole("button", { name: bundleLabel(v1) }).click();
    await expectDeferredHarnessCount(sidePanelPage, "beforeInitiate", 1);
    await item.getByRole("button", { name: versionLabel(v1), exact: true }).click();
    await releaseDeferredHarness(sidePanelPage);
    expect(await readBundleDownloads(sidePanelPage)).toEqual([]);
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toHaveCount(0);

    await expandVersion(sidePanelPage, v1);
    await sidePanelPage.getByRole("button", { name: bundleLabel(v1) }).click();
    await expectDeferredHarnessCount(sidePanelPage, "beforeInitiate", 1);
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, otherTarget);
    await releaseDeferredHarness(sidePanelPage);
    expect(await readBundleDownloads(sidePanelPage)).toEqual([]);
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toHaveCount(0);
  });

  test("cleans up failed browser initiation paths without unhandled errors", async ({ sidePanelPage }) => {
    const { target, v1, sibling } = await seedBundleVersions(sidePanelPage);
    await installBundleDownloadProbe(sidePanelPage, { failClick: true });
    await openCapture(sidePanelPage, target);
    const beforeUrls = await getObjectUrlSnapshot(sidePanelPage);
    await expandVersion(sidePanelPage, v1);

    await sidePanelPage.getByRole("button", { name: bundleLabel(v1) }).click();

    await expect(sidePanelPage.getByRole("alert")).toHaveText(
      "Could not prepare bundle export. Refresh or reopen the generated-version list before trying again."
    );
    expect(await readBundleDownloads(sidePanelPage)).toEqual([]);
    expect(await readBundleAnchors(sidePanelPage)).toEqual([]);
    await expect(sidePanelPage.locator('a[download="BundleBaseCard.zip"]')).toHaveCount(0);
    await expect.poll(async () => (await getObjectUrlSnapshot(sidePanelPage)).revokeCount).toBeGreaterThan(beforeUrls.revokeCount);

    await installBundleDownloadProbe(sidePanelPage, { failObjectUrlCreation: true });
    await expandVersion(sidePanelPage, sibling);
    await sidePanelPage.getByRole("button", { name: bundleLabel(sibling) }).click();
    await expect(sidePanelPage.getByRole("alert")).toHaveText(
      "Could not prepare bundle export. Refresh or reopen the generated-version list before trying again."
    );
  });

  test("performs no unrelated writes, requests, messages, or Preview iframe creation", async ({ sidePanelPage }) => {
    const { target, v1, revision } = await seedBundleVersions(sidePanelPage);
    await installBundleDownloadProbe(sidePanelPage);
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
    await sidePanelPage.getByRole("button", { name: bundleLabel(v1) }).click();
    await expectDownload(sidePanelPage, 1, { filename: "BundleBaseCard.zip" });

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
});

async function seedBundleVersions(page: Page) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  const target = seeded[0];
  const otherTarget = seeded[1];
  const v1 = createV1(target, "00000000000000000000000000000001", "BundleBaseCard", {
    code: "export function BundleBaseCard() {\r\n  return <div className=\"px-4 py-2\">Base</div>;\r\n}"
  });
  const revision = createV2(target, "00000000000000000000000000000002", "BundleRevisionCard", v1.id, "revision", {
    code: "export function BundleRevisionCard() {\n  return <button>保存</button>;\n}"
  });
  const regeneration = createV2(target, "00000000000000000000000000000003", "BundleRegenerationCard", v1.id, "regeneration", {
    code: "export function BundleRegenerationCard() {\n  return <section className=\"flex rounded-lg bg-blue-600\" />;\n}"
  });
  const sibling = createV1(target, "00000000000000000000000000000004", "BundleSiblingCard");
  await putGeneratedVersion(page, v1);
  await putGeneratedVersion(page, revision);
  await putGeneratedVersion(page, regeneration);
  await putGeneratedVersion(page, sibling);
  return { target, otherTarget, v1, revision, regeneration, sibling };
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
  await item.getByRole("button", { name: versionLabel(entry), exact: true }).click();
  await expect(item.locator(".generated-version-details")).toBeVisible();
  return item;
}

async function exportBundle(page: Page, entry: GeneratedComponentVersionEntry, count: number, filename: string) {
  await expandVersion(page, entry);
  await page.getByRole("button", { name: bundleLabel(entry) }).click();
  await expectDownload(page, count, { filename });
}

async function installBundleDownloadProbe(page: Page, options: { failObjectUrlCreation?: boolean; failClick?: boolean } = {}) {
  await page.evaluate(({ failObjectUrlCreation, failClick }) => {
    const downloads: Array<{ href: string; download: string; anchorConnected: boolean }> = [];
    const anchors: string[] = [];
    const blobRecords = new Map<string, { bytes?: number[]; error?: string; size: number; type: string }>();
    Object.defineProperty(window, "__ecBundleDownloads", { value: downloads, configurable: true });
    Object.defineProperty(window, "__ecBundleBlobRecords", { value: blobRecords, configurable: true });
    Object.defineProperty(window, "__ecBundleAnchors", { value: anchors, configurable: true });

    const currentCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (failObjectUrlCreation) {
        throw new Error("Synthetic object URL failure.");
      }
      const objectUrl = currentCreateObjectURL(object);
      if (object instanceof Blob && object.type === "application/zip") {
        const record = { size: object.size, type: object.type } as {
          bytes?: number[];
          error?: string;
          size: number;
          type: string;
        };
        blobRecords.set(objectUrl, record);
        void object
          .arrayBuffer()
          .then((buffer) => {
            record.bytes = Array.from(new Uint8Array(buffer));
          })
          .catch((error: unknown) => {
            record.error = error instanceof Error ? error.message : String(error);
          });
      }
      return objectUrl;
    };

    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      if (this.download.endsWith(".zip") && this.href.startsWith("blob:")) {
        if (failClick) {
          throw new Error("Synthetic anchor click failure.");
        }
        anchors.push(this.href);
        downloads.push({
          href: this.href,
          download: this.download,
          anchorConnected: this.isConnected
        });
        return;
      }
      originalAnchorClick.call(this);
    };
  }, options);
}

async function readBundleDownloads(page: Page) {
  return page.evaluate(() => {
    const state = window as unknown as {
      __ecBundleBlobRecords?: Map<string, { bytes?: number[]; error?: string; size: number; type: string }>;
      __ecBundleDownloads?: Array<{ href: string; download: string; anchorConnected: boolean }>;
    };
    return (state.__ecBundleDownloads ?? []).map((download) => ({
      ...download,
      ...state.__ecBundleBlobRecords?.get(download.href)
    }));
  });
}

async function readBundleAnchors(page: Page) {
  return page.evaluate(() => {
    return [...((window as unknown as { __ecBundleAnchors?: string[] }).__ecBundleAnchors ?? [])];
  });
}

async function expectDownload(page: Page, count: number, expected: { filename: string }) {
  await page.waitForFunction((expectedCount) => {
    const state = window as unknown as {
      __ecBundleBlobRecords?: Map<string, { bytes?: number[]; error?: string }>;
      __ecBundleDownloads?: Array<{ href: string }>;
    };
    const downloads = state.__ecBundleDownloads ?? [];
    const expectedDownload = downloads[expectedCount - 1];
    return (
      downloads.length >= expectedCount &&
      expectedDownload !== undefined &&
      state.__ecBundleBlobRecords?.get(expectedDownload.href)?.bytes !== undefined
    );
  }, count);
  const downloads = await readBundleDownloads(page);
  expect(downloads).toHaveLength(count);
  expect(downloads[count - 1]).toMatchObject({
    download: expected.filename,
    type: "application/zip"
  });
  expect(downloads[count - 1].size).toBeGreaterThan(0);
  expect(downloads[count - 1].error).toBeUndefined();
}

async function installDeferredHarness(page: Page, gateName: "beforeReread" | "beforeInitiate") {
  await page.evaluate((selectedGateName) => {
    const held: Record<"beforeReread" | "beforeInitiate", Array<() => void>> = {
      beforeReread: [],
      beforeInitiate: []
    };
    Object.defineProperty(window, "__ecPortableBundleGate", { value: held, configurable: true });
    const testWindow = window as Window & {
      __EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__?: {
        beforeReread?: () => void | Promise<void>;
        beforeInitiate?: () => void | Promise<void>;
      };
    };
    testWindow.__EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__ = {
      [selectedGateName]: () =>
        new Promise<void>((resolve) => {
          held[selectedGateName].push(resolve);
        })
    };
  }, gateName);
}

async function expectDeferredHarnessCount(page: Page, gateName: "beforeReread" | "beforeInitiate", count: number) {
  await expect
    .poll(async () =>
      page.evaluate((selectedGateName) => {
        return (
          (window as unknown as { __ecPortableBundleGate?: Record<"beforeReread" | "beforeInitiate", unknown[]> })
            .__ecPortableBundleGate?.[selectedGateName].length ?? 0
        );
      }, gateName)
    )
    .toBe(count);
}

async function releaseDeferredHarness(page: Page) {
  await page.evaluate(() => {
    const gate = (window as unknown as { __ecPortableBundleGate?: Record<"beforeReread" | "beforeInitiate", Array<() => void>> })
      .__ecPortableBundleGate;
    for (const releases of Object.values(gate ?? {})) {
      for (const release of releases.splice(0)) {
        release();
      }
    }
  });
}

async function installRereadProbe(page: Page) {
  await page.evaluate(() => {
    const state = { count: 0 };
    Object.defineProperty(window, "__ecBundleRereads", { value: state, configurable: true });
    const originalGet = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function get(this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      if (this.name === "generatedComponentVersions") {
        state.count += 1;
      }
      return originalGet.call(this, query);
    };
  });
}

async function readRereadCount(page: Page) {
  return page.evaluate(() => {
    return (window as unknown as { __ecBundleRereads?: { count: number } }).__ecBundleRereads?.count ?? 0;
  });
}

async function installMessageProbe(page: Page) {
  await page.evaluate(() => {
    const calls = { runtime: 0, tabs: 0 };
    Object.defineProperty(window, "__ecBundleMessageProbe", { value: calls, configurable: true });
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
      ...((window as unknown as { __ecBundleMessageProbe?: { runtime: number; tabs: number } }).__ecBundleMessageProbe ?? {
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

function bundleLabel(entry: GeneratedComponentVersionEntry) {
  return `Export bundle for ${entry.value.componentName} - ${entry.createdAt}`;
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
      code: options.code ?? `export function ${componentName}() {\n  return <button>Bundle</button>;\n}`,
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
          instruction: "Make bundle export focused.",
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
