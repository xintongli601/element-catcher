import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, openSidePanelPage, test } from "./extension-fixture";
import {
  DEFAULT_CAPTURE_FIXTURES,
  deleteRecordWrapper,
  resetAndSeedSavedCaptures
} from "./indexed-db-fixtures";
import {
  INTERACTION_PAIR_TRIGGERS,
  validateInteractionPairCreateInput,
  validateInteractionPairV1
} from "../../extension/src/shared/interaction-pair-contract";

const root = join(import.meta.dirname, "../..");

test.describe("Milestone 11 Slice 1 Two-State Interaction Pair V1", () => {
  test("contract accepts exactly the four V1 triggers and rejects invalid or same-capture pairs", () => {
    const [base, alternate] = DEFAULT_CAPTURE_FIXTURES;

    expect(INTERACTION_PAIR_TRIGGERS).toEqual(["click", "toggle", "hover", "focus"]);
    for (const trigger of INTERACTION_PAIR_TRIGGERS) {
      expect(() =>
        validateInteractionPairCreateInput({
          baseCaptureId: base.id,
          alternateCaptureId: alternate.id,
          trigger
        })
      ).not.toThrow();
    }

    expect(() =>
      validateInteractionPairCreateInput({
        baseCaptureId: base.id,
        alternateCaptureId: alternate.id,
        trigger: "drag" as never
      })
    ).toThrow();
    expect(() =>
      validateInteractionPairCreateInput({
        baseCaptureId: base.id,
        alternateCaptureId: base.id,
        trigger: "click"
      })
    ).toThrow();
    expect(() =>
      validateInteractionPairV1({
        schemaVersion: 1,
        id: "interaction-00000000-0000-4000-8000-000000000001",
        createdAt: "2026-08-11T00:00:00.000Z",
        baseCaptureId: base.id,
        alternateCaptureId: alternate.id,
        trigger: "custom"
      })
    ).toThrow();
  });

  test("Library creates, reopens, inspects, and deletes an Interaction Pair without remote requests", async ({ context, extensionId }) => {
    const page = await openSidePanelPage(context, extensionId);
    const httpRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) {
        httpRequests.push(request.url());
      }
    });
    const seeded = await resetAndSeedSavedCaptures(page);
    await page.reload();

    await expect(page.getByRole("heading", { name: "Capture Library" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Saved captures" }).getByRole("button")).toHaveCount(seeded.length);
    await expect(page.getByRole("heading", { name: "Interaction Pairs" })).toBeVisible();
    await expect(page.getByText("No saved Interaction Pairs yet.")).toBeVisible();

    await page.getByLabel("Base state").selectOption({ label: seeded[1].title });
    await page.getByLabel("Alternate state").selectOption({ label: seeded[0].title });
    await page.getByLabel("Trigger").selectOption("click");
    await page.getByLabel("Interaction title").fill("Open pricing detail");
    await page.getByRole("button", { name: "Save Interaction Pair" }).click();

    await expect(page.getByText("Interaction Pair saved locally.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open interaction pair: Open pricing detail" })).toBeVisible();
    await expect(page.getByLabel("Interaction Pair detail: Open pricing detail")).toContainText(`${seeded[1].title} --click--> ${seeded[0].title}`);
    await expect(page.getByLabel("Interaction Pair detail: Open pricing detail").getByRole("img")).toHaveCount(2);
    expect(httpRequests).toEqual([]);

    await page.close();
    const reopened = await openSidePanelPage(context, extensionId);
    await expect(reopened.getByRole("button", { name: "Open interaction pair: Open pricing detail" })).toBeVisible();
    await reopened.getByRole("button", { name: "Open interaction pair: Open pricing detail" }).click();
    await expect(reopened.getByLabel("Interaction Pair detail: Open pricing detail")).toContainText("Trigger");
    await expect(reopened.getByLabel("Interaction Pair detail: Open pricing detail")).toContainText("click");

    await reopened.getByRole("button", { name: "Delete Interaction Pair" }).click();
    await expect(reopened.getByText("No saved Interaction Pairs yet.")).toBeVisible();
    await reopened.close();
  });

  test("missing referenced capture fails safely and ordinary Capture Library behavior remains intact", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();

    await sidePanelPage.getByLabel("Base state").selectOption({ label: seeded[1].title });
    await sidePanelPage.getByLabel("Alternate state").selectOption({ label: seeded[0].title });
    await sidePanelPage.getByLabel("Trigger").selectOption("hover");
    await sidePanelPage.getByRole("button", { name: "Save Interaction Pair" }).click();
    await expect(sidePanelPage.getByRole("button", { name: new RegExp(`Open interaction pair: ${seeded[1].title} hover interaction`) })).toBeVisible();

    await deleteRecordWrapper(sidePanelPage, seeded[1].record.id);
    await sidePanelPage.reload();

    const pairButton = sidePanelPage.getByRole("button", { name: new RegExp(`Open interaction pair: Base hover interaction|Open interaction pair: ${seeded[1].title} hover interaction`) });
    await expect(pairButton).toBeVisible();
    await pairButton.click();
    await expect(sidePanelPage.getByText("This Interaction Pair is incomplete because a referenced capture is missing.")).toBeVisible();
    await expect(sidePanelPage.getByLabel(/Interaction Pair detail:/).getByText("Missing base state --hover-->")).toBeVisible();

    await expect(sidePanelPage.getByRole("list", { name: "Saved captures" }).getByRole("button")).toHaveCount(seeded.length - 1);
    await sidePanelPage.getByRole("button", { name: `Open saved capture: ${seeded[0].title}` }).click();
    await expect(sidePanelPage.getByRole("heading", { name: seeded[0].title })).toBeVisible();
  });

  test("Manifest permissions and CaptureRecord v1 schema remain unchanged for Interaction Pair V1", () => {
    const manifest = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8")) as {
      permissions?: string[];
      host_permissions?: string[];
    };
    expect(manifest.permissions?.sort()).toEqual(["activeTab", "scripting", "sidePanel"]);
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("webRequest");
    expect(manifest.permissions).not.toContain("identity");
    expect(manifest.permissions).not.toContain("downloads");
    expect(manifest.host_permissions).not.toContain("<all_urls>");

    const captureSchema = readFileSync(join(root, "extension/src/shared/capture-schema.ts"), "utf8");
    expect(captureSchema).toContain("export type CaptureSchemaVersion = 1;");
    expect(captureSchema).not.toContain("InteractionPair");
    expect(captureSchema).not.toContain("interactionPairs");
  });
});
