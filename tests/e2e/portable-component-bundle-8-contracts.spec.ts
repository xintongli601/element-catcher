import { expect, test } from "@playwright/test";
import {
  createPortableComponentBundle,
  PORTABLE_COMPONENT_BUNDLE_BLOB_TYPE,
  PORTABLE_COMPONENT_BUNDLE_MAX_SOURCE_BYTES,
  PORTABLE_COMPONENT_BUNDLE_README
} from "../../extension/src/export/portable-component-bundle";
import type {
  GeneratedComponentVersionEntryV1,
  GeneratedComponentVersionEntryV2
} from "../../extension/src/shared/generated-version-contract";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

test.describe("Milestone 8 Slice 2 portable component bundle contracts", () => {
  test("builds a deterministic ZIP filename and exact fixed Bundle V1 entries", () => {
    const entry = createV1("PortableCard", "export function PortableCard() {\n  return <div className=\"p-4\">Hi</div>;\n}");
    const result = createPortableComponentBundle(entry);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.filename).toBe("PortableCard.zip");
    expect(result.value.blobType).toBe(PORTABLE_COMPONENT_BUNDLE_BLOB_TYPE);

    const inspected = inspectZip(result.value.bytes);
    expect(inspected.entries.map((zipEntry) => zipEntry.name)).toEqual(["README.md", "element-catcher.json", "src/PortableCard.tsx"]);
    expect(inspected.centralDirectoryEntries.map((zipEntry) => zipEntry.name)).toEqual(inspected.entries.map((zipEntry) => zipEntry.name));
    expect(inspected.entries.some((zipEntry) => zipEntry.name.endsWith("/"))).toBe(false);
    expect(inspected.bytesAfterEocd).toBe(0);
    expect(inspected.eocd.totalEntries).toBe(3);
    expect(inspected.eocd.entriesOnDisk).toBe(3);
    expect(inspected.eocd.commentLength).toBe(0);

    expect(inspected.text("README.md")).toBe(PORTABLE_COMPONENT_BUNDLE_README);
    expect(inspected.text("element-catcher.json")).toBe(`{
  "formatVersion": 1,
  "framework": "react",
  "styling": "tailwind",
  "componentName": "PortableCard",
  "entryPath": "src/PortableCard.tsx"
}
`);
    expect(inspected.bytes("src/PortableCard.tsx")).toEqual(encoder.encode(entry.value.code));
  });

  test("supports V1, V2 Revision, and V2 Regeneration sources without metadata leakage", () => {
    const cases = [
      createV1("V1BundleCard", "export function V1BundleCard() {\n  return <section />;\n}"),
      createV2("RevisionBundleCard", "revision", "export function RevisionBundleCard() {\n  return <button>保存</button>;\n}"),
      createV2("RegenerationBundleCard", "regeneration", "export function RegenerationBundleCard() {\n  return <div className=\"rounded-lg px-4\" />;\n}")
    ];

    for (const entry of cases) {
      const result = createPortableComponentBundle(entry);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      const sourcePath = `src/${entry.value.componentName}.tsx`;
      const inspected = inspectZip(result.value.bytes);
      expect(inspected.bytes(sourcePath)).toEqual(encoder.encode(entry.value.code));

      const text = decoder.decode(result.value.bytes);
      for (const forbidden of [
        entry.id,
        entry.sourceCaptureId,
        "sourceCaptureId",
        "sourceReviewFingerprint",
        "sourceGeneratedVersionId",
        "provider metadata sentinel",
        "backend metadata sentinel",
        "GitHub metadata sentinel",
        "https://example.test/source",
        "private notes sentinel",
        "tag sentinel",
        "2026-07-18T09:00:00.000Z",
        "secret-token-sentinel"
      ]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  test("preserves CRLF, Unicode, JSX/Tailwind, no-final-newline, and one-final-newline source exactly", () => {
    const cases = [
      ["CrlfBundleCard", "export function CrlfBundleCard() {\r\n  return <div className=\"px-4\">CRLF</div>;\r\n}"],
      ["UnicodeBundleCard", "export function UnicodeBundleCard() {\n  return <button>保存 ✓</button>;\n}"],
      ["TailwindBundleCard", "export function TailwindBundleCard() {\n  return <div className=\"flex rounded-lg bg-blue-600 px-4 py-2 text-white\" />;\n}"],
      ["NoFinalNewline", "export function NoFinalNewline() {\n  return <div />;\n}"],
      ["OneFinalNewline", "export function OneFinalNewline() {\n  return <div />;\n}\n"]
    ] as const;

    for (const [componentName, source] of cases) {
      const result = createPortableComponentBundle(createV1(componentName, source));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(inspectZip(result.value.bytes).bytes(`src/${componentName}.tsx`)).toEqual(encoder.encode(source));
      }
    }
  });

  test("is byte-stable for repeated builds and freezes ZIP32 headers", () => {
    const entry = createV1("StableBundleCard", "export function StableBundleCard() {\n  return <main className=\"grid gap-3\" />;\n}");
    const first = createPortableComponentBundle(entry);
    const second = createPortableComponentBundle(entry);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.value.bytes).toEqual(second.value.bytes);
    const inspected = inspectZip(first.value.bytes);
    for (const local of inspected.entries) {
      expect(local.method).toBe(0);
      expect(local.flags).toBe(0x0800);
      expect(local.versionNeeded).toBe(20);
      expect(local.dosDate).toBe(0x0021);
      expect(local.dosTime).toBe(0x0000);
      expect(local.extraLength).toBe(0);
      expect(local.hasDataDescriptor).toBe(false);
    }
    for (const central of inspected.centralDirectoryEntries) {
      expect(central.versionMadeBy).toBe(0x0314);
      expect(central.versionNeeded).toBe(20);
      expect(central.flags).toBe(0x0800);
      expect(central.method).toBe(0);
      expect(central.dosDate).toBe(0x0021);
      expect(central.dosTime).toBe(0x0000);
      expect(central.internalAttributes).toBe(0x0000);
      expect(central.externalAttributes).toBe(0x81A40000);
      expect(central.extraLength).toBe(0);
      expect(central.commentLength).toBe(0);
      expect(central.diskNumberStart).toBe(0);
    }
    expect(inspected.eocd.diskNumber).toBe(0);
    expect(inspected.eocd.centralDirectoryDisk).toBe(0);
    expect(inspected.hasZip64Record).toBe(false);
    expect(inspected.hasDataDescriptorSignature).toBe(false);
  });

  test("writes correct CRC values, local offsets, central directory size, EOCD, and little-endian fields", () => {
    const result = createPortableComponentBundle(createV1("CrcBundleCard", "123456789"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const inspected = inspectZip(result.value.bytes);
    const sourceEntry = inspected.entries.find((entry) => entry.name === "src/CrcBundleCard.tsx");
    const sourceCentral = inspected.centralDirectoryEntries.find((entry) => entry.name === "src/CrcBundleCard.tsx");
    expect(sourceEntry?.crc32).toBe(0xCBF43926);
    expect(sourceCentral?.crc32).toBe(0xCBF43926);

    for (const central of inspected.centralDirectoryEntries) {
      const local = inspected.entries.find((entry) => entry.name === central.name);
      expect(local?.offset).toBe(central.localHeaderOffset);
      expect(local?.crc32).toBe(central.crc32);
      expect(local?.compressedSize).toBe(central.compressedSize);
      expect(local?.uncompressedSize).toBe(central.uncompressedSize);
    }

    expect(inspected.eocd.centralDirectoryOffset).toBe(inspected.centralDirectoryOffset);
    expect(inspected.eocd.centralDirectorySize).toBe(inspected.centralDirectorySize);
    expect(inspected.eocd.endOffset).toBe(result.value.bytes.byteLength);
  });

  test("accepts the exact 240,000-byte source limit and rejects one byte over without partial bytes", () => {
    const maxSource = "😀".repeat(PORTABLE_COMPONENT_BUNDLE_MAX_SOURCE_BYTES / 4);
    const maxResult = createPortableComponentBundle(createV1("MaxBundleCard", maxSource));
    expect(maxResult.ok).toBe(true);
    if (maxResult.ok) {
      expect(inspectZip(maxResult.value.bytes).bytes("src/MaxBundleCard.tsx").byteLength).toBe(PORTABLE_COMPONENT_BUNDLE_MAX_SOURCE_BYTES);
    }

    const tooLarge = `${maxSource}a`;
    const failed = createPortableComponentBundle(createV1("TooLargeBundleCard", tooLarge));
    expect(failed).toMatchObject({ ok: false, code: "source_too_large" });
    expect(failed).not.toHaveProperty("value");
    expect(createPortableComponentBundle(createV1("TooLargeBundleCard", tooLarge))).toMatchObject({ ok: false, code: "source_too_large" });
  });

  test("fails closed for unsafe component names without fallback or partial bytes", () => {
    for (const unsafe of ["", " BadName", "BadName ", ".BadName", "BadName.", "Bad/Name", "Bad\\Name", "Bad?Name", "Bad#Name", "Bad%Name", "CON"]) {
      const result = createPortableComponentBundle(createV1(unsafe, "export function BadName() {\n  return <div />;\n}"));
      expect(result.ok, unsafe).toBe(false);
      expect(result).not.toHaveProperty("value");
      expect(result).not.toHaveProperty("bytes");
    }
  });
});

type InspectedLocalEntry = {
  name: string;
  offset: number;
  versionNeeded: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  extraLength: number;
  data: Uint8Array;
  hasDataDescriptor: boolean;
};

type InspectedCentralEntry = {
  name: string;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  extraLength: number;
  commentLength: number;
  diskNumberStart: number;
  internalAttributes: number;
  externalAttributes: number;
  localHeaderOffset: number;
};

function inspectZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: InspectedLocalEntry[] = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const entryOffset = offset;
    const versionNeeded = view.getUint16(offset + 4, true);
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const dosTime = view.getUint16(offset + 10, true);
    const dosDate = view.getUint16(offset + 12, true);
    const crc32 = view.getUint32(offset + 14, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.push({
      name,
      offset: entryOffset,
      versionNeeded,
      flags,
      method,
      dosTime,
      dosDate,
      crc32,
      compressedSize,
      uncompressedSize,
      extraLength,
      data: bytes.slice(dataStart, dataEnd),
      hasDataDescriptor: flagsHasDataDescriptor(flags)
    });
    offset = dataEnd;
  }

  const centralDirectoryOffset = offset;
  const centralDirectoryEntries: InspectedCentralEntry[] = [];
  while (view.getUint32(offset, true) === 0x02014b50) {
    const versionMadeBy = view.getUint16(offset + 4, true);
    const versionNeeded = view.getUint16(offset + 6, true);
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const dosTime = view.getUint16(offset + 12, true);
    const dosDate = view.getUint16(offset + 14, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const diskNumberStart = view.getUint16(offset + 34, true);
    const internalAttributes = view.getUint16(offset + 36, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    centralDirectoryEntries.push({
      name,
      versionMadeBy,
      versionNeeded,
      flags,
      method,
      dosTime,
      dosDate,
      crc32,
      compressedSize,
      uncompressedSize,
      extraLength,
      commentLength,
      diskNumberStart,
      internalAttributes,
      externalAttributes,
      localHeaderOffset
    });
    offset = nameStart + nameLength + extraLength + commentLength;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  expect(view.getUint32(offset, true)).toBe(0x06054b50);
  const eocd = {
    diskNumber: view.getUint16(offset + 4, true),
    centralDirectoryDisk: view.getUint16(offset + 6, true),
    entriesOnDisk: view.getUint16(offset + 8, true),
    totalEntries: view.getUint16(offset + 10, true),
    centralDirectorySize: view.getUint32(offset + 12, true),
    centralDirectoryOffset: view.getUint32(offset + 16, true),
    commentLength: view.getUint16(offset + 20, true),
    endOffset: offset + 22 + view.getUint16(offset + 20, true)
  };

  return {
    entries,
    centralDirectoryEntries,
    centralDirectoryOffset,
    centralDirectorySize,
    eocd,
    bytesAfterEocd: bytes.byteLength - eocd.endOffset,
    hasZip64Record: findSignature(bytes, 0x06064b50) || findSignature(bytes, 0x07064b50),
    hasDataDescriptorSignature: findSignature(bytes, 0x08074b50),
    bytes(name: string) {
      const entry = entries.find((candidate) => candidate.name === name);
      expect(entry, name).toBeTruthy();
      return entry?.data ?? new Uint8Array();
    },
    text(name: string) {
      return decoder.decode(this.bytes(name));
    }
  };
}

function flagsHasDataDescriptor(flags: number) {
  return (flags & 0x0008) !== 0;
}

function findSignature(bytes: Uint8Array, signature: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index <= bytes.byteLength - 4; index += 1) {
    if (view.getUint32(index, true) === signature) {
      return true;
    }
  }
  return false;
}

function createV1(componentName: string, code: string): GeneratedComponentVersionEntryV1 {
  return {
    id: "generated-version-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceCaptureId: "capture-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    sourceCaptureSavedAt: "2026-07-18T09:00:00.000Z",
    sourceReviewFingerprint: "c".repeat(64),
    createdAt: "2026-07-18T12:00:00.000Z",
    value: {
      contractVersion: 1,
      componentName,
      framework: "react",
      styling: "tailwind",
      code,
      metadata: {
        providerLabel: "provider metadata sentinel",
        providerModelLabel: "backend metadata sentinel"
      },
      summary: "Generated summary sentinel.",
      approximationNotes: "Generated notes sentinel."
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
          reviewAttemptFingerprint: "d".repeat(64),
          sourceGeneratedVersionId: "generated-version-00000000000000000000000000000000",
          sourceGeneratedVersionFingerprint: "e".repeat(64),
          instruction: "Make the export deterministic.",
          instructionFingerprint: "f".repeat(64),
          screenshotIncluded: false
        }
      : {
          kind,
          logicalAttemptId: "revision-attempt-00000000000000000000000000000002",
          reviewAttemptFingerprint: "d".repeat(64),
          sourceGeneratedVersionId: "generated-version-00000000000000000000000000000000",
          sourceGeneratedVersionFingerprint: "e".repeat(64),
          screenshotIncluded: false
        };
  return {
    ...base,
    id: kind === "revision" ? "generated-version-11111111111111111111111111111111" : "generated-version-22222222222222222222222222222222",
    contractVersion: 2,
    operation
  };
}
