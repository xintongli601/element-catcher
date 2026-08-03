import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import test from "node:test";
import { createApp } from "../../.backend-dist/backend/src/app.js";
import { GITHUB_EXPORT_CONTRACT_VERSION } from "../../.backend-dist/extension/src/github/github-export-contract.js";

const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const config = {
  apiKey: "test-key-not-real",
  model: "test-model",
  extensionOrigin: EXTENSION_ORIGIN,
  host: "127.0.0.1",
  port: 8787,
  configurationVersion: "7b-slice-2"
};

test("GitHub gateway session endpoint is honest, bounded, origin-gated, and credential-safe", async () => {
  const calls = { generate: 0, revise: 0 };
  const logs = [];
  const { base, close } = await startServer({
    logs,
    async generate() {
      calls.generate += 1;
      throw new Error("generate should not be called");
    },
    async revise() {
      calls.revise += 1;
      throw new Error("revise should not be called");
    }
  });

  try {
    const valid = {
      contractVersion: GITHUB_EXPORT_CONTRACT_VERSION,
      kind: "github.session.status.v1"
    };
    const ok = await requestGitHubJson(base, "POST", valid);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), {
      contractVersion: 1,
      kind: "github.session.status.v1",
      session: {
        state: "authorization_required"
      }
    });
    assert.equal(calls.generate, 0);
    assert.equal(calls.revise, 0);

    const cases = [
      ["missing origin", () => requestGitHubJson(base, "POST", valid, { headers: { Origin: undefined } }), 403, false],
      ["wrong origin", () => requestGitHubJson(base, "POST", valid, { headers: { Origin: "chrome-extension://wrongwrongwrongwrongwrongwrongwr" } }), 403, false],
      ["missing origin beats malformed content type", () => requestGitHubJson(base, "POST", "{bad", { raw: true, headers: { Origin: undefined, "Content-Type": "text/plain" } }), 403, false],
      ["wrong origin beats malformed contract header", () => requestGitHubJson(base, "POST", valid, { headers: { Origin: "chrome-extension://wrongwrongwrongwrongwrongwrongwr", "X-Element-Catcher-Contract-Version": "2" } }), 403, false],
      ["wrong origin beats malformed body", () => requestGitHubJson(base, "POST", "{bad", { raw: true, headers: { Origin: "chrome-extension://wrongwrongwrongwrongwrongwrongwr" } }), 403, false],
      ["wrong method", () => requestGitHubJson(base, "GET", undefined), 405, false],
      ["missing content type", () => requestGitHubJson(base, "POST", JSON.stringify(valid), { raw: true, headers: { "Content-Type": undefined } }), 415, true],
      ["wrong contract header", () => requestGitHubJson(base, "POST", valid, { headers: { "X-Element-Catcher-Contract-Version": "2" } }), 400, true],
      ["malformed JSON", () => requestGitHubJson(base, "POST", "{bad", { raw: true }), 400, true],
      ["unknown field", () => requestGitHubJson(base, "POST", { ...valid, repository: "octocat/hello-world" }), 400, true],
      ["token field", () => requestGitHubJson(base, "POST", { ...valid, accessToken: "ghp_abcdefghijklmnopqrstuvwxyz123456" }), 400, true],
      ["screenshot field", () => requestGitHubJson(base, "POST", { ...valid, screenshot: "data:image/png;base64,AAAA" }), 400, true],
      ["capture record field", () => requestGitHubJson(base, "POST", { ...valid, captureRecord: { id: "capture-00000000000000000000000000000001" } }), 400, true],
      ["arbitrary URL", () => requestGitHubJson(base, "POST", { ...valid, url: "https://api.github.com/repos/octocat/hello-world" }), 400, true]
    ];
    for (const [name, run, status, expectCors] of cases) {
      const response = await run();
      assert.equal(response.status, status, name);
      assert.equal(response.headers.get("cache-control"), "no-store", name);
      assert.equal(response.headers.get("access-control-allow-origin"), expectCors ? EXTENSION_ORIGIN : null, name);
      const text = await response.text();
      assert.equal(text.includes("ghp_"), false, name);
      assert.equal(text.includes("api.github.com"), false, name);
      assert.equal(text.includes("capture-"), false, name);
      if (text) {
        const parsed = JSON.parse(text);
        assert.equal(parsed.contractVersion, 1, name);
        assert.equal(parsed.ok, false, name);
      }
    }

    assert.equal((await requestGitHubJson(base, "OPTIONS", undefined, {
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-element-catcher-contract-version"
      }
    })).status, 204);
    assert.equal((await requestGitHubJson(base, "OPTIONS", undefined, {
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-element-catcher-contract-version, authorization"
      }
    })).status, 400);
    assert.equal((await requestGitHubJson(base, "POST", "x".repeat(65_537), { raw: true })).status, 413);

    const serializedLogs = JSON.stringify(logs);
    assert.equal(serializedLogs.includes("ghp_"), false);
    assert.equal(serializedLogs.includes("api.github.com"), false);
    assert.equal(serializedLogs.includes("test-key-not-real"), false);
    assert.equal(logs.at(-1).route, "github");
    assert.equal(logs.at(-1).retryCount, 0);
  } finally {
    await close();
  }
});

async function startServer(provider) {
  const server = createServer(createApp({ config, provider, logger: { log: (entry) => provider.logs.push(entry) } }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function requestGitHubJson(base, method, body, options = {}) {
  return requestJson(base, method, body, { path: "/v1/github-export/session", ...options });
}

function requestJson(base, method, body, options = {}) {
  const headers = {
    Origin: EXTENSION_ORIGIN,
    "Content-Type": "application/json",
    "X-Element-Catcher-Contract-Version": "1",
    ...options.headers
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      delete headers[key];
    }
  }
  return fetch(`${base}${options.path ?? "/v1/generate-component"}`, {
    method,
    headers,
    body: body === undefined ? undefined : options.raw ? body : JSON.stringify(body)
  });
}
