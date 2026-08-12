import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const root = join(import.meta.dirname, "../..");

type RuntimeHarness = Window & {
  chrome: {
    runtime: {
      onMessage: {
        addListener: (listener: (message: unknown) => boolean) => void;
        removeListener: (listener: (message: unknown) => boolean) => void;
      };
      sendMessage: (message: unknown) => void;
    };
  };
  __ecRuntimeListeners: Array<(message: unknown) => boolean>;
  __ecRuntimeMessages: unknown[];
  __ecActivationCounts: {
    keydown: number;
    click: number;
  };
};

const contentScript = readFileSync(join(root, "dist/content/content-script.js"), "utf8");

test.describe("Milestone 11 Slice 2 Minimal Hover Capture Assist", () => {
  test("Enter quick-captures the highlighted hover state through the existing prepared-screenshot path", async ({ page }) => {
    const httpRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) {
        httpRequests.push(request.url());
      }
    });

    await openHarnessPage(page);
    await startSelection(page);
    await hoverTarget(page, "#hoverTarget");

    const overlayState = await getOverlayState(page);
    expect(overlayState.highlight).toMatchObject({
      display: "block",
      position: "fixed",
      pointerEvents: "none"
    });
    expect(overlayState.label).toMatchObject({
      display: "block",
      position: "fixed",
      pointerEvents: "none",
      left: 12,
      bottom: 12
    });
    const targetBox = await targetViewportBox(page, "#hoverTarget");
    expect(overlayState.highlight.left).toBeLessThanOrEqual(targetBox.left);
    expect(overlayState.highlight.top).toBeLessThanOrEqual(targetBox.top);
    expect(overlayState.highlight.right).toBeGreaterThanOrEqual(targetBox.right);
    expect(overlayState.highlight.bottomEdge).toBeGreaterThanOrEqual(targetBox.bottomEdge);
    expect(overlayState.highlight.width - targetBox.width).toBeLessThanOrEqual(4);
    expect(overlayState.highlight.height - targetBox.height).toBeLessThanOrEqual(4);
    expect(overlayState.label.left).not.toBeCloseTo(overlayState.highlight.left, 0);
    expect(overlayState.label.top).toBeGreaterThan(overlayState.highlight.bottomEdge);

    await page.locator("#hoverTarget").focus();
    await page.keyboard.press("Enter");

    const prepared = await waitForMessage(page, "EC_SELECTION_PREPARED_FOR_SCREENSHOT");
    expect(prepared).toMatchObject({
      type: "EC_SELECTION_PREPARED_FOR_SCREENSHOT",
      selection: {
        tagName: "button",
        id: "hoverTarget",
        textPreview: expect.stringContaining("Hover State Menu")
      },
      extraction: {
        source: {
          pageTitle: "Hover assist fixture"
        },
        element: {
          tagName: "button",
          id: "hoverTarget"
        },
        dom: expect.any(Object),
        styles: expect.any(Object),
        summaries: expect.any(Object)
      },
      screenshotCropRect: {
        width: expect.any(Number),
        height: expect.any(Number)
      }
    });
    expect(await getActivationCounts(page)).toEqual({ keydown: 0, click: 0 });
    expect(await countMessages(page, "EC_SELECTION_LOCKED")).toBe(1);
    expect(await countMessages(page, "EC_SELECTION_PREPARED_FOR_SCREENSHOT")).toBe(1);
    expect(httpRequests).toEqual([]);
  });

  test("repeated Enter while quick capture is in flight does not create duplicate completion", async ({ page }) => {
    await openHarnessPage(page);
    await startSelection(page);
    await hoverTarget(page, "#hoverTarget");

    await page.locator("#hoverTarget").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await waitForMessage(page, "EC_SELECTION_PREPARED_FOR_SCREENSHOT");
    expect(await countMessages(page, "EC_SELECTION_PREPARED_FOR_SCREENSHOT")).toBe(1);
  });

  test("existing click-to-lock, Parent, Child, Confirm, and Escape workflows remain working", async ({ page }) => {
    await openHarnessPage(page);
    await startSelection(page);
    await hoverTarget(page, "#childTarget");

    await page.mouse.click(...await centerOf(page, "#childTarget"));
    const lockedChild = await waitForMessage(page, "EC_SELECTION_LOCKED");
    expect(lockedChild).toMatchObject({
      lockedSelection: {
        selection: {
          id: "childTarget"
        },
        canSelectParent: true
      }
    });

    await dispatchContentMessage(page, { type: "EC_CONTENT_REFINE_PARENT" });
    const lockedParent = await lastMessage(page, "EC_SELECTION_LOCKED");
    expect(lockedParent).toMatchObject({
      lockedSelection: {
        selection: {
          id: "parentTarget"
        },
        canSelectChild: true
      }
    });

    await dispatchContentMessage(page, { type: "EC_CONTENT_REFINE_CHILD" });
    const relockedChild = await lastMessage(page, "EC_SELECTION_LOCKED");
    expect(relockedChild).toMatchObject({
      lockedSelection: {
        selection: {
          id: "childTarget"
        }
      }
    });

    await dispatchContentMessage(page, { type: "EC_CONTENT_CONFIRM_SELECTION" });
    await expect.poll(() => countMessages(page, "EC_SELECTION_PREPARED_FOR_SCREENSHOT")).toBe(1);

    await clearMessages(page);
    await startSelection(page);
    await hoverTarget(page, "#hoverTarget");
    await page.keyboard.press("Escape");
    await expect.poll(() => countMessages(page, "EC_SELECTION_CANCELLED")).toBe(1);
    expect(await countMessages(page, "EC_SELECTION_PREPARED_FOR_SCREENSHOT")).toBe(0);
  });

  test("Enter outside active selection mode is left to the webpage and produces no extension capture", async ({ page }) => {
    await openHarnessPage(page);

    await page.locator("#hoverTarget").focus();
    await page.keyboard.press("Enter");

    expect(await getActivationCounts(page)).toEqual({ keydown: 1, click: 1 });
    expect(await countMessages(page, "EC_SELECTION_PREPARED_FOR_SCREENSHOT")).toBe(0);
    expect(await countMessages(page, "EC_SELECTION_LOCKED")).toBe(0);
  });

  test("Manifest permissions and persisted schemas remain unchanged for hover capture assist", () => {
    const manifest = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8")) as {
      permissions?: string[];
      host_permissions?: string[];
      commands?: unknown;
      content_security_policy?: unknown;
    };
    expect(manifest.permissions?.sort()).toEqual(["activeTab", "scripting", "sidePanel"]);
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
    expect(manifest.commands).toBeUndefined();
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("webRequest");
    expect(manifest.permissions).not.toContain("identity");
    expect(manifest.permissions).not.toContain("cookies");
    expect(manifest.permissions).not.toContain("history");
    expect(manifest.host_permissions).not.toContain("<all_urls>");

    const captureSchema = readFileSync(join(root, "extension/src/shared/capture-schema.ts"), "utf8");
    const interactionSchema = readFileSync(join(root, "extension/src/shared/interaction-pair-contract.ts"), "utf8");
    expect(captureSchema).toContain("export type CaptureSchemaVersion = 1;");
    expect(captureSchema).not.toContain("HoverCapture");
    expect(interactionSchema).toContain("export const INTERACTION_PAIR_SCHEMA_VERSION = 1;");
    expect(interactionSchema).toContain('export const INTERACTION_PAIR_TRIGGERS = ["click", "toggle", "hover", "focus"] as const;');
    expect(interactionSchema).not.toContain("keyboard");
  });
});

async function openHarnessPage(page: Page) {
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <title>Hover assist fixture</title>
        <style>
          body {
            margin: 40px;
            font-family: system-ui, sans-serif;
          }

          #parentTarget {
            display: inline-block;
            padding: 20px;
            border: 1px solid #334155;
          }

          #hoverTarget {
            position: relative;
            min-width: 180px;
            min-height: 44px;
            padding: 10px 14px;
            border: 1px solid #2563eb;
            background: #ffffff;
            color: #172033;
          }

          #hoverTarget .hover-panel {
            display: none;
            margin-top: 8px;
            padding: 8px;
            border: 1px solid #15803d;
            background: #ecfdf5;
            color: #14532d;
          }

          #hoverTarget:hover .hover-panel {
            display: block;
          }
        </style>
      </head>
      <body>
        <div id="parentTarget">
          <button id="hoverTarget" type="button">
            Account Dropdown
            <span class="hover-panel">Hover State Menu</span>
          </button>
          <button id="childTarget" type="button">Child refinement target</button>
        </div>
        <script>
          window.__ecActivationCounts = { keydown: 0, click: 0 };
          const hoverTarget = document.querySelector("#hoverTarget");
          hoverTarget.addEventListener("keydown", () => {
            window.__ecActivationCounts.keydown += 1;
          });
          hoverTarget.addEventListener("click", () => {
            window.__ecActivationCounts.click += 1;
          });
        </script>
      </body>
    </html>
  `);

  await page.evaluate(() => {
    const runtimeWindow = window as unknown as RuntimeHarness;
    runtimeWindow.__ecRuntimeListeners = [];
    runtimeWindow.__ecRuntimeMessages = [];
    runtimeWindow.chrome = {
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeWindow.__ecRuntimeListeners.push(listener);
          },
          removeListener(listener) {
            runtimeWindow.__ecRuntimeListeners = runtimeWindow.__ecRuntimeListeners.filter((current) => current !== listener);
          }
        },
        sendMessage(message) {
          runtimeWindow.__ecRuntimeMessages.push(message);
        }
      }
    };
  });
  await page.addScriptTag({ content: contentScript });
}

async function startSelection(page: Page) {
  await dispatchContentMessage(page, { type: "EC_CONTENT_START_SELECTION" });
  await waitForMessage(page, "EC_SELECTION_STARTED");
}

async function dispatchContentMessage(page: Page, message: unknown) {
  await page.evaluate((runtimeMessage) => {
    const runtimeWindow = window as unknown as RuntimeHarness;
    for (const listener of runtimeWindow.__ecRuntimeListeners) {
      listener(runtimeMessage);
    }
  }, message);
}

async function hoverTarget(page: Page, selector: string) {
  await page.mouse.move(...await centerOf(page, selector));
}

async function centerOf(page: Page, selector: string): Promise<[number, number]> {
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error(`Element ${selector} did not have a bounding box.`);
  }
  return [box.x + box.width / 2, box.y + box.height / 2];
}

async function waitForMessage(page: Page, type: string) {
  await expect.poll(() => countMessages(page, type)).toBeGreaterThan(0);
  return lastMessage(page, type);
}

async function lastMessage(page: Page, type: string) {
  return page.evaluate((messageType) => {
    const runtimeWindow = window as unknown as RuntimeHarness;
    return runtimeWindow.__ecRuntimeMessages.filter((message) => {
      return Boolean(message && typeof message === "object" && "type" in message && message.type === messageType);
    }).at(-1);
  }, type);
}

async function countMessages(page: Page, type: string) {
  return page.evaluate((messageType) => {
    const runtimeWindow = window as unknown as RuntimeHarness;
    return runtimeWindow.__ecRuntimeMessages.filter((message) => {
      return Boolean(message && typeof message === "object" && "type" in message && message.type === messageType);
    }).length;
  }, type);
}

async function clearMessages(page: Page) {
  await page.evaluate(() => {
    (window as unknown as RuntimeHarness).__ecRuntimeMessages = [];
  });
}

async function getActivationCounts(page: Page) {
  return page.evaluate(() => {
    return { ...(window as unknown as RuntimeHarness).__ecActivationCounts };
  });
}

async function getOverlayState(page: Page) {
  return page.evaluate(() => {
    function readOverlay(selector: string) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`Missing overlay ${selector}.`);
      }

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        display: style.display,
        position: style.position,
        pointerEvents: style.pointerEvents,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottomEdge: Math.round(rect.bottom),
        bottom: Math.round(window.innerHeight - rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }

    return {
      highlight: readOverlay("[data-element-catcher-overlay='highlight']"),
      label: readOverlay("[data-element-catcher-overlay='label']")
    };
  });
}

async function targetViewportBox(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottomEdge: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  });
}
