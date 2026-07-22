import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Auth helpers for the llm-server proxy (https://github.com/dluman/llm-server).
 *
 * The proxy requires two gates on every `/v1/*` request:
 *   1. `Authorization: Bearer <github-enterprise-session-token>`
 *   2. `X-Zen-Api-Key: <zen-api-key>`
 *
 * This module provides the OAuth flow and request-time header injection used by
 * the `chompers` provider extension. It supports two ways to obtain the session
 * token:
 *   - Direct exchange: if `GITHUB_TOKEN` is set, call `/auth/token` immediately.
 *   - Device flow: otherwise show a GitHub device code and poll `/auth/device/poll`.
 */

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface SessionResponse {
  status?: "pending" | "complete";
  session_token?: string;
  expires_in?: number;
  github_login?: string;
  enterprise_slug?: string;
  error?: string;
}

/**
 * Load a simple KEY=value `.env` file into `process.env` if the variables are
 * not already set. This makes the harness work with `source .env` even when the
 * file does not use `export`.
 */
function loadEnvFile(envPath: string): void {
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex < 0) continue;
      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found; user is responsible for exporting variables.
  }
}

/**
 * The `.env` value is the OpenAI-compatible base URL, e.g.
 * `https://llm.chompe.rs/v1`. The auth endpoints live on the app root, so strip
 * the trailing `/v1` segment.
 *
 * For backward compatibility, `OPENCODE_SERVER_URL` is still honored if
 * `CHOMPERS_SERVER_URL` is not set.
 */
function getAuthBaseUrl(serverUrl: string): string {
  return serverUrl.replace(/\/v1\/?$/u, "");
}

function assertOk(response: Response, context: string): Promise<void> {
  if (response.ok) return Promise.resolve();
  return response.text().then((body) => {
    throw new Error(`${context}: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`);
  });
}

async function exchangeGitHubToken(
  authBaseUrl: string,
  githubToken: string
): Promise<OAuthCredentials> {
  const response = await fetch(`${authBaseUrl}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
    },
  });

  await assertOk(response, "Failed to exchange GitHub token for llm-server session");

  const data = (await response.json()) as SessionResponse;
  if (!data.session_token) {
    throw new Error("llm-server /auth/token response did not include a session_token");
  }

  const expiresIn = data.expires_in ?? 28800;
  return {
    access: data.session_token,
    refresh: "",
    expires: Date.now() + expiresIn * 1000,
  };
}

async function runDeviceFlow(
  authBaseUrl: string,
  callbacks: OAuthLoginCallbacks
): Promise<OAuthCredentials> {
  const codeResponse = await fetch(`${authBaseUrl}/auth/device/code`, {
    method: "POST",
  });
  await assertOk(codeResponse, "Failed to start GitHub device code flow");

  const codeData = (await codeResponse.json()) as DeviceCodeResponse;
  if (!codeData.device_code || !codeData.user_code) {
    throw new Error("llm-server /auth/device/code response was missing device_code or user_code");
  }

  callbacks.onDeviceCode({
    userCode: codeData.user_code,
    verificationUri: codeData.verification_uri,
    intervalSeconds: codeData.interval,
    expiresInSeconds: codeData.expires_in,
  });

  const deadline = Date.now() + codeData.expires_in * 1000;
  const intervalMs = Math.max((codeData.interval ?? 5) * 1000, 1000);

  while (Date.now() < deadline) {
    await sleep(intervalMs);

    const pollResponse = await fetch(`${authBaseUrl}/auth/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: codeData.device_code }),
    });

    await assertOk(pollResponse, "Failed to poll llm-server device code status");

    const pollData = (await pollResponse.json()) as SessionResponse;

    if (pollData.status === "complete") {
      if (!pollData.session_token) {
        throw new Error("llm-server device flow completed but did not return a session_token");
      }
      const expiresIn = pollData.expires_in ?? 28800;
      return {
        access: pollData.session_token,
        refresh: "",
        expires: Date.now() + expiresIn * 1000,
      };
    }

    if (pollData.status !== "pending") {
      throw new Error(`Unexpected llm-server device poll status: ${pollData.status ?? "unknown"}`);
    }
  }

  throw new Error("GitHub device code expired before authorization was completed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createLlmServerOAuth(authBaseUrl: string) {
  return {
    name: "Chompers Server (GitHub Enterprise)",

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
        return exchangeGitHubToken(authBaseUrl, githubToken);
      }
      return runDeviceFlow(authBaseUrl, callbacks);
    },

    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
        return exchangeGitHubToken(authBaseUrl, githubToken);
      }
      throw new Error(
        "Chompers session expired and no GITHUB_TOKEN is set. " +
          "Run `/login chompers` to authenticate again via GitHub device flow."
      );
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    },
  };
}

/**
 * Backward-compatible export for the legacy `opencode-server.ts` extension.
 * @deprecated Use `createLlmServerProvider` instead.
 */
export { createLlmServerOAuth };

/**
 * Create and register the full `chompers` provider for the llm-server proxy.
 *
 * This wires the provider, the Zen API key, the OAuth login flow, and a request
 * hook that injects the GitHub Enterprise session token as the `Authorization`
 * header.
 *
 * @param modelsPath - Absolute path to the inlined model catalog JSON. Because
 *   Pi transpiles extensions, this should be resolved from the extension file
 *   (e.g. with `join(dirname(__filename), "opencode-models.json")`).
 * @param projectRoot - Absolute path to the project root, used to load `.env`.
 */
export function createLlmServerProvider(
  pi: ExtensionAPI,
  serverUrl: string,
  modelsPath: string,
  projectRoot: string
) {
  loadEnvFile(join(projectRoot, ".env"));

  // Backward compatibility: copy legacy env var names to the new names so the
  // provider config strings ($CHOMPERS_SERVER_URL, $ZEN_API_KEY) resolve.
  if (process.env.CHOMPERS_SERVER_URL === undefined && process.env.OPENCODE_SERVER_URL !== undefined) {
    process.env.CHOMPERS_SERVER_URL = process.env.OPENCODE_SERVER_URL;
  }
  if (process.env.ZEN_API_KEY === undefined && process.env.OPENCODE_API_KEY !== undefined) {
    process.env.ZEN_API_KEY = process.env.OPENCODE_API_KEY;
  }

  const authBaseUrl = getAuthBaseUrl(serverUrl);
  const models = JSON.parse(readFileSync(modelsPath, "utf-8"));

  pi.unregisterProvider("opencode");
  // Hide the built-in opencode provider so users don't see duplicate OpenCode
  // models alongside the chompers proxy models.
  pi.registerProvider("opencode", { models: [] });
  pi.registerProvider("chompers", {
    name: "Chompers Server",
    baseUrl: "$CHOMPERS_SERVER_URL",
    api: "openai-completions",
    apiKey: "$ZEN_API_KEY",
    authHeader: false,
    headers: {
      "X-Zen-Api-Key": "$ZEN_API_KEY",
    },
    oauth: createLlmServerOAuth(authBaseUrl),
    models,
  });

  pi.on("before_provider_headers", async (event, ctx) => {
    if (ctx.model?.provider !== "chompers") return;

    // Prefer the OAuth credential stored by Pi after `/login chompers`. When
    // the user runs `/logout` and selects chompers, Pi removes this credential,
    // so the next request will fall through to GITHUB_TOKEN or fail with 401.
    try {
      const stored = await ctx.modelRegistry.getApiKeyForProvider("chompers");
      if (stored) {
        event.headers["Authorization"] = `Bearer ${stored}`;
        return;
      }
    } catch {
      // Provider may not be fully configured yet; fall through.
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      const credentials = await exchangeGitHubToken(authBaseUrl, githubToken);
      event.headers["Authorization"] = `Bearer ${credentials.access}`;
      return;
    }

    // No session token yet (user has not run `/login chompers`). During startup
    // Pi may fire this event for internal requests; don't throw an extension
    // error. The actual chat request will fail with a 401 from the proxy,
    // prompting the user to authenticate.
    delete event.headers["Authorization"];
  });
}
