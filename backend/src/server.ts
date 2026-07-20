import { createServer } from "node:http";
import { readBackendConfig } from "./config.js";
import { createApp } from "./app.js";
import { createOpenAIProvider } from "./provider/openai-provider.js";

const config = readBackendConfig();
const provider = createOpenAIProvider({
  apiKey: config.apiKey,
  model: config.model
});
const server = createServer(createApp({ config, provider }));

server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    outcome: "listening",
    host: config.host,
    port: config.port,
    configurationVersion: config.configurationVersion
  }));
});
