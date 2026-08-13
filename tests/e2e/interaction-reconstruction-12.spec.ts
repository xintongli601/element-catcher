import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./extension-fixture";
import {
  CURRENT_OBJECT_STORE_NAMES,
  DEFAULT_CAPTURE_FIXTURES,
  type CaptureFixtureSpec,
  createCaptureRecordFixture,
  deleteRecordWrapper,
  readAllRecordWrappers,
  readInteractionReconstructions,
  resetAndSeedSavedCaptures
} from "./indexed-db-fixtures";
import {
  installPreviewMessageRecorder,
  previewFrameBySuffix,
  renderMessagesContainGeneratedSource
} from "./preview-helpers";
import {
  createInteractionReconstructionEntry,
  prepareInteractionReconstructionReview,
  type InteractionReconstructionReviewModel
} from "../../extension/src/generation/interactive-reconstruction";
import { buildExactCaptureContextProjection } from "../../extension/src/generation/projection";
import {
  validateInteractionReconstructionEntryV1,
  validateInteractionReconstructionRequestWithoutDataUrlsV1,
  INTERACTIVE_RECONSTRUCTION_STORE_NAME,
  type InteractionReconstructionRequestWithoutDataUrlsV1,
  type InteractionReconstructionSurfaceProjectionV1
} from "../../extension/src/shared/interactive-reconstruction-contract";
import { INTERACTION_PAIR_TRIGGERS, type InteractionPairTrigger } from "../../extension/src/shared/interaction-pair-contract";
import {
  canonicalStringify,
  sha256Hex,
  validateInteractivePreviewPlanV1
} from "../../extension/src/shared/preview-policy";

const root = join(import.meta.dirname, "../..");
const pairId = "interaction-00000000-0000-4000-8000-000000000001";
const VISUAL_RECONSTRUCTION_FIXTURES: CaptureFixtureSpec[] = [
  {
    ...DEFAULT_CAPTURE_FIXTURES[0],
    title: "Alpha Menu",
    domTextPreview: "Annual plan menu",
    childSummaryTextPreview: "Annual plan menu",
    styleSentinel: "#2563eb"
  },
  {
    ...DEFAULT_CAPTURE_FIXTURES[1],
    title: "Beta Trigger",
    tagName: "button",
    semanticRole: "button",
    domTextPreview: "Open pricing",
    childSummaryTextPreview: "Open pricing",
    styleSentinel: "#0f766e"
  },
  {
    ...DEFAULT_CAPTURE_FIXTURES[2],
    title: "Gamma Action",
    domTextPreview: "Upgrade now",
    childSummaryTextPreview: "Upgrade now",
    styleSentinel: "#7c3aed"
  }
];

test.describe("Milestone 12 Interactive Reconstruction", () => {
  test("contract projects private Interaction Pair data and maps every supported trigger", async () => {
    for (const trigger of INTERACTION_PAIR_TRIGGERS) {
      const review = await createReview(trigger);
      validateInteractionReconstructionRequestWithoutDataUrlsV1(review.requestWithoutDataUrls);
      expect(JSON.stringify(review.requestWithoutDataUrls)).not.toContain(DEFAULT_CAPTURE_FIXTURES[0].sourceUrl);
      expect(JSON.stringify(review.requestWithoutDataUrls)).not.toContain(DEFAULT_CAPTURE_FIXTURES[0].pageTitle);
      expect(JSON.stringify(review.requestWithoutDataUrls)).not.toContain("user:secret");
      expect(review.requestWithoutDataUrls.privacy).toEqual({
        excludesBrowserStorage: true,
        excludesCookies: true,
        excludesCredentials: true,
        excludesPageTitle: true,
        excludesSourceSession: true,
        excludesSourceUrl: true
      });

      const entry = await createInteractionReconstructionEntry(review);
      validateInteractionReconstructionEntryV1(entry);
      expect(entry.interactivePreviewPlan.trigger).toBe(trigger);
      expect(entry.interactivePreviewPlan.additionalReactions).toHaveLength(1);
      expect(entry.value.code).toContain("useState");
      expect(entry.value.code).toContain(trigger === "hover" ? "onMouseEnter" : trigger === "focus" ? "onFocus" : "onClick");
      expect(entry.value.code).toContain("Safe fixture text");
      expect(entry.value.code).not.toContain("Rest state");
      expect(entry.value.code).not.toContain("Primary visible reaction");
      expect(entry.value.code).not.toContain("Additional reaction surface");
    }
  });

  test("unsafe interactive preview plans and malformed reconstruction entries fail closed", async () => {
    const review = await createReview("hover");
    const entry = await createInteractionReconstructionEntry(review);
    expect(() =>
      validateInteractivePreviewPlanV1({
        ...entry.interactivePreviewPlan,
        rest: {
          kind: "element",
          tag: "button",
          props: { onClick: "window.__executed = true" },
          children: [{ kind: "text", value: "unsafe" }]
        }
      })
    ).toThrow();
    expect(() => validateInteractivePreviewPlanV1({ ...entry.interactivePreviewPlan, trigger: "drag" })).toThrow();
    expect(() => validateInteractionReconstructionEntryV1({ ...entry, value: { ...entry.value, code: "eval('alert(1)')" } })).toThrow();
  });

  test("side panel reconstructs, previews, exports, persists, reopens, and deletes without network requests", async ({ sidePanelPage }) => {
    const httpRequests: string[] = [];
    sidePanelPage.on("request", (request) => {
      if (/^https?:/.test(request.url())) {
        httpRequests.push(request.url());
      }
    });
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage, VISUAL_RECONSTRUCTION_FIXTURES);
    await sidePanelPage.reload();
    await installPreviewMessageRecorder(sidePanelPage);
    const triggerCapture = seeded.find((capture) => capture.title === "Beta Trigger")!;
    const primaryCapture = seeded.find((capture) => capture.title === "Alpha Menu")!;
    const additionalCapture = seeded.find((capture) => capture.title === "Gamma Action")!;

    await sidePanelPage.getByLabel("Trigger / Before").selectOption({ label: triggerCapture.title });
    await sidePanelPage.getByLabel("Primary Reaction").selectOption({ label: primaryCapture.title });
    await sidePanelPage.getByLabel("Additional Reactions").selectOption([{ label: additionalCapture.title }]);
    await sidePanelPage.getByLabel("Interaction trigger").selectOption("hover");
    await sidePanelPage.getByLabel("Interaction title").fill("Hover price detail");
    await sidePanelPage.getByRole("button", { name: "Save Interaction Pair" }).click();

    await sidePanelPage.getByRole("button", { name: "Reconstruct interaction" }).click();
    await expect(sidePanelPage.getByText("Review interaction reconstruction data")).toBeVisible();
    await expect(sidePanelPage.getByText("Source URL, page title, cookies, browser storage, credentials, and browser session excluded.")).toBeVisible();
    await expect(sidePanelPage.getByText("Bounded capture projections and verified screenshot metadata are used only after this consent.")).toBeVisible();
    expect(httpRequests).toEqual([]);

    await sidePanelPage.getByRole("checkbox").check();
    await sidePanelPage.getByRole("button", { name: "Generate interactive reconstruction" }).click();
    await expect(sidePanelPage.getByRole("button", { name: /Open interactive reconstruction:/ })).toBeVisible();
    await expect(sidePanelPage.locator("pre.generated-code-block")).toContainText("export function");
    await expect(sidePanelPage.locator("pre.generated-code-block")).toContainText("Open pricing");
    await expect(sidePanelPage.locator("pre.generated-code-block")).toContainText("Annual plan menu");
    await expect(sidePanelPage.locator("pre.generated-code-block")).toContainText("Upgrade now");
    await expect(sidePanelPage.locator("pre.generated-code-block")).toContainText("bg-teal-600");
    await expect(sidePanelPage.locator("pre.generated-code-block")).toContainText("bg-blue-600");
    await expect(sidePanelPage.locator("pre.generated-code-block")).toContainText("bg-purple-600");
    await expect(sidePanelPage.locator("pre.generated-code-block")).not.toContainText("Rest state");
    await expect(sidePanelPage.locator("pre.generated-code-block")).not.toContainText("Primary visible reaction");
    await expect(sidePanelPage.locator("pre.generated-code-block")).not.toContainText("Additional reaction surface");
    await expect(sidePanelPage.locator("pre.generated-code-block")).not.toContainText(primaryCapture.record.source.pageTitle);
    await expect(sidePanelPage.locator("pre.generated-code-block")).not.toContainText("user:secret");

    await expect(sidePanelPage.getByText("Preview ready", { exact: true })).toBeVisible();
    const frame = previewFrameBySuffix(sidePanelPage, "src/preview/render-realm.html");
    await expect(frame.locator(".bg-teal-600", { hasText: "Open pricing" })).toBeVisible();
    await expect(frame.getByText("Annual plan menu")).toHaveCount(0);
    await frame.getByRole("group", { name: /interactive preview/ }).hover();
    await expect(frame.locator(".bg-blue-600", { hasText: "Annual plan menu" })).toBeVisible();
    await expect(frame.locator(".bg-purple-600", { hasText: "Upgrade now" })).toBeVisible();
    expect(await renderMessagesContainGeneratedSource(sidePanelPage)).toBe(false);

    const downloadPromise = sidePanelPage.waitForEvent("download");
    await sidePanelPage.getByRole("button", { name: "Export .tsx" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/Interaction\.tsx$/);

    const stored = await readInteractionReconstructions(sidePanelPage);
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).toContain("Open pricing");
    expect(JSON.stringify(stored)).not.toContain(primaryCapture.record.source.pageTitle);

    await sidePanelPage.reload();
    await sidePanelPage.getByRole("button", { name: "Open interaction pair: Hover price detail" }).click();
    await expect(sidePanelPage.getByRole("button", { name: /Open interactive reconstruction:/ })).toBeVisible();
    await sidePanelPage.getByRole("button", { name: /Open interactive reconstruction:/ }).click();
    await sidePanelPage.getByRole("button", { name: "Delete reconstruction" }).click();
    await expect(sidePanelPage.getByText("No interactive reconstructions yet.")).toBeVisible();
    expect(await readInteractionReconstructions(sidePanelPage)).toHaveLength(0);
    expect(await readAllRecordWrappers(sidePanelPage)).toHaveLength(seeded.length);
    expect(httpRequests).toEqual([]);
  });

  test("toggle preview uses reconstructed capture visuals rather than source execution", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage, VISUAL_RECONSTRUCTION_FIXTURES);
    await sidePanelPage.reload();
    const triggerCapture = seeded.find((capture) => capture.title === "Beta Trigger")!;
    const primaryCapture = seeded.find((capture) => capture.title === "Alpha Menu")!;

    await sidePanelPage.getByLabel("Trigger / Before").selectOption({ label: triggerCapture.title });
    await sidePanelPage.getByLabel("Primary Reaction").selectOption({ label: primaryCapture.title });
    await sidePanelPage.getByLabel("Interaction trigger").selectOption("toggle");
    await sidePanelPage.getByRole("button", { name: "Save Interaction Pair" }).click();
    await sidePanelPage.getByRole("button", { name: "Reconstruct interaction" }).click();
    await sidePanelPage.getByRole("checkbox").check();
    await sidePanelPage.getByRole("button", { name: "Generate interactive reconstruction" }).click();
    await expect(sidePanelPage.getByText("Preview ready", { exact: true })).toBeVisible();
    const frame = previewFrameBySuffix(sidePanelPage, "src/preview/render-realm.html");
    await expect(frame.getByText("Annual plan menu")).toHaveCount(0);
    await frame.getByRole("group", { name: /interactive preview/ }).click();
    await expect(frame.locator(".bg-blue-600", { hasText: "Annual plan menu" })).toBeVisible();
    await frame.getByRole("group", { name: /interactive preview/ }).click();
    await expect(frame.getByText("Annual plan menu")).toHaveCount(0);
  });

  test("missing referenced captures fail closed before reconstruction starts", async ({ sidePanelPage }) => {
    const seeded = await resetAndSeedSavedCaptures(sidePanelPage);
    await sidePanelPage.reload();
    await sidePanelPage.getByLabel("Trigger / Before").selectOption({ label: seeded[1].title });
    await sidePanelPage.getByLabel("Primary Reaction").selectOption({ label: seeded[0].title });
    await sidePanelPage.getByLabel("Interaction trigger").selectOption("focus");
    await sidePanelPage.getByRole("button", { name: "Save Interaction Pair" }).click();
    await deleteRecordWrapper(sidePanelPage, seeded[0].record.id);
    await sidePanelPage.reload();

    await sidePanelPage.getByRole("button", { name: /Open interaction pair:/ }).click();
    await expect(sidePanelPage.getByText("Reconstruction is unavailable until every referenced capture is available.")).toBeVisible();
    await expect(sidePanelPage.getByRole("button", { name: "Reconstruct interaction" })).toBeDisabled();
    await expect(prepareInteractionReconstructionReview({
      pair: {
        schemaVersion: 1,
        id: pairId,
        createdAt: "2026-08-12T00:00:00.000Z",
        baseCaptureId: seeded[1].record.id,
        alternateCaptureId: seeded[0].record.id,
        trigger: "focus"
      },
      baseCapture: undefined,
      alternateCapture: undefined,
      additionalReactionCaptures: [],
      missingCaptureIds: [seeded[0].record.id]
    })).rejects.toThrow();
  });

  test("static generation, M11 boundaries, and manifest/capture boundaries remain intact", () => {
    const indexedDb = readFileSync(join(root, "extension/src/storage/indexed-db.ts"), "utf8");
    const captureSchema = readFileSync(join(root, "extension/src/shared/capture-schema.ts"), "utf8");
    const manifest = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8")) as {
      permissions?: string[];
      host_permissions?: string[];
    };

    expect(indexedDb).toContain("ELEMENT_CATCHER_DATABASE_VERSION = 4");
    expect(indexedDb).toContain("INTERACTIVE_RECONSTRUCTION_STORE_NAME");
    expect(CURRENT_OBJECT_STORE_NAMES).toContain(INTERACTIVE_RECONSTRUCTION_STORE_NAME);
    expect(captureSchema).toContain("export type CaptureSchemaVersion = 1;");
    expect(captureSchema).not.toContain("InteractionReconstruction");
    expect(manifest.permissions?.sort()).toEqual(["activeTab", "scripting", "sidePanel"]);
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
  });
});

async function createReview(trigger: InteractionPairTrigger): Promise<InteractionReconstructionReviewModel> {
  const requestWithoutDataUrls = createRequest(trigger);
  return {
    pairId,
    title: `${trigger} reconstruction`,
    requestWithoutDataUrls,
    sourceInteractionPairFingerprint: await sha256Hex(canonicalStringify(requestWithoutDataUrls))
  };
}

function createRequest(trigger: InteractionPairTrigger): InteractionReconstructionRequestWithoutDataUrlsV1 {
  return {
    contractVersion: 1,
    interaction: {
      pairId,
      trigger,
      semantics: "bounded-visible-ui-only"
    },
    surfaces: [
      createSurface("triggerBefore", 0),
      createSurface("primaryReaction", 1),
      createSurface("additionalReaction", 2)
    ],
    requestedOutput: {
      framework: "react",
      styling: "tailwind",
      behavior: "bounded-interactive",
      fields: ["componentName", "code", "summary", "approximationNotes", "interactivePreviewPlan"]
    },
    privacy: {
      excludesBrowserStorage: true,
      excludesCookies: true,
      excludesCredentials: true,
      excludesPageTitle: true,
      excludesSourceSession: true,
      excludesSourceUrl: true
    }
  };
}

function createSurface(role: InteractionReconstructionSurfaceProjectionV1["role"], fixtureIndex: number): InteractionReconstructionSurfaceProjectionV1 {
  const fixture = DEFAULT_CAPTURE_FIXTURES[fixtureIndex];
  const captureContext = buildExactCaptureContextProjection(createCaptureRecordFixture(fixture));
  return {
    role,
    captureId: fixture.id,
    screenshot: {
      mediaType: "image/png",
      width: fixture.width,
      height: fixture.height,
      byteLength: 128,
      digest: `${fixtureIndex + 1}`.repeat(64).slice(0, 64)
    },
    captureContext
  };
}
