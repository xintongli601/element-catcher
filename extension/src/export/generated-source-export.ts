import { canonicalJsonStringify, type CanonicalJsonValue } from "../generation/canonical-json";
import type { GeneratedComponentVersionEntry } from "../shared/generated-version-contract";

export const GENERATED_SOURCE_EXPORT_BLOB_TYPE = "text/typescript;charset=utf-8";
export const GENERATED_SOURCE_EXPORT_FILENAME_EXTENSION = ".tsx";
export const GENERATED_SOURCE_EXPORT_FILENAME_MAX_CODE_POINTS = 96;

export type GeneratedSourceExportErrorCode = "empty" | "unsafe" | "too_long";

export type GeneratedSourceExportResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: GeneratedSourceExportErrorCode; message: string };

export type GeneratedSourceExportPayload = Readonly<{
  generatedVersionId: string;
  sourceCaptureId: string;
  filename: string;
  source: string;
  blobType: typeof GENERATED_SOURCE_EXPORT_BLOB_TYPE;
}>;

const unsafeFilenameCharacters = /[\/\\?#%:*"<>|\u0000-\u001f\u007f-\u009f]/u;
const windowsReservedBasenames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

export function createGeneratedSourceExportFilename(componentName: string): GeneratedSourceExportResult<string> {
  if (componentName.length === 0) {
    return filenameError("empty", "Component name is required before export.");
  }
  if (componentName.trim() !== componentName || componentName.startsWith(".") || componentName.endsWith(".")) {
    return filenameError("unsafe", "Component name is not safe for a filename.");
  }
  if (
    unsafeFilenameCharacters.test(componentName) ||
    componentName === "." ||
    componentName === ".." ||
    componentName.includes("..") ||
    windowsReservedBasenames.test(componentName)
  ) {
    return filenameError("unsafe", "Component name is not safe for a filename.");
  }

  const filename = `${componentName}${GENERATED_SOURCE_EXPORT_FILENAME_EXTENSION}`;
  if (Array.from(filename).length > GENERATED_SOURCE_EXPORT_FILENAME_MAX_CODE_POINTS) {
    return filenameError("too_long", "Component name is too long for export.");
  }

  return { ok: true, value: filename };
}

export function prepareGeneratedSourceExport(entry: GeneratedComponentVersionEntry): GeneratedSourceExportResult<GeneratedSourceExportPayload> {
  const filename = createGeneratedSourceExportFilename(entry.value.componentName);
  if (!filename.ok) {
    return filename;
  }

  return {
    ok: true,
    value: Object.freeze({
      generatedVersionId: entry.id,
      sourceCaptureId: entry.sourceCaptureId,
      filename: filename.value,
      source: entry.value.code,
      blobType: GENERATED_SOURCE_EXPORT_BLOB_TYPE
    })
  };
}

export function generatedSourceExportEntriesEqual(left: GeneratedComponentVersionEntry, right: GeneratedComponentVersionEntry) {
  return canonicalJsonStringify(left as unknown as CanonicalJsonValue) === canonicalJsonStringify(right as unknown as CanonicalJsonValue);
}

function filenameError(code: GeneratedSourceExportErrorCode, message: string): GeneratedSourceExportResult<string> {
  return { ok: false, code, message };
}
