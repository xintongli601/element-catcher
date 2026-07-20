import { createServer } from "node:http";
import { test, expect, openSidePanelPage } from "./extension-fixture";
import {
  CAPTURE_RECORD_STORE_NAME,
  GENERATED_COMPONENT_VERSION_STORE_NAME,
  SCREENSHOT_ASSET_STORE_NAME,
  readPersistenceCounts,
  readRecordWrapper,
  readScreenshotAssetSnapshot,
  resetAndSeedSavedCaptures
} from "./indexed-db-fixtures";
import { createApp } from "../../.backend-dist/backend/src/app.js";
import type { ComponentGenerationRequestV1 } from "../../extension/src/generation/types";

test.skip(process.env.RUN_5C_LOOPBACK !== "1", "Milestone 5C loopback E2E requires an extension build with the loopback endpoint.");

test("browser generation flow sends one loopback request and preserves persistence", async ({ context, extensionId }) => {
  const providerCalls: ComponentGenerationRequestV1[] = [];
  const config = {
    apiKey: "not-used",
    model: "fake-model",
    extensionOrigin: `chrome-extension://${extensionId}`,
    host: "127.0.0.1" as const,
    port: 8787 as const,
    configurationVersion: "5c-local-dev" as const
  };
  const server = createServer(createApp({
    config,
    logger: { log: () => undefined },
    provider: {
      async generate(request) {
        providerCalls.push(request);
        return {
          contractVersion: 1,
          componentName: "LoopbackFixture",
          framework: "react",
          styling: "tailwind",
          code: "export function LoopbackFixture() { return null; }",
          summary: "Loopback fake provider result.",
          approximationNotes: ""
        };
      }
    }
  }));
  await new Promise<void>((resolve) => server.listen(8787, "127.0.0.1", resolve));
  try {
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
    const beforeWrapper = await readRecordWrapper(page, target.record.id);
    const beforeAsset = await readScreenshotAssetSnapshot(page, target.storageKey);
    const beforeCounts = await readPersistenceCounts(page);

    await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await page.getByRole("button", { name: "Generate component" }).click();
    await expect(page.getByText("Local development proxy at 127.0.0.1")).toBeVisible();
    await page.getByLabel(/Data is leaving your device/).check();
    await page.getByRole("button", { name: "Send to AI and generate" }).click();
    await expect(page.getByRole("heading", { name: "Saved generated version" })).toBeVisible();
    await expect(page.locator(".generation-result .preview-metadata dd", { hasText: "LoopbackFixture" })).toBeVisible();

    expect(providerCalls).toHaveLength(1);
    expect(httpRequests).toEqual(["http://127.0.0.1:8787/v1/generate-component"]);
    expect(await readRecordWrapper(page, target.record.id)).toEqual(beforeWrapper);
    expect(await readScreenshotAssetSnapshot(page, target.storageKey)).toEqual(beforeAsset);
    expect(await readPersistenceCounts(page)).toEqual({
      ...beforeCounts,
      stores: [CAPTURE_RECORD_STORE_NAME, GENERATED_COMPONENT_VERSION_STORE_NAME, SCREENSHOT_ASSET_STORE_NAME],
      generatedComponentVersions: beforeCounts.generatedComponentVersions + 1
    });
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
