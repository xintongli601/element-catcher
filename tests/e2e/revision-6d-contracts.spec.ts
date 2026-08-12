import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPendingRegenerationGeneratedVersionEntryV2,
  buildPendingRevisionGeneratedVersionEntryV2,
  computeCurrentCaptureProjectionFingerprint,
  computeReviewAttemptFingerprint,
  computeRevisionInstructionFingerprint,
  computeSourceGeneratedVersionFingerprint,
  createLogicalAttemptId,
  deriveRevisionGeneratedVersionId,
  normalizeRevisionInstruction,
  validateCompleteComponentRevisionInputV1,
  validateComponentRevisionInputV1,
  validateComponentRevisionRequestV1,
  validateComponentRevisionRequestShapeV1,
  type ComponentRevisionRequestV1,
  type ReviewAttemptFingerprintInputV1
} from "../../extension/src/generation/revision-contract";
import { canonicalJsonStringify } from "../../extension/src/generation/canonical-json";
import {
  generatedComponentVersionEntriesEqual,
  validateGeneratedComponentVersionEntry,
  validateGeneratedComponentVersionEntryV1,
  validateGeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";
import { REQUESTED_OUTPUT, type ComponentGenerationResponseV1, type ExactCaptureContextProjectionV1 } from "../../extension/src/shared/generation-contract";

const captureId = "capture-0123456789abcdef0123456789abcdef";
const sourceVersionId = "generated-version-0123456789abcdef0123456789abcdef";
const sourceSavedAt = "2026-07-26T00:00:00.000Z";
const createdAt = "2026-07-26T00:01:00.000Z";
const shaA = "a".repeat(64);
const shaB = "b".repeat(64);
const shaC = "c".repeat(64);
const shaD = "d".repeat(64);
const attemptId = "revision-attempt-0123456789abcdef0123456789abcdef";
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test.beforeEach(() => {
  installCreateImageBitmapPngMock();
});

test.describe("Milestone 6D revision instruction normalization", () => {
  test("normalizes NFC, trims, collapses Unicode whitespace, and removes tab LF CR formatting", () => {
    expect(normalizeRevisionInstruction("  Cafe\u0301\t\n\r\u00a0button   update  ")).toBe("Café button update");
  });

  test("rejects empty, too-short, excessive code points, excessive UTF-8 bytes, control, and bidi input", () => {
    expect(() => normalizeRevisionInstruction("    ")).toThrow();
    expect(() => normalizeRevisionInstruction("abc")).toThrow();
    expect(normalizeRevisionInstruction("abcd")).toBe("abcd");
    expect(normalizeRevisionInstruction("a".repeat(1_000))).toBe("a".repeat(1_000));
    expect(() => normalizeRevisionInstruction("a".repeat(1_001))).toThrow();
    expect(normalizeRevisionInstruction("𠮷".repeat(4))).toBe("𠮷".repeat(4));
    expect(normalizeRevisionInstruction("😀😀😀😀").length).toBe(8);
    expect(normalizeRevisionInstruction("😀".repeat(1_000))).toBe("😀".repeat(1_000));
    expect(() => normalizeRevisionInstruction("😀".repeat(1_001))).toThrow();
    expect(() => normalizeRevisionInstruction("€".repeat(1_000) + "𠮷".repeat(275))).toThrow();
    expect(() => normalizeRevisionInstruction("abcd\u0001")).toThrow();
    expect(() => normalizeRevisionInstruction("abcd\u0085")).toThrow();
    expect(() => normalizeRevisionInstruction("abcd\u202e")).toThrow();
    expect(() => normalizeRevisionInstruction(123)).toThrow();
  });
});

test.describe("Milestone 6D revision input contract", () => {
  test("accepts exact revision and regeneration keys", () => {
    expect(() => validateComponentRevisionInputV1(validRevisionInput())).not.toThrow();
    expect(() => validateComponentRevisionInputV1(validRegenerationInput())).not.toThrow();
  });

  test("rejects unknown, missing, wrong version, wrong mode, malformed IDs, malformed fingerprints, and instruction misuse", () => {
    expect(() => validateComponentRevisionInputV1({ ...validRevisionInput(), extra: true })).toThrow();
    expect(() => validateComponentRevisionInputV1({ ...validRevisionInput(), instruction: undefined })).toThrow();
    expect(() => validateComponentRevisionInputV1({ ...validRevisionInput(), contractVersion: 2 })).toThrow();
    expect(() => validateComponentRevisionInputV1({ ...validRevisionInput(), mode: "initial-generation" })).toThrow();
    expect(() => validateComponentRevisionInputV1({ ...validRevisionInput(), sourceCaptureId: "capture-bad" })).toThrow();
    expect(() => validateComponentRevisionInputV1({ ...validRevisionInput(), sourceGeneratedVersionId: "generated-version-bad" })).toThrow();
    expect(() => validateComponentRevisionInputV1({ ...validRevisionInput(), logicalAttemptId: "revision-attempt-ABCDEF0123456789abcdef0123456789" })).toThrow();
    expect(() => validateComponentRevisionInputV1({ ...validRevisionInput(), reviewAttemptFingerprint: "A".repeat(64) })).toThrow();
    const { instruction, instructionFingerprint, ...missingRevisionInstruction } = validRevisionInput();
    expect(() => validateComponentRevisionInputV1(missingRevisionInstruction)).toThrow();
    expect(() => validateComponentRevisionInputV1({ ...validRegenerationInput(), instruction: "Update copy", instructionFingerprint: shaD })).toThrow();
  });

  test("verifies revision input instruction fingerprint semantic integrity asynchronously", async () => {
    const instruction = "Update primary label";
    const instructionFingerprint = await computeRevisionInstructionFingerprint(instruction);
    await expect(validateCompleteComponentRevisionInputV1({ ...validRevisionInput(), instructionFingerprint })).resolves.toMatchObject({
      instruction,
      instructionFingerprint
    });
    await expect(validateCompleteComponentRevisionInputV1({ ...validRevisionInput(), instructionFingerprint: shaD })).rejects.toThrow();
    await expect(validateCompleteComponentRevisionInputV1({
      ...validRevisionInput(),
      instructionFingerprint: await computeRevisionInstructionFingerprint("Use secondary label")
    })).rejects.toThrow();
    await expect(validateCompleteComponentRevisionInputV1(validRegenerationInput())).resolves.toMatchObject({ mode: "regeneration" });
  });
});

test.describe("Milestone 6D revision request contract", () => {
  test("accepts exact revision, exact regeneration, absent screenshot, and included screenshot keys", async () => {
    await expect(validateComponentRevisionRequestV1(validRevisionRequest())).resolves.toMatchObject({ mode: "revision" });
    await expect(validateComponentRevisionRequestV1(validRegenerationRequest())).resolves.toMatchObject({ mode: "regeneration" });
    const request = validRegenerationRequest();
    expect("screenshot" in request).toBe(false);
    await expect(validateComponentRevisionRequestV1({ ...validRevisionRequest(), screenshot: validScreenshot() })).resolves.toMatchObject({
      screenshot: validScreenshot()
    });
  });

  test("rejects local hidden fields, unknown nested keys, wrong request output, framework, and styling", async () => {
    await expect(validateComponentRevisionRequestV1({ ...validRevisionRequest(), sourceCaptureId: captureId })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      sourceComponent: { ...validSourceComponent(), sourceUrl: "https://example.test" }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      captureContext: { ...validCaptureContext(), pageTitle: "Hidden" }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      requestedOutput: { ...REQUESTED_OUTPUT, fields: ["componentName"] }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      sourceComponent: { ...validSourceComponent(), framework: "vue" }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      sourceComponent: { ...validSourceComponent(), styling: "css" }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({ ...validRegenerationRequest(), revisionInstruction: "Update copy" })).rejects.toThrow();
  });

  test("distinguishes absent screenshot from explicit undefined or null", async () => {
    await expect(validateComponentRevisionRequestV1(validRevisionRequest())).resolves.toBeTruthy();
    await expect(validateComponentRevisionRequestV1(validRegenerationRequest())).resolves.toBeTruthy();
    await expect(validateComponentRevisionRequestV1({ ...validRevisionRequest(), screenshot: undefined })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({ ...validRegenerationRequest(), screenshot: undefined })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({ ...validRevisionRequest(), screenshot: null })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), byteLength: undefined }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), extra: true }
    })).rejects.toThrow();
    expect(() => validateComponentRevisionRequestShapeV1(validRevisionRequest())).not.toThrow();
  });

  test("performs full included PNG and serialized request validation", async () => {
    await expect(validateComponentRevisionRequestV1({ ...validRevisionRequest(), screenshot: validScreenshot() })).resolves.toBeTruthy();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), dataUrl: "data:image/png;base64,!!!!" }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), byteLength: 5, dataUrl: "data:image/png;base64,aGVsbG8=" }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), dataUrl: `data:image/png;base64,${Buffer.from("not a png").toString("base64")}` }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), byteLength: validScreenshot().byteLength + 1 }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), width: 2 }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), width: 4097 }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: {
        ...validScreenshot(),
        dataUrl: `data:image/png;base64,${"A".repeat(6_400_000)}`
      }
    })).rejects.toThrow();
    await expect(validateComponentRevisionRequestV1({
      ...validRevisionRequest(),
      screenshot: { ...validScreenshot(), dataUrl: "data:image/png;base64,arbitrary text" }
    })).rejects.toThrow();
  });
});

test.describe("Milestone 6D generated-version V1/V2 contracts", () => {
  test("keeps valid V1 behavior and equality unchanged", () => {
    const v1 = validV1Entry();
    expect(() => validateGeneratedComponentVersionEntryV1(v1)).not.toThrow();
    expect(() => validateGeneratedComponentVersionEntry(v1)).not.toThrow();
    expect(generatedComponentVersionEntriesEqual(v1, { ...v1 })).toBe(true);
  });

  test("accepts valid V2 revision and regeneration and rejects malformed V2 variants", async () => {
    const revision = await validV2RevisionEntry();
    const regeneration = await validV2RegenerationEntry();
    expect(() => validateGeneratedComponentVersionEntryV2(revision)).not.toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2(regeneration)).not.toThrow();
    expect(() => validateGeneratedComponentVersionEntry(revision)).not.toThrow();
    expect(() => validateGeneratedComponentVersionEntryV1(revision)).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({ ...revision, operation: { kind: "initial-generation" } })).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({ ...revision, extra: true })).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({ ...revision, operation: { ...revision.operation, extra: true } })).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({
      ...regeneration,
      operation: { ...regeneration.operation, instruction: "Update copy", instructionFingerprint: shaD }
    })).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({ ...revision, value: { ...validResponse(), metadata: { providerLabel: "x".repeat(81) } } })).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({
      ...revision,
      operation: { ...revision.operation, instruction: " Update primary label " }
    })).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({
      ...revision,
      operation: { ...revision.operation, instruction: "abc" }
    })).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({
      ...revision,
      operation: { ...revision.operation, instruction: "Update primary label\u0001" }
    })).toThrow();
    expect(() => validateGeneratedComponentVersionEntryV2({
      ...revision,
      operation: { ...revision.operation, instruction: "Update primary label\u202e" }
    })).toThrow();
  });
});

test.describe("Milestone 6D canonicalization and fingerprints", () => {
  test("keeps canonical object key ordering stable", () => {
    expect(canonicalJsonStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJsonStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });

  test("computes stable source V1 and V2 fingerprints and changes for full-entry mutations", async () => {
    const v1 = validV1Entry();
    const v2 = await validV2RevisionEntry();
    await expect(computeSourceGeneratedVersionFingerprint(v1)).resolves.toMatch(/^[0-9a-f]{64}$/);
    await expect(computeSourceGeneratedVersionFingerprint(v2)).resolves.toMatch(/^[0-9a-f]{64}$/);
    expect(await computeSourceGeneratedVersionFingerprint(v1)).toBe(await computeSourceGeneratedVersionFingerprint({ ...v1 }));
    expect(await computeSourceGeneratedVersionFingerprint(v1)).not.toBe(await computeSourceGeneratedVersionFingerprint({
      ...v1,
      createdAt: "2026-07-26T00:02:00.000Z"
    }));
  });

  test("computes instruction and current capture projection fingerprints with correct inclusion boundaries", async () => {
    const normalized = normalizeRevisionInstruction("  Update   primary label ");
    expect(await computeRevisionInstructionFingerprint(normalized)).toMatch(/^[0-9a-f]{64}$/);
    await expect(computeRevisionInstructionFingerprint(" Update primary label ")).rejects.toThrow();
    const base = await computeCurrentCaptureProjectionFingerprint({ captureContext: validCaptureContext(), requestedOutput: REQUESTED_OUTPUT });
    const withChangedContext = await computeCurrentCaptureProjectionFingerprint({
      captureContext: { ...validCaptureContext(), library: { ...validCaptureContext().library, title: "Changed" } },
      requestedOutput: REQUESTED_OUTPUT
    });
    const withChangedOutput = await computeCurrentCaptureProjectionFingerprint({
      captureContext: validCaptureContext(),
      requestedOutput: { framework: "react", styling: "tailwind", fields: ["componentName", "summary", "code", "approximationNotes"] as never }
    }).catch((error) => error);
    expect(base).not.toBe(withChangedContext);
    expect(withChangedOutput).toBeInstanceOf(Error);
  });

  test("binds screenshot state and requires logicalAttemptId for reviewAttemptFingerprint", async () => {
    const falseInput = validReviewAttemptInput({ screenshot: { included: false } });
    expect(falseInput.screenshot).toEqual({ included: false });
    expect(JSON.stringify(falseInput.screenshot)).not.toContain("digest");
    expect(JSON.stringify(falseInput.screenshot)).not.toContain("width");
    const included = validReviewAttemptInput({ screenshot: { included: true, mediaType: "image/png", width: 10, height: 11, byteLength: 12, digest: shaD } });
    expect(await computeReviewAttemptFingerprint(falseInput)).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeReviewAttemptFingerprint(falseInput)).not.toBe(await computeReviewAttemptFingerprint(included));
    expect(await computeReviewAttemptFingerprint(falseInput)).not.toBe(await computeReviewAttemptFingerprint({
      ...falseInput,
      logicalAttemptId: "revision-attempt-fedcba9876543210fedcba9876543210"
    }));
    await expect(computeReviewAttemptFingerprint({ ...falseInput, logicalAttemptId: "" })).rejects.toThrow();
  });

  test("requires exact ReviewAttemptFingerprintInput keys by mode", async () => {
    const revision = validReviewAttemptInput({ screenshot: { included: false } });
    await expect(computeReviewAttemptFingerprint(revision)).resolves.toMatch(/^[0-9a-f]{64}$/);
    await expect(computeReviewAttemptFingerprint({ ...revision, extra: true })).rejects.toThrow();
    await expect(computeReviewAttemptFingerprint({ ...revision, sourceComponent: undefined })).rejects.toThrow();
    const { revisionInstruction, ...missingRevisionInstruction } = revision;
    await expect(computeReviewAttemptFingerprint(missingRevisionInstruction as ReviewAttemptFingerprintInputV1)).rejects.toThrow();
    await expect(computeReviewAttemptFingerprint({ ...revision, revisionInstruction: undefined })).rejects.toThrow();
    await expect(computeReviewAttemptFingerprint({
      ...revision,
      screenshot: { included: false, digest: shaD } as never
    })).rejects.toThrow();
    await expect(computeReviewAttemptFingerprint({
      ...revision,
      sourceComponent: { ...validSourceComponent(), extra: true }
    })).rejects.toThrow();
    const regeneration = validRegenerationReviewAttemptInput({ screenshot: { included: false } });
    await expect(computeReviewAttemptFingerprint(regeneration)).resolves.toMatch(/^[0-9a-f]{64}$/);
    await expect(computeReviewAttemptFingerprint({ ...regeneration, revisionInstruction: "Update primary label" })).rejects.toThrow();
  });
});

test.describe("Milestone 6D identities and pending V2 builders", () => {
  test("creates exact logicalAttemptId and deterministic generated-version IDs", async () => {
    const created = createLogicalAttemptId();
    expect(created).toMatch(/^revision-attempt-[0-9a-f]{32}$/);
    const id = await deriveRevisionGeneratedVersionId(attemptId);
    expect(id).toMatch(/^generated-version-[0-9a-f]{32}$/);
    await expect(deriveRevisionGeneratedVersionId(attemptId)).resolves.toBe(id);
    await expect(deriveRevisionGeneratedVersionId("revision-attempt-fedcba9876543210fedcba9876543210")).resolves.not.toBe(id);
    await expect(deriveRevisionGeneratedVersionId("bad-attempt")).rejects.toThrow();
  });

  test("builds immutable revision and regeneration V2 entries only from valid response data", async () => {
    const sourceResponse = validResponse();
    const revision = await validV2RevisionEntry(sourceResponse);
    const regeneration = await validV2RegenerationEntry(sourceResponse);
    expect(revision.sourceReviewFingerprint).toBe(shaB);
    expect(revision.operation.kind).toBe("revision");
    expect(regeneration.operation.kind).toBe("regeneration");
    expect(Object.isFrozen(revision)).toBe(true);
    expect(Object.isFrozen(revision.value)).toBe(true);
    expect(revision.value).not.toBe(sourceResponse);
    expect(() => validateGeneratedComponentVersionEntryV2(revision)).not.toThrow();
    sourceResponse.summary = "Mutated after build";
    expect(revision.value.summary).toBe("Accessible button");
    await expect(validV2RevisionEntry({ ...validResponse(), componentName: "DifferentFixture" })).rejects.toThrow();
    await expect(buildPendingRegenerationGeneratedVersionEntryV2({
      ...await validBuilderBaseWithId(),
      value: { ...validResponse(), code: "" }
    })).rejects.toThrow();
  });

  test("requires matching revision instruction fingerprints in builders", async () => {
    const instruction = "Update primary label";
    const matching = await computeRevisionInstructionFingerprint(instruction);
    const revision = await buildPendingRevisionGeneratedVersionEntryV2({
      ...await validBuilderBaseWithId(),
      instruction,
      instructionFingerprint: matching
    });
    expect(revision.operation.kind).toBe("revision");
    expect(revision.operation.instructionFingerprint).toBe(matching);
    await expect(buildPendingRevisionGeneratedVersionEntryV2({
      ...await validBuilderBaseWithId(),
      instruction,
      instructionFingerprint: shaD
    })).rejects.toThrow();
    await expect(buildPendingRevisionGeneratedVersionEntryV2({
      ...await validBuilderBaseWithId(),
      instruction,
      instructionFingerprint: await computeRevisionInstructionFingerprint("Use secondary label")
    })).rejects.toThrow();
    await expect(buildPendingRevisionGeneratedVersionEntryV2({
      ...await validBuilderBaseWithId(),
      instruction,
      instructionFingerprint: "A".repeat(64)
    })).rejects.toThrow();
    await expect(buildPendingRevisionGeneratedVersionEntryV2({
      ...await validBuilderBaseWithId(),
      instruction,
      instructionFingerprint: "bad"
    })).rejects.toThrow();
  });
});

test.describe("Milestone 6D slice boundary regression", () => {
  test("does not introduce backend route, UI wiring, generated-version V2 storage coupling, preview-host changes, or real OpenAI request path", () => {
    const root = process.cwd();
    const backendApp = readFileSync(join(root, "backend/src/app.ts"), "utf8");
    const sidePanel = readFileSync(join(root, "extension/src/sidepanel/GenerationWorkflow.tsx"), "utf8");
    const indexedDb = readFileSync(join(root, "extension/src/storage/indexed-db.ts"), "utf8");
    const previewHost = readFileSync(join(root, "extension/src/preview/host.ts"), "utf8");
    expect(backendApp).not.toContain("/v1/revise-component");
    expect(sidePanel).not.toContain("revision-contract");
    expect(indexedDb).not.toContain("GeneratedComponentVersionEntryV2");
    expect(indexedDb).toContain("ELEMENT_CATCHER_DATABASE_VERSION = 4");
    expect(previewHost).not.toContain("revision-contract");
  });
});

function validRevisionInput() {
  return {
    contractVersion: 1,
    mode: "revision",
    sourceCaptureId: captureId,
    sourceGeneratedVersionId: sourceVersionId,
    sourceGeneratedVersionFingerprint: shaA,
    currentCaptureProjectionFingerprint: shaB,
    screenshotIncluded: false,
    logicalAttemptId: attemptId,
    reviewAttemptFingerprint: shaC,
    instruction: "Update primary label",
    instructionFingerprint: shaD
  };
}

function validRegenerationInput() {
  return {
    contractVersion: 1,
    mode: "regeneration",
    sourceCaptureId: captureId,
    sourceGeneratedVersionId: sourceVersionId,
    sourceGeneratedVersionFingerprint: shaA,
    currentCaptureProjectionFingerprint: shaB,
    screenshotIncluded: true,
    logicalAttemptId: attemptId,
    reviewAttemptFingerprint: shaC
  };
}

function validRevisionRequest(): ComponentRevisionRequestV1 {
  return {
    contractVersion: 1,
    mode: "revision",
    revisionInstruction: "Update primary label",
    sourceComponent: validSourceComponent(),
    captureContext: validCaptureContext(),
    requestedOutput: REQUESTED_OUTPUT
  };
}

function validRegenerationRequest(): ComponentRevisionRequestV1 {
  return {
    contractVersion: 1,
    mode: "regeneration",
    sourceComponent: validSourceComponent(),
    captureContext: validCaptureContext(),
    requestedOutput: REQUESTED_OUTPUT
  };
}

function validSourceComponent() {
  return {
    componentName: "GeneratedFixture",
    framework: "react" as const,
    styling: "tailwind" as const,
    code: "export function GeneratedFixture() { return <button>Save</button>; }",
    summary: "Accessible button",
    approximationNotes: "None"
  };
}

function validScreenshot() {
  const byteLength = Buffer.from(pngBase64, "base64").byteLength;
  return {
    mediaType: "image/png" as const,
    width: 1,
    height: 1,
    byteLength,
    dataUrl: `data:image/png;base64,${pngBase64}`
  };
}

function validCaptureContext(): ExactCaptureContextProjectionV1 {
  return {
    library: { title: "Button", componentType: "Button", tags: ["cta"] },
    element: { tagName: "button", semanticRole: "button", rect: { width: 120, height: 40 } },
    dom: {
      sanitizedSnapshot: {
        tagName: "button",
        attributes: { class: "btn", ariaLabel: "Save" },
        textPreview: "Save",
        children: []
      },
      childSummary: []
    },
    styles: {
      computed: {
        display: "inline-flex",
        color: "rgb(255, 255, 255)",
        backgroundColor: "rgb(0, 0, 0)",
        padding: { top: "8px", right: "12px", bottom: "8px", left: "12px" }
      },
      before: { exists: false },
      after: { exists: false }
    },
    summaries: {
      componentType: "Button",
      typography: { primaryFont: "Inter", weights: ["600"] },
      colors: { foreground: "white", background: "black", roles: [{ role: "primary", value: "black" }] },
      layout: { display: "inline-flex", density: "comfortable" },
      spacing: { gap: "8px" }
    },
    pageTitlePolicy: { included: false, reason: "Excluded by default; future explicit opt-in required." },
    sourceUrlPolicy: { included: false, reason: "Excluded by default." }
  };
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

function validV1Entry() {
  return {
    id: sourceVersionId,
    sourceCaptureId: captureId,
    sourceCaptureSavedAt: sourceSavedAt,
    sourceReviewFingerprint: shaA,
    createdAt,
    value: validResponse()
  };
}

async function validV2RevisionEntry(value = validResponse()) {
  const instruction = "Update primary label";
  return buildPendingRevisionGeneratedVersionEntryV2({
    ...await validBuilderBaseWithId(),
    value,
    instruction,
    instructionFingerprint: await computeRevisionInstructionFingerprint(instruction)
  });
}

async function validV2RegenerationEntry(value = validResponse()) {
  return buildPendingRegenerationGeneratedVersionEntryV2({
    ...await validBuilderBaseWithId(),
    value
  });
}

function validBuilderBase() {
  return {
    id: "",
    sourceCaptureId: captureId,
    sourceCaptureSavedAt: sourceSavedAt,
    currentCaptureProjectionFingerprint: shaB,
    createdAt,
    value: validResponse(),
    expectedSourceComponentName: "GeneratedFixture",
    logicalAttemptId: attemptId,
    reviewAttemptFingerprint: shaC,
    sourceGeneratedVersionId: sourceVersionId,
    sourceGeneratedVersionFingerprint: shaA,
    screenshotIncluded: false
  };
}

async function validBuilderBaseWithId() {
  return {
    ...validBuilderBase(),
    id: await deriveRevisionGeneratedVersionId(attemptId)
  };
}

function validReviewAttemptInput(input: Pick<ReviewAttemptFingerprintInputV1, "screenshot">): ReviewAttemptFingerprintInputV1 {
  return {
    mode: "revision",
    localSourceCaptureId: captureId,
    localSourceGeneratedVersionId: sourceVersionId,
    sourceGeneratedVersionFingerprint: shaA,
    sourceComponent: validSourceComponent(),
    captureContext: validCaptureContext(),
    revisionInstruction: "Update primary label",
    requestedOutput: REQUESTED_OUTPUT,
    screenshot: input.screenshot,
    currentCaptureProjectionFingerprint: shaB,
    logicalAttemptId: attemptId
  };
}

function validRegenerationReviewAttemptInput(input: Pick<ReviewAttemptFingerprintInputV1, "screenshot">): ReviewAttemptFingerprintInputV1 {
  return {
    mode: "regeneration",
    localSourceCaptureId: captureId,
    localSourceGeneratedVersionId: sourceVersionId,
    sourceGeneratedVersionFingerprint: shaA,
    sourceComponent: validSourceComponent(),
    captureContext: validCaptureContext(),
    requestedOutput: REQUESTED_OUTPUT,
    screenshot: input.screenshot,
    currentCaptureProjectionFingerprint: shaB,
    logicalAttemptId: attemptId
  };
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
