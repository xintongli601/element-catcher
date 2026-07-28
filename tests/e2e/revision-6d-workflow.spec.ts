import { test, expect } from "./extension-fixture";
import {
  readGeneratedVersions,
  resetAndSeedSavedCaptures,
  putGeneratedVersion,
  type SeededCapture
} from "./indexed-db-fixtures";
import type { GeneratedComponentVersionEntryV1 } from "../../extension/src/shared/generated-version-contract";
import type { ComponentGenerationResponseV1 } from "../../extension/src/shared/generation-contract";

const revisionEndpoint = "http://127.0.0.1:8787/v1/revise-component";

test.describe("Milestone 6D Slice 5 trusted Side Panel revision workflow", () => {
  test("keeps production unconfigured by default and performs zero network fetches", async ({ sidePanelPage }) => {
    const { target } = await seedWithSources(sidePanelPage);
    const requests = await trackRevisionRequests(sidePanelPage);

    await openRevisionEditor(sidePanelPage, target, "GeneratedFixture - 2026-07-18T12:00:00.000Z", "Revise");
    await sidePanelPage.getByLabel("Instruction").fill("Update the button label");
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Review outbound request" })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Mode" })).toBeVisible();
    await expect(sidePanelPage.getByText("Revision", { exact: true })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Requested output" })).toBeVisible();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send revision" }).click();

    await expect(sidePanelPage.getByText("AI generation backend integration is not configured yet.")).toBeVisible();
    expect(requests()).toHaveLength(0);
  });

  test("revises a V1 source with screenshot false through loopback and persists one V2 without opening Preview", async ({ sidePanelPage }) => {
    const { target, firstSource } = await seedWithSources(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    const requests = await fulfillRevisionRequests(sidePanelPage);

    await openRevisionEditor(sidePanelPage, target, firstSource.value.componentName, "Revise");
    await expect(sidePanelPage.getByLabel("Include the saved screenshot in the outbound request.")).not.toBeChecked();
    await sidePanelPage.getByLabel("Instruction").fill("  Update   the button label ");
    await expect(sidePanelPage.getByText("28/1000")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Optional screenshot" })).toBeVisible();
    await expect(sidePanelPage.getByText("Not included. No screenshot data, digest, or metadata will be sent.")).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Send revision" })).toBeDisabled();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send revision" }).click();

    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toBeVisible();
    expect(requests()).toHaveLength(1);
    expect(requests()[0].headers["x-element-catcher-idempotency-key"]).toMatch(/^revision-attempt-[0-9a-f]{32}$/);
    expect(requests()[0].body).toMatchObject({
      contractVersion: 1,
      mode: "revision",
      revisionInstruction: "Update the button label",
      sourceComponent: { componentName: "GeneratedFixture", summary: "Initial generated source." }
    });
    expect(JSON.stringify(requests()[0].body)).not.toContain(target.record.id);
    expect(JSON.stringify(requests()[0].body)).not.toContain(firstSource.id);
    expect(JSON.stringify(requests()[0].body)).not.toContain(target.storageKey);
    expect(JSON.stringify(requests()[0].body)).not.toContain("data:image/png");
    await expect(sidePanelPage.getByText("3 generated versions saved locally.")).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("regenerates from a V2 source, shows screenshot preview, and keeps Back-to-edit identity fresh", async ({ sidePanelPage }) => {
    const { target, firstSource } = await seedWithSources(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    const requests = await fulfillRevisionRequests(sidePanelPage, { summary: "Seed V2 revision." });

    await openRevisionEditor(sidePanelPage, target, firstSource.value.componentName, "Revise");
    await sidePanelPage.getByLabel("Instruction").fill("Create a V2 source");
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send revision" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toBeVisible();
    const firstAttempt = requests()[0].headers["x-element-catcher-idempotency-key"];

    await sidePanelPage.getByRole("button", { name: /GeneratedFixture - 20/ }).first().click();
    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).first().click();
    await sidePanelPage.getByRole("button", { name: "Regenerate" }).click();
    await expect(sidePanelPage.getByText("Regeneration sends no revision instruction.")).toBeVisible();
    await sidePanelPage.getByLabel("Include the saved screenshot in the outbound request.").check();
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await expect(sidePanelPage.getByText("Regeneration", { exact: true })).toBeVisible();
    await expect(sidePanelPage.getByText("Regeneration sends no instruction.")).toBeVisible();
    await expect(sidePanelPage.getByAltText("Reviewed screenshot to be sent")).toBeVisible();
    await expect(sidePanelPage.getByText("Included. Image data will be sent.")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Back to edit" }).click();
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send regeneration" }).click();

    await expect(sidePanelPage.getByRole("heading", { name: "Regeneration saved" })).toBeVisible();
    expect(requests()).toHaveLength(2);
    expect(requests()[1].body).toMatchObject({ mode: "regeneration" });
    expect(JSON.stringify(requests()[1].body)).toContain("data:image/png");
    expect(requests()[1].headers["x-element-catcher-idempotency-key"]).not.toBe(firstAttempt);
    const generatedVersions = await readGeneratedVersions(sidePanelPage, target.record.id);
    expect(generatedVersions.filter((entry) => typeof entry === "object" && entry && (entry as { contractVersion?: unknown }).contractVersion === 2)).toHaveLength(2);
  });

  test("validates revision instructions without unhandled rejections", async ({ sidePanelPage }) => {
    const { target } = await seedWithSources(sidePanelPage);
    await openRevisionEditor(sidePanelPage, target, "GeneratedFixture", "Revise");

    for (const invalid of ["", "abc", "a".repeat(1001), "\u0001bad input", "\u202ebad input"]) {
      await sidePanelPage.getByLabel("Instruction").fill(invalid);
      await sidePanelPage.getByRole("button", { name: "Review data" }).click();
      await expect(sidePanelPage.getByRole("alert")).toContainText("Instruction must be 4 to 1000 Unicode code points");
      await expect(sidePanelPage.getByLabel("Instruction")).toBeFocused();
    }

    const validLarge = "😀".repeat(1000);
    await sidePanelPage.getByLabel("Instruction").fill(validLarge);
    await expect(sidePanelPage.getByText("1000/1000")).toBeVisible();
    await sidePanelPage.getByLabel("Instruction").press("Enter");
    await expect(sidePanelPage.getByLabel("Instruction")).toHaveValue(`${validLarge}\n`);
  });

  test("locks Send, handles malformed response, and requires a new Review before later success", async ({ sidePanelPage }) => {
    const { target } = await seedWithSources(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    const malformed = await fulfillRevisionRequests(sidePanelPage, { componentName: "RenamedFixture" });

    await openRevisionEditor(sidePanelPage, target, "GeneratedFixture", "Revise");
    await sidePanelPage.getByLabel("Instruction").fill("Keep the same component name");
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send revision" }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(sidePanelPage.getByText("The generation response was malformed and was not accepted.")).toBeVisible();
    expect(malformed()).toHaveLength(1);
    await expect(sidePanelPage.getByRole("button", { name: "Retry" })).toHaveCount(0);

    await sidePanelPage.unroute(revisionEndpoint);
    const success = await fulfillRevisionRequests(sidePanelPage);
    await sidePanelPage.getByRole("button", { name: "New review" }).click();
    await sidePanelPage.getByLabel("Instruction").fill("Create a fresh review");
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send revision" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toBeVisible();
    expect(success()).toHaveLength(1);
  });

  test("cancels active work and prevents stale source or transport continuations", async ({ sidePanelPage }) => {
    const { target, secondSource } = await seedWithSources(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    let release: (() => void) | undefined;
    const requests = await fulfillRevisionRequests(sidePanelPage, {
      delay: () => new Promise<void>((resolve) => {
        release = resolve;
      })
    });

    await openRevisionEditor(sidePanelPage, target, "GeneratedFixture", "Revise");
    await sidePanelPage.getByLabel("Instruction").fill("Cancel delayed transport");
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send revision" }).click();
    await expect(sidePanelPage.getByRole("button", { name: "Cancel" })).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Cancel" }).click();
    await expect(sidePanelPage.getByText("Revision cancelled.")).toBeVisible();
    release?.();
    await sidePanelPage.waitForTimeout(300);
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toHaveCount(0);
    expect(requests()).toHaveLength(1);

    await sidePanelPage.getByRole("button", { name: "Review again" }).click();
    await sidePanelPage.getByLabel("Instruction").fill("Old review must retire");
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Review outbound request" })).toBeVisible();
    await sidePanelPage.getByRole("button", { name: secondSource.value.componentName }).click();
    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Review outbound request" })).toHaveCount(0);
    await expect(sidePanelPage.getByText(secondSource.value.summary)).toBeVisible();
  });

  test("keeps union list, missing ancestor marker, initial generation, and explicit Preview boundary intact", async ({ sidePanelPage }) => {
    const { target, firstSource } = await seedWithSources(sidePanelPage);
    await putGeneratedVersion(sidePanelPage, {
      contractVersion: 2,
      id: "generated-version-20000000000000000000000000000003",
      sourceCaptureId: target.record.id,
      sourceCaptureSavedAt: target.savedAt,
      sourceReviewFingerprint: "b".repeat(64),
      createdAt: "2026-07-18T12:02:00.000Z",
      value: { ...firstSource.value, summary: "Missing ancestor V2." },
      operation: {
        kind: "regeneration",
        logicalAttemptId: "revision-attempt-20000000000000000000000000000003",
        reviewAttemptFingerprint: "c".repeat(64),
        sourceGeneratedVersionId: "generated-version-ffffffffffffffffffffffffffffffff",
        sourceGeneratedVersionFingerprint: "d".repeat(64),
        screenshotIncluded: false
      }
    });
    await sidePanelPage.reload();
    await sidePanelPage.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await expect(sidePanelPage.getByText("3 generated versions saved locally.")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: /GeneratedFixture/ }).first().click();
    await expect(sidePanelPage.locator("dd").filter({ hasText: "(missing ancestor)" }).first()).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    await sidePanelPage.getByRole("button", { name: "Preview" }).click();
    await expect(sidePanelPage.locator("iframe")).not.toHaveCount(0);
    await sidePanelPage.getByRole("button", { name: "Generate component" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Review data being sent" })).toBeVisible();
  });
});

async function seedWithSources(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  const target = seeded[0];
  const firstSource = createSourceEntry(target, "generated-version-10000000000000000000000000000001", "GeneratedFixture", "Initial generated source.");
  const secondSource = createSourceEntry(target, "generated-version-10000000000000000000000000000002", "GeneratedAlternate", "Alternate generated source.");
  await putGeneratedVersion(page, firstSource);
  await putGeneratedVersion(page, secondSource);
  return { target, firstSource, secondSource };
}

async function openRevisionEditor(page: Parameters<typeof resetAndSeedSavedCaptures>[0], target: SeededCapture, sourceName: string | RegExp, mode: "Revise" | "Regenerate") {
  await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
  await expect(page.getByRole("heading", { name: "Generated versions" })).toBeVisible();
  await page.getByRole("button", { name: sourceName }).first().click();
  await page.getByRole("button", { name: "Revise or regenerate" }).click();
  await expect(page.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();
  await page.getByRole("button", { name: mode }).click();
}

async function enableRevisionLoopback(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  await page.evaluate(() => {
    window.__EC_REVISION_WORKFLOW_TEST_LOOPBACK__ = true;
  });
}

async function trackRevisionRequests(page: Parameters<typeof resetAndSeedSavedCaptures>[0]) {
  const requests: unknown[] = [];
  await page.route(revisionEndpoint, async (route, request) => {
    requests.push(request.postDataJSON());
    await route.abort();
  });
  return () => requests;
}

async function fulfillRevisionRequests(
  page: Parameters<typeof resetAndSeedSavedCaptures>[0],
  options: Partial<ComponentGenerationResponseV1> & { delay?: () => Promise<void> } = {}
) {
  const requests: Array<{ headers: Record<string, string>; body: unknown }> = [];
  await page.route(revisionEndpoint, async (route, request) => {
    requests.push({ headers: request.headers(), body: request.postDataJSON() });
    await options.delay?.();
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
        approximationNotes: options.approximationNotes ?? "Revision workflow e2e response."
      } satisfies ComponentGenerationResponseV1)
    });
  });
  return () => requests;
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
