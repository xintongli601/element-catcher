import { createServer } from "node:http";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./extension-fixture";
import {
  putGeneratedVersion,
  readPersistenceCounts,
  resetAndSeedSavedCaptures,
  type SeededCapture
} from "./indexed-db-fixtures";
import { createApp } from "../../.backend-dist/backend/src/app.js";
import { createDeterministicFakeGitHubTransport } from "../../.backend-dist/backend/src/github/fake-github-transport.js";
import type { GeneratedComponentVersionEntry, GeneratedComponentVersionEntryV1 } from "../../extension/src/shared/generated-version-contract";

test.describe("Milestone 7B Slice 3 GitHub export Side Panel workflow", () => {
  test("normal runtime GitHub export remains fail-closed and explicit about missing real integration", async ({ sidePanelPage }) => {
    const { target, createEntry } = await seedGitHubVersions(sidePanelPage);
    await sidePanelPage.reload();
    await openCapture(sidePanelPage, target);
    const githubRequests = trackGitHubRequests(sidePanelPage);
    const createRow = await expandVersion(sidePanelPage, createEntry);

    await createRow.getByRole("button", { name: githubLabel(createEntry) }).click();

    await expect(sidePanelPage.getByRole("alert")).toHaveText(
      "GitHub export is not configured in normal runtime. Real GitHub authorization, OAuth, token storage, real GitHub REST transport, and production GitHub writes are not implemented. Deterministic fake/development export is available only through an explicitly configured local development gateway."
    );
    await expect(sidePanelPage.getByRole("heading", { name: "GitHub export Review" })).toHaveCount(0);
    await expect(sidePanelPage.getByRole("heading", { name: "GitHub export succeeded" })).toHaveCount(0);
    expect(githubRequests()).toEqual([]);
  });

  test("creates and updates one GitHub file from explicit row Review without local writes or iframes", async ({ sidePanelPage, extensionId }) => {
    const server = await startFakeGateway(extensionId);
    try {
      const { target, createEntry, updateEntry } = await seedGitHubVersions(sidePanelPage);
      await sidePanelPage.reload();
      await enableGitHubLoopback(sidePanelPage);
      const githubRequests = trackGitHubRequests(sidePanelPage);
      await openCapture(sidePanelPage, target);
      const beforeCounts = await readPersistenceCounts(sidePanelPage);
      expect(githubRequests()).toEqual([]);

      await completeGitHubExport(sidePanelPage, createEntry, {
        path: "components/NewCard.tsx",
        message: "Export NewCard",
        operation: "create",
        remoteBlob: "None",
        commitSha: "f000000000000000000000000000000000000001"
      });

      await completeGitHubExport(sidePanelPage, updateEntry, {
        path: "components/ExistingCard.tsx",
        message: "Export ExistingCard",
        operation: "update",
        remoteBlob: "d".repeat(40),
        commitSha: "f000000000000000000000000000000000000002"
      });

      await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
      expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
      expect(githubRequests().every((url) => url.startsWith("http://127.0.0.1:8787/v1/github-export/"))).toBe(true);
      expect(githubRequests().some((url) => url.includes("api.github.com"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  test("blocks invalid local path, reports remote conflict, and clears pending state on Library navigation", async ({ sidePanelPage, extensionId }) => {
    const server = await startFakeGateway(extensionId);
    try {
      const { target, otherTarget, createEntry } = await seedGitHubVersions(sidePanelPage);
      await sidePanelPage.reload();
      await enableGitHubLoopback(sidePanelPage);
      await openCapture(sidePanelPage, target);
      const githubRequests = trackGitHubRequests(sidePanelPage);
      const createRow = await expandVersion(sidePanelPage, createEntry);
      await expectRowExportControls(createRow, createEntry);
      expect(githubRequests()).toEqual([]);
      await createRow.getByRole("button", { name: githubLabel(createEntry) }).click();
      await sidePanelPage.getByLabel("GitHub repository").selectOption({ label: "octocat/hello-world" });
      await sidePanelPage.getByLabel("GitHub branch").selectOption({ label: "main" });
      await sidePanelPage.getByLabel("GitHub target path").fill(".github/workflows/NewCard.tsx");
      await sidePanelPage.getByRole("button", { name: "Review GitHub export" }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("GitHub workflow paths are not allowed.");
      await expect(sidePanelPage.getByRole("heading", { name: "GitHub export Review" })).toHaveCount(0);

      await sidePanelPage.getByLabel("GitHub target path").fill("components/ConflictCard.tsx");
      await sidePanelPage.getByLabel("GitHub commit message").fill("Export ConflictCard");
      await sidePanelPage.getByRole("button", { name: "Review GitHub export" }).click();
      await expect(sidePanelPage.getByRole("heading", { name: "GitHub export Review" })).toBeVisible();
      await sidePanelPage.getByRole("button", { name: "Cancel GitHub export" }).click();
      await expect(sidePanelPage.getByRole("status").filter({ hasText: /^GitHub export cancelled\.$/ })).toHaveCount(1);

      await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
      await expect(sidePanelPage.getByRole("button", { name: githubLabel(createEntry) })).toHaveCount(0);
      await openCapture(sidePanelPage, otherTarget);
      await expect(sidePanelPage.getByRole("heading", { name: "GitHub export Review" })).toHaveCount(0);
      await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    } finally {
      await server.close();
    }
  });

  test("supports keyboard Review and Success semantics and clears ephemeral state after Detail leave", async ({ sidePanelPage, extensionId }) => {
    const server = await startFakeGateway(extensionId);
    try {
      const { target, createEntry } = await seedGitHubVersions(sidePanelPage);
      await sidePanelPage.reload();
      await enableGitHubLoopback(sidePanelPage);
      await openCapture(sidePanelPage, target);
      const beforeCounts = await readPersistenceCounts(sidePanelPage);

      const item = pageRowForVersion(sidePanelPage, createEntry);
      const rowToggle = item.getByRole("button", { name: versionLabel(createEntry) });
      await rowToggle.focus();
      await sidePanelPage.keyboard.press("Enter");
      await expect(item.locator(".generated-version-details")).toBeVisible();
      await expectRowExportControls(item, createEntry);

      const githubButton = item.getByRole("button", { name: githubLabel(createEntry) });
      await githubButton.focus();
      await sidePanelPage.keyboard.press("Enter");
      await sidePanelPage.getByLabel("GitHub repository").selectOption({ label: "octocat/hello-world" });
      await sidePanelPage.getByLabel("GitHub branch").selectOption({ label: "main" });
      await sidePanelPage.getByLabel("GitHub target path").fill("components/KeyboardCard.tsx");
      await sidePanelPage.getByLabel("GitHub commit message").fill("Export KeyboardCard");

      const reviewButton = sidePanelPage.getByRole("button", { name: "Review GitHub export" });
      await reviewButton.focus();
      await sidePanelPage.keyboard.press("Enter");
      let review = await getGitHubReview(sidePanelPage);
      await expectGitHubReviewField(review, "Account", "octocat");
      await expectGitHubReviewField(review, "Repository", "octocat/hello-world");
      await expectGitHubReviewField(review, "Branch", "main");
      await expectGitHubReviewField(review, "Target path", "components/KeyboardCard.tsx");
      await expectGitHubReviewField(review, "Operation", "create");
      await expectGitHubReviewField(review, "Commit message", "Export KeyboardCard");
      await expectGitHubReviewField(review, "Source filename", "NewCard.tsx");
      await expectGitHubReviewField(review, "Source byte count", String(new TextEncoder().encode(createEntry.value.code).byteLength));
      await expectGitHubReviewField(review, "Remote blob SHA", "None");
      await expectGitHubReviewField(review, "Remote commit", "One remote commit will be created.");
      await expectDevelopmentOnlyNote(review);
      await expect(review.locator("input, select, textarea")).toHaveCount(0);

      const cancelButton = review.getByRole("button", { name: "Cancel GitHub export" });
      await cancelButton.focus();
      await sidePanelPage.keyboard.press("Enter");
      await expect(sidePanelPage.getByRole("status").filter({ hasText: /^GitHub export cancelled\.$/ })).toHaveCount(1);

      await reviewButton.focus();
      await sidePanelPage.keyboard.press("Enter");
      review = await getGitHubReview(sidePanelPage);
      const confirmButton = review.getByRole("button", { name: "Confirm GitHub write" });
      await confirmButton.focus();
      await sidePanelPage.keyboard.press("Enter");
      const success = await getGitHubSuccess(sidePanelPage);
      await expectDevelopmentOnlyNote(success);
      await expectSuccessField(success, "Repository", "octocat/hello-world");
      await expectSuccessField(success, "Branch", "main");
      await expectSuccessField(success, "Target path", "components/KeyboardCard.tsx");
      await expectSuccessField(success, "Operation", "create");
      await expectSuccessField(success, "Commit SHA", "f000000000000000000000000000000000000001");
      await expectSuccessField(success, "Commit URL", "https://github.com/octocat/hello-world/commit/f000000000000000000000000000000000000001");

      await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
      await expect(sidePanelPage.getByRole("heading", { name: "Capture Library" })).toBeVisible();
      await expect(sidePanelPage.getByRole("heading", { name: "GitHub export Review" })).toHaveCount(0);
      await expect(sidePanelPage.getByRole("heading", { name: "GitHub export succeeded" })).toHaveCount(0);
      await openCapture(sidePanelPage, target);
      await expect(sidePanelPage.getByRole("heading", { name: "GitHub export Review" })).toHaveCount(0);
      await expect(sidePanelPage.getByRole("heading", { name: "GitHub export succeeded" })).toHaveCount(0);
      await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
      expect(await readPersistenceCounts(sidePanelPage)).toEqual(beforeCounts);
    } finally {
      await server.close();
    }
  });
});

async function completeGitHubExport(
  page: Page,
  entry: GeneratedComponentVersionEntry,
  expected: { path: string; message: string; operation: "create" | "update"; remoteBlob: string; commitSha: string }
) {
  const item = await expandVersion(page, entry);
  await expectRowExportControls(item, entry);
  await item.getByRole("button", { name: githubLabel(entry) }).click();
  await page.getByLabel("GitHub repository").selectOption({ label: "octocat/hello-world" });
  await page.getByLabel("GitHub branch").selectOption({ label: "main" });
  await page.getByLabel("GitHub target path").fill(expected.path);
  await page.getByLabel("GitHub commit message").fill(expected.message);
  await page.getByRole("button", { name: "Review GitHub export" }).click();
  const review = await getGitHubReview(page);
  await expectGitHubReviewField(review, "Account", "octocat");
  await expectGitHubReviewField(review, "Repository", "octocat/hello-world");
  await expect(review.locator("dd").filter({ hasText: /^octocat\/hello-world$/ })).toHaveCount(1);
  await expectGitHubReviewField(review, "Branch", "main");
  await expectGitHubReviewField(review, "Target path", expected.path);
  await expectGitHubReviewField(review, "Operation", expected.operation);
  await expectGitHubReviewField(review, "Commit message", expected.message);
  await expectGitHubReviewField(review, "Source filename", `${entry.value.componentName}.tsx`);
  await expectGitHubReviewField(review, "Source byte count", String(new TextEncoder().encode(entry.value.code).byteLength));
  await expectGitHubReviewField(review, "Remote blob SHA", expected.remoteBlob);
  await expectGitHubReviewField(review, "Remote commit", "One remote commit will be created.");
  await expectDevelopmentOnlyNote(review);
  await expect(review.getByRole("button", { name: "Confirm GitHub write" })).toBeVisible();
  await expect(review.locator("input, select, textarea")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "GitHub export succeeded" })).toHaveCount(0);
  await review.getByRole("button", { name: "Confirm GitHub write" }).click();
  const success = await getGitHubSuccess(page);
  await expectDevelopmentOnlyNote(success);
  await expectSuccessField(success, "Repository", "octocat/hello-world");
  await expectSuccessField(success, "Branch", "main");
  await expectSuccessField(success, "Target path", expected.path);
  await expectSuccessField(success, "Operation", expected.operation);
  await expectSuccessField(success, "Commit SHA", expected.commitSha);
  await expectSuccessField(success, "Commit URL", `https://github.com/octocat/hello-world/commit/${expected.commitSha}`);
}

async function getGitHubReview(page: Page) {
  const heading = page.getByRole("heading", { name: "GitHub export Review" });
  await expect(heading).toBeVisible();
  const review = heading.locator("xpath=ancestor::section[1]");
  await expect(review).toBeVisible();
  return review;
}

async function expectGitHubReviewField(review: Locator, label: string, value: string) {
  await expectField(review, label, value);
}

async function getGitHubSuccess(page: Page) {
  const heading = page.getByRole("heading", { name: "GitHub export succeeded" });
  await expect(heading).toBeVisible();
  const success = heading.locator("xpath=ancestor::section[1]");
  await expect(success).toBeVisible();
  return success;
}

async function expectSuccessField(success: Locator, label: string, value: string) {
  await expectField(success, label, value);
}

async function expectDevelopmentOnlyNote(container: Locator) {
  await expect(container.getByText("Development/fake GitHub export only. This is not production GitHub integration")).toBeVisible();
}

async function expectField(container: Locator, label: string, value: string) {
  const labelLocator = container.locator("dt").filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) });
  await expect(labelLocator).toHaveCount(1);
  await expect(labelLocator.locator("xpath=following-sibling::dd[1]")).toHaveText(value);
}

async function seedGitHubVersions(page: Page) {
  const seeded = await resetAndSeedSavedCaptures(page);
  const target = seeded[0];
  const otherTarget = seeded[1];
  const createEntry = createV1(target, "00000000000000000000000000000011", "NewCard", {
    code: "export function NewCard() {\n  return <div />;\n}"
  });
  const updateEntry = createV1(target, "00000000000000000000000000000012", "ExistingCard", {
    code: "export function ExistingCard() {\n  return <div />;\n}"
  });
  await putGeneratedVersion(page, createEntry);
  await putGeneratedVersion(page, updateEntry);
  return { target, otherTarget, createEntry, updateEntry };
}

async function startFakeGateway(extensionId: string) {
  const provider = {
    logs: [],
    async generate() {
      throw new Error("generate should not be called");
    },
    async revise() {
      throw new Error("revise should not be called");
    }
  };
  const server = createServer(createApp({
    config: {
      apiKey: "test-key-not-real",
      model: "test-model",
      extensionOrigin: `chrome-extension://${extensionId}`,
      host: "127.0.0.1",
      port: 8787,
      configurationVersion: "7b-slice-3"
    },
    provider,
    githubTransport: createDeterministicFakeGitHubTransport(),
    logger: { log: (entry) => provider.logs.push(entry as never) }
  }));
  await new Promise<void>((resolve) => server.listen(8787, "127.0.0.1", resolve));
  return {
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function enableGitHubLoopback(page: Page) {
  await page.evaluate(() => {
    window.__EC_GITHUB_EXPORT_TEST_LOOPBACK__ = true;
  });
}

async function openCapture(page: Page, target: SeededCapture) {
  await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
  await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
  await expect(page.getByRole("heading", { name: target.title })).toBeVisible();
}

async function expandVersion(page: Page, entry: GeneratedComponentVersionEntry) {
  const item = pageRowForVersion(page, entry);
  await item.getByRole("button", { name: versionLabel(entry) }).click();
  await expect(item.locator(".generated-version-details")).toBeVisible();
  await expectRowExportControls(item, entry);
  await expect(page.getByRole("button", { name: githubLabel(entry) })).toHaveCount(1);
  return item;
}

function pageRowForVersion(page: Page, entry: GeneratedComponentVersionEntry) {
  return page.locator(".generated-version-item", {
    has: page.getByRole("button", { name: versionLabel(entry) })
  });
}

async function expectRowExportControls(item: Locator, entry: GeneratedComponentVersionEntry) {
  await expect(item.getByRole("button", { name: `Export .tsx for ${entry.value.componentName} - ${entry.createdAt}` })).toBeVisible();
  await expect(item.getByRole("button", { name: githubLabel(entry) })).toBeVisible();
  await expect(item.getByRole("button", { name: githubLabel(entry) })).toHaveAccessibleName(githubLabel(entry));
}

function trackGitHubRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("http://127.0.0.1:8787/v1/github-export/")) {
      requests.push(request.url());
    }
  });
  return () => requests;
}

function versionLabel(entry: GeneratedComponentVersionEntry) {
  return `${entry.value.componentName} - ${entry.createdAt}`;
}

function githubLabel(entry: GeneratedComponentVersionEntry) {
  return `Export to GitHub for ${entry.value.componentName} - ${entry.createdAt}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createV1(
  target: SeededCapture,
  idSuffix: string,
  componentName: string,
  options: Partial<GeneratedComponentVersionEntryV1["value"]> & { createdAt?: string } = {}
): GeneratedComponentVersionEntryV1 {
  return {
    id: `generated-version-${idSuffix}`,
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: options.createdAt ?? "2026-07-18T12:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName,
      framework: "react",
      styling: "tailwind",
      code: options.code ?? `export function ${componentName}() {\n  return <button>Export</button>;\n}`,
      summary: options.summary ?? `${componentName} summary.`,
      approximationNotes: options.approximationNotes ?? `${componentName} notes.`
    }
  };
}
