import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, openSidePanelPage, test } from "./extension-fixture";
import {
  DEFAULT_CAPTURE_FIXTURES,
  deleteRecordWrapper,
  readAllRecordWrappers,
  resetAndSeedSavedCaptures
} from "./indexed-db-fixtures";
import {
  INTERACTION_PAIR_TRIGGERS,
  createInteractionPairV1,
  validateInteractionPairCreateInput,
  validateInteractionPairV1
} from "../../extension/src/shared/interaction-pair-contract";

const root = join(import.meta.dirname, "../..");

test.describe("Milestone 11 Interaction Pair V1", () => {
  test("contract preserves old two-state records and validates additional reactions", () => {
    const [base, alternate, additional] = DEFAULT_CAPTURE_FIXTURES;

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
      validateInteractionPairV1({
        schemaVersion: 1,
        id: "interaction-00000000-0000-4000-8000-000000000001",
        createdAt: "2026-08-11T00:00:00.000Z",
        baseCaptureId: base.id,
        alternateCaptureId: alternate.id,
        trigger: "hover"
      })
    ).not.toThrow();

    const pair = createInteractionPairV1({
      baseCaptureId: base.id,
      alternateCaptureId: alternate.id,
      additionalReactionCaptureIds: [additional.id],
      trigger: "hover"
    });
    expect(pair.additionalReactionCaptureIds).toEqual([additional.id]);

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
      validateInteractionPairCreateInput({
        baseCaptureId: base.id,
        alternateCaptureId: alternate.id,
        additionalReactionCaptureIds: [base.id],
        trigger: "hover"
      })
    ).toThrow();
    expect(() =>
      validateInteractionPairCreateInput({
        baseCaptureId: base.id,
        alternateCaptureId: alternate.id,
        additionalReactionCaptureIds: [alternate.id],
        trigger: "hover"
      })
    ).toThrow();
    expect(() =>
      validateInteractionPairCreateInput({
        baseCaptureId: base.id,
        alternateCaptureId: alternate.id,
        additionalReactionCaptureIds: [additional.id, additional.id],
        trigger: "hover"
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

  test("Library creates, reopens, inspects, and deletes an Interaction Pair with additional reactions without remote requests", async ({ context, extensionId }) => {
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

    await page.getByLabel("Trigger / Before").selectOption({ label: seeded[1].title });
    await page.getByLabel("Primary Reaction").selectOption({ label: seeded[0].title });
    await page.getByLabel("Additional Reactions").selectOption([{ label: seeded[2].title }]);
    await page.getByLabel("Interaction trigger").selectOption("click");
    await page.getByLabel("Interaction title").fill("Open pricing detail");
    await page.getByRole("button", { name: "Save Interaction Pair" }).click();

    await expect(page.getByText("Interaction Pair saved locally.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open interaction pair: Open pricing detail" })).toBeVisible();
    await expect(page.getByLabel("Interaction Pair detail: Open pricing detail")).toContainText(`${seeded[1].title} --click--> ${seeded[0].title}`);
    await expect(page.getByLabel("Interaction Pair detail: Open pricing detail")).toContainText("Additional Reactions");
    await expect(page.getByLabel("Interaction Pair detail: Open pricing detail")).toContainText(seeded[2].title);
    await expect(page.getByLabel("Interaction Pair detail: Open pricing detail").getByRole("img")).toHaveCount(3);
    expect(httpRequests).toEqual([]);

    await page.close();
    const reopened = await openSidePanelPage(context, extensionId);
    await expect(reopened.getByRole("button", { name: "Open interaction pair: Open pricing detail" })).toBeVisible();
    await reopened.getByRole("button", { name: "Open interaction pair: Open pricing detail" }).click();
    await expect(reopened.getByLabel("Interaction Pair detail: Open pricing detail")).toContainText("Interaction");
    await expect(reopened.getByLabel("Interaction Pair detail: Open pricing detail")).toContainText("click");
    await expect(reopened.getByLabel("Interaction Pair detail: Open pricing detail").getByRole("img")).toHaveCount(3);

    await reopened.getByRole("button", { name: "Delete Interaction Pair" }).click();
    await expect(reopened.getByText("No saved Interaction Pairs yet.")).toBeVisible();
    expect(await readAllRecordWrappers(reopened)).toHaveLength(seeded.length);
    await reopened.close();
  });

  test("missing primary reaction fails safely and ordinary Capture Library behavior remains intact", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();

    await sidePanelPage.getByLabel("Trigger / Before").selectOption({ label: seeded[1].title });
    await sidePanelPage.getByLabel("Primary Reaction").selectOption({ label: seeded[0].title });
    await sidePanelPage.getByLabel("Interaction trigger").selectOption("hover");
    await sidePanelPage.getByRole("button", { name: "Save Interaction Pair" }).click();
    await expect(sidePanelPage.getByRole("button", { name: new RegExp(`Open interaction pair: ${seeded[1].title} hover interaction`) })).toBeVisible();

    await deleteRecordWrapper(sidePanelPage, seeded[0].record.id);
    await sidePanelPage.reload();

    const pairButton = sidePanelPage.getByRole("button", { name: new RegExp(`Open interaction pair: ${seeded[1].title} hover interaction`) });
    await expect(pairButton).toBeVisible();
    await pairButton.click();
    await expect(sidePanelPage.getByText("This Interaction Pair is incomplete because one or more referenced captures are missing.")).toBeVisible();
    await expect(sidePanelPage.getByLabel(/Interaction Pair detail:/).getByText(new RegExp(`${seeded[1].title} --hover--> Missing primary reaction`))).toBeVisible();

    await expect(sidePanelPage.getByRole("list", { name: "Saved captures" }).getByRole("button")).toHaveCount(seeded.length - 1);
    await sidePanelPage.getByRole("button", { name: `Open saved capture: ${seeded[1].title}` }).click();
    await expect(sidePanelPage.getByRole("heading", { name: seeded[1].title })).toBeVisible();
  });

  test("missing additional reaction fails safely after reopen", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();

    await sidePanelPage.getByLabel("Trigger / Before").selectOption({ label: seeded[1].title });
    await sidePanelPage.getByLabel("Primary Reaction").selectOption({ label: seeded[0].title });
    await sidePanelPage.getByLabel("Additional Reactions").selectOption([{ label: seeded[2].title }]);
    await sidePanelPage.getByLabel("Interaction trigger").selectOption("hover");
    await sidePanelPage.getByRole("button", { name: "Save Interaction Pair" }).click();

    await deleteRecordWrapper(sidePanelPage, seeded[2].record.id);
    await sidePanelPage.reload();

    const pairButton = sidePanelPage.getByRole("button", { name: new RegExp(`Open interaction pair: ${seeded[1].title} hover interaction`) });
    await expect(pairButton).toBeVisible();
    await pairButton.click();
    await expect(sidePanelPage.getByText("This Interaction Pair is incomplete because one or more referenced captures are missing.")).toBeVisible();
    await expect(sidePanelPage.getByLabel(/Interaction Pair detail:/).getByText("Additional Reaction 1")).toBeVisible();
    await expect(sidePanelPage.getByLabel(/Interaction Pair detail:/).getByText("Missing capture")).toBeVisible();
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
