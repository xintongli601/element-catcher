import { test, expect, openSidePanelPage } from "./extension-fixture";
import { putGeneratedVersion, resetAndSeedSavedCaptures } from "./indexed-db-fixtures";
import type { BrowserContext, Page } from "@playwright/test";

test.describe("Milestone 6B preview sandbox foundation", () => {
  test("renders only the trusted packaged React fixture inside disposable sibling sandbox pages", async ({ sidePanelPage }) => {
    const httpRequests: string[] = [];
    sidePanelPage.on("request", (request) => {
      if (/^https?:/.test(request.url())) {
        httpRequests.push(request.url());
      }
    });

    const target = await seedGeneratedPreviewFixture(sidePanelPage);
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
    expect(manifest.content_security_policy?.sandbox).not.toContain("unsafe-inline");
    expect(manifest.content_security_policy?.sandbox).not.toContain("unsafe-eval");
    expect(manifest.content_security_policy?.sandbox).not.toContain("wasm-unsafe-eval");
    expect(manifest.content_security_policy?.sandbox).toContain("default-src 'none'");
    expect(manifest.content_security_policy?.sandbox).toContain("connect-src 'none'");
    expect(manifest.content_security_policy?.sandbox).toContain("worker-src 'none'");

    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndTrustedFixture(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);
    await expect(sidePanelPage.locator("pre.generated-code code")).toContainText("return <div>AI source must stay inert</div>;");
    expect(await recordedMessagesContainExecutableSource(sidePanelPage)).toBe(false);
    expect(httpRequests).toEqual([]);

    const hostRuntime = await getFrameRuntimeSnapshot(sidePanelPage, "src/preview/host.html");
    const renderRuntime = await getFrameRuntimeSnapshot(sidePanelPage, "src/preview/render-realm.html");
    expect(hostRuntime.chromeRuntime).toBe("undefined");
    expect(renderRuntime.chromeRuntime).toBe("undefined");
    expect(renderRuntime.cookie).not.toBe("available");
    expect(renderRuntime.localStorage).not.toBe("available");
    expect(renderRuntime.sessionStorage).not.toBe("available");
    expect(renderRuntime.indexedDB).not.toBe("available");

    await assertInvalidHostMessageIgnored(sidePanelPage, {
      contractVersion: 1,
      type: "preview.host.failure",
      requestId: session.requestId,
      sessionNonce: "00000000000000000000000000000000",
      category: "runtime_failed",
      message: "wrong host nonce"
    });

    await assertInvalidRenderMessageIgnored(sidePanelPage, {
      contractVersion: 1,
      type: "preview.render.failure",
      requestId: session.requestId,
      sessionNonce: "00000000000000000000000000000000",
      category: "runtime_failed",
      message: "wrong render nonce"
    });

    await assertInvalidHostMessageIgnored(sidePanelPage, {
      contractVersion: 1,
      type: "preview.host.failure",
      requestId: "preview-00000000000000000000000000000000",
      sessionNonce: session.sessionNonce,
      category: "runtime_failed",
      message: "stale host request"
    });

    await assertInvalidRenderMessageIgnored(sidePanelPage, {
      contractVersion: 1,
      type: "preview.render.failure",
      requestId: "preview-00000000000000000000000000000000",
      sessionNonce: session.sessionNonce,
      category: "runtime_failed",
      message: "stale render request"
    });

    await assertInvalidHostMessageIgnored(sidePanelPage, {
      contractVersion: 1,
      type: "preview.host.failure",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "runtime_failed",
      message: "unknown host field",
      code: "export function ShouldNotCross() {}"
    });

    await assertInvalidRenderMessageIgnored(sidePanelPage, {
      contractVersion: 1,
      type: "preview.render.failure",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "runtime_failed",
      message: "unknown render field",
      source: "untrusted generated source"
    });

    await assertInvalidHostMessageIgnored(sidePanelPage, {
      contractVersion: 1,
      type: "preview.host.failure",
      requestId: session.requestId,
      category: "runtime_failed",
      message: "malformed host message"
    });

    await assertInvalidRenderMessageIgnored(sidePanelPage, {
      contractVersion: 1,
      type: "preview.render.failure",
      sessionNonce: session.sessionNonce,
      category: "runtime_failed",
      message: "malformed render message"
    });

    await assertUnrelatedSourceMessagesIgnored(sidePanelPage, session);

    const oldWindows = await getPreviewWindowTokens(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Close trusted fixture preview" }).click();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Open trusted fixture preview" }).click();
    await assertSiblingFramesAndTrustedFixture(sidePanelPage);
    const reopenedSession = await getRecordedPreviewSession(sidePanelPage);
    const reopenedWindows = await getPreviewWindowTokens(sidePanelPage);
    expect(reopenedSession.requestId).not.toBe(session.requestId);
    expect(reopenedSession.sessionNonce).not.toBe(session.sessionNonce);
    expect(reopenedWindows.hostWindowToken).not.toBe(oldWindows.hostWindowToken);
    expect(reopenedWindows.renderWindowToken).not.toBe(oldWindows.renderWindowToken);

    await sidePanelPage.getByRole("button", { name: "Close trusted fixture preview" }).click();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("disposes both sibling frames on timeout and reopens with a fresh successful session", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) {
        httpRequests.push(request.url());
      }
    });

    await blockRenderRealm(context, extensionId);
    const target = await seedGeneratedPreviewFixture(page);
    await installPreviewMessageRecorder(page);
    await openGeneratedPreview(page, target.title);

    await expect(page.getByText(/Trusted preview fixture timed out/)).toBeVisible({ timeout: 6_000 });
    await expect(page.locator(".preview-sandbox-frame")).toHaveCount(0);
    await expect(page.locator("pre.generated-code code")).toContainText("return <div>AI source must stay inert</div>;");
    expect(httpRequests).toEqual([]);

    await page.getByRole("button", { name: "Close trusted fixture preview" }).click();
    await page.getByRole("button", { name: "Open trusted fixture preview" }).click();
    await assertSiblingFramesAndTrustedFixture(page);
    const reopenedSession = await getRecordedPreviewSession(page);
    expect(reopenedSession.requestId).not.toBe("");
    expect(reopenedSession.sessionNonce).not.toBe("");
    await page.close();
  });

  test("disposes both sibling frames on non-timeout runtime failure and reopens successfully", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) {
        httpRequests.push(request.url());
      }
    });

    await failRenderRealmWithRuntimeFailure(context, extensionId);
    const target = await seedGeneratedPreviewFixture(page);
    await installPreviewMessageRecorder(page);
    await openGeneratedPreview(page, target.title);

    await expect(page.getByText("Trusted fixture runtime failure.")).toBeVisible();
    await expect(page.locator(".preview-sandbox-frame")).toHaveCount(0);
    await expect(page.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toHaveCount(0);
    await expect(page.locator("pre.generated-code code")).toContainText("return <div>AI source must stay inert</div>;");
    expect(httpRequests).toEqual([]);
    const failedSession = await getRecordedPreviewSession(page);

    await page.getByRole("button", { name: "Close trusted fixture preview" }).click();
    await page.getByRole("button", { name: "Open trusted fixture preview" }).click();
    await assertSiblingFramesAndTrustedFixture(page);
    const reopenedSession = await getRecordedPreviewSession(page);
    expect(reopenedSession.requestId).not.toBe(failedSession.requestId);
    expect(reopenedSession.sessionNonce).not.toBe(failedSession.sessionNonce);
    await page.close();
  });
});

async function seedGeneratedPreviewFixture(page: Page) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  const target = seeded[0];
  await putGeneratedVersion(page, createGeneratedVersionEntry(target.record.id, target.savedAt));
  return target;
}

async function openGeneratedPreview(page: Page, title: string) {
  await page.getByRole("button", { name: `Open saved capture: ${title}` }).click();
  await page.getByRole("button", { name: /PreviewFixture/ }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator("pre.generated-code code")).toContainText("export function PreviewFixture");
  await page.getByRole("button", { name: "Open trusted fixture preview" }).click();
}

async function assertSiblingFramesAndTrustedFixture(page: Page) {
  const hostFrameElement = page.locator(".preview-sandbox-host-frame");
  const renderFrameElement = page.locator(".preview-sandbox-render-frame");
  const renderFrame = page.frameLocator(".preview-sandbox-render-frame");

  await expect(page.locator(".preview-sandbox-frame")).toHaveCount(2);
  await expect(hostFrameElement).toHaveAttribute("src", /src\/preview\/host\.html$/);
  await expect(renderFrameElement).toHaveAttribute("src", /src\/preview\/render-realm\.html$/);
  await expect(hostFrameElement).not.toHaveAttribute("srcdoc", /.*/);
  await expect(renderFrameElement).not.toHaveAttribute("srcdoc", /.*/);
  await expect(hostFrameElement).not.toHaveAttribute("src", /^blob:|^data:/);
  await expect(renderFrameElement).not.toHaveAttribute("src", /^blob:|^data:/);
  await expect(page.locator(".preview-sandbox-panel > .preview-sandbox-frame-row > iframe")).toHaveCount(2);
  await expect(page.frameLocator(".preview-sandbox-host-frame").locator("iframe")).toHaveCount(0);
  await expect(renderFrame.getByText("Trusted packaged fixture")).toBeVisible();
  await expect(renderFrame.getByRole("heading", { name: "Preview sandbox boundary" })).toBeVisible();
  await expect(renderFrame.locator("[data-renderer='react-create-root']")).toBeVisible();
  await expect(renderFrame.getByText("AI source must stay inert")).toHaveCount(0);
  await expect(page.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();
}

async function assertInvalidHostMessageIgnored(page: Page, message: Record<string, unknown>) {
  await getFrame(page, "src/preview/host.html").evaluate((payload) => window.parent.postMessage(payload, "*"), message);
  await expect(page.getByText(String(message.message ?? ""))).toHaveCount(0);
  await expect(page.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();
}

async function assertInvalidRenderMessageIgnored(page: Page, message: Record<string, unknown>) {
  await getFrame(page, "src/preview/render-realm.html").evaluate((payload) => window.parent.postMessage(payload, "*"), message);
  await expect(page.getByText(String(message.message ?? ""))).toHaveCount(0);
  await expect(page.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();
}

async function assertUnrelatedSourceMessagesIgnored(page: Page, session: { requestId: string; sessionNonce: string }) {
  await page.evaluate(() => {
    const existing = document.querySelector("[data-preview-test-source='unrelated']");
    if (existing?.parentElement) {
      existing.parentElement.removeChild(existing);
    }
    const iframe = document.createElement("iframe");
    iframe.dataset.previewTestSource = "unrelated";
    iframe.src = "about:blank";
    document.body.append(iframe);
  });

  const unrelatedElement = await page.locator("iframe[data-preview-test-source='unrelated']").elementHandle();
  const unrelatedFrame = await unrelatedElement?.contentFrame();
  if (!unrelatedFrame) {
    throw new Error("Expected unrelated source iframe.");
  }

  await unrelatedFrame.evaluate(
    (message) => {
      window.parent.postMessage(message, "*");
    },
    {
      contractVersion: 1,
      type: "preview.host.failure",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "runtime_failed",
      message: "unrelated host source"
    }
  );
  await expect(page.getByText("unrelated host source")).toHaveCount(0);
  await expect(page.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();

  await unrelatedFrame.evaluate(
    (message) => {
      window.parent.postMessage(message, "*");
    },
    {
      contractVersion: 1,
      type: "preview.render.failure",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "runtime_failed",
      message: "unrelated render source"
    }
  );
  await expect(page.getByText("unrelated render source")).toHaveCount(0);
  await expect(page.getByText(/Trusted fixture rendered in an isolated sandbox realm/)).toBeVisible();

  await page.locator("iframe[data-preview-test-source='unrelated']").evaluate((iframe) => {
    iframe.parentElement?.removeChild(iframe);
  });
}

async function installPreviewMessageRecorder(page: Page) {
  await page.evaluate(() => {
    const store = {
      messages: [] as Array<{ source: "host" | "render" | "other"; data: unknown }>
    };
    Object.assign(window, { __ecPreviewMessages: store });
    window.addEventListener("message", (event) => {
      const host = document.querySelector(".preview-sandbox-host-frame") as HTMLIFrameElement | null;
      const render = document.querySelector(".preview-sandbox-render-frame") as HTMLIFrameElement | null;
      const source = event.source === host?.contentWindow ? "host" : event.source === render?.contentWindow ? "render" : "other";
      store.messages.push({ source, data: event.data });
    });
  });
}

async function getRecordedPreviewSession(page: Page) {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ source: string; data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
        const ready = [...messages].reverse().find((message) => {
          const data = message.data as { type?: string };
          return message.source === "host" && data.type === "preview.host.ready";
        })?.data as { requestId?: string; sessionNonce?: string } | undefined;
        return ready?.requestId && ready.sessionNonce ? `${ready.requestId}:${ready.sessionNonce}` : "";
      });
    })
    .not.toBe("");

  return page.evaluate(() => {
    const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ source: string; data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
    const ready = [...messages].reverse().find((message) => {
      const data = message.data as { type?: string };
      return message.source === "host" && data.type === "preview.host.ready";
    })?.data as { requestId: string; sessionNonce: string };
    return { requestId: ready.requestId, sessionNonce: ready.sessionNonce };
  });
}

async function recordedMessagesContainExecutableSource(page: Page) {
  return page.evaluate(() => {
    const forbiddenKeys = new Set(["code", "source", "html", "jsx", "tsx", "javascript", "script", "css", "tailwind", "componentSource", "generatedCode", "compiledCode"]);
    const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
    return messages.some((message) => {
      if (!message.data || typeof message.data !== "object" || Array.isArray(message.data)) {
        return false;
      }
      return Object.keys(message.data).some((key) => forbiddenKeys.has(key));
    });
  });
}

async function blockRenderRealm(context: BrowserContext, extensionId: string) {
  const renderRealmBundlePattern = new RegExp(`^chrome-extension://${extensionId}/assets/previewRenderRealm\\.js$`);
  await context.route(renderRealmBundlePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: ""
    });
    await context.unroute(renderRealmBundlePattern);
  });
}

async function failRenderRealmWithRuntimeFailure(context: BrowserContext, extensionId: string) {
  const renderRealmBundlePattern = new RegExp(`^chrome-extension://${extensionId}/assets/previewRenderRealm\\.js$`);
  await context.route(renderRealmBundlePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
let activeSession = null;
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "preview.render.init") {
    activeSession = {
      requestId: message.requestId,
      sessionNonce: message.sessionNonce
    };
    window.parent.postMessage({
      contractVersion: 1,
      type: "preview.render.ready",
      requestId: activeSession.requestId,
      sessionNonce: activeSession.sessionNonce
    }, "*");
    return;
  }
  if (message.type === "preview.render.request" && activeSession) {
    window.parent.postMessage({
      contractVersion: 1,
      type: "preview.render.failure",
      requestId: message.requestId,
      sessionNonce: message.sessionNonce,
      category: "runtime_failed",
      message: "Trusted fixture runtime failure."
    }, "*");
  }
});
`
    });
    await context.unroute(renderRealmBundlePattern);
  });
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
