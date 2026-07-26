import { test, expect } from "./extension-fixture";
import {
  assertSiblingFramesAndGeneratedPreview,
  createUnrelatedPreviewMessageFrame,
  postMessageFromFrameToParent,
  postMessageFromNamedFrameToParent,
  previewFrameBySuffix,
  getPreviewWindowTokens,
  getRecordedPreviewSession,
  installPreviewMessageRecorder,
  openGeneratedPreview,
  removeNamedFrame,
  renderMessagesContainGeneratedSource,
  seedGeneratedPreviewVersion
} from "./preview-helpers";

test.describe("Milestone 6B preview sandbox foundation regression", () => {
  test("keeps strict manifest sandbox topology and CSP", async ({ sidePanelPage }) => {
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
    expect(manifest.content_security_policy?.sandbox).toContain("sandbox allow-scripts");
    expect(manifest.content_security_policy?.sandbox).toContain("default-src 'none'");
    expect(manifest.content_security_policy?.sandbox).toContain("connect-src 'none'");
    expect(manifest.content_security_policy?.sandbox).toContain("worker-src 'none'");
    expect(manifest.content_security_policy?.sandbox).not.toContain("allow-same-origin");
    expect(manifest.content_security_policy?.sandbox).not.toContain("unsafe-eval");
    expect(manifest.content_security_policy?.sandbox).not.toContain("wasm-unsafe-eval");
  });

  test("keeps sibling packaged frames and no generated source in render-origin messages", async ({ sidePanelPage }) => {
    const httpRequests: string[] = [];
    sidePanelPage.on("request", (request) => {
      if (/^https?:/.test(request.url())) httpRequests.push(request.url());
    });

    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);

    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    expect(await renderMessagesContainGeneratedSource(sidePanelPage)).toBe(false);
    expect(httpRequests).toEqual([]);
  });

  test("rejects wrong nonce, stale requestId, unknown keys, malformed messages and wrong directions", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);

    await postMessageFromFrameToParent(sidePanelPage, "src/preview/host.html", {
      contractVersion: 2,
      type: "preview.plan.failure.v2",
      requestId: "preview-00000000000000000000000000000000",
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["wrong host requestId"]
    });
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/host.html", {
      contractVersion: 2,
      type: "preview.plan.failure.v2",
      requestId: session.requestId,
      sessionNonce: "00000000000000000000000000000000",
      category: "policy",
      diagnostics: ["wrong host nonce"]
    });
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/host.html", {
      contractVersion: 2,
      type: "preview.plan.failure.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["unknown host field"],
      extra: true
    });
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/render-realm.html", {
      contractVersion: 2,
      type: "preview.render.failure.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["wrong direction from render"],
      extra: true
    });
    const unrelatedFrameName = await createUnrelatedPreviewMessageFrame(sidePanelPage);
    await postMessageFromNamedFrameToParent(sidePanelPage, unrelatedFrameName, {
      contractVersion: 2,
      type: "preview.plan.failure.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["unrelated source"]
    });
    await expect(sidePanelPage.getByText("Preview ready", { exact: true })).toBeVisible();
    for (const text of ["wrong host requestId", "wrong host nonce", "unknown host field", "wrong direction from render", "unrelated source"]) {
      await expect(sidePanelPage.getByText(text)).toHaveCount(0);
    }
    await removeNamedFrame(sidePanelPage, unrelatedFrameName);
  });

  test("close disposes frames idempotently and reopen fresh identities", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);

    const oldWindows = await getPreviewWindowTokens(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Close preview" }).click();
    await expect(sidePanelPage.locator(".preview-sandbox-frame")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Preview", exact: true }).click();
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const reopenedSession = await getRecordedPreviewSession(sidePanelPage);
    const reopenedWindows = await getPreviewWindowTokens(sidePanelPage);
    expect(reopenedSession.requestId).not.toBe(session.requestId);
    expect(reopenedSession.sessionNonce).not.toBe(session.sessionNonce);
    expect(reopenedWindows.hostWindowToken).not.toBe(oldWindows.hostWindowToken);
    expect(reopenedWindows.renderWindowToken).not.toBe(oldWindows.renderWindowToken);
  });

  test("sandbox realms expose no extension API, storage or cookies", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    for (const suffix of ["src/preview/host.html", "src/preview/render-realm.html"]) {
      const snapshot = await previewFrameBySuffix(sidePanelPage, suffix).evaluate(() => {
        const probe = (read: () => unknown) => {
          try {
            read();
            return "available";
          } catch (error) {
            return error instanceof DOMException ? error.name : "throws";
          }
        };
        return {
          chromeRuntime: typeof (globalThis as unknown as { chrome?: { runtime?: unknown } }).chrome?.runtime,
          localStorage: probe(() => localStorage.length),
          sessionStorage: probe(() => sessionStorage.length),
          indexedDB: probe(() => indexedDB.open("__ec_6b_probe__")),
          cookie: probe(() => document.cookie)
        };
      });
      expect(snapshot.chromeRuntime).toBe("undefined");
      expect(snapshot.localStorage).not.toBe("available");
      expect(snapshot.sessionStorage).not.toBe("available");
      expect(snapshot.indexedDB).not.toBe("available");
      expect(snapshot.cookie).not.toBe("available");
    }
  });
});
