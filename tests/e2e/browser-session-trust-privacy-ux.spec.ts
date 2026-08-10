import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGenerationRequestWithoutDataUrl } from "../../extension/src/generation/projection";
import { expect, openSidePanelPage, test } from "./extension-fixture";
import {
  DEFAULT_CAPTURE_FIXTURES,
  createCaptureRecordFixture,
  resetAndSeedSavedCaptures
} from "./indexed-db-fixtures";

const root = join(import.meta.dirname, "../..");

test.describe("M10 Slice 2 browser-session trust and privacy UX", () => {
  test("Side Panel intro positions current-browser-session capture without broad private-page claims", async ({ sidePanelPage }) => {
    await expect(
      sidePanelPage.getByText(
        "Capture UI from the page open in Chrome, including many authenticated or private ordinary pages you can already access."
      )
    ).toBeVisible();
    await expect(
      sidePanelPage.getByText("Element Catcher uses your current browser session instead of remotely re-fetching the source page.")
    ).toBeVisible();
    await expect(sidePanelPage.getByText(/every private page/i)).toHaveCount(0);
    await expect(sidePanelPage.getByText(/bypass authentication/i)).toHaveCount(0);
  });

  test("Capture Preview shows browser-session provenance for saved captures after reopen", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();

    await openCapture(page, seeded[0].title);
    await expectCapturePreviewProvenance(page);
    await page.close();

    const reopened = await openSidePanelPage(context, extensionId);
    await openCapture(reopened, seeded[0].title);
    await expectCapturePreviewProvenance(reopened);
    await reopened.close();
  });

  test("Generation Review separates local capture from explicit AI sending and preserves consent gate", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];

    await openCapture(sidePanelPage, target.title);
    await sidePanelPage.getByRole("button", { name: "Generate component" }).click();

    const generationPanel = sidePanelPage.getByLabel("AI generation");
    await expect(generationPanel.getByRole("heading", { name: "Review data being sent" })).toBeVisible();
    await expect(generationPanel.getByRole("heading", { name: "Local capture and AI boundary" })).toBeVisible();
    await expect(generationPanel.getByText("Capture and save are local extension actions.")).toBeVisible();
    await expect(generationPanel.getByText("Sending to AI is a separate explicit action.")).toBeVisible();
    await expect(
      generationPanel.getByText("AI receives only the screenshot shown in Review and the structured fields shown in Review.")
    ).toBeVisible();
    await expect(
      generationPanel.getByText(
        "The AI backend does not receive your browser session, cookies, browser storage, login credentials, or access to the source webpage."
      )
    ).toBeVisible();
    await expect(generationPanel.getByRole("img", { name: "Screenshot that will be sent after consent" })).toBeVisible();
    await expect(generationPanel.getByText("Displayed values are the exact outbound projection. Excluded content is not sent.")).toBeVisible();
    await expect(generationPanel.getByRole("heading", { name: "Excluded categories" })).toBeVisible();

    for (const excluded of ["browser session", "browser storage", "cookies", "login credentials", "source webpage access"]) {
      await expect(generationPanel.getByText(excluded, { exact: true })).toBeVisible();
    }

    await expect(generationPanel.getByText(target.record.source.url)).toHaveCount(0);
    await expect(generationPanel.getByText(target.record.source.pageTitle)).toHaveCount(0);
    await expect(generationPanel.getByText(target.record.id)).toHaveCount(0);
    await expect(generationPanel.getByText(target.storageKey)).toHaveCount(0);
    await expect(generationPanel.getByText(/^Authenticated page$/i)).toHaveCount(0);
    await expect(generationPanel.getByText(/^Private capture$/i)).toHaveCount(0);

    const submit = sidePanelPage.getByRole("button", { name: "Send to AI and generate" });
    await expect(submit).toBeDisabled();
    await sidePanelPage.getByLabel(/Data is leaving your device/).check();
    await expect(submit).toBeEnabled();
  });

  test("generation outbound projection and Manifest permission boundary remain unchanged", () => {
    const record = createCaptureRecordFixture({
      ...DEFAULT_CAPTURE_FIXTURES[0],
      libraryNotes: "Private note must stay local."
    });
    const request = buildGenerationRequestWithoutDataUrl({
      record,
      screenshot: {
        mediaType: "image/png",
        width: 80,
        height: 48,
        byteLength: 100
      }
    });
    const serializedRequest = JSON.stringify(request);

    expect(Object.keys(request).sort()).toEqual(["captureContext", "contractVersion", "requestedOutput", "screenshot"]);
    expect(Object.keys(request.captureContext).sort()).toEqual([
      "dom",
      "element",
      "library",
      "pageTitlePolicy",
      "sourceUrlPolicy",
      "styles",
      "summaries"
    ]);
    expect(serializedRequest).not.toContain(record.source.url);
    expect(serializedRequest).not.toContain(record.source.pageTitle);
    expect(serializedRequest).not.toContain(record.id);
    expect(serializedRequest).not.toContain(record.assets.screenshot.storageKey);
    expect(serializedRequest).not.toMatch(/\b(cookie|cookies|browserStorage|sessionStorage|localStorage|loginCredentials|sourceWebpageAccess)\b/i);

    for (const path of ["extension/manifest.json", "dist/manifest.json"]) {
      const manifest = JSON.parse(readFileSync(join(root, path), "utf8")) as {
        permissions?: string[];
        host_permissions?: string[];
      };

      expect(manifest.permissions?.sort()).toEqual(["activeTab", "scripting", "sidePanel"]);
      expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
      expect(manifest.permissions).not.toContain("tabs");
      expect(manifest.permissions).not.toContain("webRequest");
      expect(manifest.permissions).not.toContain("identity");
      expect(manifest.permissions).not.toContain("downloads");
      expect(manifest.host_permissions).not.toContain("<all_urls>");
    }
  });
});

async function openCapture(page: Parameters<typeof resetAndSeedSavedCaptures>[0], title: string) {
  await page.getByRole("button", { name: `Open saved capture: ${title}` }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function expectCapturePreviewProvenance(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  const preview = page.locator(".capture-preview");

  await expect(preview.getByRole("heading", { name: "Browser-session provenance" })).toBeVisible();
  await expect(preview.getByText("Capture method")).toBeVisible();
  await expect(preview.getByText("Current browser session")).toBeVisible();
  await expect(preview.getByText("Source access")).toBeVisible();
  await expect(preview.getByText("Captured directly from the page open in Chrome; no remote page re-fetch was used.")).toBeVisible();
  await expect(preview.getByText("Local save boundary")).toBeVisible();
  await expect(preview.getByText("Before AI generation, the capture and screenshot remain local extension data.")).toBeVisible();
  await expect(preview.getByText(/^Authenticated page$/i)).toHaveCount(0);
  await expect(preview.getByText(/^Private capture$/i)).toHaveCount(0);
}
