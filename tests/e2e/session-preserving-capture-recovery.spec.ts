import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const root = join(import.meta.dirname, "../..");

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function countMatches(source: string, pattern: string | RegExp) {
  return source.match(typeof pattern === "string" ? new RegExp(pattern, "g") : pattern)?.length ?? 0;
}

test.describe("M10 Slice 1 session-preserving capture recovery", () => {
  test("Start Capture uses existing content runtime without programmatic injection", () => {
    const serviceWorker = readProjectFile("extension/src/background/service-worker.ts");
    const firstMessageIndex = serviceWorker.indexOf("await chrome.tabs.sendMessage(activeTab.id, contentMessage);");
    const injectionIndex = serviceWorker.indexOf("await injectContentScriptForStartRecovery(activeTab.id);");

    expect(firstMessageIndex).toBeGreaterThan(-1);
    expect(injectionIndex).toBeGreaterThan(firstMessageIndex);
    expect(serviceWorker).toContain("return { ok: true } satisfies SelectionCommandResponse;");
  });

  test("missing Start Capture runtime injects exactly once and retries exactly once", () => {
    const serviceWorker = readProjectFile("extension/src/background/service-worker.ts");

    expect(countMatches(serviceWorker, "chrome.tabs.sendMessage\\(activeTab.id, contentMessage\\)")).toBe(2);
    expect(countMatches(serviceWorker, "injectContentScriptForStartRecovery\\(activeTab.id\\)")).toBe(1);
    expect(countMatches(serviceWorker, "chrome.scripting.executeScript")).toBe(1);
    expect(serviceWorker).toContain('command !== "EC_START_SELECTION" || !isMissingContentRuntimeError(error)');
    expect(serviceWorker).toContain('files: ["content/content-script.js"]');
    expect(serviceWorker).toContain("allFrames: false");
  });

  test("injection failure and retry failure fail closed without a recovery loop", () => {
    const serviceWorker = readProjectFile("extension/src/background/service-worker.ts");
    const recoveryStart = serviceWorker.indexOf("try {\n    await injectContentScriptForStartRecovery(activeTab.id);");
    const recoveryEnd = serviceWorker.indexOf("\n}\n\nfunction isSupportedPageUrl", recoveryStart);
    const recoveryBlock = serviceWorker.slice(recoveryStart, recoveryEnd);

    expect(recoveryBlock).toContain("await injectContentScriptForStartRecovery(activeTab.id);");
    expect(recoveryBlock).toContain("await chrome.tabs.sendMessage(activeTab.id, contentMessage);");
    expect(recoveryBlock).toContain("isProtectedInjectionError(error) ? protectedPageMessage : startRecoveryAccessMessage");
    expect(countMatches(recoveryBlock, "injectContentScriptForStartRecovery")).toBe(1);
    expect(countMatches(recoveryBlock, "chrome.tabs.sendMessage")).toBe(1);
  });

  test("unsupported and browser-protected URLs do not reach recovery injection", () => {
    const serviceWorker = readProjectFile("extension/src/background/service-worker.ts");
    const unsupportedGuardIndex = serviceWorker.indexOf("if (activeTab.url && !isSupportedPageUrl(activeTab.url))");
    const injectionIndex = serviceWorker.indexOf("await injectContentScriptForStartRecovery(activeTab.id);");

    expect(unsupportedGuardIndex).toBeGreaterThan(-1);
    expect(injectionIndex).toBeGreaterThan(unsupportedGuardIndex);
    expect(serviceWorker).toContain("!isChromeWebStoreUrl(url)");
    expect(serviceWorker).toContain("isProtectedInjectionError(error) ? protectedPageMessage : startRecoveryAccessMessage");
    expect(serviceWorker).toContain("Cannot access a chrome:// URL");
    expect(serviceWorker).toContain('parsedUrl.hostname === "chromewebstore.google.com"');
    expect(serviceWorker).toContain('parsedUrl.hostname === "chrome.google.com" && parsedUrl.pathname.startsWith("/webstore")');
  });

  test("Cancel, Parent, Child, and Confirm never trigger recovery injection", () => {
    const serviceWorker = readProjectFile("extension/src/background/service-worker.ts");

    expect(serviceWorker).toContain('command !== "EC_START_SELECTION" || !isMissingContentRuntimeError(error)');
    for (const command of ["EC_CANCEL_SELECTION", "EC_REFINE_PARENT", "EC_REFINE_CHILD", "EC_CONFIRM_SELECTION"]) {
      expect(serviceWorker).toContain(`message.type === "${command}"`);
    }
    expect(countMatches(serviceWorker, "chrome.scripting.executeScript")).toBe(1);
  });

  test("recovery does not reload, navigate, recreate tabs, or broaden privileged APIs", () => {
    const serviceWorker = readProjectFile("extension/src/background/service-worker.ts");

    expect(serviceWorker).not.toMatch(/chrome\.tabs\.(reload|update|create)\s*\(/);
    expect(serviceWorker).not.toContain("<all_urls>");
    expect(serviceWorker).not.toMatch(/\bwebRequest\b/);
    expect(serviceWorker).not.toMatch(/\bdownloads\b/);
  });

  test("content script reinjection is idempotent and disposes stale runtime state", () => {
    const contentScript = readProjectFile("extension/src/content/index.ts");

    expect(contentScript).toContain('const contentRuntimeKey = "__ELEMENT_CATCHER_CONTENT_RUNTIME__";');
    expect(contentScript).toContain("contentRuntimeGlobal[contentRuntimeKey]?.dispose();");
    expect(contentScript).toContain("cleanupSelectionMode();");
    expect(contentScript).toContain("chrome.runtime.onMessage.removeListener(handleRuntimeMessage);");
    expect(contentScript).toContain("chrome.runtime.onMessage.addListener(handleRuntimeMessage);");
    expect(countMatches(contentScript, "chrome.runtime.onMessage.addListener")).toBe(1);
    expect(countMatches(contentScript, "document.addEventListener")).toBe(3);
    expect(countMatches(contentScript, "window.addEventListener")).toBe(2);
  });

  test("built manifest keeps exactly the approved M10 permission and no host broadening", () => {
    const manifest = JSON.parse(readProjectFile("dist/manifest.json")) as {
      permissions?: string[];
      host_permissions?: string[];
      content_scripts?: Array<{ matches?: string[] }>;
    };

    expect(manifest.permissions?.sort()).toEqual(["activeTab", "scripting", "sidePanel"]);
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
    expect(manifest.content_scripts?.[0]?.matches).toEqual(["http://*/*", "https://*/*"]);
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("webRequest");
    expect(manifest.permissions).not.toContain("identity");
    expect(manifest.permissions).not.toContain("downloads");
    expect(manifest.host_permissions).not.toContain("<all_urls>");
  });
});
