export type GenerationErrorCode =
  | "configuration_unavailable"
  | "request_validation_failed"
  | "request_too_large"
  | "consent_missing"
  | "review_fingerprint_mismatch"
  | "capture_changed"
  | "capture_missing"
  | "screenshot_missing"
  | "invalid_screenshot"
  | "network_unavailable"
  | "timeout"
  | "provider_rejected"
  | "rate_limited"
  | "malformed_response"
  | "persistence_failed"
  | "persistence_conflict"
  | "read_back_failed"
  | "cancellation";

export class GenerationError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    message?: string,
    readonly cause?: unknown
  ) {
    super(message ?? getSafeGenerationMessage(code));
    this.name = "GenerationError";
  }
}

export function toGenerationError(error: unknown, fallback: GenerationErrorCode = "request_validation_failed") {
  if (error instanceof GenerationError) {
    return error;
  }

  if (isGenerationErrorLike(error)) {
    return new GenerationError(error.code, undefined, error);
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new GenerationError("cancellation");
  }

  return new GenerationError(fallback, undefined, error);
}

function isGenerationErrorLike(error: unknown): error is { code: GenerationErrorCode } {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return [
    "configuration_unavailable",
    "request_validation_failed",
    "request_too_large",
    "consent_missing",
    "review_fingerprint_mismatch",
    "capture_changed",
    "capture_missing",
    "screenshot_missing",
    "invalid_screenshot",
    "network_unavailable",
    "timeout",
    "provider_rejected",
    "rate_limited",
    "malformed_response",
    "persistence_failed",
    "persistence_conflict",
    "read_back_failed",
    "cancellation"
  ].includes(String((error as { code: unknown }).code));
}

export function getSafeGenerationMessage(error: unknown) {
  const code = error instanceof GenerationError ? error.code : "request_validation_failed";

  switch (code) {
    case "configuration_unavailable":
      return "AI generation backend integration is not configured yet.";
    case "request_validation_failed":
      return "The saved capture could not be prepared for generation.";
    case "request_too_large":
      return "The generation request is too large to send safely.";
    case "consent_missing":
      return "Review the data and confirm consent before generating.";
    case "review_fingerprint_mismatch":
    case "capture_changed":
      return "The saved capture changed. Review the data again before generating.";
    case "capture_missing":
      return "The saved capture is no longer available.";
    case "screenshot_missing":
      return "The saved screenshot is no longer available.";
    case "invalid_screenshot":
      return "The saved screenshot could not be verified.";
    case "network_unavailable":
      return "The generation service is unavailable.";
    case "timeout":
      return "Generation timed out. Try again.";
    case "provider_rejected":
      return "The generation service rejected the request.";
    case "rate_limited":
      return "Generation is rate limited. Wait and try again.";
    case "malformed_response":
      return "The generation response was malformed and was not accepted.";
    case "persistence_failed":
      return "The generated component version could not be saved locally.";
    case "persistence_conflict":
      return "Element Catcher detected a generated version save conflict.";
    case "read_back_failed":
      return "Element Catcher could not verify the saved generated version.";
    case "cancellation":
      return "Generation was cancelled.";
  }
}
