export type PersistenceErrorCode =
  | "database-open"
  | "database-upgrade"
  | "blocked"
  | "quota"
  | "encoding"
  | "constraint"
  | "transaction"
  | "readback"
  | "not-found"
  | "cleanup"
  | "unknown";

const USER_MESSAGES: Record<PersistenceErrorCode, string> = {
  "database-open": "Element Catcher could not open the local persistence database.",
  "database-upgrade": "Element Catcher could not prepare the local persistence database.",
  blocked: "Element Catcher local persistence is blocked by another open extension page. Close other Element Catcher panels and try again.",
  quota: "Element Catcher could not write local persistence data because browser storage quota was exceeded.",
  encoding: "Element Catcher could not prepare the screenshot asset for local persistence.",
  constraint: "Element Catcher detected a duplicate local persistence key.",
  transaction: "Element Catcher could not complete the local persistence transaction.",
  readback: "Element Catcher could not verify the saved local persistence data.",
  "not-found": "Element Catcher could not find the expected local persistence data.",
  cleanup: "Element Catcher could not clean up temporary local persistence data.",
  unknown: "Element Catcher local persistence failed for an unknown reason."
};

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly userMessage: string;
  override readonly cause?: unknown;

  constructor(code: PersistenceErrorCode, message?: string, cause?: unknown) {
    super(message ?? USER_MESSAGES[code]);
    this.name = "PersistenceError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
    this.cause = cause;
  }
}

export function toPersistenceError(error: unknown, fallbackCode: PersistenceErrorCode = "unknown") {
  if (error instanceof PersistenceError) {
    return error;
  }

  return new PersistenceError(mapDomExceptionCode(error, fallbackCode), undefined, error);
}

export function getSafePersistenceMessage(error: unknown) {
  return toPersistenceError(error).userMessage;
}

function mapDomExceptionCode(error: unknown, fallbackCode: PersistenceErrorCode) {
  if (!(error instanceof DOMException)) {
    return fallbackCode;
  }

  if (error.name === "QuotaExceededError") {
    return "quota";
  }

  if (error.name === "DataCloneError") {
    return "encoding";
  }

  if (error.name === "ConstraintError") {
    return "constraint";
  }

  if (
    error.name === "AbortError" ||
    error.name === "InvalidStateError" ||
    error.name === "TransactionInactiveError"
  ) {
    return "transaction";
  }

  if (error.name === "VersionError") {
    return "database-open";
  }

  return fallbackCode;
}
