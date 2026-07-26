import { test, expect, openSidePanelPage } from "./extension-fixture";
import type { BrowserContext, Page } from "@playwright/test";
import {
  assertSiblingFramesAndGeneratedPreview,
  getRecordedPreviewSession,
  installPreviewMessageRecorder,
  openGeneratedPreview,
  renderMessagesContainGeneratedSource,
  seedGeneratedPreviewVersion,
  validPreviewCode
} from "./preview-helpers";

test.describe("Milestone 6C safe generated component preview", () => {
  test("previews a valid generated version through host plan and render plan only", async ({ sidePanelPage }) => {
    const httpRequests: string[] = [];
    sidePanelPage.on("request", (request) => {
      if (/^https?:/.test(request.url())) httpRequests.push(request.url());
    });
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    await expect(sidePanelPage.locator("pre.generated-code code")).toContainText("export function PreviewCard");
    expect(await renderMessagesContainGeneratedSource(sidePanelPage)).toBe(false);
    expect(await hasRenderPlanWithoutSourceCode(sidePanelPage)).toBe(true);
    expect(await hasPlanSuccessWithHashes(sidePanelPage)).toBe(true);
    expect(httpRequests).toEqual([]);
  });

  const rejectedCases = [
    ["malformed JSX", "export function PreviewCard() { return <div>; }"],
    ["imports", "import x from 'x';\nexport function PreviewCard() { return <div />; }"],
    ["calls", "export function PreviewCard() { return <div>{alert('x')}</div>; }"],
    ["hooks", "export function PreviewCard() { return <div>{useState()}</div>; }"],
    ["props", "export function PreviewCard(props) { return <div />; }"],
    ["extra declarations", "const x = 1;\nexport function PreviewCard() { return <div />; }"],
    ["unsupported tags", "export function PreviewCard() { return <img />; }"],
    ["event props", "export function PreviewCard() { return <button onClick=\"x\">Run</button>; }"],
    ["URLs", "export function PreviewCard() { return <div href=\"https://example.test\">x</div>; }"],
    ["styles", "export function PreviewCard() { return <div style=\"color:red\">x</div>; }"],
    ["unknown classes", "export function PreviewCard() { return <div className=\"fixed top-[13px]\">x</div>; }"],
    ["excessive source", `export function PreviewCard() { return <div>${"x".repeat(9000)}</div>; }`]
  ] as const;

  for (const [name, code] of rejectedCases) {
    test(`rejects source outside Previewable Subset V1: ${name}`, async ({ sidePanelPage }) => {
      const target = await seedGeneratedPreviewVersion(sidePanelPage, code);
      await openGeneratedPreview(sidePanelPage, target.title);
      await expect(sidePanelPage.getByText("Preview unavailable")).toBeVisible();
      await expect(sidePanelPage.locator("pre.generated-code code")).toContainText("export function PreviewCard");
      await expect(sidePanelPage.locator(".preview-sandbox-frame")).toHaveCount(0);
    });
  }

  test("rejects stale and malformed production messages while keeping the active preview safe", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    const session = await getRecordedPreviewSession(sidePanelPage);
    await postFromPreviewFrame(sidePanelPage, "src/preview/host.html", {
      contractVersion: 2,
      type: "preview.plan.failure.v2",
      requestId: "preview-00000000000000000000000000000000",
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["stale replay"]
    });
    await postFromPreviewFrame(sidePanelPage, "src/preview/render-realm.html", {
      contractVersion: 2,
      type: "preview.render.failure.v2",
      requestId: session.requestId,
      sessionNonce: "00000000000000000000000000000000",
      category: "policy",
      diagnostics: ["wrong nonce"]
    });
    await expect(sidePanelPage.getByText("Preview ready", { exact: true })).toBeVisible();
    await expect(sidePanelPage.getByText("stale replay")).toHaveCount(0);
    await expect(sidePanelPage.getByText("wrong nonce")).toHaveCount(0);
  });

  test("times out automatically, disposes frames and reopens with fresh identities", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    await blockRenderRealm(context, extensionId);
    const target = await seedGeneratedPreviewVersion(page);
    await installPreviewMessageRecorder(page);
    await openGeneratedPreview(page, target.title);
    await expect(page.getByText("Preview timed out", { exact: true })).toBeVisible({ timeout: 13_000 });
    await expect(page.locator(".preview-sandbox-frame")).toHaveCount(0);
    const timedOutSession = await getRecordedPreviewSession(page);
    await page.getByRole("button", { name: "Close preview" }).first().click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await assertSiblingFramesAndGeneratedPreview(page);
    const reopenedSession = await getRecordedPreviewSession(page);
    expect(reopenedSession.requestId).not.toBe(timedOutSession.requestId);
    expect(reopenedSession.sessionNonce).not.toBe(timedOutSession.sessionNonce);
    await page.close();
  });

  test("sandbox realms cannot access extension APIs or local storage", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage, validPreviewCode());
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const hostRuntime = await getFrameRuntimeSnapshot(sidePanelPage, "src/preview/host.html");
    const renderRuntime = await getFrameRuntimeSnapshot(sidePanelPage, "src/preview/render-realm.html");
    expect(hostRuntime.chromeRuntime).toBe("undefined");
    expect(renderRuntime.chromeRuntime).toBe("undefined");
    expect(renderRuntime.localStorage).not.toBe("available");
    expect(renderRuntime.sessionStorage).not.toBe("available");
    expect(renderRuntime.indexedDB).not.toBe("available");
    expect(renderRuntime.cookie).not.toBe("available");
  });
});

async function hasRenderPlanWithoutSourceCode(page: Page) {
  return page.evaluate(() => {
    const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ source: string; data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
    return messages.some((message) => {
      const data = message.data as { type?: string; renderPlan?: unknown };
      return message.source === "render" && data.type === "preview.render.success.v2";
    });
  });
}

async function hasPlanSuccessWithHashes(page: Page) {
  return page.evaluate(() => {
    const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ source: string; data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
    return messages.some((message) => {
      const data = message.data as { type?: string; sourceSha256?: string; planSha256?: string; renderPlan?: { sourceSha256?: string } };
      return message.source === "host" && data.type === "preview.plan.success.v2" && /^[a-f0-9]{64}$/.test(data.sourceSha256 ?? "") && /^[a-f0-9]{64}$/.test(data.planSha256 ?? "") && data.sourceSha256 === data.renderPlan?.sourceSha256;
    });
  });
}

async function postFromPreviewFrame(page: Page, pathSuffix: string, message: Record<string, unknown>) {
  const selector = pathSuffix.includes("host.html") ? ".preview-sandbox-host-frame" : ".preview-sandbox-render-frame";
  await page.evaluate(
    ({ selector, message }) => {
      const frame = document.querySelector(selector) as HTMLIFrameElement | null;
      if (!frame?.contentWindow) throw new Error(`Expected frame ${selector}.`);
      frame.contentWindow.postMessage(message, "*");
    },
    { selector, message }
  );
}

async function blockRenderRealm(context: BrowserContext, extensionId: string) {
  const renderRealmBundlePattern = new RegExp(`^chrome-extension://${extensionId}/assets/previewRenderRealm\\.js$`);
  await context.route(renderRealmBundlePattern, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    await context.unroute(renderRealmBundlePattern);
  });
}

async function getFrameRuntimeSnapshot(page: Page, pathSuffix: string) {
  const frame = page.frames().find((candidate) => candidate.url().endsWith(pathSuffix));
  if (!frame) throw new Error(`Expected frame ending with ${pathSuffix}.`);
  return frame.evaluate(() => {
    const readStorageState = (read: () => unknown) => {
      try {
        read();
        return "available";
      } catch (error) {
        return error instanceof DOMException ? error.name : "throws";
      }
    };
    return {
      chromeRuntime: typeof (globalThis as unknown as { chrome?: { runtime?: unknown } }).chrome?.runtime,
      localStorage: readStorageState(() => localStorage.length),
      sessionStorage: readStorageState(() => sessionStorage.length),
      indexedDB: readStorageState(() => indexedDB.open("__ec_preview_probe__")),
      cookie: readStorageState(() => document.cookie)
    };
  });
}
