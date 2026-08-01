import { expect, test } from "@playwright/test";
import {
  createGeneratedSourceExportFilename,
  GENERATED_SOURCE_EXPORT_BLOB_TYPE,
  GENERATED_SOURCE_EXPORT_FILENAME_MAX_CODE_POINTS,
  prepareGeneratedSourceExport
} from "../../extension/src/export/generated-source-export";
import type {
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";

test.describe("Milestone 7A Slice 2 generated source export contracts", () => {
  test("creates deterministic safe filenames and rejects unsafe names without fallback", () => {
    expect(createGeneratedSourceExportFilename("ExportCard")).toEqual({ ok: true, value: "ExportCard.tsx" });
    expect(createGeneratedSourceExportFilename("ExportCard")).toEqual(createGeneratedSourceExportFilename("ExportCard"));
    expect(createGeneratedSourceExportFilename("组件Card")).toEqual({ ok: true, value: "组件Card.tsx" });

    const bounded = "A".repeat(GENERATED_SOURCE_EXPORT_FILENAME_MAX_CODE_POINTS - ".tsx".length);
    expect(createGeneratedSourceExportFilename(bounded)).toEqual({ ok: true, value: `${bounded}.tsx` });
    expect(createGeneratedSourceExportFilename(`${bounded}B`)).toMatchObject({ ok: false, code: "too_long" });

    for (const unsafe of [
      "",
      " ../ExportCard",
      "ExportCard ",
      ".ExportCard",
      "ExportCard.",
      "Export/Card",
      "Export\\Card",
      "Export\u0000Card",
      "Export\u007fCard",
      "..",
      "Export..Card",
      "Export?Card",
      "Export#Card",
      "Export%Card",
      "Export:Card",
      "Export*Card",
      "Export\"Card",
      "Export<Card",
      "Export>Card",
      "Export|Card",
      "CON"
    ]) {
      const result = createGeneratedSourceExportFilename(unsafe);
      expect(result.ok, unsafe).toBe(false);
      if (!result.ok) {
        expect(result).not.toHaveProperty("value", "Component.tsx");
        expect(result).not.toHaveProperty("value", "export.tsx");
      }
    }
  });

  test("prepares exact source payloads for V1 and V2 without metadata leakage", () => {
    const v1 = createV1("ExactSourceCard", "export function ExactSourceCard() {\r\n  return <div className=\"p-4\">Hi</div>;\r\n}");
    const revision = createV2("RevisionExportCard", "revision", "export function RevisionExportCard() {\n  return <button>保存</button>;\n}");
    const regeneration = createV2("RegenerationExportCard", "regeneration", "export function RegenerationExportCard() {\n  return <section />;\n}");

    for (const entry of [v1, revision, regeneration]) {
      const result = prepareGeneratedSourceExport(entry);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.value).toEqual({
        generatedVersionId: entry.id,
        sourceCaptureId: entry.sourceCaptureId,
        filename: `${entry.value.componentName}.tsx`,
        source: entry.value.code,
        blobType: GENERATED_SOURCE_EXPORT_BLOB_TYPE
      });
      expect(JSON.stringify(result.value)).not.toContain("sourceReviewFingerprint");
      expect(JSON.stringify(result.value)).not.toContain("logicalAttemptId");
      expect(JSON.stringify(result.value)).not.toContain("sourceGeneratedVersionId");
      expect(JSON.stringify(result.value)).not.toContain("provider");
      expect(JSON.stringify(result.value)).not.toContain("backend");
    }
  });

  test("preserves newline, Unicode, JSX, Tailwind, final-newline, and preview-rejected source exactly", () => {
    const cases = [
      "",
      "export function NoFinalNewline() {\n  return <div />;\n}",
      "export function FinalNewline() {\n  return <div />;\n}\n",
      "export function CrlfCard() {\r\n  return <div className=\"px-4 py-2\">CRLF</div>;\r\n}",
      "export function UnicodeCard() {\n  return <button>保存 ✓</button>;\n}",
      "export function TailwindCard() {\n  return <div className=\"flex rounded-lg bg-blue-600 px-4 py-2 text-white\" />;\n}",
      "export function PreviewRejectedCard() {\n  alert(\"not previewable\");\n  return <div />;\n}"
    ];

    for (const [index, source] of cases.entries()) {
      const entry = createV1(`PayloadCase${index}`, source);
      const result = prepareGeneratedSourceExport(entry);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe(source);
        expect(new TextEncoder().encode(result.value.source)).toEqual(new TextEncoder().encode(source));
      }
    }
  });
});

function createV1(componentName: string, code: string): GeneratedComponentVersionEntryV1 {
  return {
    id: `generated-version-${componentName.padEnd(32, "0").slice(0, 32).toLowerCase()}`,
    sourceCaptureId: "capture-00000000000000000000000000000001",
    sourceCaptureSavedAt: "2026-07-18T09:00:00.000Z",
    sourceReviewFingerprint: "a".repeat(64),
    createdAt: "2026-07-18T12:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName,
      framework: "react",
      styling: "tailwind",
      code,
      summary: `${componentName} summary.`,
      approximationNotes: `${componentName} notes.`
    }
  };
}

function createV2(componentName: string, kind: "revision" | "regeneration", code: string): GeneratedComponentVersionEntryV2 {
  const base = createV1(componentName, code);
  const operation: GeneratedComponentVersionEntryV2["operation"] =
    kind === "revision"
      ? {
          kind,
          logicalAttemptId: "revision-attempt-00000000000000000000000000000001",
          reviewAttemptFingerprint: "b".repeat(64),
          sourceGeneratedVersionId: "generated-version-00000000000000000000000000000000",
          sourceGeneratedVersionFingerprint: "c".repeat(64),
          instruction: "Make the export deterministic.",
          instructionFingerprint: "d".repeat(64),
          screenshotIncluded: false
        }
      : {
          kind,
          logicalAttemptId: "revision-attempt-00000000000000000000000000000002",
          reviewAttemptFingerprint: "b".repeat(64),
          sourceGeneratedVersionId: "generated-version-00000000000000000000000000000000",
          sourceGeneratedVersionFingerprint: "c".repeat(64),
          screenshotIncluded: false
        };
  return {
    ...base,
    contractVersion: 2,
    operation
  };
}
