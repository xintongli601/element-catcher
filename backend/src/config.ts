export type BackendConfig = {
  apiKey: string;
  model: string;
  extensionOrigin: string;
  host: "127.0.0.1";
  port: 8787;
  configurationVersion: "5c-local-dev";
};

export function readBackendConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL;
  const extensionOrigin = env.ELEMENT_CATCHER_EXTENSION_ORIGIN;

  if (!apiKey || !model || !extensionOrigin) {
    throw new Error("configuration_unavailable");
  }

  return {
    apiKey,
    model,
    extensionOrigin,
    host: "127.0.0.1",
    port: 8787,
    configurationVersion: "5c-local-dev"
  };
}
