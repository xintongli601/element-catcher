import type { ComponentGenerationRequestWithoutDataUrlV1 } from "./types";
import { canonicalJsonStringify, sha256HexText } from "./canonical-json";

export async function computeReviewFingerprint({
  requestWithoutDataUrl,
  screenshotDigest,
  screenshotByteLength,
  screenshotWidth,
  screenshotHeight
}: {
  requestWithoutDataUrl: ComponentGenerationRequestWithoutDataUrlV1;
  screenshotDigest: string;
  screenshotByteLength: number;
  screenshotWidth: number;
  screenshotHeight: number;
}) {
  return sha256HexText(
    canonicalJsonStringify({
      contractVersion: requestWithoutDataUrl.contractVersion,
      requestWithoutDataUrl,
      screenshotDigest,
      screenshotByteLength,
      screenshotWidth,
      screenshotHeight
    })
  );
}
