import { test, expect } from "./extension-fixture";
import {
  readGeneratedVersions,
  resetAndSeedSavedCaptures,
  putGeneratedVersion,
  type SeededCapture
} from "./indexed-db-fixtures";
import type { GeneratedComponentVersionEntryV1 } from "../../extension/src/shared/generated-version-contract";
import type { ComponentGenerationResponseV1 } from "../../extension/src/shared/generation-contract";

test.describe("Milestone 6D Slice 5 trusted Side Panel revision workflow", () => {
  test("revises a persisted V1 source through frozen review, consent, loopback transport, and V2 persistence", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    const target = seeded[0];
    const sourceEntry = createSourceEntry(target);
    await putGeneratedVersion(sidePanelPage, sourceEntry);

    const requests: Array<{ headers: Record<string, string>; body: unknown }> = [];
    await sidePanelPage.route("http://127.0.0.1:8787/v1/revise-component", async (route, request) => {
      requests.push({
        headers: request.headers(),
        body: request.postDataJSON()
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1,
          componentName: "GeneratedFixture",
          framework: "react",
          styling: "tailwind",
          code: "export function GeneratedFixture() { return <button>Updated label</button>; }",
          summary: "Updated label revision.",
          approximationNotes: "Revision workflow e2e response."
        } satisfies ComponentGenerationResponseV1)
      });
    });

    await sidePanelPage.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
    await expect(sidePanelPage.getByText("1 generated version saved locally.")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: /GeneratedFixture/ }).click();
    await expect(sidePanelPage.getByText("Initial generation", { exact: true })).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();

    await sidePanelPage.getByRole("button", { name: "Revise" }).click();
    await expect(sidePanelPage.getByLabel("Instruction")).toBeVisible();
    await expect(sidePanelPage.getByText("0/1000")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Include the saved screenshot in the outbound request.")).not.toBeChecked();
    await sidePanelPage.getByLabel("Instruction").fill("  Update   the button label ");
    await expect(sidePanelPage.getByText("28/1000")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();

    await expect(sidePanelPage.getByRole("heading", { name: "Review outbound request" })).toBeVisible();
    await expect(sidePanelPage.getByText("Update the button label")).toBeVisible();
    await expect(sidePanelPage.getByText("Not included. No screenshot data, digest, or metadata will be sent.")).toBeVisible();
    await expect(sidePanelPage.getByText("local capture IDs", { exact: false })).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Send revision" })).toBeDisabled();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send revision" }).click();

    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0].headers["x-element-catcher-idempotency-key"]).toMatch(/^revision-attempt-[0-9a-f]{32}$/);
    expect(requests[0].body).toMatchObject({
      contractVersion: 1,
      mode: "revision",
      revisionInstruction: "Update the button label",
      sourceComponent: {
        componentName: "GeneratedFixture",
        framework: "react",
        styling: "tailwind",
        summary: "Initial generated source."
      }
    });
    expect(JSON.stringify(requests[0].body)).not.toContain(target.record.id);
    expect(JSON.stringify(requests[0].body)).not.toContain(sourceEntry.id);
    expect(JSON.stringify(requests[0].body)).not.toContain(target.storageKey);
    expect(JSON.stringify(requests[0].body)).not.toContain("data:image/png");

    await expect(sidePanelPage.getByText("2 generated versions saved locally.")).toBeVisible();
    const generatedVersions = await readGeneratedVersions(sidePanelPage, target.record.id);
    const v2Entry = generatedVersions.find((entry) => typeof entry === "object" && entry && (entry as { contractVersion?: unknown }).contractVersion === 2) as {
      operation: { kind: string; sourceGeneratedVersionId: string; instruction: string; screenshotIncluded: boolean };
      value: { summary: string };
    } | undefined;
    expect(v2Entry).toBeTruthy();
    expect(v2Entry?.operation).toMatchObject({
      kind: "revision",
      sourceGeneratedVersionId: sourceEntry.id,
      instruction: "Update the button label",
      screenshotIncluded: false
    });
    expect(v2Entry?.value.summary).toBe("Updated label revision.");
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });
});

function createSourceEntry(target: SeededCapture): GeneratedComponentVersionEntryV1 {
  return {
    id: "generated-version-10000000000000000000000000000001",
    sourceCaptureId: target.record.id,
    sourceCaptureSavedAt: target.savedAt,
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: "2026-07-18T12:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName: "GeneratedFixture",
      framework: "react",
      styling: "tailwind",
      code: "export function GeneratedFixture() { return <button>Original</button>; }",
      summary: "Initial generated source.",
      approximationNotes: "Seeded test source."
    }
  };
}
