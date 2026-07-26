export const PREVIEW_PROTOCOL_VERSION = 2;
export const PREVIEW_TIMEOUT_MS = 10_000;

export const PREVIEW_LIMITS = {
  sourceCodePoints: 8192,
  astNodes: 800,
  astDepth: 96,
  astArrayLength: 256,
  planNodes: 160,
  planDepth: 16,
  childrenPerNode: 32,
  propsPerElement: 8,
  textNodeCodePoints: 512,
  totalTextCodePoints: 4096,
  classesPerNode: 16,
  serializedPlanBytes: 16384,
  messageBytes: 32768,
  diagnostics: 8,
  diagnosticCodePoints: 240,
  warnings: 8,
  warningCodePoints: 240,
  requestIdCodePoints: 80,
  componentNameCodePoints: 64
} as const;

export const PREVIEW_TAGS = [
  "div",
  "span",
  "p",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "nav",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "button",
  "label"
] as const;

export const PREVIEW_PROPS = ["className", "role", "aria-label", "aria-hidden", "title", "type"] as const;
export const PREVIEW_ROLES = ["button", "group", "heading", "img", "list", "listitem", "main", "navigation", "note", "presentation", "region", "status"] as const;
export const PREVIEW_CLASS_TOKENS = [
  "block",
  "inline",
  "inline-block",
  "flex",
  "inline-flex",
  "grid",
  "hidden",
  "items-start",
  "items-center",
  "items-end",
  "justify-start",
  "justify-center",
  "justify-between",
  "gap-1",
  "gap-2",
  "gap-3",
  "gap-4",
  "p-1",
  "p-2",
  "p-3",
  "p-4",
  "px-2",
  "px-3",
  "px-4",
  "py-1",
  "py-2",
  "py-3",
  "m-0",
  "mt-1",
  "mt-2",
  "mt-3",
  "mb-1",
  "mb-2",
  "mb-3",
  "rounded",
  "rounded-md",
  "border",
  "border-slate-200",
  "border-slate-300",
  "bg-white",
  "bg-slate-50",
  "bg-slate-100",
  "bg-blue-50",
  "bg-blue-600",
  "text-white",
  "text-slate-500",
  "text-slate-600",
  "text-slate-700",
  "text-slate-900",
  "text-blue-700",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "font-medium",
  "font-semibold",
  "leading-tight",
  "leading-normal",
  "shadow-sm",
  "w-full",
  "max-w-full"
] as const;

export const PLAN_FAILURE_CATEGORIES = ["syntax", "program-envelope", "component-name", "policy", "limit", "internal"] as const;
export const RENDER_FAILURE_CATEGORIES = ["schema", "policy", "limit", "lifecycle", "internal"] as const;
export const DISPOSE_REASONS = ["close", "timeout", "terminal-failure", "session-replaced"] as const;

export type PreviewTag = (typeof PREVIEW_TAGS)[number];
export type PlanFailureCategory = (typeof PLAN_FAILURE_CATEGORIES)[number];
export type RenderFailureCategory = (typeof RENDER_FAILURE_CATEGORIES)[number];
export type DisposeReason = (typeof DISPOSE_REASONS)[number];

export type PreviewRenderTextNodeV1 = {
  kind: "text";
  value: string;
};

export type PreviewRenderElementNodeV1 = {
  kind: "element";
  tag: PreviewTag;
  props: Record<string, string | boolean>;
  children: PreviewRenderNodeV1[];
};

export type PreviewRenderFragmentNodeV1 = {
  kind: "fragment";
  children: PreviewRenderNodeV1[];
};

export type PreviewRenderNodeV1 = PreviewRenderTextNodeV1 | PreviewRenderElementNodeV1 | PreviewRenderFragmentNodeV1;

export type PreviewRenderPlanV1 = {
  contractVersion: 1;
  componentName: string;
  sourceSha256: string;
  root: PreviewRenderNodeV1;
  warnings: string[];
};

export class PreviewPolicyError extends Error {
  constructor(
    readonly category: PlanFailureCategory | RenderFailureCategory | "schema",
    message: string
  ) {
    super(message);
  }
}

const encoder = new TextEncoder();
const tagSet = new Set<string>(PREVIEW_TAGS);
const propSet = new Set<string>(PREVIEW_PROPS);
const roleSet = new Set<string>(PREVIEW_ROLES);
const classTokenSet = new Set<string>(PREVIEW_CLASS_TOKENS);
const componentNamePattern = /^[A-Z][A-Za-z0-9]{0,63}$/;
const shaPattern = /^[a-f0-9]{64}$/;

export function assertSourceWithinLimit(source: string) {
  if (countCodePoints(source) > PREVIEW_LIMITS.sourceCodePoints) {
    throw new PreviewPolicyError("limit", "Generated source is too large for safe preview.");
  }
}

export async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

export function normalizeText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function validateComponentName(value: unknown): string {
  if (typeof value !== "string" || !componentNamePattern.test(value)) {
    throw new PreviewPolicyError("component-name", "Component name is not previewable.");
  }
  return value;
}

export function validateSha256(value: unknown, label = "sha256"): string {
  if (typeof value !== "string" || !shaPattern.test(value)) {
    throw new PreviewPolicyError("policy", `${label} is invalid.`);
  }
  return value;
}

export function validatePreviewRenderPlan(value: unknown, expectedComponentName?: string): PreviewRenderPlanV1 {
  assertPlainData(value, PREVIEW_LIMITS.planDepth + 4, PREVIEW_LIMITS.planNodes * 8);
  assertExactObjectKeys(value, ["componentName", "contractVersion", "root", "sourceSha256", "warnings"]);
  const plan = value as PreviewRenderPlanV1;
  if (plan.contractVersion !== 1) {
    throw new PreviewPolicyError("schema", "Unsupported render plan version.");
  }
  const componentName = validateComponentName(plan.componentName);
  if (expectedComponentName && componentName !== expectedComponentName) {
    throw new PreviewPolicyError("policy", "Plan componentName does not match the selected generated version.");
  }
  const sourceSha256 = validateSha256(plan.sourceSha256, "sourceSha256");
  const counters = { nodes: 0, totalText: 0 };
  const root = validateNode(plan.root, 0, counters);
  if (!Array.isArray(plan.warnings) || plan.warnings.length > PREVIEW_LIMITS.warnings) {
    throw new PreviewPolicyError("policy", "Plan warnings are not previewable.");
  }
  const warnings = plan.warnings.map((warning) => {
    if (typeof warning !== "string" || countCodePoints(warning) > PREVIEW_LIMITS.warningCodePoints || hasControlCharacters(warning)) {
      throw new PreviewPolicyError("policy", "Plan warning is not previewable.");
    }
    return normalizeText(warning);
  });
  const cleanPlan = { contractVersion: 1 as const, componentName, sourceSha256, root, warnings };
  if (encoder.encode(canonicalStringify(cleanPlan)).byteLength > PREVIEW_LIMITS.serializedPlanBytes) {
    throw new PreviewPolicyError("limit", "Render plan is too large.");
  }
  return cleanPlan;
}

export function assertPlainData(value: unknown, maxDepth = 32, maxNodes = 1200) {
  const seen = new WeakSet<object>();
  let visited = 0;
  const visit = (candidate: unknown, depth: number) => {
    visited += 1;
    if (visited > maxNodes || depth > maxDepth) {
      throw new PreviewPolicyError("limit", "Message traversal limit exceeded.");
    }
    if (candidate === null || typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean") {
      if (typeof candidate === "number" && !Number.isFinite(candidate)) {
        throw new PreviewPolicyError("policy", "Non-finite numbers are not previewable.");
      }
      return;
    }
    if (typeof candidate !== "object" || candidate instanceof Date || candidate instanceof RegExp || candidate instanceof Map || candidate instanceof Set) {
      throw new PreviewPolicyError("policy", "Only plain preview data is allowed.");
    }
    if (seen.has(candidate)) {
      throw new PreviewPolicyError("policy", "Cyclic preview data is not allowed.");
    }
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      if (candidate.length > PREVIEW_LIMITS.astArrayLength) {
        throw new PreviewPolicyError("limit", "Preview array is too large.");
      }
      for (const item of candidate) visit(item, depth + 1);
      return;
    }
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new PreviewPolicyError("policy", "Only plain preview objects are allowed.");
    }
    for (const key of Object.keys(candidate)) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor || descriptor.get || descriptor.set) {
        throw new PreviewPolicyError("policy", "Preview data getters are not allowed.");
      }
      visit((candidate as Record<string, unknown>)[key], depth + 1);
    }
  };
  visit(value, 0);
}

export function assertExactObjectKeys(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreviewPolicyError("schema", "Expected preview object.");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new PreviewPolicyError("schema", `Unexpected preview fields: ${actual.join(", ") || "none"}.`);
  }
}

export function normalizeDiagnostics(error: unknown) {
  const message = error instanceof Error ? error.message : "Preview failed.";
  const safe = normalizeText(message).slice(0, PREVIEW_LIMITS.diagnosticCodePoints);
  return [safe || "Preview failed."];
}

function validateNode(value: unknown, depth: number, counters: { nodes: number; totalText: number }): PreviewRenderNodeV1 {
  counters.nodes += 1;
  if (counters.nodes > PREVIEW_LIMITS.planNodes || depth > PREVIEW_LIMITS.planDepth) {
    throw new PreviewPolicyError("limit", "Render plan exceeds preview limits.");
  }
  assertExactObjectKeys(value, nodeKeys(value));
  const node = value as PreviewRenderNodeV1;
  if (node.kind === "text") {
    if (typeof node.value !== "string" || hasControlCharacters(node.value)) {
      throw new PreviewPolicyError("policy", "Text node is not previewable.");
    }
    const valueText = normalizeText(node.value);
    counters.totalText += countCodePoints(valueText);
    if (countCodePoints(valueText) > PREVIEW_LIMITS.textNodeCodePoints || counters.totalText > PREVIEW_LIMITS.totalTextCodePoints) {
      throw new PreviewPolicyError("limit", "Preview text is too large.");
    }
    return { kind: "text", value: valueText };
  }
  if (node.kind === "fragment") {
    const children = validateChildren(node.children, depth, counters);
    return { kind: "fragment", children };
  }
  if (node.kind !== "element" || typeof node.tag !== "string" || !tagSet.has(node.tag)) {
    throw new PreviewPolicyError("policy", "Element tag is not previewable.");
  }
  const props = validateProps(node.tag, node.props);
  const children = validateChildren(node.children, depth, counters);
  return { kind: "element", tag: node.tag as PreviewTag, props, children };
}

function validateChildren(value: unknown, depth: number, counters: { nodes: number; totalText: number }) {
  if (!Array.isArray(value) || value.length > PREVIEW_LIMITS.childrenPerNode) {
    throw new PreviewPolicyError("limit", "Preview children exceed limits.");
  }
  return value.map((child) => validateNode(child, depth + 1, counters));
}

function validateProps(tag: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreviewPolicyError("schema", "Element props must be an object.");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > PREVIEW_LIMITS.propsPerElement) {
    throw new PreviewPolicyError("limit", "Too many preview props.");
  }
  const props: Record<string, string | boolean> = {};
  for (const [key, raw] of entries) {
    if (!propSet.has(key)) {
      throw new PreviewPolicyError("policy", `Prop ${key} is not previewable.`);
    }
    if (key === "aria-hidden") {
      if (typeof raw !== "boolean") throw new PreviewPolicyError("policy", "aria-hidden must be boolean.");
      props[key] = raw;
      continue;
    }
    if (typeof raw !== "string" || hasControlCharacters(raw)) {
      throw new PreviewPolicyError("policy", `Prop ${key} is not previewable.`);
    }
    const normalized = normalizeText(raw);
    if (key === "className") props[key] = normalizeClassName(normalized);
    else if (key === "role") {
      if (!roleSet.has(normalized)) throw new PreviewPolicyError("policy", "Role is not previewable.");
      props[key] = normalized;
    } else if (key === "type") {
      if (tag !== "button" || normalized !== "button") throw new PreviewPolicyError("policy", "Only button type=button is previewable.");
      props[key] = "button";
    } else if (countCodePoints(normalized) > PREVIEW_LIMITS.diagnosticCodePoints) {
      throw new PreviewPolicyError("limit", `Prop ${key} is too long.`);
    } else {
      props[key] = normalized;
    }
  }
  if (tag === "button" && !("type" in props)) {
    props.type = "button";
  }
  return props;
}

function normalizeClassName(value: string) {
  if (!value) return "";
  const tokens = [...new Set(value.split(" ").filter(Boolean))];
  if (tokens.length > PREVIEW_LIMITS.classesPerNode) {
    throw new PreviewPolicyError("limit", "Too many class tokens.");
  }
  for (const token of tokens) {
    if (token.includes(":") || token.includes("[") || token.startsWith("!") || !classTokenSet.has(token)) {
      throw new PreviewPolicyError("policy", `Class token ${token} is not previewable.`);
    }
  }
  return tokens.join(" ");
}

function nodeKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "text") return ["kind", "value"];
  if (kind === "fragment") return ["children", "kind"];
  return ["children", "kind", "props", "tag"];
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortCanonical(nested)]));
}

function hasControlCharacters(value: string) {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function countCodePoints(value: string) {
  return Array.from(value).length;
}
