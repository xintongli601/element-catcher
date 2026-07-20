import type { ComponentGenerationRequestV1, ComponentGenerationResponseV1, GenerationTransport } from "./types";
import { GenerationError } from "./errors";
import { GENERATION_CONTRACT_VERSION, type GenerationBackendErrorCodeV1 } from "./limits";
import { validateGenerationResponse } from "./request-validation";
import { getUtf8ByteLength } from "./canonical-json";

export type MockGenerationScenario =
  | "success"
  | "delayed-success"
  | "malformed-response"
  | "rate-limit"
  | "provider-rejected"
  | "timeout";

export type GenerationTestHarness = {
  scenario?: MockGenerationScenario;
  delayMs?: number;
  calls: Array<{
    request: ComponentGenerationRequestV1;
    abortedAtCall: boolean;
  }>;
  cancellations: number;
};

declare global {
  interface Window {
    __EC_GENERATION_TEST_HARNESS__?: GenerationTestHarness;
  }
}

const LOOPBACK_BACKEND_ORIGIN = "http://127.0.0.1:8787";
const RESPONSE_BODY_LIMIT_BYTES = 100_000;

export function createGenerationTransport(): { transport: GenerationTransport; endpointCategory: "backend-unconfigured" | "deterministic-mock" | "local-development-proxy" } {
  const harness = typeof window !== "undefined" ? window.__EC_GENERATION_TEST_HARNESS__ : undefined;
  return createGenerationTransportForEnvironment(import.meta.env.VITE_ELEMENT_CATCHER_BACKEND_URL, harness);
}

export function createGenerationTransportForEnvironment(
  backendUrl: string | undefined,
  harness?: GenerationTestHarness
): { transport: GenerationTransport; endpointCategory: "backend-unconfigured" | "deterministic-mock" | "local-development-proxy" } {
  if (harness) {
    return {
      endpointCategory: "deterministic-mock",
      transport: createMockGenerationTransport(harness)
    };
  }

  if (backendUrl === LOOPBACK_BACKEND_ORIGIN) {
    return {
      endpointCategory: "local-development-proxy",
      transport: createHttpGenerationTransport(`${LOOPBACK_BACKEND_ORIGIN}/v1/generate-component`)
    };
  }

  return {
    endpointCategory: "backend-unconfigured",
    transport: unavailableGenerationTransport
  };
}

export const unavailableGenerationTransport: GenerationTransport = {
  async generate() {
    throw new GenerationError("configuration_unavailable");
  }
};

export function createHttpGenerationTransport(endpoint: string): GenerationTransport {
  return {
    async generate(request, signal) {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Element-Catcher-Contract-Version": String(GENERATION_CONTRACT_VERSION)
          },
          body: JSON.stringify(request),
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

      const text = await readBoundedResponseText(response);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GenerationError(response.ok ? "malformed_response" : "network_unavailable");
      }

      if (!response.ok) {
        const code = parseBackendErrorCode(parsed);
        throw new GenerationError(code);
      }

      validateGenerationResponse(parsed);
      return parsed;
    }
  };
}

async function readBoundedResponseText(response: Response) {
  const text = await response.text();
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

function createMockGenerationTransport(harness: GenerationTestHarness): GenerationTransport {
  return {
    async generate(request, signal) {
      harness.calls.push({
        request,
        abortedAtCall: signal.aborted
      });

      if (signal.aborted) {
        harness.cancellations += 1;
        throw new GenerationError("cancellation");
      }

      const delayMs = harness.delayMs ?? (harness.scenario === "delayed-success" ? 250 : 50);
      if (delayMs > 0) {
        await wait(delayMs, signal, harness);
      }

      switch (harness.scenario) {
        case "malformed-response":
          return {
            contractVersion: 1,
            componentName: "bad-name",
            framework: "react",
            styling: "tailwind",
            code: "",
            summary: "Malformed response",
            approximationNotes: ""
          } as ComponentGenerationResponseV1;
        case "rate-limit":
          throw new GenerationError("rate_limited");
        case "provider-rejected":
          throw new GenerationError("provider_rejected");
        case "timeout":
          throw new GenerationError("timeout");
        case "delayed-success":
        case "success":
        default:
          return {
            contractVersion: 1,
            componentName: "GeneratedFixture",
            framework: "react",
            styling: "tailwind",
            code: [
              "export function GeneratedFixture() {",
              "  return <section className=\"rounded-lg border border-slate-200 bg-white p-4\">Generated mock component</section>;",
              "}"
            ].join("\n"),
            summary: "Deterministic mock generation result.",
            approximationNotes: "Generated from a deterministic local test transport; not saved.",
            metadata: {
              providerLabel: "Deterministic mock",
              providerModelLabel: "mock-v1"
            }
          };
      }
    }
  };
}

function wait(ms: number, signal: AbortSignal, harness: GenerationTestHarness) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      harness.cancellations += 1;
      reject(new GenerationError("cancellation"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
