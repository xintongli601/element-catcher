import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  sidePanelPage: Page;
};

type RuntimeError = {
  pageUrl: string;
  message: string;
};

const DIST_DIR = resolve(process.cwd(), "dist");

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use, testInfo) => {
    const userDataDir = await mkdtemp(resolve(tmpdir(), "element-catcher-playwright-"));
    const runtimeErrors: RuntimeError[] = [];
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${DIST_DIR}`,
        `--load-extension=${DIST_DIR}`
      ]
    });

    await context.addInitScript(() => {
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
      const active = new Set<string>();
      const created: Array<{ url: string; size: number; type: string }> = [];
      const revoked: string[] = [];

      Object.defineProperty(window, "__ecObjectUrlEvents", {
        value: {
          created,
          revoked,
          get active() {
            return Array.from(active);
          },
          get createCount() {
            return created.length;
          },
          get revokeCount() {
            return revoked.length;
          }
        },
        configurable: true
      });

      URL.createObjectURL = (object: Blob | MediaSource) => {
        const url = originalCreateObjectURL(object);
        active.add(url);
        created.push({
          url,
          size: object instanceof Blob ? object.size : 0,
          type: object instanceof Blob ? object.type : "media-source"
        });
        return url;
      };

      URL.revokeObjectURL = (url: string) => {
        active.delete(url);
        revoked.push(url);
        originalRevokeObjectURL(url);
      };
    });

    context.on("page", (page) => attachRuntimeGuards(page, runtimeErrors));
    for (const page of context.pages()) {
      attachRuntimeGuards(page, runtimeErrors);
    }

    try {
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });

      if (runtimeErrors.length) {
        await testInfo.attach("unexpected-runtime-errors.json", {
          body: JSON.stringify(runtimeErrors, null, 2),
          contentType: "application/json"
        });
        throw new Error(`Unexpected browser runtime errors:\n${runtimeErrors.map((error) => error.message).join("\n")}`);
      }
    }
  },

  extensionId: async ({ context }, use) => {
    const serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(serviceWorker.url()).host;
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    await use(extensionId);
  },

  sidePanelPage: async ({ context, extensionId }, use) => {
    const page = await openSidePanelPage(context, extensionId);
    await use(page);
    await page.close();
  }
});

export { expect } from "@playwright/test";

export async function openSidePanelPage(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(getSidePanelUrl(extensionId));
  await expect(page.getByRole("heading", { name: "Element Catcher" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Capture" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  return page;
}

export function getSidePanelUrl(extensionId: string) {
  return `chrome-extension://${extensionId}/src/sidepanel/index.html`;
}

export async function getObjectUrlSnapshot(page: Page) {
  return page.evaluate(() => {
    const events = (window as unknown as {
      __ecObjectUrlEvents?: {
        created: Array<{ url: string; size: number; type: string }>;
        revoked: string[];
        active: string[];
        createCount: number;
        revokeCount: number;
      };
    }).__ecObjectUrlEvents;

    if (!events) {
      throw new Error("Object URL instrumentation was not installed.");
    }

    return {
      created: [...events.created],
      revoked: [...events.revoked],
      active: [...events.active],
      createCount: events.createCount,
      revokeCount: events.revokeCount
    };
  });
}

function attachRuntimeGuards(page: Page, runtimeErrors: RuntimeError[]) {
  page.on("pageerror", (error) => {
    runtimeErrors.push({
      pageUrl: page.url(),
      message: `pageerror: ${error.message}`
    });
  });

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    runtimeErrors.push({
      pageUrl: page.url(),
      message: `console.error: ${message.text()}`
    });
  });
}
