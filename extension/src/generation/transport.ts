import type { ComponentGenerationRequestV1, ComponentGenerationResponseV1, GenerationTransport } from "./types";
import { GenerationError } from "./errors";

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

export function createGenerationTransport(): { transport: GenerationTransport; endpointCategory: "backend-unconfigured" | "deterministic-mock" } {
  const harness = typeof window !== "undefined" ? window.__EC_GENERATION_TEST_HARNESS__ : undefined;
  if (harness) {
    return {
      endpointCategory: "deterministic-mock",
      transport: createMockGenerationTransport(harness)
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

      const delayMs = harness.delayMs ?? (harness.scenario === "delayed-success" ? 250 : 0);
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
