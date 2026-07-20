import { GenerationError } from "./errors";

export type CanonicalJsonValue =
  | string
  | number
  | boolean
  | null
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue | undefined };

export function canonicalJsonStringify(value: CanonicalJsonValue): string {
  return JSON.stringify(toCanonicalValue(value));
}

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export async function sha256HexBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256HexText(value: string) {
  return sha256HexBytes(new TextEncoder().encode(value));
}

function toCanonicalValue(value: CanonicalJsonValue): Exclude<CanonicalJsonValue, undefined> {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new GenerationError("request_validation_failed");
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toCanonicalValue);
  }

  const result: { [key: string]: CanonicalJsonValue } = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) {
      result[key] = toCanonicalValue(child);
    }
  }
  return result;
}
