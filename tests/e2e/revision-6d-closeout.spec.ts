import type { Page } from "@playwright/test";
import { test, expect } from "./extension-fixture";
import {
  putGeneratedVersion,
  readGeneratedVersions,
  resetAndSeedSavedCaptures,
  type SeededCapture
} from "./indexed-db-fixtures";
import { deriveRevisionGeneratedVersionId } from "../../extension/src/generation/revision-contract";
import type {
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";
import type { ComponentGenerationResponseV1 } from "../../extension/src/shared/generation-contract";

const revisionEndpoint = "http://127.0.0.1:8787/v1/revise-component";

type HarnessOptions = {
  failBeforeAddCount?: number;
  pauseBeforeAdd?: boolean;
  failAfterCommitCount?: number;
  pauseAfterCommit?: boolean;
};

type RevisionRequest = {
  headers: Record<string, string>;
  body: unknown;
};

test.describe("Milestone 6D Slice 6 regression closeout", () => {
  test("recovers from a pre-commit V2 persistence failure without another transport", async ({ sidePanelPage }) => {
    const { target, firstSource } = await seedWithSources(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await installV2PersistenceHarness(sidePanelPage, { failBeforeAddCount: 1 });
    const requests = await fulfillRevisionRequests(sidePanelPage);

    await sendRevision(sidePanelPage, target, firstSource, "Persist after one local failure");
    await expect(sidePanelPage.getByText("Element Catcher could not save the generated component version.")).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Retry saving" })).toBeVisible();
    expect(requests()).toHaveLength(1);
    const targetId = await targetIdFromRequest(requests()[0]);
    expect(await hasGeneratedVersion(sidePanelPage, target.record.id, targetId)).toBe(false);

    await sidePanelPage.getByRole("button", { name: "Retry saving" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toBeVisible();
    expect(requests()).toHaveLength(1);
    await expect(sidePanelPage.getByText("3 generated versions saved locally.")).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    expect(await countGeneratedVersionId(sidePanelPage, target.record.id, targetId)).toBe(1);
    await expectSourceUnchanged(sidePanelPage, target, firstSource);
  });

  test("recovers an exact target committed before UI confirmation without duplicate save", async ({ sidePanelPage }) => {
    const { target, firstSource } = await seedWithSources(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await installV2PersistenceHarness(sidePanelPage, { failAfterCommitCount: 1 });
    const requests = await fulfillRevisionRequests(sidePanelPage, { summary: "Committed before UI confirmation." });

    await sendRevision(sidePanelPage, target, firstSource, "Recover already committed target");
    await expect(sidePanelPage.getByText("Element Catcher could not save the generated component version.")).toBeVisible();
    expect(requests()).toHaveLength(1);
    const targetId = await targetIdFromRequest(requests()[0]);
    expect(await countGeneratedVersionId(sidePanelPage, target.record.id, targetId)).toBe(1);

    await sidePanelPage.getByRole("button", { name: "Retry saving" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toBeVisible();
    await expect(sidePanelPage.getByText("Recovered saved revision result.")).toBeVisible();
    expect(requests()).toHaveLength(1);
    expect(await countGeneratedVersionId(sidePanelPage, target.record.id, targetId)).toBe(1);
    await expectSourceUnchanged(sidePanelPage, target, firstSource);
  });

  test("rejects conflicting recovery target without overwrite or extra provider call", async ({ sidePanelPage }) => {
    const { target, firstSource } = await seedWithSources(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await installV2PersistenceHarness(sidePanelPage, { failBeforeAddCount: 1 });
    const requests = await fulfillRevisionRequests(sidePanelPage, { summary: "Original pending target." });

    await sendRevision(sidePanelPage, target, firstSource, "Reject conflicting recovered target");
    await expect(sidePanelPage.getByRole("button", { name: "Retry saving" })).toBeVisible();
    expect(requests()).toHaveLength(1);
    const targetId = await targetIdFromRequest(requests()[0]);
    const logicalAttemptId = requests()[0].headers["x-element-catcher-idempotency-key"];
    await putGeneratedVersion(sidePanelPage, conflictingV2Entry(target, firstSource, targetId, logicalAttemptId));

    await sidePanelPage.getByRole("button", { name: "Retry saving" }).click();
    await expect(sidePanelPage.getByText("Element Catcher detected a generated version persistence conflict.")).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Retry saving" })).toHaveCount(0);
    expect(requests()).toHaveLength(1);
    const versions = await readGeneratedVersions(sidePanelPage, target.record.id);
    const recovered = versions.find((entry) => isObject(entry) && entry.id === targetId) as GeneratedComponentVersionEntryV2 | undefined;
    expect(recovered?.value.summary).toBe("Conflicting recovered target.");
  });

  test("keeps cancel semantics stable across pre-commit and post-commit persistence boundaries", async ({ sidePanelPage }) => {
    const { target, firstSource } = await seedWithSources(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await installV2PersistenceHarness(sidePanelPage, { pauseBeforeAdd: true });
    let requests = await fulfillRevisionRequests(sidePanelPage, { summary: "Should not commit before cancel." });

    await sendRevision(sidePanelPage, target, firstSource, "Cancel before local commit");
    await expect(sidePanelPage.getByText("Saving revision result locally...")).toBeVisible();
    await waitForHarness(sidePanelPage, "beforeAddCalls", 1);
    const preCommitTargetId = await targetIdFromRequest(requests()[0]);
    await sidePanelPage.getByRole("button", { name: "Cancel" }).click();
    await releaseBeforeAdd(sidePanelPage);
    await expect(sidePanelPage.getByText("Revision cancelled.")).toBeVisible();
    await sidePanelPage.waitForTimeout(300);
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toHaveCount(0);
    expect(await hasGeneratedVersion(sidePanelPage, target.record.id, preCommitTargetId)).toBe(false);

    await sidePanelPage.reload();
    await enableRevisionLoopback(sidePanelPage);
    await installV2PersistenceHarness(sidePanelPage, { pauseAfterCommit: true });
    requests = await fulfillRevisionRequests(sidePanelPage, { summary: "Commit wins before cancel." });
    await sendRevision(sidePanelPage, target, firstSource, "Cancel after local commit");
    await waitForHarness(sidePanelPage, "afterCommitCalls", 1);
    const postCommitTargetId = await targetIdFromRequest(requests()[0]);
    await sidePanelPage.getByRole("button", { name: "Cancel" }).click();
    await expect(sidePanelPage.getByText("Revision cancelled.")).toBeVisible();
    await releaseAfterCommit(sidePanelPage);
    await sidePanelPage.waitForTimeout(300);
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toHaveCount(0);
    expect(await countGeneratedVersionId(sidePanelPage, target.record.id, postCommitTargetId)).toBe(1);

    await sidePanelPage.reload();
    await sidePanelPage.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await expect(sidePanelPage.getByText("3 generated versions saved locally.")).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });
});

async function seedWithSources(page: Page) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  const target = seeded[0];
  const firstSource = createSourceEntry(target, "generated-version-10000000000000000000000000000001", "GeneratedFixture", "Initial generated source.");
  const secondSource = createSourceEntry(target, "generated-version-10000000000000000000000000000002", "GeneratedAlternate", "Alternate generated source.");
  await putGeneratedVersion(page, firstSource);
  await putGeneratedVersion(page, secondSource);
  return { target, firstSource, secondSource };
}

async function sendRevision(page: Page, target: SeededCapture, source: GeneratedComponentVersionEntryV1, instruction: string) {
  await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
  await expect(page.getByRole("heading", { name: "Generated versions" })).toBeVisible();
  await page.getByRole("button", { name: source.value.componentName }).first().click();
  await page.getByRole("button", { name: "Revise or regenerate" }).click();
  await page.getByRole("button", { name: "Revise" }).click();
  await page.getByLabel("Instruction").fill(instruction);
  await page.getByRole("button", { name: "Review data" }).click();
  await page.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
  await page.getByRole("button", { name: "Send revision" }).click();
}

async function enableRevisionLoopback(page: Page) {
  await page.evaluate(() => {
    window.__EC_REVISION_WORKFLOW_TEST_LOOPBACK__ = true;
  });
}

async function installV2PersistenceHarness(page: Page, options: HarnessOptions) {
  await page.evaluate((input) => {
    window.__EC_GENERATED_VERSION_V2_PERSISTENCE_TEST_HARNESS__ = {
      enabled: true,
      beforeAddCalls: 0,
      afterCommitCalls: 0,
      attempts: [],
      ...input
    };
  }, options);
}

async function releaseBeforeAdd(page: Page) {
  await page.evaluate(() => {
    const harness = window.__EC_GENERATED_VERSION_V2_PERSISTENCE_TEST_HARNESS__;
    if (harness) {
      harness.releaseBeforeAdd = true;
    }
  });
}

async function releaseAfterCommit(page: Page) {
  await page.evaluate(() => {
    const harness = window.__EC_GENERATED_VERSION_V2_PERSISTENCE_TEST_HARNESS__;
    if (harness) {
      harness.releaseAfterCommit = true;
    }
  });
}

async function waitForHarness(page: Page, key: "beforeAddCalls" | "afterCommitCalls", value: number) {
  await page.waitForFunction(
    ({ key, value }) => {
      const harness = window.__EC_GENERATED_VERSION_V2_PERSISTENCE_TEST_HARNESS__;
      return (harness?.[key] ?? 0) === value;
    },
    { key, value }
  );
}

async function fulfillRevisionRequests(
  page: Page,
  options: Partial<ComponentGenerationResponseV1> = {}
) {
  const requests: RevisionRequest[] = [];
  await page.route(revisionEndpoint, async (route, request) => {
    requests.push({ headers: request.headers(), body: request.postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        componentName: options.componentName ?? "GeneratedFixture",
        framework: "react",
        styling: "tailwind",
        code: options.code ?? "export function GeneratedFixture() { return <button>Updated label</button>; }",
        summary: options.summary ?? "Updated label revision.",
        approximationNotes: options.approximationNotes ?? "Revision workflow closeout response."
      } satisfies ComponentGenerationResponseV1)
    });
  });
  return () => requests;
}

async function targetIdFromRequest(request: RevisionRequest) {
  return deriveRevisionGeneratedVersionId(request.headers["x-element-catcher-idempotency-key"]);
}

async function hasGeneratedVersion(page: Page, sourceCaptureId: string, id: string) {
  return (await countGeneratedVersionId(page, sourceCaptureId, id)) > 0;
}

async function countGeneratedVersionId(page: Page, sourceCaptureId: string, id: string) {
  const versions = await readGeneratedVersions(page, sourceCaptureId);
  return versions.filter((entry) => isObject(entry) && entry.id === id).length;
}

async function expectSourceUnchanged(page: Page, target: SeededCapture, source: GeneratedComponentVersionEntryV1) {
  const versions = await readGeneratedVersions(page, target.record.id);
  const storedSource = versions.find((entry) => isObject(entry) && entry.id === source.id);
  expect(storedSource).toEqual(source);
}

function conflictingV2Entry(
  target: SeededCapture,
  source: GeneratedComponentVersionEntryV1,
  id: string,
  logicalAttemptId: string
): GeneratedComponentVersionEntryV2 {
  return {
    contractVersion: 2,
    id,
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    sourceReviewFingerprint: "b".repeat(64),
    createdAt: "2026-07-18T12:04:00.000Z",
    value: {
      ...source.value,
      summary: "Conflicting recovered target.",
      code: "export function GeneratedFixture() { return <button>Conflicting target</button>; }"
    },
    operation: {
      kind: "revision",
      logicalAttemptId,
      reviewAttemptFingerprint: "c".repeat(64),
      sourceGeneratedVersionId: "generated-version-ffffffffffffffffffffffffffffffff",
      sourceGeneratedVersionFingerprint: "d".repeat(64),
      instruction: "Conflicting instruction",
      instructionFingerprint: "e".repeat(64),
      screenshotIncluded: false
    }
  };
}

function createSourceEntry(
  target: SeededCapture,
  id: string,
  componentName: string,
  summary: string
): GeneratedComponentVersionEntryV1 {
  return {
    id,
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: id.endsWith("2") ? "2026-07-18T12:01:00.000Z" : "2026-07-18T12:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName,
      framework: "react",
      styling: "tailwind",
      code: `export function ${componentName}() { return <button>Original</button>; }`,
      summary,
      approximationNotes: "Seeded test source."
    }
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
