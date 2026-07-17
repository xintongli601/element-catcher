import type { JsonValue } from "./capture-schema";

export type JsonCompatibilityResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

export function assertJsonCompatible(value: unknown): asserts value is JsonValue {
  const result = validateJsonCompatible(value);

  if (!result.ok) {
    throw new Error(result.reason);
  }
}

export function validateJsonCompatible(value: unknown): JsonCompatibilityResult {
  return validateJsonValue(value, "$", new WeakSet<object>());
}

function validateJsonValue(value: unknown, path: string, seen: WeakSet<object>): JsonCompatibilityResult {
  if (value === null) {
    return { ok: true };
  }

  const valueType = typeof value;

  if (valueType === "string" || valueType === "boolean") {
    return { ok: true };
  }

  if (valueType === "number") {
    return Number.isFinite(value)
      ? { ok: true }
      : { ok: false, reason: `${path} contains a non-finite number.` };
  }

  if (valueType === "undefined") {
    return { ok: false, reason: `${path} contains undefined.` };
  }

  if (valueType === "function" || valueType === "symbol" || valueType === "bigint") {
    return { ok: false, reason: `${path} contains unsupported ${valueType}.` };
  }

  if (valueType !== "object") {
    return { ok: false, reason: `${path} contains unsupported value.` };
  }

  const objectValue = value as object;

  if (seen.has(objectValue)) {
    return { ok: false, reason: `${path} contains a circular reference.` };
  }

  if (!isPlainJsonContainer(objectValue)) {
    return { ok: false, reason: `${path} contains a non-plain runtime object.` };
  }

  seen.add(objectValue);

  const result = Array.isArray(objectValue)
    ? validateJsonArray(objectValue, path, seen)
    : validateJsonObject(objectValue as Record<string, unknown>, path, seen);

  seen.delete(objectValue);
  return result;
}

function validateJsonArray(values: unknown[], path: string, seen: WeakSet<object>): JsonCompatibilityResult {
  for (let index = 0; index < values.length; index += 1) {
    const result = validateJsonValue(values[index], `${path}[${index}]`, seen);
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

function validateJsonObject(
  value: Record<string, unknown>,
  path: string,
  seen: WeakSet<object>
): JsonCompatibilityResult {
  for (const [key, childValue] of Object.entries(value)) {
    const result = validateJsonValue(childValue, `${path}.${key}`, seen);
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

function isPlainJsonContainer(value: object) {
  if (Array.isArray(value)) {
    return true;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
