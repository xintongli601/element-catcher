import { test, expect } from "@playwright/test";
import {
  createGenerationTransportForEnvironment,
  createHttpGenerationTransport,
  type GenerationTestHarness
} from "../../extension/src/generation/transport";
import { GenerationError, getSafeGenerationMessage } from "../../extension/src/generation/errors";
import type { ComponentGenerationRequestV1 } from "../../extension/src/generation/types";

test.describe("Milestone 5C extension transport", () => {
  test("endpoint gate fails closed except for exact loopback and keeps mock isolated", async () => {
    await expect(createGenerationTransportForEnvironment(undefined).transport.generate(validRequest(), new AbortController().signal)).rejects.toMatchObject({ code: "configuration_unavailable" });
    expect(createGenerationTransportForEnvironment("http://127.0.0.1:8787").endpointCategory).toBe("local-development-proxy");
    for (const value of [
      "http://localhost:8787",
      "http://127.0.0.1:8788",
      "https://127.0.0.1:8787",
      "http://127.0.0.1:8787/",
      "http://127.0.0.1:8787/v1/generate-component",
      "https://api.openai.com"
    ]) {
      expect(createGenerationTransportForEnvironment(value).endpointCategory).toBe("backend-unconfigured");
    }
    const harness: GenerationTestHarness = { scenario: "success", calls: [], cancellations: 0 };
    expect(createGenerationTransportForEnvironment("https://api.openai.com", harness).endpointCategory).toBe("deterministic-mock");
  });

  test("HTTP transport uses exact fetch options and validates safe responses", async () => {
    const originalFetch = globalThis.fetch;
    const observed: Array<{ url: string; init: RequestInit }> = [];
    const controller = new AbortController();
    globalThis.fetch = async (url, init) => {
      observed.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(validResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };
    try {
      const response = await createHttpGenerationTransport("http://127.0.0.1:8787/v1/generate-component").generate(validRequest(), controller.signal);
      expect(response.componentName).toBe("GeneratedFixture");
      expect(observed).toHaveLength(1);
      expect(observed[0].url).toBe("http://127.0.0.1:8787/v1/generate-component");
      expect(observed[0].init.method).toBe("POST");
      expect(observed[0].init.credentials).toBe("omit");
      expect(observed[0].init.cache).toBe("no-store");
      expect(observed[0].init.signal).toBe(controller.signal);
      expect(observed[0].init.headers).toEqual({
        "Content-Type": "application/json",
        "X-Element-Catcher-Contract-Version": "1"
      });
      expect(JSON.parse(String(observed[0].init.body))).toEqual(validRequest());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("HTTP transport maps backend envelopes safely and rejects unsafe response shapes", async () => {
    await expectWithFetch(new Response(JSON.stringify({ contractVersion: 1, error: { code: "rate_limited", message: "raw provider detail req_123" } }), { status: 429 }), "rate_limited", false);
    await expectWithFetch(new Response(JSON.stringify({ contractVersion: 1, error: { code: "unknown_code", message: "raw" } }), { status: 500 }), "network_unavailable", false);
    await expectWithFetch(new Response(JSON.stringify({ contractVersion: 1, error: { code: "rate_limited", message: "raw", details: "secret" } }), { status: 429 }), "network_unavailable", false);
    await expectWithFetch(new Response("not json", { status: 502 }), "network_unavailable", false);
    await expectWithFetch(new Response("x".repeat(100_001), { status: 200 }), "malformed_response", false);
    await expectWithFetch(new Response(JSON.stringify({ ...validResponse(), extra: true }), { status: 200 }), "malformed_response", false);
  });
});

async function expectWithFetch(response: Response, code: string, expectRaw: boolean) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response;
  try {
    try {
      await createHttpGenerationTransport("http://127.0.0.1:8787/v1/generate-component").generate(validRequest(), new AbortController().signal);
      throw new Error("expected transport rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationError);
      expect((error as GenerationError).code).toBe(code);
      expect(getSafeGenerationMessage(error).includes("raw provider detail")).toBe(expectRaw);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function validRequest(): ComponentGenerationRequestV1 {
  return {
    contractVersion: 1,
    screenshot: {
      mediaType: "image/png",
      width: 1,
      height: 1,
      byteLength: 67,
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=="
    },
    captureContext: {
      library: { tags: [] },
      element: { tagName: "div", rect: { width: 1, height: 1 } },
      dom: { sanitizedSnapshot: { tagName: "div", attributes: {}, children: [] }, childSummary: [] },
      styles: { computed: {} },
      summaries: { typography: {}, colors: {}, layout: {}, spacing: {} },
      pageTitlePolicy: { included: false, reason: "Excluded by default; future explicit opt-in required." },
      sourceUrlPolicy: { included: false, reason: "Excluded by default." }
    },
    requestedOutput: { framework: "react", styling: "tailwind", fields: ["componentName", "code", "summary", "approximationNotes"] }
  };
}

function validResponse() {
  return {
    contractVersion: 1,
    componentName: "GeneratedFixture",
    framework: "react",
    styling: "tailwind",
    code: "export function GeneratedFixture() { return null; }",
    summary: "Valid.",
    approximationNotes: ""
  };
}
