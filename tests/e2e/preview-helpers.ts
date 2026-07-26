import { expect } from "./extension-fixture";
import { putGeneratedVersion, resetAndSeedSavedCaptures } from "./indexed-db-fixtures";
import type { Page } from "@playwright/test";

export async function seedGeneratedPreviewVersion(page: Page, code = validPreviewCode()) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  const target = seeded[0];
  await putGeneratedVersion(page, createGeneratedVersionEntry(target.record.id, target.savedAt, code));
  return target;
}

export async function openGeneratedPreview(page: Page, title: string) {
  await page.getByRole("button", { name: `Open saved capture: ${title}` }).click();
  await page.getByRole("button", { name: /PreviewCard/ }).click();
  await expect(page.locator("pre.generated-code code")).toContainText("export function PreviewCard");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
}

export async function assertSiblingFramesAndGeneratedPreview(page: Page) {
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
  await expect(renderFrame.getByText("AI source must stay inert")).toBeVisible();
  await expect(page.getByText("Preview ready", { exact: true })).toBeVisible();
}

export async function installPreviewMessageRecorder(page: Page) {
  await page.evaluate(() => {
    const store = { messages: [] as Array<{ source: "host" | "render" | "other"; data: unknown }> };
    Object.assign(window, { __ecPreviewMessages: store });
    window.addEventListener("message", (event) => {
      const host = document.querySelector(".preview-sandbox-host-frame") as HTMLIFrameElement | null;
      const render = document.querySelector(".preview-sandbox-render-frame") as HTMLIFrameElement | null;
      const source = event.source === host?.contentWindow ? "host" : event.source === render?.contentWindow ? "render" : "other";
      store.messages.push({ source, data: event.data });
    });
  });
}

export async function installRenderInboundRecorder(page: Page) {
  await page.context().addInitScript(() => {
    if (!location.href.endsWith("/src/preview/render-realm.html")) return;
    const store = { messages: [] as unknown[] };
    Object.assign(window, { __ecRenderInboundMessages: store });
    window.addEventListener(
      "message",
      (event) => {
        store.messages.push(event.data);
      },
      true
    );
  });
}

export async function getRecordedPreviewSession(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ source: string; data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
        const ready = [...messages].reverse().find((message) => message.source === "host" && (message.data as { type?: string }).type === "preview.host.ready.v2")?.data as { requestId?: string; sessionNonce?: string } | undefined;
        return ready?.requestId && ready.sessionNonce ? `${ready.requestId}:${ready.sessionNonce}` : "";
      })
    )
    .not.toBe("");
  return page.evaluate(() => {
    const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ source: string; data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
    const ready = [...messages].reverse().find((message) => message.source === "host" && (message.data as { type?: string }).type === "preview.host.ready.v2")?.data as { requestId: string; sessionNonce: string };
    return { requestId: ready.requestId, sessionNonce: ready.sessionNonce };
  });
}

export async function renderMessagesContainGeneratedSource(page: Page) {
  return page.evaluate(() => {
    const messages = (window as unknown as { __ecPreviewMessages?: { messages: Array<{ source: string; data: unknown }> } }).__ecPreviewMessages?.messages ?? [];
    return messages.some((message) => {
      if (message.source !== "render" || !message.data || typeof message.data !== "object") return false;
      const text = JSON.stringify(message.data);
      return text.includes("export function") || text.includes("AI source must stay inert");
    });
  });
}

export async function getPreviewWindowTokens(page: Page) {
  return page.evaluate(() => {
    const registry = (window as unknown as { __ecPreviewWindowTokens?: WeakMap<WindowProxy, string> }).__ecPreviewWindowTokens ?? new WeakMap<WindowProxy, string>();
    (window as unknown as { __ecPreviewWindowTokens?: WeakMap<WindowProxy, string> }).__ecPreviewWindowTokens = registry;
    const tokenFor = (frame: HTMLIFrameElement | null) => {
      const target = frame?.contentWindow;
      if (!target) return "";
      const existing = registry.get(target);
      if (existing) return existing;
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

export function previewFrameBySuffix(page: Page, pathSuffix: string) {
  const frame = page.frames().find((candidate) => candidate.url().endsWith(pathSuffix));
  if (!frame) throw new Error(`Expected preview frame ending with ${pathSuffix}.`);
  return frame;
}

export async function postMessageFromFrameToParent(page: Page, pathSuffix: string, message: Record<string, unknown>) {
  await previewFrameBySuffix(page, pathSuffix).evaluate((payload) => {
    parent.postMessage(payload, "*");
  }, message);
}

export async function createUnrelatedPreviewMessageFrame(page: Page) {
  const frameName = await page.evaluate(() => {
    const name = `ec-unrelated-${crypto.randomUUID()}`;
    const frame = document.createElement("iframe");
    frame.name = name;
    frame.src = "about:blank";
    frame.hidden = true;
    document.body.append(frame);
    return name;
  });
  await expect.poll(() => page.frame({ name: frameName })?.url() ?? "").toBe("about:blank");
  return frameName;
}

export async function postMessageFromNamedFrameToParent(page: Page, frameName: string, message: Record<string, unknown>) {
  const frame = page.frame({ name: frameName });
  if (!frame) throw new Error(`Expected unrelated frame named ${frameName}.`);
  await frame.evaluate((payload) => {
    parent.postMessage(payload, "*");
  }, message);
}

export async function postCyclicMessageFromNamedFrameToParent(page: Page, frameName: string, message: Record<string, unknown>) {
  const frame = page.frame({ name: frameName });
  if (!frame) throw new Error(`Expected unrelated frame named ${frameName}.`);
  await frame.evaluate((baseMessage) => {
    const payload: Record<string, unknown> = {
      ...baseMessage,
      nested: Array.from({ length: 256 }, (_, index) => ({ index, value: "x".repeat(256) }))
    };
    payload.self = payload;
    parent.postMessage(payload, "*");
  }, message);
}

export async function removeNamedFrame(page: Page, frameName: string) {
  await page.evaluate((name) => {
    document.querySelector(`iframe[name="${CSS.escape(name)}"]`)?.remove();
  }, frameName);
}

export function validPreviewCode() {
  return "export function PreviewCard() {\n  return <article className=\"p-4 border rounded-md bg-white\"><h2 className=\"text-lg font-semibold\">AI source must stay inert</h2><p className=\"text-sm text-slate-600\">Rendered from a safe plan.</p></article>;\n}";
}

function createGeneratedVersionEntry(sourceCaptureId: string, sourceCaptureSavedAt: string, code: string) {
  return {
    id: "generated-version-66666666-6666-6666-6666-666666666666",
    sourceCaptureId,
    sourceCaptureSavedAt,
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: "2026-07-18T14:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName: "PreviewCard",
      framework: "react",
      styling: "tailwind",
      code,
      summary: "Previewable component summary.",
      approximationNotes: ""
    }
  };
}
