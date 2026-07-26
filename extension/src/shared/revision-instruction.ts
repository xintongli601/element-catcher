import { codePointLength, getUtf8ByteLength } from "./generation-contract";

export function normalizeRevisionInstruction(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("invalid revision instruction");
  }

  const nfc = value.normalize("NFC");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(nfc)) {
    throw new Error("invalid revision instruction");
  }
  if (/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(nfc)) {
    throw new Error("invalid revision instruction");
  }

  const normalized = nfc.trim().replace(/\s+/gu, " ");
  const codePoints = codePointLength(normalized);
  if (codePoints < 4 || codePoints > 1_000 || getUtf8ByteLength(normalized) > 4_096) {
    throw new Error("invalid revision instruction");
  }

  return normalized;
}
