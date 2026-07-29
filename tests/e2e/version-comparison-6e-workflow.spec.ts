import { expect, test } from "./extension-fixture";
import {
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
    await expect(sidePanelPage.getByText("direct-child")).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Metadata changes" })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Code changes" })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Complete Baseline code" })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Complete Candidate code" })).toBeVisible();
    await expect(sidePanelPage.getByText("Revision instruction")).toBeVisible();
    await expect(sidePanelPage.locator(".version-code-diff-marker").filter({ hasText: "+" }).first()).toBeVisible();
    await expect(sidePanelPage.getByText("Candidate line 2")).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Swap" }).click();
    await expect(sidePanelPage.getByRole("button", { name: "Swap" })).toBeFocused();
    await expect(sidePanelPage.getByText("direct-parent")).toBeVisible();

    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await sidePanelPage.getByLabel("Baseline version").selectOption({ label: versionLabel(child) });
    await sidePanelPage.getByLabel("Candidate version").selectOption({ label: versionLabel(sibling) });
    await expect(sidePanelPage.locator(".version-comparison-relationship")).toHaveCount(0);
    await sidePanelPage.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(sidePanelPage.locator(".version-comparison-relationship")).toHaveText("sibling");

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
    await expect(sidePanelPage.getByText("incomplete-lineage")).toBeVisible();
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
