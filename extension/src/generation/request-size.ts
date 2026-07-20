import { getUtf8ByteLength } from "./canonical-json";
import { PNG_DATA_URL_PREFIX } from "./limits";
import type { ComponentGenerationRequestWithoutDataUrlV1, ComponentGenerationRequestV1 } from "./types";

export function predictCompleteRequestBytes(requestWithoutDataUrl: ComponentGenerationRequestWithoutDataUrlV1) {
  const requestWithEmptyDataUrl: ComponentGenerationRequestV1 = {
    ...requestWithoutDataUrl,
    screenshot: {
      ...requestWithoutDataUrl.screenshot,
      dataUrl: ""
    }
  };
  return (
    getUtf8ByteLength(JSON.stringify(requestWithEmptyDataUrl)) +
    getUtf8ByteLength(PNG_DATA_URL_PREFIX) +
    getBase64PayloadLength(requestWithoutDataUrl.screenshot.byteLength)
  );
}

export function getBase64PayloadLength(decodedByteLength: number) {
  return 4 * Math.ceil(decodedByteLength / 3);
}
