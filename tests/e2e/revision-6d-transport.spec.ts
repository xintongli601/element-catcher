import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCaptureRecordFixture, DEFAULT_CAPTURE_FIXTURES } from "./indexed-db-fixtures";
import { REQUESTED_OUTPUT, type ComponentGenerationResponseV1 } from "../../extension/src/shared/generation-contract";
import {
  buildPendingRevisionGeneratedVersionEntryV2,
  computeReviewAttemptFingerprint,
  computeRevisionInstructionFingerprint,
  computeSourceGeneratedVersionFingerprint,
  deriveRevisionGeneratedVersionId
} from "../../extension/src/generation/revision-contract";
import {
  canonicalRevisionRequestBody,
  finalizeRevisionTransportResponse,
  prepareComponentRevisionReview,
  revalidateComponentRevisionReview,
  reviewRequestBodiesEqual,
  validateCompleteFrozenComponentRevisionReviewV1,
  validateFrozenComponentRevisionReviewV1,
  type FrozenComponentRevisionReviewV1
} from "../../extension/src/generation/revision-review";
import { createHttpRevisionTransport } from "../../extension/src/generation/revision-transport";
import { canonicalJsonStringify, type CanonicalJsonValue } from "../../extension/src/generation/canonical-json";
import { computePngDataUrlDigest } from "../../extension/src/generation/screenshot";
import type { StoredScreenshotAsset } from "../../extension/src/storage/indexed-db";

const captureId = "capture-0123456789abcdef0123456789abcdef";
const sourceVersionId = "generated-version-0123456789abcdef0123456789abcdef";
const sourceSavedAt = "2026-07-26T00:00:00.000Z";
const attemptId = "revision-attempt-0123456789abcdef0123456789abcdef";
const alternateAttemptId = "revision-attempt-fedcba9876543210fedcba9876543210";
const createdAt = "2026-07-26T00:05:00.000Z";
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test.beforeEach(() => {
  installCreateImageBitmapPngMock();
});

test.describe("Milestone 6D Slice 3 frozen revision Review preparation", () => {
  test("prepares deeply frozen revision and regeneration Reviews with exact outbound projection and privacy", async () => {
    const capture = validCaptureRecord();
    const asset = validScreenshotAsset(capture);
    const source = validV1Entry();
    const review = await prepareComponentRevisionReview({
      currentCaptureRecord: capture,
      currentSavedAt: sourceSavedAt,
      screenshotAsset: asset,
      sourceGeneratedVersionEntry: source,
      mode: "revision",
      rawRevisionInstruction: "  Update   primary label ",
      screenshotIncluded: false,
      endpointCategory: "local-development-proxy",
      createLogicalAttemptId: () => attemptId,
      signal: activeSignal()
    });

    expect(review.mode).toBe("revision");
    expect(review.instruction).toBe("Update primary label");
    expect(review.instructionFingerprint).toBe(await computeRevisionInstructionFingerprint("Update primary label"));
    expect(review.logicalAttemptId).toBe(attemptId);
    expect(review.targetGeneratedVersionId).toBe(await deriveRevisionGeneratedVersionId(attemptId));
    expect(review.sourceGeneratedVersionFingerprint).toBe(await computeSourceGeneratedVersionFingerprint(source));
    expect(review.screenshot).toEqual({ included: false });
    expect("screenshot" in review.request).toBe(false);
    expect(review.request.revisionInstruction).toBe("Update primary label");
    expect(review.request.sourceComponent).toEqual({
      componentName: "GeneratedFixture",
      framework: "react",
      styling: "tailwind",
      code: source.value.code,
      summary: source.value.summary,
      approximationNotes: source.value.approximationNotes
    });
    expect(JSON.stringify(review.request)).not.toContain("providerLabel");
    expect(JSON.stringify(review.request)).not.toContain("sourceCaptureId");
    expect(JSON.stringify(review.request)).not.toContain("sourceGeneratedVersionId");
    expect(JSON.stringify(review.request)).not.toContain("Fingerprint");
    expect(JSON.stringify(review.request)).not.toContain("logicalAttemptId");
    expect(JSON.stringify(review.request)).not.toContain("savedAt");
    expect(JSON.stringify(review.request)).not.toContain("storageKey");
    expect(JSON.stringify(review.request)).not.toContain("notes");
    expect(JSON.stringify(review.request)).not.toContain("https://private.example.test");
    expect(JSON.stringify(review.request)).not.toContain("Private Page");
    expect(review.request.requestedOutput).toEqual(REQUESTED_OUTPUT);
    expect(reviewRequestBodiesEqual(review, review.request)).toBe(true);
    expect(review.canonicalRequestBody).toBe(JSON.stringify(review.request));
    expect(Object.isFrozen(review)).toBe(true);
    expect(isDeepFrozen(review)).toBe(true);

    source.value.summary = "Mutated by caller";
    capture.library.title = "Mutated by caller";
    expect(review.sourceComponent.summary).toBe("Accessible button");
    expect(review.captureContext.library.title).toBe("Button");

    const regeneration = await prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: await validV2SourceEntry(),
      mode: "regeneration",
      screenshotIncluded: false,
      createLogicalAttemptId: () => alternateAttemptId,
      signal: activeSignal()
    });
    expect(regeneration.mode).toBe("regeneration");
    expect("instruction" in regeneration).toBe(false);
    expect("instructionFingerprint" in regeneration).toBe(false);
    expect("revisionInstruction" in regeneration.request).toBe(false);
    await expect(prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "regeneration",
      rawRevisionInstruction: "Update label",
      screenshotIncluded: false,
      createLogicalAttemptId: () => attemptId,
      signal: activeSignal()
    })).rejects.toThrow();
  });

  test("binds screenshot false and true semantics during preparation and revalidation", async () => {
    const capture = validCaptureRecord();
    const source = validV1Entry();
    const screenshotFalse = await prepareComponentRevisionReview({
      currentCaptureRecord: capture,
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(capture),
      sourceGeneratedVersionEntry: source,
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: false,
      createLogicalAttemptId: () => attemptId,
      signal: activeSignal()
    });
    expect(screenshotFalse.reviewAttemptFingerprintInput.screenshot).toEqual({ included: false });
    expect(JSON.stringify(screenshotFalse.reviewAttemptFingerprintInput)).not.toContain("data:image/png");
    expect(JSON.stringify(screenshotFalse.reviewAttemptFingerprintInput)).not.toContain("digest");
    await expect(validateCompleteFrozenComponentRevisionReviewV1(screenshotFalse)).resolves.toBe(screenshotFalse);
    await expect(revalidateComponentRevisionReview({
      review: screenshotFalse,
      currentCaptureRecord: { ...validCaptureRecord(), library: { ...validCaptureRecord().library, notes: "Changed local notes only" } },
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(capture, { payload: "different-one-byte-payload" }),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: screenshotFalse.endpointCategory,
      signal: activeSignal()
    })).resolves.toEqual(screenshotFalse.request);
    await expect(revalidateComponentRevisionReview({
      review: screenshotFalse,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: undefined,
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: screenshotFalse.endpointCategory,
      signal: activeSignal()
    })).rejects.toThrow();

    const screenshotTrue = await prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: true,
      createLogicalAttemptId: () => alternateAttemptId,
      signal: activeSignal()
    });
    expect(screenshotTrue.screenshot.included).toBe(true);
    expect(screenshotTrue.request.screenshot).toMatchObject({ mediaType: "image/png", width: 1, height: 1 });
    expect(screenshotTrue.request.screenshot?.dataUrl).toBe(`data:image/png;base64,${pngBase64}`);
    expect(JSON.stringify(screenshotTrue.reviewAttemptFingerprintInput)).not.toContain(screenshotTrue.request.screenshot?.dataUrl);
    await expect(validateCompleteFrozenComponentRevisionReviewV1(screenshotTrue)).resolves.toBe(screenshotTrue);
    expect(screenshotTrue.screenshot.included).toBe(true);
    expect(screenshotTrue.screenshot.digest).toBe(await computePngDataUrlDigest(screenshotTrue.request.screenshot?.dataUrl ?? "", {
      byteLength: screenshotTrue.request.screenshot?.byteLength ?? 0,
      width: screenshotTrue.request.screenshot?.width ?? 0,
      height: screenshotTrue.request.screenshot?.height ?? 0
    }));
    await expect(revalidateComponentRevisionReview({
      review: screenshotTrue,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord(), { payload: "different-one-byte-payload" }),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: screenshotTrue.endpointCategory,
      signal: activeSignal()
    })).rejects.toThrow();
    await expect(revalidateComponentRevisionReview({
      review: screenshotTrue,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: { ...validScreenshotAsset(validCaptureRecord()), width: 2 },
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: screenshotTrue.endpointCategory,
      signal: activeSignal()
    })).rejects.toThrow();
  });

  test("binds revalidation to the independently resolved endpoint category", async () => {
    const localProxyReview = await validRevisionReview();
    await expect(revalidateComponentRevisionReview({
      review: localProxyReview,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: "local-development-proxy",
      signal: activeSignal()
    })).resolves.toEqual(localProxyReview.request);
    await expect(revalidateComponentRevisionReview({
      review: localProxyReview,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: "deterministic-mock",
      signal: activeSignal()
    })).rejects.toThrow();

    const deterministicReview = await prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: false,
      endpointCategory: "deterministic-mock",
      createLogicalAttemptId: () => attemptId,
      signal: activeSignal()
    });
    await expect(revalidateComponentRevisionReview({
      review: deterministicReview,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: "backend-unconfigured",
      signal: activeSignal()
    })).rejects.toThrow();
    await expect(revalidateComponentRevisionReview({
      review: deterministicReview,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: "production-backend" as FrozenComponentRevisionReviewV1["endpointCategory"],
      signal: activeSignal()
    })).rejects.toThrow();
  });

  test("rejects source mismatch, tampered Review, and transmitted-field changes before transport", async () => {
    await expect(prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: "not a timestamp",
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: false,
      createLogicalAttemptId: () => attemptId,
      signal: activeSignal()
    })).rejects.toThrow();
    await expect(prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: "2026-07-26T00:00:00Z",
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: false,
      createLogicalAttemptId: () => attemptId,
      signal: activeSignal()
    })).rejects.toThrow();
    await expect(prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: { ...validV1Entry(), sourceCaptureId: "capture-fedcba9876543210fedcba9876543210" },
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: false,
      createLogicalAttemptId: () => attemptId,
      signal: activeSignal()
    })).rejects.toThrow();

    const review = await validRevisionReview();
    await expect(revalidateComponentRevisionReview({
      review: { ...review },
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: review.endpointCategory,
      signal: activeSignal()
    })).rejects.toThrow();
    await expect(revalidateComponentRevisionReview({
      review,
      currentCaptureRecord: { ...validCaptureRecord(), library: { ...validCaptureRecord().library, title: "Changed transmitted title" } },
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: review.endpointCategory,
      signal: activeSignal()
    })).rejects.toThrow();
    await expect(revalidateComponentRevisionReview({
      review,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: { ...validV1Entry(), value: { ...validResponse(), summary: "Changed source" } },
      endpointCategory: review.endpointCategory,
      signal: activeSignal()
    })).rejects.toThrow();

    const tamperedCases = [
      ["instruction fingerprint", { instructionFingerprint: "f".repeat(64) }],
      ["contract version", { contractVersion: 2 }],
      ["savedAt", { sourceCaptureSavedAt: "2026-07-26T00:00:00Z" }],
      ["endpoint", { endpointCategory: "production-backend" }],
      ["extra", { extra: true }],
      ["canonical body", { canonicalRequestBody: "{}" }],
      ["fingerprint input", { reviewAttemptFingerprintInput: { ...review.reviewAttemptFingerprintInput, currentCaptureProjectionFingerprint: "f".repeat(64) } }]
    ];
    for (const [name, patch] of tamperedCases) {
      await expect(revalidateComponentRevisionReview({
        review: deepFreezeJson({ ...review, ...patch }) as FrozenComponentRevisionReviewV1,
        currentCaptureRecord: validCaptureRecord(),
        currentSavedAt: sourceSavedAt,
        screenshotAsset: validScreenshotAsset(validCaptureRecord()),
        sourceGeneratedVersionEntry: validV1Entry(),
        endpointCategory: review.endpointCategory,
        signal: activeSignal()
      }), String(name)).rejects.toThrow();
    }

    const regeneration = await prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "regeneration",
      screenshotIncluded: false,
      createLogicalAttemptId: () => alternateAttemptId,
      signal: activeSignal()
    });
    expect(() => validateFrozenComponentRevisionReviewV1(deepFreezeJson({
      ...regeneration,
      instruction: "Update primary label",
      instructionFingerprint: "f".repeat(64)
    }))).toThrow();
  });

  test("honors AbortSignal during preparation and revalidation without producing trusted data", async () => {
    const preAborted = new AbortController();
    preAborted.abort();
    let idCalls = 0;
    await expect(prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: false,
      createLogicalAttemptId: () => {
        idCalls += 1;
        return attemptId;
      },
      signal: preAborted.signal
    })).rejects.toMatchObject({ code: "cancellation" });
    expect(idCalls).toBe(0);

    const duringScreenshot = new AbortController();
    await expect(prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord(), { abortOnRead: duringScreenshot }),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: true,
      createLogicalAttemptId: () => {
        idCalls += 1;
        return attemptId;
      },
      signal: duringScreenshot.signal
    })).rejects.toMatchObject({ code: "cancellation" });
    expect(idCalls).toBe(0);

    const review = await validRevisionReview();
    await expect(revalidateComponentRevisionReview({
      review,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: review.endpointCategory,
      signal: preAborted.signal
    })).rejects.toMatchObject({ code: "cancellation" });

    const revalidationAbort = new AbortController();
    const screenshotReview = await prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "revision",
      rawRevisionInstruction: "Update primary label",
      screenshotIncluded: true,
      createLogicalAttemptId: () => alternateAttemptId,
      signal: activeSignal()
    });
    await expect(revalidateComponentRevisionReview({
      review: screenshotReview,
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord(), { abortOnRead: revalidationAbort }),
      sourceGeneratedVersionEntry: validV1Entry(),
      endpointCategory: screenshotReview.endpointCategory,
      signal: revalidationAbort.signal
    })).rejects.toMatchObject({ code: "cancellation" });
  });
});

test.describe("Milestone 6D Slice 3 revision transport and pending V2", () => {
  test("sends exact body and idempotency header, reuses retry identity, and maps safe errors", async () => {
    const review = await validRevisionReview();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(validResponse()), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const transport = createHttpRevisionTransport("http://127.0.0.1:8787/v1/revise-component");
      await expect(transport.revise(review.request, review.logicalAttemptId, new AbortController().signal)).resolves.toMatchObject({
        componentName: review.sourceComponent.componentName
      });
      await transport.revise(review.request, review.logicalAttemptId, new AbortController().signal);
      expect(calls).toHaveLength(2);
      expect(calls[0].url).toBe("http://127.0.0.1:8787/v1/revise-component");
      expect(calls[0].init.method).toBe("POST");
      expect(calls[0].init.credentials).toBe("omit");
      expect(calls[0].init.cache).toBe("no-store");
      expect(calls[0].init.headers).toEqual({
        "Content-Type": "application/json",
        "X-Element-Catcher-Contract-Version": "1",
        "X-Element-Catcher-Idempotency-Key": review.logicalAttemptId
      });
      expect(calls[0].init.body).toBe(review.canonicalRequestBody);
      expect(calls[1].init.body).toBe(calls[0].init.body);
      expect((calls[1].init.headers as Record<string, string>)["X-Element-Catcher-Idempotency-Key"]).toBe(review.logicalAttemptId);
      expect(String(calls[0].init.body)).not.toContain(review.logicalAttemptId);
    } finally {
      globalThis.fetch = originalFetch;
    }

    await expect(withFetchResponse(new Response(JSON.stringify({ ...validResponse(), componentName: "RenamedFixture" })), async () =>
      createHttpRevisionTransport("http://127.0.0.1:8787/v1/revise-component").revise(review.request, review.logicalAttemptId, new AbortController().signal)
    )).rejects.toMatchObject({ code: "malformed_response" });
    await expect(withFetchResponse(new Response(JSON.stringify({ contractVersion: 1, error: { code: "rate_limited", message: "safe" } }), { status: 429 }), async () =>
      createHttpRevisionTransport("http://127.0.0.1:8787/v1/revise-component").revise(review.request, review.logicalAttemptId, new AbortController().signal)
    )).rejects.toMatchObject({ code: "rate_limited" });
    await expect(withFetchResponse(new Response("x".repeat(100_001)), async () =>
      createHttpRevisionTransport("http://127.0.0.1:8787/v1/revise-component").revise(review.request, review.logicalAttemptId, new AbortController().signal)
    )).rejects.toMatchObject({ code: "malformed_response" });
    const abortController = new AbortController();
    abortController.abort();
    await expect(withFetchImplementation(async () => {
      throw new DOMException("Operation aborted.", "AbortError");
    }, async () =>
      createHttpRevisionTransport("http://127.0.0.1:8787/v1/revise-component").revise(review.request, review.logicalAttemptId, abortController.signal)
    )).rejects.toMatchObject({ code: "cancellation" });
  });

  test("validates complete revision requests before fetch", async () => {
    const review = await validRevisionReview();
    let calls = 0;
    const transport = createHttpRevisionTransport("http://127.0.0.1:8787/v1/revise-component");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify(validResponse()), { status: 200 });
    };
    try {
      await expect(transport.revise({
        ...review.request,
        screenshot: {
          mediaType: "image/png",
          width: 1,
          height: 1,
          byteLength: 8,
          dataUrl: "data:image/png;base64,aGVsbG8="
        }
      }, review.logicalAttemptId, activeSignal())).rejects.toThrow();
      await expect(transport.revise({
        ...review.request,
        screenshot: {
          mediaType: "image/png",
          width: 2,
          height: 1,
          byteLength: Buffer.from(pngBase64, "base64").byteLength,
          dataUrl: `data:image/png;base64,${pngBase64}`
        }
      }, review.logicalAttemptId, activeSignal())).rejects.toThrow();
      await expect(transport.revise({
        ...review.request,
        screenshot: {
          mediaType: "image/png",
          width: 1,
          height: 1,
          byteLength: 1,
          dataUrl: `data:image/png;base64,${"A".repeat(6_400_000)}`
        }
      }, review.logicalAttemptId, activeSignal())).rejects.toThrow();
      await expect(transport.revise({ ...review.request, screenshot: undefined }, review.logicalAttemptId, activeSignal())).rejects.toThrow();
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("constructs immutable pending V2 only after valid response and honors cancellation", async () => {
    const review = await validRevisionReview();
    const result = await finalizeRevisionTransportResponse({
      review,
      response: validResponse(),
      signal: new AbortController().signal,
      createdAt
    });
    expect(result.pendingEntry.id).toBe(review.targetGeneratedVersionId);
    expect(result.pendingEntry.sourceReviewFingerprint).toBe(review.currentCaptureProjectionFingerprint);
    expect(result.pendingEntry.operation.kind).toBe("revision");
    expect(result.pendingEntry.operation.logicalAttemptId).toBe(review.logicalAttemptId);
    expect(result.pendingEntry.operation.reviewAttemptFingerprint).toBe(review.reviewAttemptFingerprint);
    expect(result.pendingEntry.operation.sourceGeneratedVersionId).toBe(review.sourceGeneratedVersionId);
    expect(result.pendingEntry.operation.sourceGeneratedVersionFingerprint).toBe(review.sourceGeneratedVersionFingerprint);
    expect(result.pendingEntry.operation.instruction).toBe(review.instruction);
    expect(result.pendingEntry.operation.instructionFingerprint).toBe(review.instructionFingerprint);
    expect(result.pendingEntry.operation.screenshotIncluded).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(isDeepFrozen(result)).toBe(true);

    const regeneration = await prepareComponentRevisionReview({
      currentCaptureRecord: validCaptureRecord(),
      currentSavedAt: sourceSavedAt,
      screenshotAsset: validScreenshotAsset(validCaptureRecord()),
      sourceGeneratedVersionEntry: validV1Entry(),
      mode: "regeneration",
      screenshotIncluded: false,
      createLogicalAttemptId: () => alternateAttemptId,
      signal: activeSignal()
    });
    const regenerationResult = await finalizeRevisionTransportResponse({
      review: regeneration,
      response: validResponse(),
      signal: new AbortController().signal,
      createdAt
    });
    expect(regenerationResult.pendingEntry.operation.kind).toBe("regeneration");
    expect("instruction" in regenerationResult.pendingEntry.operation).toBe(false);

    await expect(finalizeRevisionTransportResponse({
      review,
      response: { ...validResponse(), componentName: "RenamedFixture" },
      signal: new AbortController().signal,
      createdAt
    })).rejects.toMatchObject({ code: "malformed_response" });
    const aborted = new AbortController();
    aborted.abort();
    await expect(finalizeRevisionTransportResponse({
      review,
      response: validResponse(),
      signal: aborted.signal,
      createdAt
    })).rejects.toMatchObject({ code: "cancellation" });
  });

  test("rejects fabricated frozen Review lineage before pending V2 finalization", async () => {
    const review = await validRevisionReview();
    const requestWithMismatchedSource = {
      ...review.request,
      sourceComponent: {
        ...review.request.sourceComponent,
        summary: "Different request source component"
      }
    };
    const otherSourceEntry = {
      ...validV1Entry(),
      id: "generated-version-fedcba9876543210fedcba9876543210",
      sourceCaptureId: "capture-fedcba9876543210fedcba9876543210"
    };
    const fabricatedCases = [
      ["screenshot lineage", { screenshotIncluded: true }],
      ["source fingerprint", { sourceGeneratedVersionFingerprint: "f".repeat(64) }],
      ["review attempt fingerprint", { reviewAttemptFingerprint: "f".repeat(64) }],
      ["target generated version", { targetGeneratedVersionId: "generated-version-fedcba9876543210fedcba9876543210" }],
      ["logical attempt binding", { reviewAttemptFingerprintInput: { ...review.reviewAttemptFingerprintInput, logicalAttemptId: alternateAttemptId } }],
      ["request source component", { request: requestWithMismatchedSource, canonicalRequestBody: JSON.stringify(requestWithMismatchedSource) }],
      ["canonical source entry id", { canonicalSourceGeneratedVersionEntry: canonicalJson(otherSourceEntry) }]
    ];

    for (const [name, patch] of fabricatedCases) {
      const fabricated = deepFreezeJson({ ...review, ...patch }) as FrozenComponentRevisionReviewV1;
      if (name === "screenshot lineage") {
        expect(() => validateFrozenComponentRevisionReviewV1(fabricated)).not.toThrow();
        await expect(validateCompleteFrozenComponentRevisionReviewV1(fabricated)).rejects.toThrow();
      }
      await expect(finalizeRevisionTransportResponse({
        review: fabricated,
        response: validResponse(),
        signal: activeSignal(),
        createdAt
      }), String(name)).rejects.toMatchObject({ code: "review_fingerprint_mismatch" });
    }
  });

  test("rejects fabricated screenshot digest lineage bound to valid request bytes", async () => {
    const review = await validScreenshotRevisionReview();
    if (review.screenshot.included !== true || review.reviewAttemptFingerprintInput.screenshot.included !== true || !review.request.screenshot) {
      throw new Error("invalid screenshot fixture");
    }
    const falseDigest = "f".repeat(64);
    expect(falseDigest).not.toBe(review.screenshot.digest);
    const fabricatedFingerprintInput = {
      ...review.reviewAttemptFingerprintInput,
      screenshot: {
        ...review.reviewAttemptFingerprintInput.screenshot,
        digest: falseDigest
      }
    };
    const fabricated = deepFreezeJson({
      ...review,
      screenshot: {
        ...review.screenshot,
        digest: falseDigest
      },
      reviewAttemptFingerprintInput: fabricatedFingerprintInput,
      reviewAttemptFingerprint: await computeReviewAttemptFingerprint(fabricatedFingerprintInput)
    }) as FrozenComponentRevisionReviewV1;

    expect(() => validateFrozenComponentRevisionReviewV1(fabricated)).not.toThrow();
    await expect(validateCompleteFrozenComponentRevisionReviewV1(fabricated)).rejects.toThrow();
    await expect(finalizeRevisionTransportResponse({
      review: fabricated,
      response: validResponse(),
      signal: activeSignal(),
      createdAt
    })).rejects.toMatchObject({ code: "review_fingerprint_mismatch" });
  });

  test("rejects screenshot request byte changes even when metadata remains bound", async () => {
    const review = await validScreenshotRevisionReview();
    if (!review.request.screenshot) {
      throw new Error("invalid screenshot fixture");
    }
    const changedRequest = {
      ...review.request,
      screenshot: {
        ...review.request.screenshot,
        dataUrl: changedPngDataUrlSameShape()
      }
    };
    expect(changedRequest.screenshot.dataUrl).not.toBe(review.request.screenshot.dataUrl);
    await expect(validateCompleteFrozenComponentRevisionReviewV1(deepFreezeJson({
      ...review,
      request: changedRequest,
      canonicalRequestBody: JSON.stringify(changedRequest)
    }) as FrozenComponentRevisionReviewV1)).rejects.toThrow();
  });

  test("maps response-body and response-validation cancellation without retrying", async () => {
    const review = await validRevisionReview();
    const transport = createHttpRevisionTransport("http://127.0.0.1:8787/v1/revise-component");
    let calls = 0;
    const pendingBodyAbort = new AbortController();
    await expect(withFetchImplementation(async () => {
      calls += 1;
      return responseLike({
        ok: true,
        text: async () => {
          await Promise.resolve();
          pendingBodyAbort.abort();
          throw new DOMException("Operation aborted.", "AbortError");
        }
      });
    }, async () => transport.revise(review.request, review.logicalAttemptId, pendingBodyAbort.signal))).rejects.toMatchObject({ code: "cancellation" });
    expect(calls).toBe(1);

    calls = 0;
    const afterBodyAbort = new AbortController();
    await expect(withFetchImplementation(async () => {
      calls += 1;
      return responseLike({
        ok: true,
        text: async () => {
          afterBodyAbort.abort();
          return JSON.stringify(validResponse());
        }
      });
    }, async () => transport.revise(review.request, review.logicalAttemptId, afterBodyAbort.signal))).rejects.toMatchObject({ code: "cancellation" });
    expect(calls).toBe(1);

    calls = 0;
    const afterParseAbort = new AbortController();
    const originalParse = JSON.parse;
    JSON.parse = ((text: string) => {
      const parsed = originalParse(text);
      if (calls > 0 && text.includes("\"componentName\"")) {
        afterParseAbort.abort();
      }
      return parsed;
    }) as JSON["parse"];
    try {
      await expect(withFetchImplementation(async () => {
        calls += 1;
        return responseLike({
          ok: true,
          text: async () => JSON.stringify(validResponse())
        });
      }, async () => transport.revise(review.request, review.logicalAttemptId, afterParseAbort.signal))).rejects.toMatchObject({ code: "cancellation" });
    } finally {
      JSON.parse = originalParse;
    }
    expect(calls).toBe(1);

    calls = 0;
    await expect(withFetchImplementation(async () => {
      calls += 1;
      return responseLike({
        ok: true,
        text: async () => JSON.stringify(validResponse())
      });
    }, async () => transport.revise(review.request, review.logicalAttemptId, activeSignal()))).resolves.toMatchObject({
      componentName: review.sourceComponent.componentName
    });
    expect(calls).toBe(1);
  });

  test("keeps Slice 3 unreachable from production UI, storage, preview, backend, package and manifest boundaries", () => {
    const root = process.cwd();
    expect(readFileSync(join(root, "extension/src/sidepanel/GenerationWorkflow.tsx"), "utf8")).not.toContain("revision-review");
    expect(readFileSync(join(root, "extension/src/sidepanel/GenerationWorkflow.tsx"), "utf8")).not.toContain("revision-transport");
    expect(readFileSync(join(root, "extension/src/storage/indexed-db.ts"), "utf8")).not.toContain("GeneratedComponentVersionEntryV2");
    expect(readFileSync(join(root, "extension/src/preview/host.ts"), "utf8")).not.toContain("revision-review");
    expect(readFileSync(join(root, "backend/src/app.ts"), "utf8")).not.toContain("revision-review");
    expect(readFileSync(join(root, "package.json"), "utf8")).not.toContain("revision-transport");
    expect(readFileSync(join(root, "extension/manifest.json"), "utf8")).not.toContain("revise-component");
  });
});

async function validRevisionReview(): Promise<FrozenComponentRevisionReviewV1> {
  return prepareComponentRevisionReview({
    currentCaptureRecord: validCaptureRecord(),
    currentSavedAt: sourceSavedAt,
    screenshotAsset: validScreenshotAsset(validCaptureRecord()),
    sourceGeneratedVersionEntry: validV1Entry(),
    mode: "revision",
    rawRevisionInstruction: "Update primary label",
    screenshotIncluded: false,
    endpointCategory: "local-development-proxy",
    createLogicalAttemptId: () => attemptId,
    signal: activeSignal()
  });
}

async function validScreenshotRevisionReview(): Promise<FrozenComponentRevisionReviewV1> {
  return prepareComponentRevisionReview({
    currentCaptureRecord: validCaptureRecord(),
    currentSavedAt: sourceSavedAt,
    screenshotAsset: validScreenshotAsset(validCaptureRecord()),
    sourceGeneratedVersionEntry: validV1Entry(),
    mode: "revision",
    rawRevisionInstruction: "Update primary label",
    screenshotIncluded: true,
    endpointCategory: "local-development-proxy",
    createLogicalAttemptId: () => alternateAttemptId,
    signal: activeSignal()
  });
}

function validCaptureRecord() {
  return createCaptureRecordFixture({
    ...DEFAULT_CAPTURE_FIXTURES[0],
    id: captureId,
    title: "Button",
    sourceUrl: "https://private.example.test/path?token=secret",
    pageTitle: "Private Page",
    width: 1,
    height: 1,
    tagName: "button",
    semanticRole: "button",
    libraryComponentType: "Button",
    libraryTags: ["cta"],
    libraryNotes: "Private notes",
    summaryComponentType: "Button"
  });
}

function validScreenshotAsset(record = validCaptureRecord(), options: { payload?: string; abortOnRead?: AbortController } = {}): StoredScreenshotAsset {
  const bytes = options.payload ? fixedLengthPayloadBytes(options.payload) : Buffer.from(pngBase64, "base64");
  const blob = options.abortOnRead
    ? abortingBlob(bytes, options.abortOnRead)
    : new Blob([bytes], { type: "image/png" });
  return {
    storageKey: record.assets.screenshot.storageKey,
    blob,
    mediaType: "image/png",
    width: record.assets.screenshot.width,
    height: record.assets.screenshot.height,
    byteLength: bytes.byteLength,
    crop: record.assets.screenshot.crop
  };
}

function activeSignal() {
  return new AbortController().signal;
}

function deepFreezeJson<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T;
  return deepFreeze(clone);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function canonicalJson(value: unknown) {
  return canonicalJsonStringify(value as CanonicalJsonValue);
}

function responseLike(input: { ok: boolean; text: () => Promise<string> }): Response {
  return input as Response;
}

function abortingBlob(bytes: Uint8Array, controller: AbortController) {
  const blob = new Blob([bytes], { type: "image/png" });
  const read = blob.arrayBuffer.bind(blob);
  return Object.assign(blob, {
    async arrayBuffer() {
      controller.abort();
      return read();
    }
  });
}

function fixedLengthPayloadBytes(seed: string) {
  const original = Buffer.from(pngBase64, "base64");
  const replacement = Buffer.from(original);
  const seedBytes = Buffer.from(seed);
  for (let index = 24; index < replacement.length && index - 24 < seedBytes.length; index += 1) {
    replacement[index] = seedBytes[index - 24];
  }
  return replacement;
}

function changedPngDataUrlSameShape() {
  return `data:image/png;base64,${Buffer.from(fixedLengthPayloadBytes("changed-digest")).toString("base64")}`;
}

function validV1Entry() {
  return {
    id: sourceVersionId,
    sourceCaptureId: captureId,
    sourceCaptureSavedAt: sourceSavedAt,
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: "2026-07-26T00:01:00.000Z",
    value: validResponse()
  };
}

async function validV2SourceEntry() {
  const instruction = "Update primary label";
  return buildPendingRevisionGeneratedVersionEntryV2({
    id: await deriveRevisionGeneratedVersionId(attemptId),
    sourceCaptureId: captureId,
    sourceCaptureSavedAt: sourceSavedAt,
    currentCaptureProjectionFingerprint: "b".repeat(64),
    createdAt: "2026-07-26T00:02:00.000Z",
    value: validResponse(),
    expectedSourceComponentName: "GeneratedFixture",
    logicalAttemptId: attemptId,
    reviewAttemptFingerprint: "c".repeat(64),
    sourceGeneratedVersionId: sourceVersionId,
    sourceGeneratedVersionFingerprint: "d".repeat(64),
    instruction,
    instructionFingerprint: await computeRevisionInstructionFingerprint(instruction),
    screenshotIncluded: false
  });
}

function validResponse(): ComponentGenerationResponseV1 {
  return {
    contractVersion: 1,
    componentName: "GeneratedFixture",
    framework: "react",
    styling: "tailwind",
    code: "export function GeneratedFixture() { return <button>Save</button>; }",
    summary: "Accessible button",
    approximationNotes: "None",
    metadata: { providerLabel: "mock", providerModelLabel: "fixture" }
  };
}

async function withFetchResponse<T>(response: Response, run: () => Promise<T>) {
  return withFetchImplementation(async () => response, run);
}

async function withFetchImplementation<T>(implementation: typeof fetch, run: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function isDeepFrozen(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return true;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}

function installCreateImageBitmapPngMock() {
  const globalWithImageBitmap = globalThis as typeof globalThis & {
    createImageBitmap?: (blob: Blob) => Promise<{ width: number; height: number; close: () => void }>;
  };
  globalWithImageBitmap.createImageBitmap = async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < 24) {
      throw new Error("invalid png");
    }
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let index = 0; index < signature.length; index += 1) {
      if (bytes[index] !== signature[index]) {
        throw new Error("invalid png");
      }
    }
    return {
      width: readUint32(bytes, 16),
      height: readUint32(bytes, 20),
      close() {}
    };
  };
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}
