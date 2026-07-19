import type { CaptureLibraryMetadata } from "../shared/capture-schema";

export const LIBRARY_TITLE_MAX_LENGTH = 120;
export const LIBRARY_COMPONENT_TYPE_MAX_LENGTH = 80;
export const LIBRARY_TAG_MAX_COUNT = 20;
export const LIBRARY_TAG_MAX_LENGTH = 40;
export const LIBRARY_NOTES_MAX_LENGTH = 1000;

export type LibraryMetadataField = "title" | "componentType" | "tags" | "notes";

export type LibraryMetadataInput = {
  title: string;
  componentType: string;
  tags: string;
  notes: string;
};

export class LibraryMetadataValidationError extends Error {
  readonly field: LibraryMetadataField;

  constructor(field: LibraryMetadataField, message: string) {
    super(message);
    this.name = "LibraryMetadataValidationError";
    this.field = field;
  }
}

export function createLibraryMetadataInput(metadata: CaptureLibraryMetadata): LibraryMetadataInput {
  return {
    title: metadata.title ?? "",
    componentType: metadata.componentType ?? "",
    tags: metadata.tags.join(", "),
    notes: metadata.notes ?? ""
  };
}

export function normalizeLibraryMetadataInput(input: LibraryMetadataInput): CaptureLibraryMetadata {
  return {
    ...optionalField("title", input.title, LIBRARY_TITLE_MAX_LENGTH, "Title"),
    ...optionalField("componentType", input.componentType, LIBRARY_COMPONENT_TYPE_MAX_LENGTH, "Component type"),
    tags: normalizeTags(input.tags),
    ...normalizeNotes(input.notes)
  };
}

function optionalField(
  field: Extract<LibraryMetadataField, "title" | "componentType">,
  value: string,
  maxLength: number,
  label: string
) {
  if (hasLineBreak(value)) {
    throw new LibraryMetadataValidationError(field, `${label} must be a single line.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.length > maxLength) {
    throw new LibraryMetadataValidationError(field, `${label} must be ${maxLength} characters or fewer.`);
  }

  return { [field]: trimmed };
}

function normalizeTags(value: string) {
  const normalizedTags: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of value.split(/[,\r\n]+/)) {
    const normalizedTag = rawTag.trim().replace(/\s+/g, " ");
    if (!normalizedTag) {
      continue;
    }

    if (normalizedTag.length > LIBRARY_TAG_MAX_LENGTH) {
      throw new LibraryMetadataValidationError("tags", `Each tag must be ${LIBRARY_TAG_MAX_LENGTH} characters or fewer.`);
    }

    const dedupeKey = normalizedTag.toLocaleLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalizedTags.push(normalizedTag);
  }

  if (normalizedTags.length > LIBRARY_TAG_MAX_COUNT) {
    throw new LibraryMetadataValidationError("tags", `Use ${LIBRARY_TAG_MAX_COUNT} tags or fewer.`);
  }

  return normalizedTags;
}

function normalizeNotes(value: string) {
  const normalizedLineEndings = value.replace(/\r\n?/g, "\n");
  const trimmed = normalizedLineEndings.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.length > LIBRARY_NOTES_MAX_LENGTH) {
    throw new LibraryMetadataValidationError("notes", `Notes must be ${LIBRARY_NOTES_MAX_LENGTH} characters or fewer.`);
  }

  return { notes: trimmed };
}

function hasLineBreak(value: string) {
  return /[\r\n]/.test(value);
}
