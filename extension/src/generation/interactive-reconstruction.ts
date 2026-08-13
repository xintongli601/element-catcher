import { validateCaptureRecordV1 } from "../capture/capture-record-v1";
import { buildExactCaptureContextProjection } from "./projection";
import { digestBlob } from "../storage/screenshot-asset";
import { verifyScreenshotAsset } from "./screenshot";
import { canonicalStringify, sha256Hex, type InteractivePreviewPlanV1, type PreviewRenderNodeV1, type PreviewTag } from "../shared/preview-policy";
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
import type { ComponentGenerationResponseV1, TransmittedDomNodeV1 } from "../shared/generation-contract";

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
    rest: createVisualSurfaceNode(trigger, "Trigger / Before"),
    reaction: createVisualSurfaceNode(primary, "Primary Reaction"),
    additionalReactions: additional.map((surface, index) => createVisualSurfaceNode(surface, `Additional Reaction ${index + 1}`)),
    warnings: ["Interactive preview uses a validated declarative plan; generated source is not executed inside Element Catcher."]
  };
}

function createVisualSurfaceNode(surface: InteractionReconstructionSurfaceProjectionV1, label: string): PreviewRenderNodeV1 {
  return reconstructDomNode(surface, surface.captureContext.dom.sanitizedSnapshot, 0, label);
}

function createInteractiveSource(review: InteractionReconstructionReviewModel, componentName: string) {
  const trigger = review.requestWithoutDataUrls.interaction.trigger;
  const [restSurface, primarySurface, ...additionalSurfaces] = review.requestWithoutDataUrls.surfaces;
  const restNode = createVisualSurfaceNode(restSurface, "Trigger / Before");
  const primaryNode = createVisualSurfaceNode(primarySurface, "Primary Reaction");
  const additionalNodes = additionalSurfaces.map((surface, index) => createVisualSurfaceNode(surface, `Additional Reaction ${index + 1}`));
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
    `    <section className=\"inline-block max-w-full\" ${eventProps}>`,
    ...nodeToJsxLines(restNode, 6),
    "      {active ? (",
    "        <div className=\"mt-2 grid gap-2\">",
    ...nodeToJsxLines(primaryNode, 10),
    ...additionalNodes.flatMap((node) => nodeToJsxLines(node, 10)),
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

function reconstructDomNode(
  surface: InteractionReconstructionSurfaceProjectionV1,
  sourceNode: TransmittedDomNodeV1,
  depth: number,
  label?: string
): PreviewRenderNodeV1 {
  const tag = mapPreviewTag(sourceNode, surface.captureContext.element.semanticRole);
  const children: PreviewRenderNodeV1[] = [];
  const text = sourceNode.textPreview?.trim();
  if (text) {
    children.push({ kind: "text", value: boundText(text, depth === 0 ? 160 : 120) });
  }
  for (const child of sourceNode.children.slice(0, depth === 0 ? 8 : 6)) {
    children.push(reconstructDomNode(surface, child, depth + 1));
  }
  if (!children.length) {
    const fallback = fallbackVisibleText(surface);
    if (fallback) {
      children.push({ kind: "text", value: fallback });
    }
  }

  const props: Record<string, string | boolean> = {
    className: classTokensForNode(surface, sourceNode, depth).join(" ")
  };
  if (depth === 0) {
    props.role = tag === "button" ? "button" : "region";
    props["aria-label"] = label ?? titleForSurface(surface);
  }
  if (tag === "button") {
    props.type = "button";
  }
  return { kind: "element", tag, props, children };
}

function classTokensForNode(surface: InteractionReconstructionSurfaceProjectionV1, sourceNode: TransmittedDomNodeV1, depth: number) {
  const computed = surface.captureContext.styles.computed;
  const tokens = new Set<string>();
  if (depth === 0) {
    const display = computed.display ?? surface.captureContext.summaries.layout.display;
    if (display === "flex" || display === "inline-flex") {
      tokens.add("flex");
      tokens.add((computed.flexDirection ?? surface.captureContext.summaries.layout.direction) === "horizontal" || computed.flexDirection === "row" ? "flex-row" : "flex-col");
    } else if (display === "grid") {
      tokens.add("grid");
    } else {
      tokens.add("block");
    }
    tokens.add(alignToken(computed.alignItems));
    tokens.add(justifyToken(computed.justifyContent));
    tokens.add(gapToken(computed.gap ?? surface.captureContext.summaries.spacing.gap));
    tokens.add(paddingToken(computed.padding ?? surface.captureContext.summaries.spacing.padding));
    tokens.add(backgroundToken(computed.backgroundColor ?? surface.captureContext.summaries.colors.background));
    const textToken = textColorToken(computed.color ?? surface.captureContext.summaries.colors.foreground);
    if (textToken) tokens.add(textToken);
    tokens.add(textSizeToken(computed.fontSize));
    tokens.add(fontWeightToken(computed.fontWeight ?? surface.captureContext.summaries.typography.weights?.[0]));
    tokens.add(textAlignToken(computed.textAlign));
    if (hasBorder(computed.border, surface.captureContext.summaries.colors.border)) {
      tokens.add("border");
      tokens.add(borderColorToken(surface.captureContext.summaries.colors.border ?? computed.border));
    }
    tokens.add(radiusToken(computed.borderRadius));
    if (computed.boxShadow && computed.boxShadow !== "none") {
      tokens.add(computed.boxShadow.includes("rgba") || computed.boxShadow.includes("rgb") ? "shadow-md" : "shadow-sm");
    }
    if (surface.captureContext.element.rect.width >= 320) {
      tokens.add("max-w-full");
    }
  } else {
    tokens.add("block");
    tokens.add(depth === 1 ? "mt-1" : "m-0");
    tokens.add(sourceNode.children.length ? "grid" : "inline-block");
    if (sourceNode.children.length) {
      tokens.add("gap-1");
    }
    tokens.add(textSizeToken(depth === 1 ? computed.fontSize : undefined));
    tokens.add(fontWeightToken(depth === 1 ? computed.fontWeight : undefined));
  }
  return Array.from(tokens).filter(Boolean).slice(0, 16);
}

function nodeToJsxLines(node: PreviewRenderNodeV1, indent: number): string[] {
  const pad = " ".repeat(indent);
  if (node.kind === "text") {
    return [`${pad}{${JSON.stringify(node.value)}}`];
  }
  if (node.kind === "fragment") {
    return node.children.flatMap((child) => nodeToJsxLines(child, indent));
  }
  const attributes = Object.entries(node.props)
    .filter(([, value]) => value !== "" && value !== false)
    .map(([key, value]) => {
      if (key === "className") return `className=${JSON.stringify(value)}`;
      if (key === "aria-label") return `aria-label=${JSON.stringify(value)}`;
      if (typeof value === "boolean") return value ? key : "";
      return `${key}=${JSON.stringify(value)}`;
    })
    .filter(Boolean)
    .join(" ");
  const open = attributes ? `<${node.tag} ${attributes}>` : `<${node.tag}>`;
  if (node.children.length === 1 && node.children[0].kind === "text") {
    return [`${pad}${open}{${JSON.stringify(node.children[0].value)}}</${node.tag}>`];
  }
  return [
    `${pad}${open}`,
    ...node.children.flatMap((child) => nodeToJsxLines(child, indent + 2)),
    `${pad}</${node.tag}>`
  ];
}

function mapPreviewTag(node: TransmittedDomNodeV1, semanticRole?: string): PreviewTag {
  const tag = node.tagName.toLowerCase();
  const role = node.attributes.role ?? semanticRole;
  if (tag === "button" || role === "button") return "button";
  if (tag === "nav" || role === "navigation") return "nav";
  if (tag === "main") return "main";
  if (tag === "header") return "header";
  if (tag === "footer") return "footer";
  if (tag === "ul" || tag === "ol" || tag === "li") return tag as PreviewTag;
  if (/^h[1-6]$/.test(tag)) return tag as PreviewTag;
  if (tag === "p" || tag === "span" || tag === "label" || tag === "article" || tag === "section") return tag as PreviewTag;
  return role === "list" ? "ul" : role === "listitem" ? "li" : "div";
}

function alignToken(value: string | undefined) {
  if (value === "center") return "items-center";
  if (value === "flex-end" || value === "end") return "items-end";
  return "items-start";
}

function justifyToken(value: string | undefined) {
  if (value === "center") return "justify-center";
  if (value === "space-between") return "justify-between";
  return "justify-start";
}

function gapToken(value: string | undefined) {
  const numeric = parseCssNumber(value);
  if (numeric >= 16) return "gap-4";
  if (numeric >= 12) return "gap-3";
  if (numeric >= 8) return "gap-2";
  return "gap-1";
}

function paddingToken(value: { top?: string; right?: string; bottom?: string; left?: string } | undefined) {
  const numeric = averageBox(value);
  if (numeric >= 16) return "p-4";
  if (numeric >= 12) return "p-3";
  if (numeric >= 8) return "p-2";
  return "p-1";
}

function backgroundToken(value: string | undefined) {
  const color = normalizeColor(value);
  if (color === "#2563eb" || color === "#1d4ed8") return "bg-blue-600";
  if (color === "#0f766e" || color === "#0d9488") return "bg-teal-600";
  if (color === "#7c3aed" || color === "#9333ea") return "bg-purple-600";
  if (color === "#eff6ff") return "bg-blue-50";
  if (color === "#f0fdfa") return "bg-teal-50";
  if (color === "#faf5ff") return "bg-purple-50";
  if (color === "#f1f5f9") return "bg-slate-100";
  if (color === "#f8fafc") return "bg-slate-50";
  return "bg-white";
}

function textColorToken(value: string | undefined) {
  const color = normalizeColor(value);
  if (color === "#ffffff") return "text-white";
  if (color === "#1d4ed8" || color === "#2563eb") return "text-blue-700";
  if (color === "#0f766e" || color === "#0d9488") return "text-teal-700";
  if (color === "#7c3aed" || color === "#9333ea") return "text-purple-700";
  if (color === "#475569") return "text-slate-600";
  if (color === "#334155") return "text-slate-700";
  return "text-slate-900";
}

function borderColorToken(value: string | undefined) {
  const color = normalizeColor(value);
  if (color === "#2563eb" || color === "#bfdbfe") return "border-blue-200";
  if (color === "#0f766e" || color === "#99f6e4") return "border-teal-200";
  if (color === "#7c3aed" || color === "#ddd6fe") return "border-purple-200";
  return "border-slate-300";
}

function textSizeToken(value: string | undefined) {
  const numeric = parseCssNumber(value);
  if (numeric >= 20) return "text-xl";
  if (numeric >= 18) return "text-lg";
  if (numeric >= 16) return "text-base";
  return "text-sm";
}

function fontWeightToken(value: string | undefined) {
  const numeric = Number.parseInt(value ?? "", 10);
  return Number.isFinite(numeric) && numeric >= 600 ? "font-semibold" : "font-medium";
}

function textAlignToken(value: string | undefined) {
  if (value === "center") return "text-center";
  if (value === "right" || value === "end") return "text-right";
  return "text-left";
}

function radiusToken(value: string | undefined) {
  const numeric = parseCssNumber(value);
  if (numeric >= 10) return "rounded-lg";
  if (numeric >= 6) return "rounded-md";
  return "rounded";
}

function hasBorder(border: string | undefined, summaryBorder: string | undefined) {
  return Boolean(summaryBorder || (border && border !== "none" && !border.startsWith("0px")));
}

function fallbackVisibleText(surface: InteractionReconstructionSurfaceProjectionV1) {
  const summary = surface.captureContext.dom.childSummary.find((child) => child.textPreview)?.textPreview;
  return summary ? boundText(summary, 120) : "";
}

function normalizeColor(value: string | undefined) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(normalized);
  if (!rgb) return normalized;
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

function parseCssNumber(value: string | undefined) {
  const match = /-?\d+(\.\d+)?/.exec(value ?? "");
  return match ? Number(match[0]) : 0;
}

function averageBox(value: { top?: string; right?: string; bottom?: string; left?: string } | undefined) {
  if (!value) return 0;
  const numbers = [value.top, value.right, value.bottom, value.left].map(parseCssNumber).filter((number) => number > 0);
  return numbers.length ? numbers.reduce((sum, number) => sum + number, 0) / numbers.length : 0;
}

function boundText(value: string, maxLength: number) {
  return value.replace(/[{}<>]/g, "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}
