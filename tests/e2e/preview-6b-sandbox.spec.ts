import { test, expect } from "./extension-fixture";
import {
  assertSiblingFramesAndGeneratedPreview,
  getPreviewWindowTokens,
  getRecordedPreviewSession,
  installPreviewMessageRecorder,
  openGeneratedPreview,
  renderMessagesContainGeneratedSource,
  seedGeneratedPreviewVersion
} from "./preview-helpers";

test.describe("Milestone 6B preview sandbox foundation regression", () => {
  test("keeps the accepted sibling sandbox topology and fresh disposable sessions", async ({ sidePanelPage }) => {
    const httpRequests: string[] = [];
    sidePanelPage.on("request", (request) => {
      if (/^https?:/.test(request.url())) httpRequests.push(request.url());
    });

    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);

    const manifest = await sidePanelPage.evaluate(async () => {
      const response = await fetch(chrome.runtime.getURL("manifest.json"));
      return response.json() as Promise<{
        sandbox?: { pages?: string[] };
        web_accessible_resources?: unknown;
        content_security_policy?: { sandbox?: string };
      }>;
    });
    expect(manifest.sandbox?.pages).toEqual(["src/preview/host.html", "src/preview/render-realm.html"]);
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.content_security_policy?.sandbox).not.toContain("allow-same-origin");
    expect(manifest.content_security_policy?.sandbox).not.toContain("unsafe-eval");
    expect(manifest.content_security_policy?.sandbox).toContain("connect-src 'none'");
    expect(manifest.content_security_policy?.sandbox).toContain("worker-src 'none'");

    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);
    expect(await renderMessagesContainGeneratedSource(sidePanelPage)).toBe(false);
    expect(httpRequests).toEqual([]);

    const oldWindows = await getPreviewWindowTokens(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Close preview" }).click();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Preview", exact: true }).click();
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const reopenedSession = await getRecordedPreviewSession(sidePanelPage);
    const reopenedWindows = await getPreviewWindowTokens(sidePanelPage);
    expect(reopenedSession.requestId).not.toBe(session.requestId);
    expect(reopenedSession.sessionNonce).not.toBe(session.sessionNonce);
    expect(reopenedWindows.hostWindowToken).not.toBe(oldWindows.hostWindowToken);
    expect(reopenedWindows.renderWindowToken).not.toBe(oldWindows.renderWindowToken);
  });
});
