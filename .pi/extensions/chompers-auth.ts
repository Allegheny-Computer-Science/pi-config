import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createLlmServerProvider } from "../lib/llm-server-auth";
import { dirname, join } from "node:path";

export default function (pi: ExtensionAPI) {
  const serverUrl =
    process.env.CHOMPERS_SERVER_URL ??
    process.env.OPENCODE_SERVER_URL ??
    "https://llm.chompe.rs/v1";
  const modelsPath = join(dirname(__filename), "opencode-models.json");
  const projectRoot = join(dirname(__filename), "..", "..");
  createLlmServerProvider(pi, serverUrl, modelsPath, projectRoot);
}
