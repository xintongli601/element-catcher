export const MAX_PREVIEW_TEXT_LENGTH = 180;
export const MAX_SOURCE_LENGTH = 160;
export const MAX_LIBRARY_TEXT_LENGTH = 96;
const SOURCE_UNAVAILABLE_LABEL = "Source unavailable";
const SUPPORTED_SOURCE_PROTOCOLS = new Set(["http:", "https:"]);

export function formatSourceLocation(value: string) {
  try {
    const url = new URL(value);
    if (!SUPPORTED_SOURCE_PROTOCOLS.has(url.protocol) || url.origin === "null") {
      return SOURCE_UNAVAILABLE_LABEL;
    }

    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return boundText(`${url.origin}${url.pathname}`, MAX_SOURCE_LENGTH);
  } catch {
    return SOURCE_UNAVAILABLE_LABEL;
  }
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function boundText(value: string, maxLength = MAX_PREVIEW_TEXT_LENGTH) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export function normalizedOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
