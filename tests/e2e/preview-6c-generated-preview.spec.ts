import { test, expect, openSidePanelPage } from "./extension-fixture";
import type { BrowserContext, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PREVIEW_CLASS_TOKENS } from "../../extension/src/shared/preview-policy";
import {
  assertSiblingFramesAndGeneratedPreview,
  createUnrelatedPreviewMessageFrame,
  getRecordedPreviewSession,
  installRenderInboundRecorder,
  installPreviewMessageRecorder,
  openGeneratedPreview,
  postCyclicMessageFromNamedFrameToParent,
  postMessageFromFrameToParent,
  previewFrameBySuffix,
  removeNamedFrame,
  renderMessagesContainGeneratedSource,
  seedGeneratedPreviewVersion,
  validPreviewCode
} from "./preview-helpers";

test.describe("Milestone 6C safe generated component preview", () => {
  test("bounded utility CSS is exactly in parity with the approved token registry", async () => {
    const css = readFileSync(resolve(process.cwd(), "extension/src/preview/preview-utilities.css"), "utf8");
    const selectors = [...css.matchAll(/^\.([A-Za-z0-9_-]+)\s*\{/gm)].map((match) => match[1]).sort();
    expect(selectors).toEqual([...PREVIEW_CLASS_TOKENS].sort());
  });

  test("previews a valid generated version through host plan and render plan only", async ({ sidePanelPage }) => {
    const httpRequests: string[] = [];
    sidePanelPage.on("request", (request) => {
      if (/^https?:/.test(request.url())) httpRequests.push(request.url());
    });
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installRenderInboundRecorder(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    await expect(sidePanelPage.locator("pre.generated-code code")).toContainText("export function PreviewCard");
    expect(await renderMessagesContainGeneratedSource(sidePanelPage)).toBe(false);
    expect(await renderRealmReceivedPlanWithoutSource(sidePanelPage)).toBe(true);
    expect(await hasPlanSuccessWithHashes(sidePanelPage)).toBe(true);
    expect(httpRequests).toEqual([]);
  });

  test("applies representative bounded utility CSS in real Chromium", async ({ sidePanelPage }) => {
    const code = "export function PreviewCard() {\n  return <section className=\"grid gap-2 w-full p-4 border rounded-md bg-blue-600\"><div className=\"flex gap-2\"><h2 className=\"text-lg font-semibold text-white\">Styled</h2><p className=\"text-sm text-slate-600 bg-white\">Body</p></div></section>;\n}";
    const target = await seedGeneratedPreviewVersion(sidePanelPage, code);
    await openGeneratedPreview(sidePanelPage, target.title);
    await expect(sidePanelPage.locator(".preview-sandbox-frame")).toHaveCount(2);
    await expect(sidePanelPage.getByText("Preview ready", { exact: true })).toBeVisible();
    const styles = await previewFrameBySuffix(sidePanelPage, "src/preview/render-realm.html").evaluate(() => {
      const section = document.querySelector("section") as HTMLElement;
      const row = document.querySelector("div") as HTMLElement;
      const heading = document.querySelector("h2") as HTMLElement;
      const body = document.querySelector("p") as HTMLElement;
      const parent = section.parentElement as HTMLElement;
      const read = (element: HTMLElement) => getComputedStyle(element);
      const parentStyle = read(parent);
      return {
        section: {
          display: read(section).display,
          gap: read(section).gap,
          width: read(section).width,
          rectWidth: section.getBoundingClientRect().width,
          paddingTop: read(section).paddingTop,
          borderTopWidth: read(section).borderTopWidth,
          borderTopStyle: read(section).borderTopStyle,
          borderRadius: read(section).borderRadius,
          backgroundColor: read(section).backgroundColor
        },
        parentContentWidth: parent.clientWidth - Number.parseFloat(parentStyle.paddingLeft) - Number.parseFloat(parentStyle.paddingRight),
        row: { display: read(row).display, gap: read(row).gap },
        heading: { fontSize: read(heading).fontSize, fontWeight: read(heading).fontWeight, color: read(heading).color },
        body: { color: read(body).color, backgroundColor: read(body).backgroundColor }
      };
    });
    expect(styles.section.display).toBe("grid");
    expect(styles.section.gap).toBe("8px");
    expect(Math.abs(styles.section.rectWidth - styles.parentContentWidth)).toBeLessThanOrEqual(1);
    expect(styles.section.paddingTop).toBe("16px");
    expect(styles.section.borderTopWidth).toBe("1px");
    expect(styles.section.borderTopStyle).toBe("solid");
    expect(styles.section.borderRadius).toBe("6px");
    expect(styles.section.backgroundColor).toBe("rgb(37, 99, 235)");
    expect(styles.row.display).toBe("flex");
    expect(styles.row.gap).toBe("8px");
    expect(styles.heading.fontSize).toBe("18px");
    expect(styles.heading.fontWeight).toBe("600");
    expect(styles.heading.color).toBe("rgb(255, 255, 255)");
    expect(styles.body.color).toBe("rgb(71, 85, 105)");
    expect(styles.body.backgroundColor).toBe("rgb(255, 255, 255)");
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
    ["duplicate className", "export function PreviewCard() { return <div className=\"p-4\" className=\"p-2\">x</div>; }"],
    ["duplicate role", "export function PreviewCard() { return <div role=\"region\" role=\"status\">x</div>; }"],
    ["duplicate aria-label", "export function PreviewCard() { return <div aria-label=\"one\" aria-label=\"two\">x</div>; }"],
    ["program directives", "\"use strict\";\nexport function PreviewCard() { return <div />; }"],
    ["function directives", "export function PreviewCard() { \"use strict\"; return <div />; }"],
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

  test("keeps JSX comments inert while rendering allowed JSX", async ({ sidePanelPage }) => {
    const code = "export function PreviewCard() { return <div className=\"p-4\">{/* comment stays inert */}Visible</div>; }";
    const target = await seedGeneratedPreviewVersion(sidePanelPage, code);
    await openGeneratedPreview(sidePanelPage, target.title);
    await expect(sidePanelPage.getByText("Preview ready", { exact: true })).toBeVisible();
    await expect(sidePanelPage.frameLocator(".preview-sandbox-render-frame").getByText("Visible")).toBeVisible();
  });

  test("blocks a UTF-8 source request that exceeds the protocol message limit before timeout", async ({ sidePanelPage }) => {
    const code = `export function PreviewCard() { return <div>${"😀".repeat(8130)}</div>; }`;
    const target = await seedGeneratedPreviewVersion(sidePanelPage, code);
    await openGeneratedPreview(sidePanelPage, target.title);
    await expect(sidePanelPage.getByText("Preview unavailable")).toBeVisible();
    await expect(sidePanelPage.getByText("message size limit")).toBeVisible();
    await expect(sidePanelPage.locator(".preview-sandbox-frame")).toHaveCount(0);
  });

  test("rejects stale and malformed production messages while keeping the active preview safe", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    const session = await getRecordedPreviewSession(sidePanelPage);
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/host.html", {
      contractVersion: 2,
      type: "preview.plan.failure.v2",
      requestId: "preview-00000000000000000000000000000000",
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["stale replay"]
    });
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/render-realm.html", {
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

  test("ignores a current host preview.render.success.v2 direction-confusion message", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/host.html", {
      contractVersion: 2,
      type: "preview.render.success.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce
    });
    await expectPreviewStillReadyAndSilent(sidePanelPage, []);
  });

  test("ignores a current host preview.render.failure.v2 direction-confusion message", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/host.html", {
      contractVersion: 2,
      type: "preview.render.failure.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["host sent render failure"]
    });
    await expectPreviewStillReadyAndSilent(sidePanelPage, ["host sent render failure"]);
  });

  test("ignores a current render preview.host.ready.v2 direction-confusion message", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/render-realm.html", {
      contractVersion: 2,
      type: "preview.host.ready.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce
    });
    await expectPreviewStillReadyAndSilent(sidePanelPage, []);
  });

  test("ignores a current render preview.plan.failure.v2 direction-confusion message", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);
    await postMessageFromFrameToParent(sidePanelPage, "src/preview/render-realm.html", {
      contractVersion: 2,
      type: "preview.plan.failure.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["render sent plan failure"]
    });
    await expectPreviewStillReadyAndSilent(sidePanelPage, ["render sent plan failure"]);
  });

  test("ignores a cyclic oversized wrong-window message before protocol traversal", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const session = await getRecordedPreviewSession(sidePanelPage);
    const unrelatedFrameName = await createUnrelatedPreviewMessageFrame(sidePanelPage);
    await postCyclicMessageFromNamedFrameToParent(sidePanelPage, unrelatedFrameName, {
      contractVersion: 2,
      type: "preview.plan.failure.v2",
      requestId: session.requestId,
      sessionNonce: session.sessionNonce,
      category: "policy",
      diagnostics: ["wrong-window cyclic payload"]
    });
    await expectPreviewStillReadyAndSilent(sidePanelPage, ["wrong-window cyclic payload"]);
    await removeNamedFrame(sidePanelPage, unrelatedFrameName);
  });

  test("ignores stale trusted validation errors after a preview is closed and reopened", async ({ sidePanelPage }) => {
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installRejectableSecondSidePanelDigest(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await expect.poll(() => sidePanelPage.evaluate(() => Boolean((window as unknown as { __ecPausedPreviewDigest?: boolean }).__ecPausedPreviewDigest))).toBe(true);
    const staleSession = await getRecordedPreviewSession(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "Close preview" }).first().click();
    await expect(sidePanelPage.locator(".preview-sandbox-frame")).toHaveCount(0);
    await sidePanelPage.evaluate(() => {
      (window as unknown as { __ecRejectPausedPreviewDigest?: () => void }).__ecRejectPausedPreviewDigest?.();
    });
    await sidePanelPage.getByRole("button", { name: "Preview", exact: true }).click();
    await assertSiblingFramesAndGeneratedPreview(sidePanelPage);
    const freshSession = await getRecordedPreviewSession(sidePanelPage);
    expect(freshSession.requestId).not.toBe(staleSession.requestId);
    expect(freshSession.sessionNonce).not.toBe(staleSession.sessionNonce);
    await expectPreviewStillReadyAndSilent(sidePanelPage, ["forced stale plan hash failure"]);
  });

  test("duplicate host source request during planning emits one failure and no later success", async ({ sidePanelPage }) => {
    await installNeverResolvingHostDigest(sidePanelPage);
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    const session = await getRecordedPreviewSession(sidePanelPage);
    const sourceSha256 = await sidePanelPage.evaluate(async (source) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }, validPreviewCode());
    await sidePanelPage.evaluate(
      ({ session, sourceSha256, source }) => {
        const host = document.querySelector(".preview-sandbox-host-frame") as HTMLIFrameElement;
        host.contentWindow?.postMessage(
          {
            contractVersion: 2,
            type: "preview.source.request.v2",
            requestId: session.requestId,
            sessionNonce: session.sessionNonce,
            expectedComponentName: "PreviewCard",
            source,
            sourceSha256
          },
          "*"
        );
      },
      { session, sourceSha256, source: validPreviewCode() }
    );
    await expect(sidePanelPage.getByText("Preview unavailable")).toBeVisible();
    expect(await countPreviewMessages(sidePanelPage, "host", "preview.plan.failure.v2")).toBe(1);
    expect(await countPreviewMessages(sidePanelPage, "host", "preview.plan.success.v2")).toBe(0);
  });

  test("duplicate render plan during rendering emits one failure and no React success", async ({ sidePanelPage }) => {
    await installNeverResolvingRenderDigest(sidePanelPage);
    const target = await seedGeneratedPreviewVersion(sidePanelPage);
    await installRenderInboundRecorder(sidePanelPage);
    await installPreviewMessageRecorder(sidePanelPage);
    await openGeneratedPreview(sidePanelPage, target.title);
    await expect(sidePanelPage.locator(".preview-sandbox-frame")).toHaveCount(2);
    await expect
      .poll(async () =>
        sidePanelPage.frames().find((candidate) => candidate.url().endsWith("src/preview/render-realm.html"))?.evaluate(() => {
          const messages = (window as unknown as { __ecRenderInboundMessages?: { messages: unknown[] } }).__ecRenderInboundMessages?.messages ?? [];
          return messages.find((message) => (message as { type?: string }).type === "preview.render.plan.v2") ?? null;
        }) ?? null
      )
      .not.toBeNull();
    const duplicatePlan = await previewFrameBySuffix(sidePanelPage, "src/preview/render-realm.html").evaluate(() => {
      const messages = (window as unknown as { __ecRenderInboundMessages?: { messages: unknown[] } }).__ecRenderInboundMessages?.messages ?? [];
      return messages.find((message) => (message as { type?: string }).type === "preview.render.plan.v2") as Record<string, unknown>;
    });
    await sidePanelPage.evaluate((message) => {
      const render = document.querySelector(".preview-sandbox-render-frame") as HTMLIFrameElement;
      render.contentWindow?.postMessage(message, "*");
    }, duplicatePlan);
    await expect(sidePanelPage.getByText("Preview failed", { exact: true })).toBeVisible();
    expect(await countPreviewMessages(sidePanelPage, "render", "preview.render.failure.v2")).toBe(1);
    expect(await countPreviewMessages(sidePanelPage, "render", "preview.render.success.v2")).toBe(0);
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

async function renderRealmReceivedPlanWithoutSource(page: Page) {
  return previewFrameBySuffix(page, "src/preview/render-realm.html").evaluate(() => {
    const messages = (window as unknown as { __ecRenderInboundMessages?: { messages: unknown[] } }).__ecRenderInboundMessages?.messages ?? [];
    return messages.some((message) => {
      const data = message as { type?: string; renderPlan?: unknown; sourceSha256?: string; planSha256?: string; source?: unknown };
      const text = JSON.stringify(data);
      return data.type === "preview.render.plan.v2" && !!data.renderPlan && /^[a-f0-9]{64}$/.test(data.sourceSha256 ?? "") && /^[a-f0-9]{64}$/.test(data.planSha256 ?? "") && data.source === undefined && !text.includes("export function") && !text.includes("React.createElement");
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

async function blockRenderRealm(context: BrowserContext, extensionId: string) {
  const renderRealmBundlePattern = new RegExp(`^chrome-extension://${extensionId}/assets/previewRenderRealm\\.js$`);
  await context.route(renderRealmBundlePattern, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    await context.unroute(renderRealmBundlePattern);
  });
}

async function countPreviewMessages(page: Page, source: string, type: string) {
  return page.evaluate(
    ({ source, type }) => {
      const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ source: string; data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
      return messages.filter((message) => message.source === source && (message.data as { type?: string }).type === type).length;
    },
    { source, type }
  );
}

async function expectPreviewStillReadyAndSilent(page: Page, diagnostics: string[]) {
  await expect(page.getByText("Preview ready", { exact: true })).toBeVisible();
  await expect(page.getByText("Preview unavailable")).toHaveCount(0);
  await expect(page.getByText("Preview failed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Preview timed out", { exact: true })).toHaveCount(0);
  await expect(page.locator(".preview-sandbox-frame")).toHaveCount(2);
  for (const diagnostic of diagnostics) {
    await expect(page.getByText(diagnostic)).toHaveCount(0);
  }
}

async function installRejectableSecondSidePanelDigest(page: Page) {
  await page.evaluate(() => {
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let digestCalls = 0;
    Object.assign(window, { __ecPausedPreviewDigest: false, __ecRejectPausedPreviewDigest: undefined });
    Object.defineProperty(crypto.subtle, "digest", {
      configurable: true,
      value(algorithm: AlgorithmIdentifier, data: BufferSource) {
        digestCalls += 1;
        if (digestCalls === 2) {
          return new Promise<ArrayBuffer>((_resolve, reject) => {
            Object.assign(window, {
              __ecPausedPreviewDigest: true,
              __ecRejectPausedPreviewDigest: () => reject(new Error("forced stale plan hash failure"))
            });
          });
        }
        return originalDigest(algorithm, data);
      }
    });
  });
}

async function installNeverResolvingHostDigest(page: Page) {
  await page.context().addInitScript(() => {
    if (!location.href.endsWith("/src/preview/host.html")) return;
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let blocked = false;
    Object.defineProperty(crypto.subtle, "digest", {
      configurable: true,
      value(algorithm: AlgorithmIdentifier, data: BufferSource) {
        if (!blocked) {
          blocked = true;
          return new Promise<ArrayBuffer>(() => undefined);
        }
        return originalDigest(algorithm, data);
      }
    });
  });
}

async function installNeverResolvingRenderDigest(page: Page) {
  await page.context().addInitScript(() => {
    if (!location.href.endsWith("/src/preview/render-realm.html")) return;
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let blocked = false;
    Object.defineProperty(crypto.subtle, "digest", {
      configurable: true,
      value(algorithm: AlgorithmIdentifier, data: BufferSource) {
        if (!blocked) {
          blocked = true;
          return new Promise<ArrayBuffer>(() => undefined);
        }
        return originalDigest(algorithm, data);
      }
    });
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
