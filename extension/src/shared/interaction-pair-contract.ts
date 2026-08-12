export const INTERACTION_PAIR_SCHEMA_VERSION = 1;
export const INTERACTION_PAIR_TRIGGERS = ["click", "toggle", "hover", "focus"] as const;

export type InteractionPairTrigger = (typeof INTERACTION_PAIR_TRIGGERS)[number];

export type InteractionPairV1 = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  title?: string;
  baseCaptureId: string;
  alternateCaptureId: string;
  additionalReactionCaptureIds?: string[];
  trigger: InteractionPairTrigger;
};

export type InteractionPairCreateInput = {
  title?: string;
  baseCaptureId: string;
  alternateCaptureId: string;
  additionalReactionCaptureIds?: string[];
  trigger: InteractionPairTrigger;
};

const INTERACTION_PAIR_ID_PATTERN = /^interaction-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CAPTURE_ID_PATTERN = /^capture-[0-9a-f-]{36}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_TITLE_LENGTH = 80;

export function createInteractionPairId() {
  return `interaction-${crypto.randomUUID()}`;
}

export function createInteractionPairTimestamp() {
  return new Date().toISOString();
}

export function normalizeInteractionPairTitle(value: string | undefined) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? boundString(normalized, MAX_TITLE_LENGTH) : undefined;
}

export function isInteractionPairTrigger(value: unknown): value is InteractionPairTrigger {
  return typeof value === "string" && (INTERACTION_PAIR_TRIGGERS as readonly string[]).includes(value);
}

export function validateInteractionPairCreateInput(input: InteractionPairCreateInput) {
  assertPlainObject(input);
  assertExactKeys(input, ["baseCaptureId", "alternateCaptureId", "trigger"], ["title", "additionalReactionCaptureIds"]);
  validateInteractionReferences(input.baseCaptureId, input.alternateCaptureId, input.additionalReactionCaptureIds);
  validateCaptureReference(input.baseCaptureId, "Trigger / Before capture");
  validateCaptureReference(input.alternateCaptureId, "Primary Reaction capture");
  if (input.baseCaptureId === input.alternateCaptureId) {
    throw new Error("Trigger / Before and Primary Reaction captures must be different.");
  }
  if (!isInteractionPairTrigger(input.trigger)) {
    throw new Error("Interaction trigger is not supported.");
  }
  if (input.title !== undefined && normalizeInteractionPairTitle(input.title) !== input.title.trim().replace(/\s+/g, " ")) {
    throw new Error("Interaction title is not normalized.");
  }
}

export function validateInteractionPairV1(value: unknown): asserts value is InteractionPairV1 {
  assertPlainObject(value);
  const pair = value as InteractionPairV1;
  assertExactKeys(pair, ["schemaVersion", "id", "createdAt", "baseCaptureId", "alternateCaptureId", "trigger"], [
    "title",
    "additionalReactionCaptureIds"
  ]);
  if (pair.schemaVersion !== INTERACTION_PAIR_SCHEMA_VERSION) {
    throw new Error("Interaction Pair schema version is invalid.");
  }
  if (typeof pair.id !== "string" || !INTERACTION_PAIR_ID_PATTERN.test(pair.id)) {
    throw new Error("Interaction Pair id is invalid.");
  }
  if (typeof pair.createdAt !== "string" || !ISO_TIMESTAMP_PATTERN.test(pair.createdAt)) {
    throw new Error("Interaction Pair timestamp is invalid.");
  }
  if (pair.title !== undefined) {
    if (typeof pair.title !== "string" || pair.title.length === 0 || pair.title.length > MAX_TITLE_LENGTH) {
      throw new Error("Interaction Pair title is invalid.");
    }
  }
  validateInteractionReferences(pair.baseCaptureId, pair.alternateCaptureId, pair.additionalReactionCaptureIds);
  validateCaptureReference(pair.baseCaptureId, "Trigger / Before capture");
  validateCaptureReference(pair.alternateCaptureId, "Primary Reaction capture");
  if (pair.baseCaptureId === pair.alternateCaptureId) {
    throw new Error("Interaction Pair references must be distinct.");
  }
  if (!isInteractionPairTrigger(pair.trigger)) {
    throw new Error("Interaction Pair trigger is invalid.");
  }
}

export function createInteractionPairV1(input: InteractionPairCreateInput): InteractionPairV1 {
  const additionalReactionCaptureIds = normalizeAdditionalReactionCaptureIds(input.additionalReactionCaptureIds);
  const normalizedInput: InteractionPairCreateInput = {
    ...input,
    ...(additionalReactionCaptureIds.length ? { additionalReactionCaptureIds } : {}),
    title: normalizeInteractionPairTitle(input.title)
  };
  validateInteractionPairCreateInput(normalizedInput);
  const pair: InteractionPairV1 = {
    schemaVersion: INTERACTION_PAIR_SCHEMA_VERSION,
    id: createInteractionPairId(),
    createdAt: createInteractionPairTimestamp(),
    ...(normalizedInput.title ? { title: normalizedInput.title } : {}),
    baseCaptureId: normalizedInput.baseCaptureId,
    alternateCaptureId: normalizedInput.alternateCaptureId,
    ...(additionalReactionCaptureIds.length ? { additionalReactionCaptureIds } : {}),
    trigger: normalizedInput.trigger
  };
  validateInteractionPairV1(pair);
  return pair;
}

export function normalizeAdditionalReactionCaptureIds(value: string[] | undefined) {
  return Array.from(new Set(value ?? []));
}

function validateInteractionReferences(baseCaptureId: string, alternateCaptureId: string, additionalReactionCaptureIds: string[] | undefined) {
  if (additionalReactionCaptureIds === undefined) {
    return;
  }
  if (!Array.isArray(additionalReactionCaptureIds)) {
    throw new Error("Additional Reaction captures must be a list.");
  }
  const seen = new Set<string>();
  for (const [index, captureId] of additionalReactionCaptureIds.entries()) {
    validateCaptureReference(captureId, `Additional Reaction capture ${index + 1}`);
    if (captureId === baseCaptureId) {
      throw new Error("Additional Reaction captures cannot duplicate Trigger / Before.");
    }
    if (captureId === alternateCaptureId) {
      throw new Error("Additional Reaction captures cannot duplicate Primary Reaction.");
    }
    if (seen.has(captureId)) {
      throw new Error("Additional Reaction captures must be unique.");
    }
    seen.add(captureId);
  }
}

function validateCaptureReference(value: unknown, label: string) {
  if (typeof value !== "string" || !CAPTURE_ID_PATTERN.test(value)) {
    throw new Error(`${label} reference is invalid.`);
  }
}

function assertPlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a plain object.");
  }
}

function assertExactKeys(value: Record<string, unknown>, requiredKeys: string[], optionalKeys: string[] = []) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const actualKeys = Object.keys(value);
  for (const key of requiredKeys) {
    if (!actualKeys.includes(key)) {
      throw new Error(`Missing required key: ${key}.`);
    }
  }
  for (const key of actualKeys) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected key: ${key}.`);
    }
  }
}

function boundString(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}
