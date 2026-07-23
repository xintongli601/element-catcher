import { test, expect, openSidePanelPage } from "./extension-fixture";
import { putGeneratedVersion, resetAndSeedSavedCaptures } from "./indexed-db-fixtures";
import type { Page } from "@playwright/test";

test.describe("Milestone 6B preview sandbox foundation", () => {
  test("renders only the trusted packaged React fixture inside disposable packaged sandbox pages", async ({ sidePanelPage }) => {
    const httpRequests: string[] = [];
    sidePanelPage.on("request", (request) => {
      if (/^https?:/.test(request.url())) {
        httpRequests.push(request.url());
      }
    });

    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const generatedVersion = createGeneratedVersionEntry(target.record.id, target.savedAt);
    await putGeneratedVersion(sidePanelPage, generatedVersion);

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
    expect(manifest.content_security_policy?.sandbox).not.toContain("unsafe-inline");
    expect(manifest.content_security_policy?.sandbox).not.toContain("unsafe-eval");
    expect(manifest.content_security_policy?.sandbox).not.toContain("wasm-unsafe-eval");
    expect(manifest.content_security_policy?.sandbox).toContain("default-src 'none'");
    expect(manifest.content_security_policy?.sandbox).toContain("connect-src 'none'");
    expect(manifest.content_security_policy?.sandbox).toContain("worker-src 'none'");

    await sidePanelPage.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await sidePanelPage.getByRole("button", { name: /PreviewFixture/ }).click();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    await expect(sidePanelPage.locator("pre.generated-code code")).toContainText("export function PreviewFixture");

    await sidePanelPage.getByRole("button", { name: "Open trusted fixture preview" }).click();
    const hostFrameElement = sidePanelPage.locator(".preview-sandbox-host-frame");
    const renderFrameElement = sidePanelPage.locator(".preview-sandbox-render-frame");
    const renderFrame = sidePanelPage.frameLocator(".preview-sandbox-render-frame");

    await expect(sidePanelPage.locator(".preview-sandbox-frame")).toHaveCount(2);
    await expect(hostFrameElement).toHaveAttribute("src", /src\/preview\/host\.html$/);
    await expect(renderFrameElement).toHaveAttribute("src", /src\/preview\/render-realm\.html$/);
    await expect(hostFrameElement).not.toHaveAttribute("srcdoc", /.*/);
    await expect(renderFrameElement).not.toHaveAttribute("srcdoc", /.*/);
    await expect(hostFrameElement).not.toHaveAttribute("src", /^blob:|^data:/);
    await expect(renderFrameElement).not.toHaveAttribute("src", /^blob:|^data:/);
    await expect(sidePanelPage.locator(".preview-sandbox-panel > .preview-sandbox-frame-row > iframe")).toHaveCount(2);
    await expect(sidePanelPage.frameLocator(".preview-sandbox-host-frame").locator("iframe")).toHaveCount(0);
    await expect(renderFrame.getByText("Trusted packaged fixture")).toBeVisible();
    await expect(renderFrame.getByRole("heading", { name: "Preview sandbox boundary" })).toBeVisible();
    await expect(renderFrame.locator("[data-renderer='react-create-root']")).toBeVisible();
    await expect(renderFrame.getByText("AI source must stay inert")).toHaveCount(0);
    await expect(sidePanelPage.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();
    await expect(sidePanelPage.locator("pre.generated-code code")).toContainText("return <div>AI source must stay inert</div>;");
    expect(httpRequests).toEqual([]);

    const hostRuntime = await getFrameRuntimeSnapshot(sidePanelPage, "src/preview/host.html");
    const renderRuntime = await getFrameRuntimeSnapshot(sidePanelPage, "src/preview/render-realm.html");
    expect(hostRuntime.chromeRuntime).toBe("undefined");
    expect(renderRuntime.chromeRuntime).toBe("undefined");
    expect(renderRuntime.cookie).not.toBe("available");
    expect(renderRuntime.localStorage).not.toBe("available");
    expect(renderRuntime.sessionStorage).not.toBe("available");
    expect(renderRuntime.indexedDB).not.toBe("available");

    await getFrame(sidePanelPage, "src/preview/host.html").evaluate(() => {
      window.parent.postMessage(
        {
          contractVersion: 1,
          type: "preview.host.failure",
          requestId: "preview-00000000000000000000000000000000",
          sessionNonce: "00000000000000000000000000000000",
          category: "runtime_failed",
          message: "wrong host nonce",
          code: "export function ShouldNotCross() {}"
        },
        "*"
      );
    });
    await expect(sidePanelPage.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();

    await getFrame(sidePanelPage, "src/preview/render-realm.html").evaluate(() => {
      window.parent.postMessage(
        {
          contractVersion: 1,
          type: "preview.render.failure",
          requestId: "preview-00000000000000000000000000000000",
          sessionNonce: "00000000000000000000000000000000",
          category: "runtime_failed",
          message: "spoofed failure",
          source: "untrusted generated source"
        },
        "*"
      );
    });
    await expect(sidePanelPage.getByText("spoofed failure")).toHaveCount(0);
    await expect(sidePanelPage.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();

    await sidePanelPage.evaluate(() => {
      const host = document.querySelector(".preview-sandbox-host-frame") as HTMLIFrameElement | null;
      const render = document.querySelector(".preview-sandbox-render-frame") as HTMLIFrameElement | null;
      Object.assign(window, {
        __ecOldPreviewHost: host?.contentWindow ?? null,
        __ecOldPreviewRender: render?.contentWindow ?? null
      });
    });

    await sidePanelPage.getByRole("button", { name: "Close trusted fixture preview" }).click();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Open trusted fixture preview" }).click();
    const reopenedSession = await getPreviewSession(sidePanelPage);
    await expect(sidePanelPage.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();
    expect(reopenedSession.requestId).not.toBe("");
    expect(reopenedSession.sessionNonce).not.toBe("");
    await sidePanelPage.evaluate(() => {
      const oldHost = (window as unknown as { __ecOldPreviewHost?: WindowProxy | null }).__ecOldPreviewHost;
      const oldRender = (window as unknown as { __ecOldPreviewRender?: WindowProxy | null }).__ecOldPreviewRender;
      oldHost?.postMessage(
        {
          contractVersion: 1,
          type: "preview.host.failure",
          requestId: "preview-00000000000000000000000000000000",
          sessionNonce: "00000000000000000000000000000000",
          category: "runtime_failed",
          message: "old host failure"
        },
        "*"
      );
      oldRender?.postMessage(
        {
          contractVersion: 1,
          type: "preview.render.failure",
          requestId: "preview-00000000000000000000000000000000",
          sessionNonce: "00000000000000000000000000000000",
          category: "runtime_failed",
          message: "old render failure"
        },
        "*"
      );
    });
    await expect(sidePanelPage.getByText("old host failure")).toHaveCount(0);
    await expect(sidePanelPage.getByText("old render failure")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Close trusted fixture preview" }).click();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("creates a fresh preview identity after close and after Side Panel reopen", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();
    const target = seeded[0];
    await putGeneratedVersion(page, createGeneratedVersionEntry(target.record.id, target.savedAt));

    await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await page.getByRole("button", { name: /PreviewFixture/ }).click();
    await page.getByRole("button", { name: "Open trusted fixture preview" }).click();
    const firstSession = await getPreviewSession(page);
    await expect(page.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();
    const firstWindows = await getPreviewWindowTokens(page);
    await page.getByRole("button", { name: "Close trusted fixture preview" }).click();
    await expect(page.locator("iframe")).toHaveCount(0);

    await page.getByRole("button", { name: "Open trusted fixture preview" }).click();
    const secondSession = await getPreviewSession(page);
    const secondWindows = await getPreviewWindowTokens(page);
    expect(secondSession.requestId).not.toBe(firstSession.requestId);
    expect(secondSession.sessionNonce).not.toBe(firstSession.sessionNonce);
    expect(secondWindows.hostWindowToken).not.toBe(firstWindows.hostWindowToken);
    expect(secondWindows.renderWindowToken).not.toBe(firstWindows.renderWindowToken);
    await page.close();

    const reopened = await openSidePanelPage(context, extensionId);
    await reopened.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await reopened.getByRole("button", { name: /PreviewFixture/ }).click();
    await expect(reopened.locator("iframe")).toHaveCount(0);
    await reopened.getByRole("button", { name: "Open trusted fixture preview" }).click();
    const reopenedSession = await getPreviewSession(reopened);
    expect(reopenedSession.requestId).not.toBe(secondSession.requestId);
    expect(reopenedSession.sessionNonce).not.toBe(secondSession.sessionNonce);
    await reopened.close();
  });
});

async function getPreviewSession(page: Page) {
  return page.locator(".preview-sandbox-panel").evaluate((panel) => ({
    requestId: panel.getAttribute("data-preview-request-id") ?? "",
    sessionNonce: panel.getAttribute("data-preview-session-nonce") ?? ""
  }));
}

async function getPreviewWindowTokens(page: Page) {
  return page.evaluate(() => {
    const registry = (window as unknown as { __ecPreviewWindowTokens?: WeakMap<WindowProxy, string> }).__ecPreviewWindowTokens ?? new WeakMap<WindowProxy, string>();
    (window as unknown as { __ecPreviewWindowTokens?: WeakMap<WindowProxy, string> }).__ecPreviewWindowTokens = registry;
    const tokenFor = (frame: HTMLIFrameElement | null) => {
      const target = frame?.contentWindow;
      if (!target) {
        return "";
      }
      const existing = registry.get(target);
      if (existing) {
        return existing;
      }
      const token = crypto.randomUUID();
      registry.set(target, token);
      return token;
    };

    return {
      hostWindowToken: tokenFor(document.querySelector(".preview-sandbox-host-frame")),
      renderWindowToken: tokenFor(document.querySelector(".preview-sandbox-render-frame"))
    };
  });
}

function getFrame(page: Page, pathSuffix: string) {
  const frame = page.frames().find((candidate) => candidate.url().endsWith(pathSuffix));
  if (!frame) {
    throw new Error(`Expected frame ending with ${pathSuffix}.`);
  }
  return frame;
}

async function getFrameRuntimeSnapshot(page: Page, pathSuffix: string) {
  return getFrame(page, pathSuffix).evaluate(() => {
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

function createGeneratedVersionEntry(sourceCaptureId: string, sourceCaptureSavedAt: string) {
  return {
    id: "generated-version-66666666-6666-6666-6666-666666666666",
    sourceCaptureId,
    sourceCaptureSavedAt,
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: "2026-07-18T14:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName: "PreviewFixture",
      framework: "react",
      styling: "tailwind",
      code: "export function PreviewFixture() {\n  return <div>AI source must stay inert</div>;\n}",
      summary: "Preview sandbox fixture summary.",
      approximationNotes: ""
    }
  };
}
