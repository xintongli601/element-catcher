import { validateCaptureRecordV1 } from "../capture/capture-record-v1";
import { buildExactCaptureContextProjection } from "./projection";
import { digestBlob } from "../storage/screenshot-asset";
import { verifyScreenshotAsset } from "./screenshot";
import { canonicalStringify, sha256Hex, type InteractivePreviewPlanV1, type PreviewRenderNodeV1 } from "../shared/preview-policy";
import {
  createInteractionReconstructionId,
  createInteractionReconstructionTimestamp,
  validateInteractionReconstructionEntryV1,
  validateInteractionReconstructionRequestWithoutDataUrlsV1,
  type InteractionReconstructionEntryV1,
  type InteractionReconstructionRequestWithoutDataUrlsV1,
  type InteractionReconstructionSurfaceProjectionV1
} from "../shared/interactive-reconstruction-contract";
import type { InteractionPairReadModel } from "../storage/interaction-pair";
import type { SavedCaptureReadModel } from "../storage/capture-save";
import type { ComponentGenerationResponseV1 } from "../shared/generation-contract";

export type InteractionReconstructionReviewModel = {
  pairId: string;
  title: string;
  requestWithoutDataUrls: InteractionReconstructionRequestWithoutDataUrlsV1;
  sourceInteractionPairFingerprint: string;
};

export function assertInteractionPairComplete(readModel: InteractionPairReadModel) {
  if (!readModel.baseCapture || !readModel.alternateCapture || readModel.additionalReactionCaptures.some((reaction) => !reaction.capture)) {
    throw new Error("Interaction Pair must have every referenced capture available before reconstruction.");
  }
}

export async function prepareInteractionReconstructionReview(readModel: InteractionPairReadModel): Promise<InteractionReconstructionReviewModel> {
  assertInteractionPairComplete(readModel);
  const triggerSurface = await createSurface("triggerBefore", readModel.baseCapture!);
  const primarySurface = await createSurface("primaryReaction", readModel.alternateCapture!);
  const additionalSurfaces = await Promise.all(
    readModel.additionalReactionCaptures.map((reaction) => createSurface("additionalReaction", reaction.capture!))
  );
  const requestWithoutDataUrls: InteractionReconstructionRequestWithoutDataUrlsV1 = {
    contractVersion: 1,
    interaction: {
      pairId: readModel.pair.id,
      trigger: readModel.pair.trigger,
      semantics: "bounded-visible-ui-only"
    },
    surfaces: [triggerSurface, primarySurface, ...additionalSurfaces],
    requestedOutput: {
      framework: "react",
      styling: "tailwind",
      behavior: "bounded-interactive",
      fields: ["componentName", "code", "summary", "approximationNotes", "interactivePreviewPlan"]
    },
    privacy: {
      excludesSourceUrl: true,
      excludesPageTitle: true,
      excludesCookies: true,
      excludesBrowserStorage: true,
      excludesCredentials: true,
      excludesSourceSession: true
    }
  };
  validateInteractionReconstructionRequestWithoutDataUrlsV1(requestWithoutDataUrls);
  return {
    pairId: readModel.pair.id,
    title: readModel.pair.title ?? `${displayTitle(readModel.baseCapture!)} ${readModel.pair.trigger} reconstruction`,
    requestWithoutDataUrls,
    sourceInteractionPairFingerprint: await sha256Hex(canonicalStringify(requestWithoutDataUrls))
  };
}

export async function createInteractionReconstructionEntry(review: InteractionReconstructionReviewModel): Promise<InteractionReconstructionEntryV1> {
  const componentName = createComponentName(review);
  const code = createInteractiveSource(review, componentName);
  const sourceSha256 = await sha256Hex(code);
  const interactivePreviewPlan = createInteractivePreviewPlan(review, componentName, sourceSha256);
  const value: ComponentGenerationResponseV1 = {
    contractVersion: 1,
    componentName,
    framework: "react",
    styling: "tailwind",
    code,
    summary: `Bounded ${review.requestWithoutDataUrls.interaction.trigger} reconstruction from an Interaction Pair.`,
    approximationNotes: "Generated locally from user-selected visible interaction states. No source-site business logic, network, authentication, or data mutation is reconstructed.",
    metadata: {
      providerLabel: "Element Catcher local interactive reconstructor",
      providerModelLabel: "m12-v1"
    }
  };
  const entry: InteractionReconstructionEntryV1 = {
    contractVersion: 1,
    id: createInteractionReconstructionId(),
    sourceInteractionPairId: review.pairId,
    sourceInteractionPairFingerprint: review.sourceInteractionPairFingerprint,
    createdAt: createInteractionReconstructionTimestamp(),
    value,
    interactivePreviewPlan
  };
  validateInteractionReconstructionEntryV1(entry);
  return entry;
}

function createSurface(
  role: InteractionReconstructionSurfaceProjectionV1["role"],
  savedCapture: SavedCaptureReadModel
): Promise<InteractionReconstructionSurfaceProjectionV1> {
  return Promise.resolve()
    .then(async () => {
      validateCaptureRecordV1(savedCapture.record);
      const screenshot = await verifyScreenshotAsset(savedCapture.asset);
      return {
        role,
        captureId: savedCapture.record.id,
        screenshot: {
          mediaType: "image/png" as const,
          width: screenshot.width,
          height: screenshot.height,
          byteLength: screenshot.byteLength,
          digest: await digestBlob(screenshot.blob)
        },
        captureContext: buildExactCaptureContextProjection(savedCapture.record)
      };
    });
}

function createInteractivePreviewPlan(
  review: InteractionReconstructionReviewModel,
  componentName: string,
  sourceSha256: string
): InteractivePreviewPlanV1 {
  const [trigger, primary, ...additional] = review.requestWithoutDataUrls.surfaces;
  return {
    contractVersion: 1,
    componentName,
    sourceSha256,
    trigger: review.requestWithoutDataUrls.interaction.trigger,
    rest: surfaceNode(trigger, "Trigger / Before"),
    reaction: surfaceNode(primary, "Primary Reaction"),
    additionalReactions: additional.map((surface, index) => surfaceNode(surface, `Additional Reaction ${index + 1}`)),
    warnings: ["Interactive preview uses a validated declarative plan; generated source is not executed inside Element Catcher."]
  };
}

function surfaceNode(surface: InteractionReconstructionSurfaceProjectionV1, label: string): PreviewRenderNodeV1 {
  const title = surface.captureContext.library.title ?? surface.captureContext.summaries.componentType ?? surface.captureContext.element.tagName;
  return {
    kind: "element",
    tag: "section",
    props: { className: surface.role === "triggerBefore" ? "rounded-md border border-slate-300 bg-white p-3" : "rounded-md border border-slate-200 bg-slate-50 p-3 mt-2", role: "region", "aria-label": label },
    children: [
      { kind: "element", tag: "p", props: { className: "m-0 text-sm font-semibold text-slate-900" }, children: [{ kind: "text", value: title }] },
      { kind: "element", tag: "p", props: { className: "m-0 mt-1 text-sm text-slate-600" }, children: [{ kind: "text", value: summarizeSurface(surface) }] }
    ]
  };
}

function createInteractiveSource(review: InteractionReconstructionReviewModel, componentName: string) {
  const trigger = review.requestWithoutDataUrls.interaction.trigger;
  const restTitle = titleForSurface(review.requestWithoutDataUrls.surfaces[0]);
  const primaryTitle = titleForSurface(review.requestWithoutDataUrls.surfaces[1]);
  const additionalTitles = review.requestWithoutDataUrls.surfaces.slice(2).map(titleForSurface);
  const eventProps =
    trigger === "hover"
      ? 'onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)}'
      : trigger === "focus"
        ? 'onFocus={() => setActive(true)} onBlur={() => setActive(false)} tabIndex={0}'
        : 'onClick={() => setActive((current) => !current)}';
  return [
    "import { useState } from 'react';",
    "",
    `export function ${componentName}() {`,
    "  const [active, setActive] = useState(false);",
    "  return (",
    `    <section className=\"rounded-md border border-slate-300 bg-white p-4\" ${eventProps}>`,
    "      <div className=\"rounded-md border border-slate-300 bg-white p-3\">",
    `        <p className=\"m-0 text-sm font-semibold text-slate-900\">${escapeJsx(restTitle)}</p>`,
    `        <p className=\"m-0 mt-1 text-sm text-slate-600\">Rest state for ${trigger} interaction.</p>`,
    "      </div>",
    "      {active ? (",
    "        <div className=\"mt-2 grid gap-2\">",
    "          <div className=\"rounded-md border border-slate-200 bg-slate-50 p-3\">",
    `            <p className=\"m-0 text-sm font-semibold text-slate-900\">${escapeJsx(primaryTitle)}</p>`,
    "            <p className=\"m-0 mt-1 text-sm text-slate-600\">Primary visible reaction.</p>",
    "          </div>",
    ...additionalTitles.flatMap((title) => [
      "          <div className=\"rounded-md border border-slate-200 bg-blue-50 p-3\">",
      `            <p className=\"m-0 text-sm font-semibold text-blue-700\">${escapeJsx(title)}</p>`,
      "            <p className=\"m-0 mt-1 text-sm text-slate-600\">Additional reaction surface.</p>",
      "          </div>"
    ]),
    "        </div>",
    "      ) : null}",
    "    </section>",
    "  );",
    "}"
  ].join("\n");
}

function createComponentName(review: InteractionReconstructionReviewModel) {
  const base = titleForSurface(review.requestWithoutDataUrls.surfaces[0]).replace(/[^A-Za-z0-9]+/g, " ");
  const words = base.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  const name = `${words.map((word) => word[0].toUpperCase() + word.slice(1)).join("") || "Interactive"}Interaction`;
  return /^[A-Z][A-Za-z0-9]{0,63}$/.test(name) ? name : "InteractiveReconstruction";
}

function displayTitle(savedCapture: SavedCaptureReadModel) {
  return savedCapture.record.library.title || savedCapture.record.summaries.componentType || savedCapture.record.element.tagName;
}

function titleForSurface(surface: InteractionReconstructionSurfaceProjectionV1) {
  return surface.captureContext.library.title ?? surface.captureContext.summaries.componentType ?? surface.captureContext.element.tagName;
}

function summarizeSurface(surface: InteractionReconstructionSurfaceProjectionV1) {
  return `${surface.captureContext.element.tagName} ${Math.round(surface.captureContext.element.rect.width)} x ${Math.round(surface.captureContext.element.rect.height)}`;
}

function escapeJsx(value: string) {
  return value.replace(/[{}<>]/g, "").slice(0, 80);
}
