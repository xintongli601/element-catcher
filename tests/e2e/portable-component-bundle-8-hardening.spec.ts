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
  readGeneratedVersions,
  readPersistenceCounts,
  resetAndSeedSavedCaptures,
  type SeededCapture
} from "./indexed-db-fixtures";
import {
  createPortableComponentBundle,
  PORTABLE_COMPONENT_BUNDLE_README
} from "../../extension/src/export/portable-component-bundle";
import type {
  GeneratedComponentVersionEntry,
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

test.describe("Milestone 8 Slice 4 portable bundle export lifecycle hardening", () => {
  test("real Chromium downloads exact Bundle V1 ZIP artifacts for V1, V2 Revision, and V2 Regeneration", async ({ sidePanelPage }) => {
    const { target, versions } = await seedBundleHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    for (const entry of [versions.crlf, versions.revisionUnicode, versions.regenerationTailwind]) {
      const download = await exportBundleWithRealDownload(sidePanelPage, entry);
      const bytes = await expectBundleDownloadBytes(download, entry);
      inspectDownloadedBundle(bytes, entry);
      await expect(sidePanelPage.getByText("saved successfully")).toHaveCount(0);
    }
  });

  test("repeated real exports are byte-stable while duplicate naming remains browser-owned", async ({ sidePanelPage }) => {
    const { target, versions } = await seedBundleHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    const first = await exportBundleWithRealDownload(sidePanelPage, versions.crlf);
    const firstBytes = await expectBundleDownloadBytes(first, versions.crlf);
    const second = await exportBundleWithRealDownload(sidePanelPage, versions.crlf);
    const secondBytes = await expectBundleDownloadBytes(second, versions.crlf);

    expect(first.suggestedFilename()).toBe("BundleCrlfCard.zip");
    expect(second.suggestedFilename()).toBe("BundleCrlfCard.zip");
    expect(Array.from(secondBytes)).toEqual(Array.from(firstBytes));
    const urls = await eventuallyCleanBundleUrls(sidePanelPage);
    expect(urls.created.filter((event) => event.type === "application/zip")).toHaveLength(2);
  });

  test("real stale rereads fail closed for missing, altered, and wrong-capture entries and remain retryable", async ({ sidePanelPage }) => {
    const { target, otherTarget, versions } = await seedBundleHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await expandVersion(sidePanelPage, versions.crlf);
    await deleteGeneratedVersion(sidePanelPage, versions.crlf.id);
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    });

    await putGeneratedVersion(sidePanelPage, versions.crlf);
    await expectBundleDownloadBytes(await exportBundleWithRealDownload(sidePanelPage, versions.crlf), versions.crlf);

    await expandVersion(sidePanelPage, versions.revisionUnicode);
    await putGeneratedVersion(sidePanelPage, {
      ...versions.revisionUnicode,
      value: { ...versions.revisionUnicode.value, code: `${versions.revisionUnicode.value.code}\n// altered` }
    });
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: bundleLabel(versions.revisionUnicode) }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    });

    await putGeneratedVersion(sidePanelPage, versions.revisionUnicode);
    await expandVersion(sidePanelPage, versions.regenerationTailwind);
    await putGeneratedVersion(sidePanelPage, { ...versions.regenerationTailwind, sourceCaptureId: otherTarget.record.id });
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: bundleLabel(versions.regenerationTailwind) }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    });

    await putGeneratedVersion(sidePanelPage, versions.regenerationTailwind);
    await expectBundleDownloadBytes(await exportBundleWithRealDownload(sidePanelPage, versions.regenerationTailwind), versions.regenerationTailwind);
  });

  for (const failure of ["structuredClone", "Blob", "createObjectURL", "createElement", "append", "click", "remove"] as const) {
    test(`one-shot ${failure} failure is safe and retryable`, async ({ sidePanelPage }) => {
      const { target, versions } = await seedBundleHardeningVersions(sidePanelPage);
      await openCapture(sidePanelPage, target);
      await expandVersion(sidePanelPage, versions.crlf);
      await installOneShotBrowserFailure(sidePanelPage, failure);

      await expectNoRealDownload(sidePanelPage, async () => {
        await sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) }).click();
        await expect(sidePanelPage.getByRole("alert")).toHaveText(
          "Could not prepare bundle export. Refresh or reopen the generated-version list before trying again."
        );
      });
      await expect(sidePanelPage.locator('a[download$=".zip"]')).toHaveCount(0);
      await expect(sidePanelPage.locator('a[href^="blob:"]')).toHaveCount(0);
      expect(activeBundleUrls(await getObjectUrlSnapshot(sidePanelPage))).toEqual([]);

      await expectBundleDownloadBytes(await exportBundleWithRealDownload(sidePanelPage, versions.crlf), versions.crlf);
    });
  }

  test("object URL ownership, duplicate suppression, and another-row export remain bounded", async ({ sidePanelPage }) => {
    const { target, versions } = await seedBundleHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const unrelatedUrl = await sidePanelPage.evaluate(() => URL.createObjectURL(new Blob(["not bundle"], { type: "text/plain" })));
    await installDeferredBundleGate(sidePanelPage);
    await expandVersion(sidePanelPage, versions.crlf);

    const downloads: Download[] = [];
    sidePanelPage.on("download", (download) => downloads.push(download));
    await sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) }).click();
    await sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) }).click({ force: true });
    await expectBundleGateCount(sidePanelPage, "beforeReread", 1);
    await releaseBundleGate(sidePanelPage, "beforeReread", 0);
    await expectBundleGateCount(sidePanelPage, "beforeInitiate", 1);
    const firstDownload = sidePanelPage.waitForEvent("download");
    await releaseBundleGate(sidePanelPage, "beforeInitiate", 0);
    await expectBundleDownloadBytes(await firstDownload, versions.crlf);
    expect(downloads).toHaveLength(1);
    await clearDeferredBundleGate(sidePanelPage);

    const second = await exportBundleWithRealDownload(sidePanelPage, versions.sibling);
    await expectBundleDownloadBytes(second, versions.sibling);
    const snapshot = await eventuallyCleanBundleUrls(sidePanelPage);
    expect(snapshot.active).toContain(unrelatedUrl);
    expect(snapshot.revoked).not.toContain(unrelatedUrl);
    await sidePanelPage.evaluate((url) => URL.revokeObjectURL(url), unrelatedUrl);
  });

  test("keyboard accessibility and status semantics stay safe", async ({ sidePanelPage }) => {
    const { target, versions } = await seedBundleHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await expect(sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) })).toHaveCount(0);
    await sidePanelPage.getByRole("button", { name: versionLabel(versions.crlf), exact: true }).focus();
    await sidePanelPage.keyboard.press("Enter");
    const button = sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) });
    await button.focus();
    await expect(button).toBeFocused();
    expect(await button.getAttribute("aria-label")).not.toContain(versions.crlf.id);
    expect(await button.getAttribute("aria-label")).not.toContain(target.record.id);

    await installDeferredBundleGate(sidePanelPage);
    await sidePanelPage.keyboard.press("Enter");
    await expect(button).toBeDisabled();
    const describedBy = await button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(sidePanelPage.locator(`#${describedBy}`)).toHaveText("Preparing bundle export...");
    const preparingStatus = sidePanelPage.getByRole("status").filter({ hasText: "Preparing bundle export..." });
    await expect(preparingStatus).toBeVisible();
    await expect(sidePanelPage.getByRole("alert")).toHaveCount(0);
    expect(await activeElementRole(sidePanelPage)).not.toBe("status");
    expect(await activeElementRole(sidePanelPage)).not.toBe("alert");
    expect(await activeElementIsActionableButton(sidePanelPage)).toBe(false);
    await releaseBundleGate(sidePanelPage, "beforeReread", 0);
    const downloadPromise = sidePanelPage.waitForEvent("download");
    await releaseBundleGate(sidePanelPage, "beforeInitiate", 0);
    await expectBundleDownloadBytes(await downloadPromise, versions.crlf);
    await expect(button).toBeEnabled();
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toBeVisible();
    await clearDeferredBundleGate(sidePanelPage);

    await deleteGeneratedVersion(sidePanelPage, versions.crlf.id);
    await expectNoRealDownload(sidePanelPage, async () => {
      await sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("Generated version changed.");
    });
    const staleDescribedBy = await button.getAttribute("aria-describedby");
    expect(staleDescribedBy).toBeTruthy();
    await expect(sidePanelPage.locator(`#${staleDescribedBy}`)).toHaveAttribute("role", "alert");
    await expect(sidePanelPage.locator(`#${staleDescribedBy}`)).toContainText("Generated version changed.");

    await putGeneratedVersion(sidePanelPage, versions.crlf);
    await installOneShotBrowserFailure(sidePanelPage, "Blob");
    await expectNoRealDownload(sidePanelPage, async () => {
      await button.click();
      await expect(sidePanelPage.getByRole("alert")).toHaveCount(1);
      await expect(sidePanelPage.getByRole("alert")).toContainText("Could not prepare bundle export.");
    });
    await expect(sidePanelPage.getByRole("alert")).not.toContainText("Generated version changed.");
    await expect(sidePanelPage.getByRole("alert")).not.toContainText("Error:");
    await expect(sidePanelPage.getByRole("alert")).not.toContainText("Synthetic");
    const failedDescribedBy = await button.getAttribute("aria-describedby");
    expect(failedDescribedBy).toBeTruthy();
    await expect(sidePanelPage.locator(`#${failedDescribedBy}`)).toHaveAttribute("role", "alert");
    await expect(sidePanelPage.locator(`#${failedDescribedBy}`)).toContainText("Could not prepare bundle export.");
    await expect(button).toBeEnabled();
    await expect(sidePanelPage.locator('a[download$=".zip"]')).toHaveCount(0);
    await expect(sidePanelPage.locator('a[href^="blob:"]')).toHaveCount(0);
    expect(activeBundleUrls(await getObjectUrlSnapshot(sidePanelPage))).toEqual([]);
  });

  test("bundle export is read-only, local-only, source-only, and coexists with comparison and revision state", async ({ sidePanelPage }) => {
    const { target, versions } = await seedBundleHardeningVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const activity = await installBundleActivityProbe(sidePanelPage);
    const beforeCounts = await readPersistenceCounts(sidePanelPage);
    const beforeWrappers = await readAllRecordWrappers(sidePanelPage);
    const beforeAssets = await readAllScreenshotAssetSnapshots(sidePanelPage);
    const beforeVersions = await readGeneratedVersions(sidePanelPage, target.record.id);

    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    await sidePanelPage.getByLabel("Baseline version").selectOption(versions.crlf.id);
    await sidePanelPage.getByLabel("Candidate version").selectOption(versions.revisionUnicode.id);
    await sidePanelPage.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();

    await expandVersion(sidePanelPage, versions.crlf);
    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();

    const bytes = await expectBundleDownloadBytes(await exportBundleWithRealDownload(sidePanelPage, versions.crlf), versions.crlf);
    const text = decoder.decode(bytes);
    expect(text).not.toContain(target.record.id);
    expect(text).not.toContain(versions.crlf.id);
    expect(text).not.toContain(target.record.source.url);
    expect(text).not.toContain("SENTINEL_METADATA_SHOULD_NOT_EXPORT");

    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(versions.crlf.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(versions.revisionUnicode.id);
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    expect(await activity()).toEqual({ httpRequests: [], runtimeMessages: [], tabMessages: [], writes: [], clipboardWrites: 0, filePickers: 0 });
    expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
    expect(await readAllRecordWrappers(sidePanelPage)).toEqual(beforeWrappers);
    expect(await readAllScreenshotAssetSnapshots(sidePanelPage)).toEqual(beforeAssets);
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual(beforeVersions);
  });

  test("ephemeral state retires across row collapse, Detail leave, capture switch, and remount", async ({ sidePanelPage }) => {
    const { target, otherTarget, versions } = await seedBundleHardeningVersions(sidePanelPage);
    await installDeferredBundleGate(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await expandVersion(sidePanelPage, versions.crlf);

    await sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) }).click();
    await expectBundleGateCount(sidePanelPage, "beforeReread", 1);
    await sidePanelPage.getByRole("button", { name: versionLabel(versions.crlf), exact: true }).click();
    await expectNoRealDownload(sidePanelPage, async () => releaseBundleGate(sidePanelPage, "beforeReread", 0));
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toHaveCount(0);

    await expandVersion(sidePanelPage, versions.revisionUnicode);
    await sidePanelPage.getByRole("button", { name: bundleLabel(versions.revisionUnicode) }).click();
    await expectBundleGateCount(sidePanelPage, "beforeReread", 2);
    await releaseBundleGate(sidePanelPage, "beforeReread", 1);
    await expectBundleGateCount(sidePanelPage, "beforeInitiate", 1);
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, otherTarget);
    await expectNoRealDownload(sidePanelPage, async () => releaseBundleGate(sidePanelPage, "beforeInitiate", 0));
    await expect(sidePanelPage.getByRole("status").filter({ hasText: "Browser download initiated" })).toHaveCount(0);
    expect(activeBundleUrls(await getObjectUrlSnapshot(sidePanelPage))).toEqual([]);

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, target);
    await expandVersion(sidePanelPage, versions.crlf);
    await expect(sidePanelPage.getByRole("button", { name: bundleLabel(versions.crlf) })).not.toHaveAttribute("aria-describedby", /.+/);
  });
});

async function seedBundleHardeningVersions(page: Page) {
  const seeded = await resetAndSeedSavedCaptures(page, [
    {
      id: "capture-00000000-0000-0000-0000-000000000021",
      title: "Bundle Alpha",
      tagName: "article",
      semanticRole: "card",
      sourceUrl: "https://private.example.test/bundle-alpha?token=SENTINEL_METADATA_SHOULD_NOT_EXPORT",
      pageTitle: "SENTINEL_METADATA_SHOULD_NOT_EXPORT",
      savedAt: "2026-07-18T12:00:00.000Z",
      width: 80,
      height: 48,
      color: "#2563eb",
      libraryTags: ["SENTINEL_METADATA_SHOULD_NOT_EXPORT"],
      libraryNotes: "SENTINEL_METADATA_SHOULD_NOT_EXPORT"
    },
    {
      id: "capture-00000000-0000-0000-0000-000000000022",
      title: "Bundle Beta",
      tagName: "section",
      semanticRole: "banner",
      sourceUrl: "https://private.example.test/bundle-beta",
      pageTitle: "Bundle Beta",
      savedAt: "2026-07-18T11:00:00.000Z",
      width: 96,
      height: 52,
      color: "#0f766e"
    }
  ]);
  await page.reload();
  const target = seeded[0];
  const otherTarget = seeded[1];
  const crlf = createV1(target, "00000000000000000000000000000021", "BundleCrlfCard", {
    code: "export function BundleCrlfCard() {\r\n  return <div className=\"px-4 py-2\">CRLF</div>;\r\n}"
  });
  const revisionUnicode = createV2(target, "00000000000000000000000000000022", "BundleRevisionUnicodeCard", crlf.id, "revision", {
    code: "export function BundleRevisionUnicodeCard() {\n  return <button>保存 ✓</button>;\n}"
  });
  const regenerationTailwind = createV2(target, "00000000000000000000000000000023", "BundleRegenerationTailwindCard", crlf.id, "regeneration", {
    code: "export function BundleRegenerationTailwindCard() {\n  return <section className=\"flex rounded-lg bg-blue-600 px-4 py-2 text-white\" />;\n}"
  });
  const sibling = createV1(target, "00000000000000000000000000000024", "BundleSiblingCard");
  const versions = { crlf, revisionUnicode, regenerationTailwind, sibling };
  for (const entry of Object.values(versions)) {
    await putGeneratedVersion(page, entry);
  }
  return { target, otherTarget, versions };
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

async function exportBundleWithRealDownload(page: Page, entry: GeneratedComponentVersionEntry) {
  await expandVersion(page, entry);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: bundleLabel(entry) }).click();
  await expect(page.getByRole("status").filter({ hasText: "Browser download initiated" })).toBeVisible();
  return downloadPromise;
}

async function expectBundleDownloadBytes(download: Download, entry: GeneratedComponentVersionEntry) {
  const prepared = createPortableComponentBundle(entry);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) {
    throw new Error("Expected portable bundle preparation to succeed.");
  }
  expect(download.suggestedFilename()).toBe(prepared.value.filename);
  const directory = await mkdtemp(join(tmpdir(), "element-catcher-bundle-download-"));
  const filePath = join(directory, prepared.value.filename);
  try {
    await download.saveAs(filePath);
    const bytes = new Uint8Array(await readFile(filePath));
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(Array.from(bytes)).toEqual(Array.from(prepared.value.bytes));
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

function inspectDownloadedBundle(bytes: Uint8Array, entry: GeneratedComponentVersionEntry) {
  const inspected = inspectZip(bytes);
  const sourcePath = `src/${entry.value.componentName}.tsx`;
  expect(inspected.entries.map((zipEntry) => zipEntry.name)).toEqual(["README.md", "element-catcher.json", sourcePath]);
  expect(inspected.centralDirectoryEntries.map((zipEntry) => zipEntry.name)).toEqual(["README.md", "element-catcher.json", sourcePath]);
  expect(inspected.entries.filter((zipEntry) => zipEntry.name.endsWith("/"))).toEqual([]);
  expect(inspected.bytesAfterEocd).toBe(0);
  expect(inspected.eocd.commentLength).toBe(0);
  expect(inspected.eocd.totalEntries).toBe(3);
  expect(inspected.eocd.entriesOnDisk).toBe(3);
  expect(inspected.eocd.endOffset).toBe(bytes.byteLength);
  expect(inspected.text("README.md")).toBe(PORTABLE_COMPONENT_BUNDLE_README);
  expect(inspected.text("element-catcher.json")).toBe(`{
  "formatVersion": 1,
  "framework": "react",
  "styling": "tailwind",
  "componentName": ${JSON.stringify(entry.value.componentName)},
  "entryPath": ${JSON.stringify(sourcePath)}
}
`);
  expect(inspected.bytes(sourcePath)).toEqual(encoder.encode(entry.value.code));
  for (const local of inspected.entries) {
    expect(local.method).toBe(0);
    expect(local.flags).toBe(0x0800);
    expect(local.versionNeeded).toBe(20);
    expect(local.dosDate).toBe(0x0021);
    expect(local.dosTime).toBe(0x0000);
    expect(local.extraLength).toBe(0);
    expect(local.hasDataDescriptor).toBe(false);
  }
  for (const central of inspected.centralDirectoryEntries) {
    expect(central.versionMadeBy).toBe(0x0314);
    expect(central.versionNeeded).toBe(20);
    expect(central.flags).toBe(0x0800);
    expect(central.method).toBe(0);
    expect(central.dosDate).toBe(0x0021);
    expect(central.dosTime).toBe(0x0000);
    expect(central.externalAttributes).toBe(0x81A40000);
    expect(central.extraLength).toBe(0);
    expect(central.commentLength).toBe(0);
  }
  expect(inspected.hasZip64Record).toBe(false);
  expect(inspected.hasDataDescriptorSignature).toBe(false);
}

type InspectedLocalEntry = {
  name: string;
  offset: number;
  versionNeeded: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  compressedSize: number;
  extraLength: number;
  data: Uint8Array;
  hasDataDescriptor: boolean;
};

type InspectedCentralEntry = {
  name: string;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  extraLength: number;
  commentLength: number;
  externalAttributes: number;
};

function inspectZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: InspectedLocalEntry[] = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const entryOffset = offset;
    const versionNeeded = view.getUint16(offset + 4, true);
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const dosTime = view.getUint16(offset + 10, true);
    const dosDate = view.getUint16(offset + 12, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    entries.push({
      name: decoder.decode(bytes.slice(nameStart, nameStart + nameLength)),
      offset: entryOffset,
      versionNeeded,
      flags,
      method,
      dosTime,
      dosDate,
      compressedSize,
      extraLength,
      data: bytes.slice(dataStart, dataEnd),
      hasDataDescriptor: (flags & 0x0008) !== 0
    });
    offset = dataEnd;
  }

  const centralDirectoryOffset = offset;
  const centralDirectoryEntries: InspectedCentralEntry[] = [];
  while (view.getUint32(offset, true) === 0x02014b50) {
    const versionMadeBy = view.getUint16(offset + 4, true);
    const versionNeeded = view.getUint16(offset + 6, true);
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const dosTime = view.getUint16(offset + 12, true);
    const dosDate = view.getUint16(offset + 14, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const nameStart = offset + 46;
    centralDirectoryEntries.push({
      name: decoder.decode(bytes.slice(nameStart, nameStart + nameLength)),
      versionMadeBy,
      versionNeeded,
      flags,
      method,
      dosTime,
      dosDate,
      extraLength,
      commentLength,
      externalAttributes
    });
    offset = nameStart + nameLength + extraLength + commentLength;
  }

  expect(view.getUint32(offset, true)).toBe(0x06054b50);
  const eocd = {
    entriesOnDisk: view.getUint16(offset + 8, true),
    totalEntries: view.getUint16(offset + 10, true),
    centralDirectorySize: view.getUint32(offset + 12, true),
    centralDirectoryOffset: view.getUint32(offset + 16, true),
    commentLength: view.getUint16(offset + 20, true),
    endOffset: offset + 22 + view.getUint16(offset + 20, true)
  };
  expect(eocd.centralDirectoryOffset).toBe(centralDirectoryOffset);
  expect(eocd.centralDirectorySize).toBe(offset - centralDirectoryOffset);

  return {
    entries,
    centralDirectoryEntries,
    eocd,
    bytesAfterEocd: bytes.byteLength - eocd.endOffset,
    hasZip64Record: findSignature(bytes, 0x06064b50) || findSignature(bytes, 0x07064b50),
    hasDataDescriptorSignature: findSignature(bytes, 0x08074b50),
    bytes(name: string) {
      const entry = entries.find((candidate) => candidate.name === name);
      expect(entry, name).toBeTruthy();
      return entry?.data ?? new Uint8Array();
    },
    text(name: string) {
      return decoder.decode(this.bytes(name));
    }
  };
}

function findSignature(bytes: Uint8Array, signature: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index <= bytes.byteLength - 4; index += 1) {
    if (view.getUint32(index, true) === signature) {
      return true;
    }
  }
  return false;
}

async function eventuallyCleanBundleUrls(page: Page) {
  await expect.poll(async () => activeBundleUrls(await getObjectUrlSnapshot(page))).toEqual([]);
  return getObjectUrlSnapshot(page);
}

function activeBundleUrls(snapshot: Awaited<ReturnType<typeof getObjectUrlSnapshot>>) {
  return snapshot.active.filter((url) => {
    const event = snapshot.created.find((created) => created.url === url);
    return event?.type === "application/zip";
  });
}

async function installDeferredBundleGate(page: Page) {
  await page.evaluate(() => {
    type GateName = "beforeReread" | "beforeInitiate";
    const held: Record<GateName, Array<() => void>> = { beforeReread: [], beforeInitiate: [] };
    const hold = (name: GateName) =>
      new Promise<void>((resolve) => {
        held[name].push(resolve);
      });
    const testWindow = window as Window & {
      __ecPortableBundleGate?: { held: Record<GateName, Array<() => void>> };
      __EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__?: {
        beforeReread?: () => void | Promise<void>;
        beforeInitiate?: () => void | Promise<void>;
      };
    };
    testWindow.__ecPortableBundleGate = { held };
    testWindow.__EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__ = {
      beforeReread: () => hold("beforeReread"),
      beforeInitiate: () => hold("beforeInitiate")
    };
  });
}

async function expectBundleGateCount(page: Page, name: "beforeReread" | "beforeInitiate", count: number) {
  await expect
    .poll(async () =>
      page.evaluate((gateName) => {
        return (
          (window as unknown as { __ecPortableBundleGate?: { held: Record<"beforeReread" | "beforeInitiate", unknown[]> } })
            .__ecPortableBundleGate?.held[gateName].length ?? 0
        );
      }, name)
    )
    .toBe(count);
}

async function releaseBundleGate(page: Page, name: "beforeReread" | "beforeInitiate", index: number) {
  await page.evaluate(
    ({ name: gateName, index: gateIndex }) => {
      const gate = (window as unknown as {
        __ecPortableBundleGate?: { held: Record<"beforeReread" | "beforeInitiate", Array<() => void>> };
      }).__ecPortableBundleGate;
      const release = gate?.held[gateName][gateIndex];
      if (!release) {
        throw new Error(`Missing portable bundle export gate ${gateName} at ${gateIndex}.`);
      }
      release();
    },
    { name, index }
  );
}

async function clearDeferredBundleGate(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as Window & {
      __ecPortableBundleGate?: unknown;
      __EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__?: unknown;
    };
    delete testWindow.__EC_PORTABLE_COMPONENT_BUNDLE_EXPORT_TEST_HARNESS__;
    delete testWindow.__ecPortableBundleGate;
  });
}

async function activeElementRole(page: Page) {
  return page.evaluate(() => document.activeElement?.getAttribute("role") ?? null);
}

async function activeElementIsActionableButton(page: Page) {
  return page.evaluate(() => {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLButtonElement && !activeElement.disabled;
  });
}

async function installOneShotBrowserFailure(
  page: Page,
  failure: "structuredClone" | "Blob" | "createObjectURL" | "createElement" | "append" | "click" | "remove"
) {
  await page.evaluate((failureMode) => {
    let used = false;
    const shouldFail = () => {
      if (used) {
        return false;
      }
      used = true;
      return true;
    };

    if (failureMode === "structuredClone") {
      const original = window.structuredClone.bind(window) as typeof window.structuredClone;
      window.structuredClone = (<T>(value: T, options?: StructuredSerializeOptions): T => {
        if (shouldFail()) {
          throw new Error("Synthetic structuredClone failure.");
        }
        return original(value, options);
      }) as typeof window.structuredClone;
      return;
    }

    if (failureMode === "Blob") {
      const OriginalBlob = window.Blob;
      class FailingBlob extends OriginalBlob {
        constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
          if (shouldFail()) {
            throw new Error("Synthetic Blob failure.");
          }
          super(blobParts, options);
        }
      }
      window.Blob = FailingBlob as typeof Blob;
      return;
    }

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
        if (this === document.body && nodes.some((node) => node instanceof HTMLAnchorElement && node.download.endsWith(".zip")) && shouldFail()) {
          throw new Error("Synthetic anchor append failure.");
        }
        return original.call(this, ...nodes);
      };
      return;
    }

    if (failureMode === "click") {
      const original = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
        if (this.download.endsWith(".zip") && shouldFail()) {
          throw new Error("Synthetic anchor click failure.");
        }
        return original.call(this);
      };
      return;
    }

    const originalClick = HTMLAnchorElement.prototype.click;
    const originalRemove = HTMLAnchorElement.prototype.remove;
    const originalRemoveChild = Node.prototype.removeChild;
    let firstZipClickSuppressed = false;
    let firstZipRemoveFailed = false;
    const restore = () => {
      HTMLAnchorElement.prototype.click = originalClick;
      HTMLAnchorElement.prototype.remove = originalRemove;
      Node.prototype.removeChild = originalRemoveChild;
    };
    HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
      if (this.download.endsWith(".zip") && !firstZipClickSuppressed) {
        firstZipClickSuppressed = true;
        return;
      }
      return originalClick.call(this);
    };
    HTMLAnchorElement.prototype.remove = function patchedRemove(this: HTMLAnchorElement) {
      if (this.download.endsWith(".zip") && firstZipClickSuppressed && !firstZipRemoveFailed) {
        firstZipRemoveFailed = true;
        throw new Error("Synthetic anchor remove failure.");
      }
      return originalRemove.call(this);
    };
    Node.prototype.removeChild = function patchedRemoveChild<T extends Node>(this: Node, child: T) {
      if (child instanceof HTMLAnchorElement && child.download.endsWith(".zip") && firstZipRemoveFailed) {
        restore();
        throw new Error("Synthetic removeChild failure.");
      }
      return originalRemoveChild.call(this, child) as T;
    };
  }, failure);
}

async function installBundleActivityProbe(page: Page) {
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
      __ecBundleActivity?: typeof state;
    };
    const pickerHost = window as unknown as Record<string, ((...args: unknown[]) => unknown) | undefined>;

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

    for (const name of ["showOpenFilePicker", "show" + "SaveFilePicker", "showDirectoryPicker"]) {
      const original = pickerHost[name];
      if (original) {
        pickerHost[name] = (...args: unknown[]) => {
          state.filePickers += 1;
          return original(...args);
        };
      }
    }

    global.__ecBundleActivity = state;
  });

  return async () => {
    const activity = await page.evaluate(() => {
      const state = (window as unknown as {
        __ecBundleActivity?: {
          runtimeMessages: unknown[];
          tabMessages: unknown[];
          writes: Array<{ method: string; store: string }>;
          clipboardWrites: number;
          filePickers: number;
        };
      }).__ecBundleActivity;
      if (!state) {
        throw new Error("Bundle activity probe was not installed.");
      }
      return state;
    });
    return { httpRequests, ...activity };
  };
}

function versionLabel(entry: GeneratedComponentVersionEntry) {
  return `${entry.value.componentName} - ${entry.createdAt}`;
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
  const operation: GeneratedComponentVersionEntryV2["operation"] =
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
