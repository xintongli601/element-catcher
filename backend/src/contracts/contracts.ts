import {
  GENERATION_CONTRACT_VERSION,
  type GenerationBackendErrorCodeV1,
  type GenerationBackendErrorResponseV1
} from "../../../extension/src/shared/generation-contract.js";

export type ComponentGenerationRequestV1 = {
  contractVersion: 1;
  screenshot: {
    mediaType: "image/png";
    width: number;
    height: number;
    byteLength: number;
    dataUrl: string;
  };
  captureContext: Record<string, unknown>;
  requestedOutput: {
    framework: "react";
    styling: "tailwind";
    fields: ["componentName", "code", "summary", "approximationNotes"];
  };
};

export type ComponentGenerationResponseV1 = {
  contractVersion: 1;
  componentName: string;
  framework: "react";
  styling: "tailwind";
  code: string;
  summary: string;
  approximationNotes: string;
};

export type ProviderAdapter = {
  generate(request: ComponentGenerationRequestV1, signal: AbortSignal): Promise<ComponentGenerationResponseV1>;
};

const SAFE_MESSAGES: Record<GenerationBackendErrorCodeV1, string> = {
  configuration_unavailable: "AI generation backend integration is not configured.",
  request_validation_failed: "The generation request was invalid.",
  request_too_large: "The generation request is too large.",
  invalid_screenshot: "The screenshot could not be verified.",
  network_unavailable: "The generation service is unavailable.",
  timeout: "Generation timed out.",
  provider_rejected: "The generation service rejected the request.",
  rate_limited: "Generation is rate limited.",
  malformed_response: "The generation response was malformed."
};

export class BackendSafeError extends Error {
  constructor(readonly code: GenerationBackendErrorCodeV1, readonly status: number) {
    super(SAFE_MESSAGES[code]);
    this.name = "BackendSafeError";
  }
}

export function safeErrorResponse(code: GenerationBackendErrorCodeV1): GenerationBackendErrorResponseV1 {
  return {
    contractVersion: GENERATION_CONTRACT_VERSION,
    error: {
      code,
      message: SAFE_MESSAGES[code]
    }
  };
}

export function statusForCode(code: GenerationBackendErrorCodeV1) {
  switch (code) {
    case "request_too_large":
      return 413;
    case "invalid_screenshot":
    case "request_validation_failed":
      return 400;
    case "rate_limited":
      return 429;
    case "configuration_unavailable":
      return 500;
    case "timeout":
      return 504;
    case "provider_rejected":
    case "malformed_response":
    case "network_unavailable":
      return 502;
  }
}
