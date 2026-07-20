import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { GENERATION_CONTRACT_VERSION, GENERATION_LIMITS } from "../../extension/src/shared/generation-contract.js";
import { isValidChromeExtensionOrigin, type BackendConfig } from "./config.js";
import type { ProviderAdapter } from "./contracts/contracts.js";
import { BackendSafeError, safeErrorResponse, statusForCode } from "./contracts/contracts.js";
import { validateBackendRequest, validateBackendResponse } from "./validation/backend-validation.js";

export type BackendLogEntry = {
  correlationId: string;
  outcome: string;
  status: number;
  durationMs: number;
  requestBodyBytes: number;
  screenshotBytes?: number;
  screenshotWidth?: number;
  screenshotHeight?: number;
  retryCount: 0;
  configurationVersion: string;
};

export type BackendLogger = {
  log(entry: BackendLogEntry): void;
};

const ROUTE = "/v1/generate-component";
const ALLOWED_HEADERS = "Content-Type, X-Element-Catcher-Contract-Version";

export function createApp({
  config,
  provider,
  logger = consoleLogger
}: {
  config: BackendConfig;
  provider: ProviderAdapter;
  logger?: BackendLogger;
}) {
  return async function handle(request: IncomingMessage, response: ServerResponse) {
    const started = Date.now();
    const correlationId = randomUUID();
    let bodyBytes = 0;
    let status = 500;
    let outcome = "unknown";
    let screenshotBytes: number | undefined;
    let screenshotWidth: number | undefined;
    let screenshotHeight: number | undefined;
    let corsAllowed = false;

    try {
      applyBaseHeaders(response);
      validateRouteAndMethod(request);
      validateRequestOrigin(request, config);
      corsAllowed = true;
      validateRequestHeaders(request);
      if (request.method === "OPTIONS") {
        validatePreflightHeaders(request);
        writeJson(response, 204, undefined, config, corsAllowed);
        status = 204;
        outcome = "ok";
        return;
      }
      const body = await readLimitedBody(request);
      bodyBytes = body.byteLength;
      const parsed = parseJson(body);
      const generationRequest = validateBackendRequest(parsed);
      screenshotBytes = generationRequest.screenshot.byteLength;
      screenshotWidth = generationRequest.screenshot.width;
      screenshotHeight = generationRequest.screenshot.height;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      request.on("aborted", () => controller.abort());
      try {
        const providerResponse = await provider.generate(generationRequest, controller.signal);
        const validated = validateBackendResponse(providerResponse);
        writeJson(response, 200, validated, config, corsAllowed);
        status = 200;
        outcome = "ok";
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const safe = normalizeError(error);
      status = safe.status;
      outcome = safe.code;
      writeJson(response, status, safeErrorResponse(safe.code), config, corsAllowed);
    } finally {
      logger.log({
        correlationId,
        outcome,
        status,
        durationMs: Date.now() - started,
        requestBodyBytes: bodyBytes,
        screenshotBytes,
        screenshotWidth,
        screenshotHeight,
        retryCount: 0,
        configurationVersion: config.configurationVersion
      });
    }
  };
}

function validateRouteAndMethod(request: IncomingMessage) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== ROUTE) {
    throw new BackendSafeError("request_validation_failed", 404);
  }
  if (request.method !== "POST" && request.method !== "OPTIONS") {
    throw new BackendSafeError("request_validation_failed", 405);
  }
}

function validateRequestOrigin(request: IncomingMessage, config: BackendConfig) {
  if (!isValidChromeExtensionOrigin(config.extensionOrigin) || request.headers.origin !== config.extensionOrigin) {
    throw new BackendSafeError("request_validation_failed", 403);
  }
}

function validateRequestHeaders(request: IncomingMessage) {
  if (request.method === "OPTIONS") {
    return;
  }
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new BackendSafeError("request_validation_failed", 415);
  }
  if (request.headers["x-element-catcher-contract-version"] !== String(GENERATION_CONTRACT_VERSION)) {
    throw new BackendSafeError("request_validation_failed", 400);
  }
  const declared = request.headers["content-length"];
  if (declared !== undefined) {
    validateContentLength(declared);
  }
}

function validatePreflightHeaders(request: IncomingMessage) {
  if (request.headers["access-control-request-method"] !== "POST") {
    throw new BackendSafeError("request_validation_failed", 400);
  }
  const requestedHeaders = parseRequestedHeaders(request.headers["access-control-request-headers"]);
  const allowedHeaders = new Set(["content-type", "x-element-catcher-contract-version"]);
  if (requestedHeaders.length === 0 || requestedHeaders.some((header) => !allowedHeaders.has(header))) {
    throw new BackendSafeError("request_validation_failed", 400);
  }
}

function validateContentLength(value: string | string[]) {
  if (Array.isArray(value) || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new BackendSafeError("request_validation_failed", 400);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BackendSafeError("request_validation_failed", 400);
  }
  if (parsed > GENERATION_LIMITS.serializedRequestBytes) {
    throw new BackendSafeError("request_too_large", 413);
  }
}

function readLimitedBody(request: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let overLimit = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > GENERATION_LIMITS.serializedRequestBytes) {
        overLimit = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (overLimit) {
        reject(new BackendSafeError("request_too_large", 413));
        return;
      }
      resolve(Buffer.concat(chunks, size));
    });
    request.on("error", reject);
  });
}

function parseRequestedHeaders(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return [];
  }
  return value.split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
}

function parseJson(body: Buffer) {
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new BackendSafeError("request_validation_failed", 400);
  }
}

function normalizeError(error: unknown) {
  if (error instanceof BackendSafeError) {
    return error;
  }
  return new BackendSafeError("request_validation_failed", 400);
}

function applyBaseHeaders(response: ServerResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Vary", "Origin");
}

function applyCors(response: ServerResponse, config: BackendConfig) {
  response.setHeader("Access-Control-Allow-Origin", config.extensionOrigin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
}

function writeJson(response: ServerResponse, status: number, body: unknown, config: BackendConfig, corsAllowed: boolean) {
  if (corsAllowed) {
    applyCors(response, config);
  }
  response.statusCode = status;
  response.end(body === undefined ? "" : JSON.stringify(body));
}

const consoleLogger: BackendLogger = {
  log(entry) {
    console.log(JSON.stringify(entry));
  }
};
