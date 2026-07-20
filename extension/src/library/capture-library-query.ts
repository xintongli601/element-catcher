import type { BoxEdges, CaptureRecord } from "../shared/capture-schema";
import type { SavedCaptureReadModel } from "../storage/capture-save";

export type CaptureLibraryQueryState = {
  searchQuery: string;
  componentType: string;
  tag: string;
};

export type CaptureLibraryFilterOption = {
  value: string;
  label: string;
};

export type CaptureLibraryFilterOptions = {
  componentTypes: CaptureLibraryFilterOption[];
  tags: CaptureLibraryFilterOption[];
};

const SUPPORTED_SOURCE_PROTOCOLS = new Set(["http:", "https:"]);

export function createDefaultCaptureLibraryQuery(): CaptureLibraryQueryState {
  return {
    searchQuery: "",
    componentType: "",
    tag: ""
  };
}

export function normalizeCaptureLibrarySearchQuery(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

export function getUserVisibleComponentType(record: CaptureRecord) {
  return normalizeWhitespace(record.library.componentType ?? "") || normalizeWhitespace(record.summaries.componentType ?? "");
}

export function createSafeCaptureSearchDocument(savedCapture: SavedCaptureReadModel) {
  const record = savedCapture.record;
  const values: string[] = [];

  pushText(values, record.library.title);
  pushTexts(values, record.library.tags);
  pushText(values, record.library.componentType);
  pushText(values, createSafeSourceSearchLocation(record.source.url));
  pushText(values, record.source.pageTitle);
  pushText(values, record.summaries.componentType);

  pushText(values, record.summaries.typography.primaryFont);
  pushTexts(values, record.summaries.typography.scale);
  pushTexts(values, record.summaries.typography.weights);
  pushText(values, record.summaries.typography.notes);

  pushText(values, record.summaries.colors.foreground);
  pushText(values, record.summaries.colors.background);
  pushText(values, record.summaries.colors.accent);
  pushText(values, record.summaries.colors.border);
  for (const colorRole of record.summaries.colors.roles ?? []) {
    pushText(values, colorRole.role);
    pushText(values, colorRole.value);
  }

  pushText(values, record.summaries.layout.display);
  pushText(values, record.summaries.layout.direction);
  pushText(values, record.summaries.layout.alignment);
  pushText(values, record.summaries.layout.density);
  pushText(values, record.summaries.layout.notes);

  pushBoxEdges(values, record.summaries.spacing.padding);
  pushBoxEdges(values, record.summaries.spacing.margin);
  pushText(values, record.summaries.spacing.gap);
  pushText(values, record.summaries.spacing.notes);

  return values;
}

export function createCaptureLibraryFilterOptions(
  savedCaptures: SavedCaptureReadModel[],
  activeQuery: CaptureLibraryQueryState = createDefaultCaptureLibraryQuery()
): CaptureLibraryFilterOptions {
  return {
    componentTypes: createSortedOptions(
      savedCaptures.map((savedCapture) => getUserVisibleComponentType(savedCapture.record)),
      activeQuery.componentType
    ),
    tags: createSortedOptions(
      savedCaptures.flatMap((savedCapture) => savedCapture.record.library.tags),
      activeQuery.tag
    )
  };
}

export function filterSavedCaptureLibrary(
  savedCaptures: SavedCaptureReadModel[],
  queryState: CaptureLibraryQueryState
) {
  const searchQuery = normalizeCaptureLibrarySearchQuery(queryState.searchQuery);
  const componentType = normalizeComparable(queryState.componentType);
  const tag = normalizeComparable(queryState.tag);

  return savedCaptures.filter((savedCapture) => {
    if (componentType && normalizeComparable(getUserVisibleComponentType(savedCapture.record)) !== componentType) {
      return false;
    }

    if (tag && !savedCapture.record.library.tags.some((captureTag) => normalizeComparable(captureTag) === tag)) {
      return false;
    }

    if (!searchQuery) {
      return true;
    }

    return createSafeCaptureSearchDocument(savedCapture).some((value) =>
      normalizeCaptureLibrarySearchQuery(value).includes(searchQuery)
    );
  });
}

export function hasActiveCaptureLibraryQuery(queryState: CaptureLibraryQueryState) {
  return Boolean(
    normalizeCaptureLibrarySearchQuery(queryState.searchQuery) ||
      normalizeComparable(queryState.componentType) ||
      normalizeComparable(queryState.tag)
  );
}

export function boundCaptureLibraryQuerySummaryText(value: string, maxLength = 48) {
  const normalized = normalizeWhitespace(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function createSafeSourceSearchLocation(value: string) {
  try {
    const url = new URL(value);
    if (!SUPPORTED_SOURCE_PROTOCOLS.has(url.protocol) || url.origin === "null") {
      return "";
    }

    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function createSortedOptions(values: string[], activeValue: string) {
  const byKey = new Map<string, CaptureLibraryFilterOption>();

  for (const value of values) {
    const label = normalizeWhitespace(value);
    const key = normalizeComparable(label);
    if (!key || byKey.has(key)) {
      continue;
    }

    byKey.set(key, {
      value: label,
      label
    });
  }

  const activeLabel = normalizeWhitespace(activeValue);
  const activeKey = normalizeComparable(activeLabel);
  if (activeKey) {
    byKey.set(activeKey, {
      value: activeLabel,
      label: activeLabel
    });
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const leftKey = normalizeComparable(left.label);
    const rightKey = normalizeComparable(right.label);
    if (leftKey !== rightKey) {
      return leftKey < rightKey ? -1 : 1;
    }

    return left.label < right.label ? -1 : left.label > right.label ? 1 : 0;
  });
}

function pushText(values: string[], value: string | undefined) {
  const normalized = normalizeWhitespace(value ?? "");
  if (normalized) {
    values.push(normalized);
  }
}

function pushTexts(values: string[], input: string[] | undefined) {
  for (const value of input ?? []) {
    pushText(values, value);
  }
}

function pushBoxEdges(values: string[], edges: BoxEdges | undefined) {
  if (!edges) {
    return;
  }

  pushText(values, edges.top);
  pushText(values, edges.right);
  pushText(values, edges.bottom);
  pushText(values, edges.left);
}

function normalizeComparable(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
