import { GENERATION_CONTRACT_VERSION, type ComponentGenerationResponseV1, type GenerationBackendErrorCodeV1 } from "../shared/generation-contract";
import { isValidLogicalAttemptId } from "../shared/generated-version-contract";
import { getUtf8ByteLength } from "./canonical-json";
import { GenerationError } from "./errors";
import { validateGenerationResponse } from "./request-validation";
import {
  validateComponentRevisionRequestShapeV1,
  validateComponentRevisionRequestV1,
  type ComponentRevisionRequestV1
} from "./revision-contract";
import type { RevisionTransport } from "./revision-review";

const RESPONSE_BODY_LIMIT_BYTES = 100_000;

export function createHttpRevisionTransport(endpoint: string): RevisionTransport {
  return {
    async revise(request, logicalAttemptId, signal) {
      if (!isValidLogicalAttemptId(logicalAttemptId)) {
        throw new GenerationError("request_validation_failed");
      }
      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }
      validateComponentRevisionRequestShapeV1(request);
      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }
      let cleanRequest: ComponentRevisionRequestV1;
      try {
        cleanRequest = await validateComponentRevisionRequestV1(cloneJson(request));
      } catch (error) {
        if (error instanceof GenerationError) {
          throw error;
        }
        throw new GenerationError("request_validation_failed", undefined, error);
      }
      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }
      const body = JSON.stringify(cleanRequest);
      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Element-Catcher-Contract-Version": String(GENERATION_CONTRACT_VERSION),
            "X-Element-Catcher-Idempotency-Key": logicalAttemptId
          },
          body,
          credentials: "omit",
          cache: "no-store",
          signal
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new GenerationError("cancellation");
        }
        throw new GenerationError("network_unavailable");
      }
      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }

      const text = await readBoundedResponseText(response, signal);
      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GenerationError(response.ok ? "malformed_response" : "network_unavailable");
      }
      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }

      if (!response.ok) {
        throw new GenerationError(parseBackendErrorCode(parsed));
      }

      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }
      validateRevisionTransportResponse(parsed, cleanRequest);
      if (signal.aborted) {
        throw new GenerationError("cancellation");
      }
      return parsed;
    }
  };
}

export function validateRevisionTransportResponse(
  value: unknown,
  request: ComponentRevisionRequestV1
): asserts value is ComponentGenerationResponseV1 {
  try {
    validateGenerationResponse(value);
    if (value.componentName !== request.sourceComponent.componentName) {
      throw new Error("renamed component");
    }
  } catch (error) {
    if (error instanceof GenerationError) {
      throw error;
    }
    throw new GenerationError("malformed_response");
  }
}

async function readBoundedResponseText(response: Response, signal: AbortSignal) {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GenerationError("cancellation");
    }
    throw error;
  }
  if (signal.aborted) {
    throw new GenerationError("cancellation");
  }
  if (getUtf8ByteLength(text) > RESPONSE_BODY_LIMIT_BYTES) {
    throw new GenerationError("malformed_response");
  }
  return text;
}

function parseBackendErrorCode(value: unknown): GenerationBackendErrorCodeV1 {
  if (!value || typeof value !== "object") {
    return "network_unavailable";
  }
  if ((value as { contractVersion?: unknown }).contractVersion !== GENERATION_CONTRACT_VERSION) {
    return "network_unavailable";
  }
  const envelopeKeys = Object.keys(value);
  if (envelopeKeys.length !== 2 || !envelopeKeys.includes("contractVersion") || !envelopeKeys.includes("error")) {
    return "network_unavailable";
  }
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return "network_unavailable";
  }
  const errorKeys = Object.keys(error);
  if (errorKeys.length !== 2 || !errorKeys.includes("code") || !errorKeys.includes("message")) {
    return "network_unavailable";
  }
  if (typeof (error as { message?: unknown }).message !== "string") {
    return "network_unavailable";
  }
  const code = (error as { code?: unknown }).code;
  switch (code) {
    case "configuration_unavailable":
    case "request_validation_failed":
    case "request_too_large":
    case "invalid_screenshot":
    case "network_unavailable":
    case "timeout":
    case "provider_rejected":
    case "rate_limited":
    case "malformed_response":
      return code;
    default:
      return "network_unavailable";
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
