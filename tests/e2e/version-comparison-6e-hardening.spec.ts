import { expect, openSidePanelPage, test } from "./extension-fixture";
import {
  ELEMENT_CATCHER_DATABASE_VERSION,
  GENERATED_COMPONENT_VERSION_STORE_NAME,
  putGeneratedVersion,
  readGeneratedVersions,
  readPersistenceCounts,
  readRecordWrapper,
  readScreenshotAssetSnapshot,
  readGeneratedStoreInfo,
  resetAndSeedSavedCaptures,
  type SeededCapture
} from "./indexed-db-fixtures";
import type { Page } from "@playwright/test";
import type {
  GeneratedComponentVersionEntry,
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";
import type { ComponentGenerationResponseV1 } from "../../extension/src/shared/generation-contract";

const revisionEndpoint = "http://127.0.0.1:8787/v1/revise-component";

test.describe("Milestone 6E Slice 3 version comparison hardening", () => {
  test("ignores an older generated-version refresh completion after a newer accepted list wins ownership", async ({ sidePanelPage }) => {
    const { target, base, child, refreshSource } = await seedComparisonVersions(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await fulfillRevisionRequests(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await expect(sidePanelPage.getByText(child.value.summary)).toBeVisible();

    await installGeneratedListCompletionGate(sidePanelPage, target.record.id, 2);
    await saveRevisionFromVersion(sidePanelPage, refreshSource, "Start stale refresh");
    await expectGeneratedListGateCount(sidePanelPage, 1);

    const newestChild = {
      ...child,
      value: {
        ...child.value,
        code: "export function CandidateCard() {\n  return <button>Newest accepted child</button>;\n}",
        summary: "Newest accepted child summary."
      }
    };
    await putGeneratedVersion(sidePanelPage, newestChild);
    await saveRevisionFromVersion(sidePanelPage, refreshSource, "Start newest refresh");
    await expectGeneratedListGateCount(sidePanelPage, 2);

    await releaseGeneratedListCompletion(sidePanelPage, 1);
    await expect(sidePanelPage.getByText("Newest accepted child summary.")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Complete Candidate code").getByText("Newest accepted child")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(base.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);

    await releaseGeneratedListCompletion(sidePanelPage, 0);
    await expect(sidePanelPage.getByText("Newest accepted child summary.")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Complete Candidate code").getByText("Newest accepted child")).toBeVisible();
    await expect(sidePanelPage.getByText("Candidate generated source.")).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(base.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("drops a previous-capture late revision completion after Detail unmount and capture switch", async ({ sidePanelPage }) => {
    const { target, otherTarget, base, child } = await seedComparisonVersions(sidePanelPage);
    const { otherBase, otherChild } = await seedOtherComparisonVersions(sidePanelPage, otherTarget);
    await enableRevisionLoopback(sidePanelPage);
    const route = await installDeferredRevisionRoute(sidePanelPage);

    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await startSaveFromVersion(sidePanelPage, child, "revision", "Delay capture A revision completion");
    await route.waitForRequest(0);

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, otherTarget);
    await route.release(0, { componentName: child.value.componentName, summary: "Late Capture A revision saved." });

    await expect(sidePanelPage.getByRole("heading", { name: otherTarget.title })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.getByText(target.title)).toHaveCount(0);
    await expect(sidePanelPage.getByText(base.id)).toHaveCount(0);
    await expect(sidePanelPage.getByText(child.id)).toHaveCount(0);
    await expect(sidePanelPage.getByText(child.value.summary)).toHaveCount(0);
    await expect(sidePanelPage.getByText("Late Capture A revision saved.")).toHaveCount(0);
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await compare(sidePanelPage, otherBase, otherChild);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(otherBase.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(otherChild.id);
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, target);
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("ignores a pending Capture A generated-version refresh after switching to Capture B", async ({ sidePanelPage }) => {
    const { target, otherTarget, base, child, refreshSource } = await seedComparisonVersions(sidePanelPage);
    const { otherBase, otherChild } = await seedOtherComparisonVersions(sidePanelPage, otherTarget);
    await enableRevisionLoopback(sidePanelPage);
    await fulfillRevisionRequests(sidePanelPage);

    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(base.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);

    await installGeneratedListCompletionGate(sidePanelPage, target.record.id, 1);
    await saveRevisionFromVersion(sidePanelPage, refreshSource, "Start pending Capture A refresh before switching captures");
    await expectGeneratedListGateCount(sidePanelPage, 1);

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, otherTarget);
    await expect(sidePanelPage.getByRole("heading", { name: otherTarget.title })).toBeVisible();
    await expect(sidePanelPage.getByText("2 generated versions saved locally.")).toBeVisible();
    await releaseGeneratedListCompletion(sidePanelPage, 0);

    await expect(sidePanelPage.getByRole("heading", { name: otherTarget.title })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveCount(0);
    await expect(sidePanelPage.getByText(target.title)).toHaveCount(0);
    await expect(sidePanelPage.getByText(base.id)).toHaveCount(0);
    await expect(sidePanelPage.getByText(child.id)).toHaveCount(0);
    await expect(sidePanelPage.getByText(child.value.summary)).toHaveCount(0);
    await expect(sidePanelPage.getByText("Newest accepted child summary.")).toHaveCount(0);
    await expect(sidePanelPage.getByText("Revision saved")).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await compare(sidePanelPage, otherBase, otherChild);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(otherBase.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(otherChild.id);
    await expect(sidePanelPage.getByText(otherChild.value.summary)).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("does not reopen detail or comparison after a pending generated-version refresh resolves on Library", async ({ sidePanelPage }) => {
    const { target, base, child, refreshSource } = await seedComparisonVersions(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await fulfillRevisionRequests(sidePanelPage);

    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(base.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);

    await installGeneratedListCompletionGate(sidePanelPage, target.record.id, 1);
    await saveRevisionFromVersion(sidePanelPage, refreshSource, "Start pending refresh before returning to Library");
    await expectGeneratedListGateCount(sidePanelPage, 1);

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await expect(sidePanelPage.getByRole("button", { name: `Open saved capture: ${target.title}` })).toBeVisible();
    await releaseGeneratedListCompletion(sidePanelPage, 0);

    await expect(sidePanelPage.getByRole("button", { name: `Open saved capture: ${target.title}` })).toBeVisible();
    await expect(sidePanelPage.getByRole("heading", { name: "Generated versions" })).toHaveCount(0);
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveCount(0);
    await expect(sidePanelPage.getByText(base.id)).toHaveCount(0);
    await expect(sidePanelPage.getByText(child.id)).toHaveCount(0);
    await expect(sidePanelPage.getByText(child.value.summary)).toHaveCount(0);
    await expect(sidePanelPage.getByText(child.value.code)).toHaveCount(0);
    await expect(sidePanelPage.getByText("Revision saved")).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await openCapture(sidePanelPage, target);
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveCount(0);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  for (const mode of ["revision", "regeneration"] as const) {
    test(`keeps comparison selections and exact new ${mode} ID after saving while open`, async ({ sidePanelPage }) => {
      const { target, base, child, sibling } = await seedComparisonVersions(sidePanelPage);
      await enableRevisionLoopback(sidePanelPage);
      await fulfillRevisionRequests(sidePanelPage, {
        summary: `${mode} saved while comparison stayed open.`
      });
      await openCapture(sidePanelPage, target);
      await compare(sidePanelPage, base, child);
      const baselineId = await sidePanelPage.getByLabel("Baseline version").inputValue();
      const candidateId = await sidePanelPage.getByLabel("Candidate version").inputValue();
      const beforeIds = await generatedVersionIds(sidePanelPage, target);

      await saveFromVersion(sidePanelPage, sibling, mode, "Keep comparison open through save");

      await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
      await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(baselineId);
      await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(candidateId);
      await expect(sidePanelPage.getByText("Candidate generated source.")).toBeVisible();
      const afterIds = await generatedVersionIds(sidePanelPage, target);
      const newIds = afterIds.filter((id) => !beforeIds.includes(id));
      expect(newIds).toHaveLength(1);
      const [newId] = newIds;
      expect((await readGeneratedVersions(sidePanelPage, target.record.id)).map((entry) => (entry as { id?: string }).id)).toContain(newId);
      expect(await selectOptionValues(sidePanelPage, "Baseline version")).toContain(newId);
      expect(await selectOptionValues(sidePanelPage, "Candidate version")).toContain(newId);
      await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    });
  }

  test("keeps pre-existing capture, screenshot, V1, and V2 bytes immutable across preview and revision refreshes", async ({ sidePanelPage }) => {
    const { target, base, child, sibling } = await seedComparisonVersions(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await fulfillRevisionRequests(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    const before = await immutableSnapshotByVersion(sidePanelPage, target);

    await openGeneratedVersionDetails(sidePanelPage, child);
    await sidePanelPage.getByRole("button", { name: "Preview" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(2);
    await sidePanelPage.getByRole("button", { name: "Close preview" }).click();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    await expectExistingImmutableSnapshot(sidePanelPage, target, before, 0);

    await saveFromVersion(sidePanelPage, sibling, "revision", "Preserve immutable entries after revision refresh");
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    await expectExistingImmutableSnapshot(sidePanelPage, target, before, 1);

    await saveFromVersion(sidePanelPage, sibling, "regeneration");
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
    await expectExistingImmutableSnapshot(sidePanelPage, target, before, 2);
  });

  test("handles external refresh removals by role and recomputes from newest accepted entries", async ({ sidePanelPage }) => {
    await fulfillRevisionRequests(sidePanelPage);

    let { target, base, child, refreshSource } = await seedComparisonVersions(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);

    await deleteGeneratedVersion(sidePanelPage, base.id);
    await saveRevisionFromVersion(sidePanelPage, refreshSource, "Trigger baseline retirement");
    await expect(sidePanelPage.getByRole("alert")).toContainText("The selected version is no longer available. Choose two versions again.");
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue("");
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);

    ({ target, base, child, refreshSource } = await seedComparisonVersions(sidePanelPage));
    await enableRevisionLoopback(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await deleteGeneratedVersion(sidePanelPage, child.id);
    await saveRevisionFromVersion(sidePanelPage, refreshSource, "Trigger candidate retirement");
    await expect(sidePanelPage.getByRole("alert")).toContainText("The selected version is no longer available. Choose two versions again.");
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(base.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue("");

    ({ target, base, child, refreshSource } = await seedComparisonVersions(sidePanelPage));
    await enableRevisionLoopback(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await deleteGeneratedVersion(sidePanelPage, base.id);
    await deleteGeneratedVersion(sidePanelPage, child.id);
    await saveRevisionFromVersion(sidePanelPage, refreshSource, "Trigger both selections retirement");
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue("");
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue("");

    ({ target, base, child, refreshSource } = await seedComparisonVersions(sidePanelPage));
    await enableRevisionLoopback(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const refreshedChild = {
      ...child,
      value: {
        ...child.value,
        code: "export function CandidateCard() {\n  return <button>Newest accepted child</button>;\n}",
        summary: "Newest accepted child summary."
      }
    };
    await putGeneratedVersion(sidePanelPage, refreshedChild);
    await compare(sidePanelPage, base, child);
    await saveRevisionFromVersion(sidePanelPage, refreshSource, "Trigger recompute from newest entries");
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue(base.id);
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue(child.id);
    await expect(sidePanelPage.getByText("Newest accepted child summary.")).toBeVisible();
    await expect(sidePanelPage.getByLabel("Complete Candidate code").getByText("Newest accepted child")).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);
  });

  test("does not restore comparison state across library return or side panel reopen", async ({ sidePanelPage, context, extensionId }) => {
    const { target, base, child } = await seedComparisonVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, target);
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await expect(sidePanelPage.getByRole("button", { name: "Compare versions" })).toBeVisible();

    const reopened = await openSidePanelPage(context, extensionId);
    await openCapture(reopened, target);
    await expect(reopened.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await reopened.getByRole("button", { name: "Compare versions" }).click();
    await expect(reopened.getByLabel("Baseline version")).toHaveValue("");
    await expect(reopened.getByLabel("Candidate version")).toHaveValue("");
    await reopened.close();
  });

  test("keeps Preview, revision, and regeneration independent from comparison", async ({ sidePanelPage }) => {
    const { target, base, child, sibling } = await seedComparisonVersions(sidePanelPage);
    await enableRevisionLoopback(sidePanelPage);
    const revisionRequests = await fulfillRevisionRequests(sidePanelPage, {
      summary: "Revision added while comparison was open."
    });
    await openCapture(sidePanelPage, target);
    await compare(sidePanelPage, base, child);
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await openGeneratedVersionDetails(sidePanelPage, child);
    await sidePanelPage.getByRole("button", { name: "Preview" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(2);
    await sidePanelPage.getByRole("button", { name: "Close comparison" }).last().click();
    await expect(sidePanelPage.locator("iframe")).toHaveCount(2);
    await expect(sidePanelPage.getByRole("button", { name: "Revise or regenerate" })).toBeVisible();

    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).click();
    await sidePanelPage.getByRole("button", { name: "Revise" }).click();
    await sidePanelPage.getByLabel("Instruction").fill("Add a calmer action label");
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send revision" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Revision saved" })).toBeVisible();

    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    expect((await selectOptionLabels(sidePanelPage, "Baseline version")).some((label) => label.startsWith("CandidateCard - "))).toBe(true);
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue("");
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue("");
    await sidePanelPage.getByRole("button", { name: "Close revision tools" }).click();
    await expect(sidePanelPage.getByRole("button", { name: "Revise or regenerate" })).toBeVisible();

    await sidePanelPage.getByRole("button", { name: versionLabel(sibling) }).click();
    await sidePanelPage.getByRole("button", { name: "Revise or regenerate" }).click();
    await sidePanelPage.getByRole("button", { name: "Regenerate" }).click();
    await sidePanelPage.getByRole("button", { name: "Review data" }).click();
    await sidePanelPage.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
    await sidePanelPage.getByRole("button", { name: "Send regeneration" }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Regeneration saved" })).toBeVisible();
    expect(revisionRequests().length).toBe(2);
  });

  test("comparison actions are local-only, private, iframe-free, and immutable", async ({ sidePanelPage }) => {
    const { target, base, child, sibling } = await seedComparisonVersions(sidePanelPage);
    await openCapture(sidePanelPage, target);
    const before = await immutableSnapshot(sidePanelPage, target);
    const activity = await installComparisonActivityProbe(sidePanelPage);

    await compare(sidePanelPage, base, child);
    await sidePanelPage.getByRole("button", { name: "Swap" }).click();
    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();
    await sidePanelPage.getByLabel("Baseline version").selectOption(sibling.id);
    await sidePanelPage.getByLabel("Candidate version").selectOption(child.id);
    await sidePanelPage.getByRole("button", { name: "Compare", exact: true }).click();
    await sidePanelPage.getByRole("button", { name: "Close comparison" }).last().click();

    const after = await immutableSnapshot(sidePanelPage, target);
    expect(after).toEqual(before);
    expect(await activity()).toEqual({ httpRequests: [], runtimeMessages: [], tabMessages: [], writes: [] });
    await expect(sidePanelPage.locator("iframe")).toHaveCount(0);

    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    const comparisonText = await sidePanelPage.locator(".version-comparison").innerText();
    expect(comparisonText).not.toContain(target.record.source.url);
    expect(comparisonText).not.toContain(target.record.source.pageTitle);
    expect(comparisonText).not.toContain(target.record.library.notes);
    expect(comparisonText).not.toContain("sourceReviewFingerprint");
    expect(comparisonText).not.toContain("logicalAttemptId");
    expect(comparisonText).not.toContain("reviewAttemptFingerprint");
    expect(comparisonText).not.toContain("provider");
    expect(comparisonText).not.toContain("storageKey");
    expect(comparisonText).not.toContain("raw");
    expect(comparisonText).not.toContain("payload");
  });

  test("recovers safely from defensive lineage, diff, duplicate, open-close, capture switch, and schema boundaries", async ({ sidePanelPage }) => {
    const { target, otherTarget, base, child, missingAncestor, cycleA, finalNewlineOnly, oversized } = await seedComparisonVersions(
      sidePanelPage,
      { includeDefensive: true }
    );
    await openCapture(sidePanelPage, target);

    await compare(sidePanelPage, base, missingAncestor);
    await expect(sidePanelPage.getByText("The relationship cannot be fully determined because lineage is missing or invalid.")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();
    await compare(sidePanelPage, base, cycleA, { alreadyOpen: true });
    await expect(sidePanelPage.getByText("The relationship cannot be fully determined because lineage is missing or invalid.")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();
    await compare(sidePanelPage, base, finalNewlineOnly, { alreadyOpen: true });
    await expect(sidePanelPage.getByText("[Final newline added]")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();
    await compare(sidePanelPage, base, oversized, { alreadyOpen: true });
    await expect(sidePanelPage.getByText("Diff unavailable at this size.")).toBeVisible();
    await sidePanelPage.getByRole("button", { name: "Change selections" }).click();
    await sidePanelPage.getByLabel("Baseline version").selectOption(child.id);
    await sidePanelPage.getByLabel("Candidate version").selectOption(child.id);
    await expect(sidePanelPage.getByRole("alert")).toContainText("A version cannot be both Baseline and Candidate.");
    await sidePanelPage.getByLabel("Candidate version").selectOption(base.id);
    await sidePanelPage.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toBeVisible();

    await sidePanelPage.getByRole("button", { name: "Close comparison" }).last().click();
    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    await sidePanelPage.getByRole("button", { name: "Close comparison" }).click();
    await sidePanelPage.getByRole("button", { name: "Compare versions" }).click();
    await expect(sidePanelPage.getByLabel("Baseline version")).toHaveValue("");
    await expect(sidePanelPage.getByLabel("Candidate version")).toHaveValue("");

    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, otherTarget);
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);
    await sidePanelPage.getByRole("button", { name: "Back to Library" }).click();
    await openCapture(sidePanelPage, target);
    await expect(sidePanelPage.getByRole("heading", { name: "Comparison overview" })).toHaveCount(0);

    expect(await readPersistenceCounts(sidePanelPage)).toMatchObject({
      version: ELEMENT_CATCHER_DATABASE_VERSION,
      stores: ["captureRecords", GENERATED_COMPONENT_VERSION_STORE_NAME, "screenshotAssets"]
    });
    expect(await readGeneratedStoreInfo(sidePanelPage)).toEqual({
      keyPath: "id",
      indexes: [{ name: "sourceCaptureId", keyPath: "sourceCaptureId", unique: false }]
    });
  });
});

type SeedOptions = {
  includeDefensive?: boolean;
};

async function seedComparisonVersions(page: Page, options: SeedOptions = {}) {
  const seeded = await resetAndSeedSavedCaptures(page);
  await page.reload();
  const target = seeded[0];
  const otherTarget = seeded[1];
  const base = createV1(target, "00000000000000000000000000000001", "BaselineCard", {
    code: "export function BaselineCard() {\n  return <button>Save</button>;\n}",
    summary: "Baseline generated source."
  });
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
  const refreshSource = createV1(target, "00000000000000000000000000000009", "RefreshSourceCard", {
    code: "export function RefreshSourceCard() {\n  return <button>Refresh</button>;\n}",
    summary: "Refresh trigger source.",
    createdAt: "2026-07-18T12:09:00.000Z"
  });
  await putGeneratedVersion(page, base);
  await putGeneratedVersion(page, child);
  await putGeneratedVersion(page, sibling);
  await putGeneratedVersion(page, refreshSource);

  let missingAncestor = child;
  let cycleA = child;
  let finalNewlineOnly = child;
  let oversized = sibling;
  if (options.includeDefensive) {
    missingAncestor = createV2(target, "00000000000000000000000000000004", "MissingAncestorCard", "generated-version-ffffffffffffffffffffffffffffffff", {
      code: "export function MissingAncestorCard() {\n  return <button>Missing</button>;\n}",
      createdAt: "2026-07-18T12:03:00.000Z"
    });
    cycleA = createV2(target, "00000000000000000000000000000005", "CycleACard", "generated-version-00000000000000000000000000000006", {
      code: "export function CycleACard() {\n  return <button>Cycle A</button>;\n}",
      createdAt: "2026-07-18T12:04:00.000Z"
    });
    const cycleB = createV2(target, "00000000000000000000000000000006", "CycleBCard", cycleA.id, {
      code: "export function CycleBCard() {\n  return <button>Cycle B</button>;\n}",
      createdAt: "2026-07-18T12:05:00.000Z"
    });
    finalNewlineOnly = createV1(target, "00000000000000000000000000000007", "FinalNewlineCard", {
      code: `${base.value.code}\n`,
      createdAt: "2026-07-18T12:06:00.000Z"
    });
    oversized = createV1(target, "00000000000000000000000000000008", "OversizedCard", {
      code: Array.from({ length: 1201 }, (_, index) => `const value${index} = ${index};`).join("\n"),
      createdAt: "2026-07-18T12:07:00.000Z"
    });
    await putGeneratedVersion(page, missingAncestor);
    await putGeneratedVersion(page, cycleA);
    await putGeneratedVersion(page, cycleB);
    await putGeneratedVersion(page, finalNewlineOnly);
    await putGeneratedVersion(page, oversized);
  }

  return { target, otherTarget, base, child, sibling, refreshSource, missingAncestor, cycleA, finalNewlineOnly, oversized };
}

async function seedOtherComparisonVersions(page: Page, otherTarget: SeededCapture) {
  const otherBase = createV1(otherTarget, "10000000000000000000000000000001", "OtherBaselineCard", {
    summary: "Other capture baseline source.",
    createdAt: "2026-07-18T13:00:00.000Z"
  });
  const otherChild = createV2(otherTarget, "10000000000000000000000000000002", "OtherCandidateCard", otherBase.id, {
    summary: "Other capture candidate source.",
    createdAt: "2026-07-18T13:01:00.000Z"
  });
  await putGeneratedVersion(page, otherBase);
  await putGeneratedVersion(page, otherChild);
  return { otherBase, otherChild };
}

async function openCapture(page: Page, target: SeededCapture) {
  await page.getByRole("button", { name: `Open saved capture: ${target.title}` }).click();
  await expect(page.getByRole("heading", { name: "Generated versions" })).toBeVisible();
}

async function compare(
  page: Page,
  baseline: GeneratedComponentVersionEntry,
  candidate: GeneratedComponentVersionEntry,
  options: { alreadyOpen?: boolean } = {}
) {
  if (!options.alreadyOpen) {
    await page.getByRole("button", { name: "Compare versions" }).click();
  }
  await page.getByLabel("Baseline version").selectOption(baseline.id);
  await page.getByLabel("Candidate version").selectOption(candidate.id);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Comparison overview" })).toBeVisible();
}

async function openGeneratedVersionDetails(page: Page, entry: GeneratedComponentVersionEntry) {
  const item = generatedVersionItem(page, entry);
  const details = item.locator(".generated-version-details");
  if ((await details.count()) > 0 && (await details.isVisible())) {
    return;
  }
  await item.getByRole("button", { name: versionLabel(entry) }).click();
  await expect(item.locator(".generated-version-details")).toBeVisible();
}

function generatedVersionItem(page: Page, entry: GeneratedComponentVersionEntry) {
  return page.locator(".generated-version-item").filter({
    has: page.getByRole("button", { name: versionLabel(entry) })
  });
}

async function enableRevisionLoopback(page: Page) {
  await page.evaluate(() => {
    window.__EC_REVISION_WORKFLOW_TEST_LOOPBACK__ = true;
  });
}

async function fulfillRevisionRequests(page: Page, options: Partial<ComponentGenerationResponseV1> = {}) {
  const requests: Array<{ headers: Record<string, string>; body: unknown }> = [];
  await page.route(revisionEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { sourceComponent?: { componentName?: string } };
    const componentName = options.componentName ?? body.sourceComponent?.componentName ?? "RefreshSourceCard";
    requests.push({ headers: request.headers(), body });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        componentName,
        framework: "react",
        styling: "tailwind",
        code: options.code ?? `export function ${componentName}() { return <button>Refresh</button>; }`,
        summary: options.summary ?? "Refresh workflow response.",
        approximationNotes: options.approximationNotes ?? "Refresh workflow e2e response."
      } satisfies ComponentGenerationResponseV1)
    });
  });
  return () => requests;
}

async function saveRevisionFromVersion(page: Page, source: GeneratedComponentVersionEntry, instruction: string) {
  await startSaveFromVersion(page, source, "revision", instruction);
  await expect(page.getByRole("heading", { name: "Revision saved" })).toBeVisible();
}

async function saveFromVersion(
  page: Page,
  source: GeneratedComponentVersionEntry,
  mode: "revision" | "regeneration",
  instruction = "Update the generated component"
) {
  await startSaveFromVersion(page, source, mode, instruction);
  await expect(page.getByRole("heading", { name: mode === "revision" ? "Revision saved" : "Regeneration saved" })).toBeVisible();
}

async function startSaveFromVersion(
  page: Page,
  source: GeneratedComponentVersionEntry,
  mode: "revision" | "regeneration",
  instruction = "Update the generated component"
) {
  await openGeneratedVersionDetails(page, source);
  const item = generatedVersionItem(page, source);
  if ((await page.getByRole("button", { name: "Cancel" }).count()) > 0) {
    await page.getByRole("button", { name: "Cancel" }).last().click();
    await expect(page.getByRole("heading", { name: "Trusted revision workflow" })).toHaveCount(0);
  }
  if ((await item.getByRole("button", { name: "Close revision tools" }).count()) > 0) {
    await item.getByRole("button", { name: "Close revision tools" }).click();
    await expect(page.getByRole("heading", { name: "Trusted revision workflow" })).toHaveCount(0);
  }
  await item.getByRole("button", { name: "Revise or regenerate" }).click();
  await expect(page.getByRole("heading", { name: "Trusted revision workflow" })).toBeVisible();
  await page.getByRole("button", { name: mode === "revision" ? "Revise" : "Regenerate" }).click();
  if (mode === "revision") {
    await page.getByLabel("Instruction").fill(instruction);
  }
  await page.getByRole("button", { name: "Review data" }).click();
  await page.getByLabel("I understand this displayed data will leave my device and may use paid AI capacity.").check();
  await page.getByRole("button", { name: mode === "revision" ? "Send revision" : "Send regeneration" }).click();
}

async function installDeferredRevisionRoute(page: Page) {
  const pending: Array<{
    body: { mode?: "revision" | "regeneration"; sourceComponent?: { componentName?: string } };
    release: (options?: Partial<ComponentGenerationResponseV1>) => Promise<void>;
  }> = [];
  await page.route(revisionEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { mode?: "revision" | "regeneration"; sourceComponent?: { componentName?: string } };
    await new Promise<void>((resolve) => {
      pending.push({
        body,
        release: async (options: Partial<ComponentGenerationResponseV1> = {}) => {
          const componentName = options.componentName ?? body.sourceComponent?.componentName ?? "DeferredRevisionCard";
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              contractVersion: 1,
              componentName,
              framework: "react",
              styling: "tailwind",
              code: options.code ?? `export function ${componentName}() { return <button>Deferred</button>; }`,
              summary: options.summary ?? "Deferred revision workflow response.",
              approximationNotes: options.approximationNotes ?? "Deferred revision workflow e2e response."
            } satisfies ComponentGenerationResponseV1)
          });
          resolve();
        }
      });
    });
  });

  return {
    waitForRequest: async (index: number) => {
      await expect.poll(() => pending.length).toBeGreaterThan(index);
      return pending[index].body;
    },
    release: async (index: number, options: Partial<ComponentGenerationResponseV1> = {}) => {
      await expect.poll(() => pending.length).toBeGreaterThan(index);
      await pending[index].release(options);
    }
  };
}

async function deleteGeneratedVersion(page: Page, id: string) {
  await page.evaluate(
    async ({ generatedVersionId }) => {
      const request = indexedDB.open("element-catcher-local-persistence", 2);
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
    { generatedVersionId: id }
  );
}

async function immutableSnapshot(page: Page, target: SeededCapture) {
  return {
    recordWrapper: await readRecordWrapper(page, target.record.id),
    screenshot: await readScreenshotAssetSnapshot(page, target.storageKey),
    generatedVersions: await readGeneratedVersions(page, target.record.id)
  };
}

async function immutableSnapshotByVersion(page: Page, target: SeededCapture) {
  const generatedVersions = (await readGeneratedVersions(page, target.record.id)) as GeneratedComponentVersionEntry[];
  return {
    recordWrapper: await readRecordWrapper(page, target.record.id),
    screenshot: await readScreenshotAssetSnapshot(page, target.storageKey),
    v1: Object.fromEntries(generatedVersions.filter((entry) => !("contractVersion" in entry)).map((entry) => [entry.id, entry])),
    v2: Object.fromEntries(generatedVersions.filter((entry) => "contractVersion" in entry).map((entry) => [entry.id, entry]))
  };
}

async function expectExistingImmutableSnapshot(
  page: Page,
  target: SeededCapture,
  before: Awaited<ReturnType<typeof immutableSnapshotByVersion>>,
  expectedNewV2Count: number
) {
  const after = await immutableSnapshotByVersion(page, target);
  expect(after.recordWrapper).toEqual(before.recordWrapper);
  expect(after.screenshot).toEqual(before.screenshot);

  for (const [id, entry] of Object.entries(before.v1)) {
    expect(after.v1[id], `pre-existing V1 ${id}`).toEqual(entry);
  }
  for (const [id, entry] of Object.entries(before.v2)) {
    expect(after.v2[id], `pre-existing V2 ${id}`).toEqual(entry);
  }

  expect(Object.keys(after.v1).sort()).toEqual(Object.keys(before.v1).sort());
  expect(Object.keys(after.v2).filter((id) => !(id in before.v2))).toHaveLength(expectedNewV2Count);
}

async function generatedVersionIds(page: Page, target: SeededCapture) {
  return (await readGeneratedVersions(page, target.record.id)).map((entry) => (entry as { id: string }).id);
}

async function selectOptionValues(page: Page, label: string) {
  return page.getByLabel(label).locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
}

async function installGeneratedListCompletionGate(page: Page, sourceCaptureId: string, holdCount: number) {
  await page.evaluate(
    ({ sourceCaptureId: gatedSourceCaptureId, holdCount: gatedHoldCount }) => {
      const global = window as unknown as {
        __ecGeneratedListGate?: {
          held: Array<{ release: () => void }>;
        };
      };
      const nativeOnComplete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete");
      const originalGetAll = IDBIndex.prototype.getAll;
      const markedTransactions = new WeakSet<IDBTransaction>();
      let heldCount = 0;

      global.__ecGeneratedListGate = { held: [] };

      IDBIndex.prototype.getAll = function patchedGetAll(this: IDBIndex, query?: IDBValidKey | IDBKeyRange, count?: number) {
        if (
          this.name === "sourceCaptureId" &&
          this.objectStore.name === "generatedComponentVersions" &&
          query === gatedSourceCaptureId &&
          heldCount < gatedHoldCount
        ) {
          markedTransactions.add(this.objectStore.transaction);
        }
        return count === undefined ? originalGetAll.call(this, query) : originalGetAll.call(this, query, count);
      };

      Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
        configurable: true,
        get() {
          return nativeOnComplete?.get?.call(this) ?? null;
        },
        set(handler: ((this: IDBTransaction, event: Event) => unknown) | null) {
          if (!markedTransactions.has(this) || !handler) {
            nativeOnComplete?.set?.call(this, handler);
            return;
          }
          markedTransactions.delete(this);
          heldCount += 1;
          nativeOnComplete?.set?.call(this, (event: Event) => {
            global.__ecGeneratedListGate?.held.push({
              release: () => {
                handler.call(this, event);
              }
            });
          });
        }
      });
    },
    { sourceCaptureId, holdCount }
  );
}

async function expectGeneratedListGateCount(page: Page, count: number) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        return (window as unknown as { __ecGeneratedListGate?: { held: unknown[] } }).__ecGeneratedListGate?.held.length ?? 0;
      })
    )
    .toBe(count);
}

async function releaseGeneratedListCompletion(page: Page, index: number) {
  await page.evaluate((heldIndex) => {
    const gate = (window as unknown as { __ecGeneratedListGate?: { held: Array<{ release: () => void }> } }).__ecGeneratedListGate;
    if (!gate?.held[heldIndex]) {
      throw new Error(`Generated list completion ${heldIndex} was not held.`);
    }
    gate.held[heldIndex].release();
  }, index);
}

async function installComparisonActivityProbe(page: Page) {
  const httpRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:\/\//.test(request.url())) {
      httpRequests.push(request.url());
    }
  });

  await page.evaluate(() => {
    const runtimeMessages: unknown[] = [];
    const tabMessages: unknown[] = [];
    const writes: Array<{ method: string; store: string }> = [];
    const global = window as unknown as {
      chrome?: {
        runtime?: { sendMessage?: (...args: unknown[]) => unknown };
        tabs?: { sendMessage?: (...args: unknown[]) => unknown };
      };
      __ecComparisonActivity?: {
        runtimeMessages: unknown[];
        tabMessages: unknown[];
        writes: Array<{ method: string; store: string }>;
      };
    };

    if (global.chrome?.runtime?.sendMessage) {
      const original = global.chrome.runtime.sendMessage.bind(global.chrome.runtime);
      global.chrome.runtime.sendMessage = (...args: unknown[]) => {
        runtimeMessages.push(args);
        return original(...args);
      };
    }

    if (global.chrome?.tabs?.sendMessage) {
      const original = global.chrome.tabs.sendMessage.bind(global.chrome.tabs);
      global.chrome.tabs.sendMessage = (...args: unknown[]) => {
        tabMessages.push(args);
        return original(...args);
      };
    }

    const originalAdd = IDBObjectStore.prototype.add;
    const originalPut = IDBObjectStore.prototype.put;
    const originalDelete = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.add = function patchedAdd(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      writes.push({ method: "add", store: this.name });
      return originalAdd.call(this, value, key);
    };
    IDBObjectStore.prototype.put = function patchedPut(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      writes.push({ method: "put", store: this.name });
      return originalPut.call(this, value, key);
    };
    IDBObjectStore.prototype.delete = function patchedDelete(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      writes.push({ method: "delete", store: this.name });
      return originalDelete.call(this, key);
    };

    global.__ecComparisonActivity = { runtimeMessages, tabMessages, writes };
  });

  return async () => {
    const browserActivity = await page.evaluate(() => {
      const activity = (window as unknown as {
        __ecComparisonActivity?: {
          runtimeMessages: unknown[];
          tabMessages: unknown[];
          writes: Array<{ method: string; store: string }>;
        };
      }).__ecComparisonActivity;
      if (!activity) {
        throw new Error("Comparison activity probe was not installed.");
      }
      return activity;
    });
    return { httpRequests, ...browserActivity };
  };
}

async function selectOptionLabels(page: Page, label: string) {
  return page.getByLabel(label).locator("option").evaluateAll((options) => options.map((option) => option.textContent ?? ""));
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
    operationKind?: "revision" | "regeneration";
  } = {}
): GeneratedComponentVersionEntryV2 {
  const operationKind = options.operationKind ?? "revision";
  return {
    ...createV1(target, idSuffix, componentName, options),
    contractVersion: 2,
    operation:
      operationKind === "revision"
        ? {
            kind: "revision",
            logicalAttemptId: `revision-attempt-${idSuffix}`,
            reviewAttemptFingerprint: "b".repeat(64),
            sourceGeneratedVersionId,
            sourceGeneratedVersionFingerprint: "c".repeat(64),
            instruction: options.instruction ?? "Revise this generated component.",
            instructionFingerprint: "d".repeat(64),
            screenshotIncluded: options.screenshotIncluded ?? false
          }
        : {
            kind: "regeneration",
            logicalAttemptId: `revision-attempt-${idSuffix}`,
            reviewAttemptFingerprint: "b".repeat(64),
            sourceGeneratedVersionId,
            sourceGeneratedVersionFingerprint: "c".repeat(64),
            screenshotIncluded: options.screenshotIncluded ?? false
          }
  };
}
