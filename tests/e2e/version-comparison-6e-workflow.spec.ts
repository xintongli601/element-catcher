import { expect, test } from "./extension-fixture";
import type { Locator } from "@playwright/test";
import {
  ELEMENT_CATCHER_DATABASE_VERSION,
  putGeneratedVersion,
  readGeneratedVersions,
  resetAndSeedSavedCaptures,
  type SeededCapture
} from "./indexed-db-fixtures";
import type {
  GeneratedComponentVersionEntry,
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";
import type { ComponentGenerationResponseV1 } from "../../extension/src/shared/generation-contract";

const revisionEndpoint = "http://127.0.0.1:8787/v1/revise-component";

test.describe("Milestone 6E Slice 2 version comparison workflow", () => {
  test("shows an unavailable comparison state when fewer than two versions are loaded", async ({ sidePanelPage }) => {
    const { target, base } = await seedComparisonVersions(sidePanelPage, { entries: "single" });

    await openCapture(sidePanelPage, target);
    await expect(sidePanelPage.getByText("1 generated version saved locally.")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    await expect(sidePanelPage.getByRole("status")).toContainText("At least two generated versions are required to compare.");
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveCount(0);
    await expect(sidePanelPage.getByText(base.value.code)).toHaveCount(0);
  });

  test("requires deliberate valid selections, renders results, swaps, changes selections, closes with focus, and performs no writes or remote requests", async ({
    sidePanelPage
  }) => {
    const { target, base, child, sibling } = await seedComparisonVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const initialVersions = await readGeneratedVersions(sidePanelPage, target.record.id);
    const remoteRequests = trackRemoteRequests(sidePanelPage);

    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    await expect(sidePanelPage.getByRole("button", { name: "Compare", exact: true })).toBeDisabled();
    await sidePanelPage.getByLabel("Baseline version").selectOption({ label: versionLabel(base) });
    await expect(sidePanelPage.getByRole("button", { name: "Compare", exact: true })).toBeDisabled();
    await sidePanelPage.getByLabel("Candidate version").selectOption({ label: versionLabel(base) });
    await expect(sidePanelPage.getByRole("alert")).toContainText("A version cannot be both Baseline and Candidate.");
    await expect(sidePanelPage.getByLabel("Candidate version")).toBeFocused();
    await expect(sidePanelPage.getByRole("button", { name: "Compare", exact: true })).toBeDisabled();

    await sidePanelPage.getByLabel("Candidate version").selectOption({ label: versionLabel(child) });
    await expect(sidePanelPage.getByRole("button", { name: "Compare", exact: true })).toBeEnabled();
    await sidePanelPage.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeFocused();
    await expect(sidePanelPage.getByRole("heading", { name: "Relationship" })).toBeVisible();
    await expect(sidePanelPage.getByText("Candidate is a direct child of Baseline.")).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Metadata changes" })).toBeVisible();
    await expect(sidePanelPage.getByRole("cell", { name: "Changed" }).first()).toBeVisible();
    await expect(sidePanelPage.getByRole("cell", { name: "Candidate only" }).first()).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Code changes" })).toBeVisible();
    await expect(sidePanelPage.getByRole("columnheader", { name: "Baseline line" })).toBeVisible();
    await expect(sidePanelPage.getByRole("columnheader", { name: "Candidate line" })).toBeVisible();
    await expect(sidePanelPage.getByRole("columnheader", { name: "Change" })).toBeVisible();
    await expect(sidePanelPage.getByRole("columnheader", { name: "Code" })).toBeVisible();
    await expect(sidePanelPage.getByRole("cell", { name: "Added" }).first()).toBeVisible();
    await expect(sidePanelPage.getByRole("cell", { name: "Removed" }).first()).toBeVisible();
    await expect(sidePanelPage.getByRole("cell", { name: "Unchanged" }).first()).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Complete Baseline code" })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Complete Candidate code" })).toBeVisible();
    await expect(sidePanelPage.getByText("Revision instruction")).toBeVisible();
    await expect(sidePanelPage.locator(".version-code-diff-marker").filter({ hasText: "+" }).first()).toBeVisible();
    await expect(sidePanelPage.getByText("Candidate line 2")).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Swap" }).click();
    await expect(sidePanelPage.getByRole("button", { name: "Swap" })).toBeFocused();
    await expect(sidePanelPage.getByText("Candidate is the direct parent of Baseline.")).toBeVisible();

    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await sidePanelPage.getByLabel("Baseline version").selectOption({ label: versionLabel(child) });
    await sidePanelPage.getByLabel("Candidate version").selectOption({ label: versionLabel(sibling) });
    await expect(sidePanelPage.locator(".version-comparison-relationship")).toHaveCount(0);
    await sidePanelPage.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(sidePanelPage.locator(".version-comparison-relationship")).toHaveText("Baseline and Candidate share the same loaded parent.");

    await sidePanelPage.getByRole("button", { name: "Close comparison" }).last().click();
    await expect(sidePanelPage.getByRole("button", { name: "Compare versions" })).toBeFocused();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    expect(remoteRequests()).toEqual([]);
    expect(await readGeneratedVersions(sidePanelPage, target.record.id)).toEqual(initialVersions);
  });

  test("renders equal and oversized diff fallbacks while keeping complete code copyable and incomplete lineage visible", async ({
    sidePanelPage
  }) => {
    const { target, equalBase, equalCandidate, oversized, missingAncestor } = await seedComparisonVersions(sidePanelPage, {
      includeFallbacks: true
    });
    await openCapture(sidePanelPage, target);

    await compare(sidePanelPage, equalBase, equalCandidate);
    await expect(sidePanelPage.getByText("No code changes.")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Complete Baseline code").getByText(equalBase.value.code)).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();

    await compare(sidePanelPage, equalBase, oversized, { alreadyOpen: true });
    await expect(sidePanelPage.getByText("Diff unavailable at this size.")).toBeVisible();
    await expect(sidePanelPage.getByText(oversized.value.code.slice(0, 120))).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();

    await compare(sidePanelPage, equalBase, missingAncestor, { alreadyOpen: true });
    await expect(sidePanelPage.getByText("The relationship cannot be fully determined because lineage is missing or invalid.")).toBeVisible();
  });

  test("preserves and recomputes an open comparison after a legitimate generated-version refresh", async ({ sidePanelPage }) => {
    const { target, base, child, sibling } = await seedComparisonVersions(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await fulfillRevisionRequests(sidePanelPage, { componentName: "SiblingCard", summary: "Refresh trigger revision saved." });
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);

    const refreshedChild = {
      ...child,
      value: {
        ...child.value,
        code: "export function CandidateCard() {\n  return <button>Refreshed candidate</button>;\n}",
        summary: "Candidate refreshed through accepted list."
      }
    };
    await putGeneratedVersion(sidePanelPage, refreshedChild);
    await saveRevisionFromVersion(sidePanelPage, sibling, "Trigger refresh preservation");

    await expect(sidePanelPage.getByText("4 generated versions saved locally.")).toBeVisible();
    const refreshedVersions = await readGeneratedVersions(sidePanelPage, target.record.id);
    expect(refreshedVersions.map((entry) => (entry as { id?: string }).id)).toEqual(expect.arrayContaining([base.id, child.id]));
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(base.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);
    await expect(sidePanelPage.getByText("Candidate refreshed through accepted list.")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Complete Candidate code").getByText("Refreshed candidate")).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("retires a stale selected version after refresh while keeping the surviving role selected", async ({ sidePanelPage }) => {
    const { target, base, child, sibling } = await seedComparisonVersions(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await fulfillRevisionRequests(sidePanelPage, { componentName: "SiblingCard", summary: "Retirement trigger revision saved." });
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await expect(sidePanelPage.getByText(child.value.summary)).toBeVisible();

    await deleteGeneratedVersionForWorkflow(sidePanelPage, child.id);
    await saveRevisionFromVersion(sidePanelPage, sibling, "Trigger selected retirement");

    await expect(sidePanelPage.getByRole("alert")).toContainText("The selected version is no longer available. Choose two versions again.");
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(base.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue("");
    await expect(sidePanelPage.getByText(child.value.summary)).toHaveCount(0);
    await expect(sidePanelPage.getByText(child.value.code)).toHaveCount(0);
    await sidePanelPage.waitForTimeout(300);
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
  });

  test("supports a keyboard-only comparison, swap, and close loop", async ({ sidePanelPage }) => {
    const { target, child, sibling } = await seedComparisonVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await sidePanelPage.getByRole("button", { name: "Compare versions" }).focus();
    await sidePanelPage.keyboard.press("Enter");
    await expect(sidePanelPage.getByLabel("Baseline version")).toBeVisible();
    await tabTo(sidePanelPage, sidePanelPage.getByLabel("Baseline version"));
    await sidePanelPage.keyboard.press("KeyS");
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(sibling.id);
    await sidePanelPage.keyboard.press("Tab");
    await expect(sidePanelPage.getByLabel("Candidate version")).toBeFocused();
    await sidePanelPage.keyboard.press("KeyC");
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);
    await sidePanelPage.keyboard.press("Tab");
    await expect(sidePanelPage.getByRole("button", { name: "Compare", exact: true })).toBeFocused();
    await sidePanelPage.keyboard.press("Enter");
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeFocused();
    await sidePanelPage.keyboard.press("Tab");
    await expect(sidePanelPage.getByRole("button", { name: "Swap" })).toBeFocused();
    await sidePanelPage.keyboard.press("Enter");
    await expect(sidePanelPage.getByRole("button", { name: "Swap" })).toBeFocused();
    await sidePanelPage.keyboard.press("Tab");
    await sidePanelPage.keyboard.press("Tab");
    await expect(sidePanelPage.getByRole("button", { name: "Close comparison" }).last()).toBeFocused();
    await sidePanelPage.keyboard.press("Enter");
    await expect(sidePanelPage.getByRole("button", { name: "Compare versions" })).toBeFocused();
  });

  test("keeps comparison separate from expanded details and revision tools, and clears on capture switch", async ({ sidePanelPage }) => {
    const { target, otherTarget, base, child } = await seedComparisonVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);

    await sidePanelPage.getByRole("button", { name: versionLabel(base) }).click();
    await expect(sidePanelPage.locator(".generated-version-details").getByText(base.value.summary)).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();

    await compare(sidePanelPage, base, child);
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();
    await expect(sidePanelPage.locator(".generated-version-details").getByText(base.value.summary)).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, otherTarget);
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.getByRole("button", { name: "Compare versions" })).toHaveCount(0);
  });
});

type SeedOptions = {
  entries?: "single" | "standard";
  includeFallbacks?: boolean;
};

async function seedComparisonVersions(page: Parameters<typeof resetAndSeedSavedCaptures>[0], options: SeedOptions = {}) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  const target = seeded[0];
  const otherTarget = seeded[1];
  const base = createV1(target, "00000000000000000000000000000001", "BaselineCard", {
    code: "export function BaselineCard() {\n  return <button>Save</button>;\n}",
    summary: "Baseline generated source."
  });
  await putGeneratedVersion(page, base);
  if (options.entries === "single") {
    return { target, otherTarget, base, child: base, sibling: base, equalBase: base, equalCandidate: base, oversized: base, missingAncestor: base };
  }

  const child = createV2(target, "00000000000000000000000000000002", "CandidateCard", base.id, {
    code: "export function CandidateCard() {\n  return <button>Buy now</button>;\n}",
    summary: "Candidate generated source.",
    instruction: "Make the card action stronger.",
    createdAt: "2026-07-18T12:01:00.000Z"
  });
  const sibling = createV2(target, "00000000000000000000000000000003", "SiblingCard", base.id, {
    code: "export function SiblingCard() {\n  return <button>Save</button>;\n}",
    summary: "Sibling generated source.",
    createdAt: "2026-07-18T12:02:00.000Z"
  });
  await putGeneratedVersion(page, child);
  await putGeneratedVersion(page, sibling);

  let equalBase: GeneratedComponentVersionEntry = base;
  let equalCandidate: GeneratedComponentVersionEntry = child;
  let oversized: GeneratedComponentVersionEntry = sibling;
  let missingAncestor: GeneratedComponentVersionEntry = child;
  if (options.includeFallbacks) {
    equalBase = createV1(target, "00000000000000000000000000000004", "EqualBaseCard", {
      code: "export function EqualCard() {\n  return <button>Same</button>;\n}",
      createdAt: "2026-07-18T12:03:00.000Z"
    });
    equalCandidate = createV1(target, "00000000000000000000000000000005", "EqualCandidateCard", {
      code: equalBase.value.code,
      createdAt: "2026-07-18T12:04:00.000Z"
    });
    oversized = createV1(target, "00000000000000000000000000000006", "OversizedCard", {
      code: Array.from({ length: 1201 }, (_, index) => `const value${index} = ${index};`).join("\n"),
      createdAt: "2026-07-18T12:05:00.000Z"
    });
    missingAncestor = createV2(target, "00000000000000000000000000000007", "MissingAncestorCard", "generated-version-ffffffffffffffffffffffffffffffff", {
      code: "export function MissingAncestorCard() {\n  return <button>Missing</button>;\n}",
      createdAt: "2026-07-18T12:06:00.000Z"
    });
    await putGeneratedVersion(page, equalBase);
    await putGeneratedVersion(page, equalCandidate);
    await putGeneratedVersion(page, oversized);
    await putGeneratedVersion(page, missingAncestor);
  }

  return { target, otherTarget, base, child, sibling, equalBase, equalCandidate, oversized, missingAncestor };
}

async function openCapture(page: Parameters<typeof resetAndSeedSavedCaptures>[0], target: SeededCapture) {
  await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
  await expect(page.getByRole("heading", { name: "Generated versions" })).toBeVisible();
}

async function compare(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  baseline: GeneratedComponentVersionEntry,
  candidate: GeneratedComponentVersionEntry,
  options: { alreadyOpen?: boolean } = {}
) {
  if (!options.alreadyOpen) {
    await page.getByRole("button", { name: "Compare versions" }).click();
  }
  await page.getByLabel("Baseline version").selectOption({ label: versionLabel(baseline) });
  await page.getByLabel("Candidate version").selectOption({ label: versionLabel(candidate) });
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
}

function trackRemoteRequests(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:\/\//.test(request.url())) {
      requests.push(request.url());
    }
  });
  return () => requests;
}

async function enableRevisionLoopback(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  await page.evaluate(() => {
    window.__EC_REVISION_WORKFLOW_TEST_LOOPBACK__ = true;
  });
}

async function fulfillRevisionRequests(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  options: Partial<ComponentGenerationResponseV1> = {}
) {
  const requests: Array<{ headers: Record<string, string>; body: unknown }> = [];
  await page.route(revisionEndpoint, async (route, request) => {
    requests.push({ headers: request.headers(), body: request.postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        componentName: options.componentName ?? "RefreshCard",
        framework: "react",
        styling: "tailwind",
        code: options.code ?? "export function RefreshCard() { return <button>Refresh</button>; }",
        summary: options.summary ?? "Refresh workflow response.",
        approximationNotes: options.approximationNotes ?? "Refresh workflow e2e response."
      } satisfies ComponentGenerationResponseV1)
    });
  });
  return () => requests;
}

async function saveRevisionFromVersion(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  source: GeneratedComponentVersionEntry,
  instruction: string
) {
  const item = page.locator(".generated-version-item").filter({
    has: page.getByRole("button", { name: versionLabel(source) })
  });
  await item.getByRole("button", { name: versionLabel(source) }).click();
  await item.getByRole("button", { name: "Revise or regenerate" }).click();
  await expect(page.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();
  await page.getByRole("button", { name: "Revise" }).click();
  await page.getByLabel("Instruction").fill(instruction);
  await page.getByRole("button", { name: "Review data" }).click();
  await page.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
  await page.getByRole("button", { name: "Send revision" }).click();
  await expect(page.getByRole("heading", { name: "Revision saved" })).toBeVisible();
}

async function deleteGeneratedVersionForWorkflow(page: Parameters<typeof resetAndSeedSavedCaptures>[0], id: string) {
  await page.evaluate(
    async ({ databaseVersion, id: generatedVersionId }) => {
      const request = indexedDB.open("element-catcher-local-persistence", databaseVersion);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => reject(new Error("Unexpected database upgrade during generated version deletion."));
        request.onsuccess = () => resolve(request.result);
      });

      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("generatedComponentVersions", "readwrite");
          transaction.objectStore("generatedComponentVersions").delete(generatedVersionId);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        database.close();
      }
    },
    { databaseVersion: ELEMENT_CATCHER_DATABASE_VERSION, id }
  );
}

async function tabTo(page: Parameters<typeof resetAndSeedSavedCaptures>[0], locator: Locator) {
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((element) => element === document.activeElement).catch(() => false)) {
      return;
    }
  }
  await expect(locator).toBeFocused();
}

function versionLabel(entry: GeneratedComponentVersionEntry) {
  return `${entry.value.componentName} - ${entry.createdAt}`;
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
      framework: options.framework ?? "react",
      styling: options.styling ?? "tailwind",
      code: options.code ?? `export function ${componentName}() { return <button>Save</button>; }`,
      summary: options.summary ?? `${componentName} summary.`,
      approximationNotes: options.approximationNotes ?? `${componentName} notes.`
    }
  };
}

function createV2(
  target: SeededCapture,
  idSuffix: string,
  componentName: string,
  sourceGeneratedVersionId: string,
  options: Partial<GeneratedComponentVersionEntryV1["value"]> & {
    createdAt?: string;
    instruction?: string;
    screenshotIncluded?: boolean;
  } = {}
): GeneratedComponentVersionEntryV2 {
  return {
    ...createV1(target, idSuffix, componentName, options),
    contractVersion: 2,
    operation: {
      kind: "revision",
      logicalAttemptId: `revision-attempt-${idSuffix}`,
      reviewAttemptFingerprint: "b".repeat(64),
      sourceGeneratedVersionId,
      sourceGeneratedVersionFingerprint: "c".repeat(64),
      instruction: options.instruction ?? "Revise this generated component.",
      instructionFingerprint: "d".repeat(64),
      screenshotIncluded: options.screenshotIncluded ?? false
    }
  };
}
