import { GenerationError } from "./errors";

export function codePointLength(value: string) {
  return Array.from(value).length;
}

export function optionalString(value: unknown, limit: number, code = "request_validation_failed") {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new GenerationError(code as never);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  assertCodePointLimit(trimmed, limit, code);
  return trimmed;
}

export function requiredString(value: unknown, limit: number, code = "request_validation_failed") {
  if (typeof value !== "string") {
    throw new GenerationError(code as never);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new GenerationError(code as never);
  }

  assertCodePointLimit(trimmed, limit, code);
  return trimmed;
}

export function assertCodePointLimit(value: string, limit: number, code = "request_validation_failed") {
  if (codePointLength(value) > limit) {
    throw new GenerationError(code as never);
  }
}

export function assertExactKeys(value: unknown, keys: readonly string[], code = "request_validation_failed") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GenerationError(code as never);
  }

  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new GenerationError(code as never);
  }
}

export function assertAllowedKeys(value: unknown, keys: readonly string[], code = "request_validation_failed") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GenerationError(code as never);
  }

  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new GenerationError(code as never);
    }
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
