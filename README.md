# Pi Coding Agent — Allegheny College Base Template

Base configuration template for the [Pi coding agent](https://github.com/earendil-works/pi) at Allegheny College. This repository provides a ready-to-use starting point for students and faculty working with Pi across courses and research projects.

## Overview

Pi is an AI-powered coding assistant that runs in your terminal. This template supplies the minimum configuration needed to connect Pi to the OpenCode API proxy (`llm-server`, deployed at `https://llm.chompe.rs`) and optional tool packages.

## Quick Start

1. **Clone this template** into a new project directory:

   ```bash
   git clone <this-repo-url> my-project
   cd my-project
   rm -rf .git
   git init
   ```

2. **Ensure Pi is installed** (requires Node.js ≥ 20):

   ```bash
   npm install -g @earendil-works/pi-coding-agent
   ```

3. **Set required environment variables** for the OpenCode API proxy:

   ```bash
   cp .env.template .env
   # Edit .env with your actual Zen API key and optional GitHub token
   source .env
   ```

   The Pi harness connects to the `llm-server` proxy at `https://llm.chompe.rs`.
   The proxy requires two auth gates:

   - A GitHub Enterprise session token, obtained via OAuth device flow or by
     exchanging a `GITHUB_TOKEN`.
   - The upstream Opencode Zen API key, sent as `X-Zen-Api-Key`.

   The active extension automatically loads `.env` from the project root, so a
   plain `source .env` is sufficient. If you prefer to export the variables
   yourself, use `set -a && source .env && set +a`.

   See [`dluman/llm-server`](https://github.com/dluman/llm-server) for the
   proxy source and deployment details.

4. **Launch Pi and authenticate**:

   ```bash
   pi
   ```

   If you set `GITHUB_TOKEN` in `.env`, run:

   ```
   /login chompers
   ```

   If you did not set `GITHUB_TOKEN`, Pi will show a GitHub device code when you
   run `/login chompers`. Open the displayed URL in your browser, enter the code,
   and authorize the GitHub App. Pi will then exchange the device code for an
   llm-server session token.

## Repository Structure

```
.
└── .pi/
    ├── settings.json            # Agent configuration (provider, model, behavior)
    ├── extensions/
    │   ├── chompers-auth.ts     # Active provider extension for the Chompers proxy
    │   └── opencode-models.json # Inlined OpenCode (Zen) model catalog
    ├── lib/
    │   └── llm-server-auth.ts   # OAuth / session-token helpers
    ├── git/                     # Pi package cache (auto-managed)
    └── .pi/                     # Session data (auto-managed)
```

## Configuration

All Pi behavior is driven by `.pi/settings.json`. The default configuration includes:

| Setting               | Value              | Description                                  |
|-----------------------|--------------------|----------------------------------------------|
| `defaultProvider`     | `chompers`         | Uses the OpenCode API proxy (`llm-server`)   |
| `defaultModel`        | `deepseek-v4-pro`  | DeepSeek V4 Pro model                        |
| `defaultThinkingLevel`| `medium`           | Balanced reasoning depth               |
| `retry.enabled`       | `true`             | Automatic retry on transient failures  |
| `compaction.enabled`  | `true`             | Context window management              |
| `enableSkillCommands` | `true`             | Built-in skill command support         |

### Provider Extension

The `.pi/extensions/chompers-auth.ts` file registers a new `chompers` provider
that routes through the `llm-server` proxy deployed at `https://llm.chompe.rs`.
It preserves the upstream OpenCode (Zen) model catalog (so model IDs such as
`deepseek-v4-pro` stay correct), adds the `X-Zen-Api-Key` header, and registers
an OAuth flow so users can authenticate via `/login chompers`.

The built-in `opencode` provider is hidden (registered with an empty model list)
to avoid showing duplicate OpenCode models next to the `chompers` proxy models.

The OAuth logic is extracted into `.pi/lib/llm-server-auth.ts`:

- **With `GITHUB_TOKEN` set:** `/login chompers` exchanges the token directly
  for an llm-server session token.
- **Without `GITHUB_TOKEN`:** `/login chompers` starts a GitHub device flow,
  asks the user to authorize in a browser, and polls the proxy until the
  session token is issued.

The provider also declares `apiKey: "$ZEN_API_KEY"` (without sending it as
an `Authorization` header) so Pi considers it configured at startup. This means
`defaultProvider: "chompers"` and `defaultModel: "deepseek-v4-pro"` are selected
immediately, before `/login` is run. The actual `Authorization: Bearer` header is
injected at request time from the OAuth credential stored by Pi after `/login
chompers`.

The session token lasts for the lifetime configured by `llm-server` (default 8
hours). When it expires, re-run `/login chompers`.

To log out, run `/logout` inside Pi and select `chompers` from the OAuth
provider selector. This clears Pi's stored credential; the next request will
prompt for authentication again.

> Note: The original `opencode-server.ts` extension is preserved in
> `.pi/extensions-inactive/` and is no longer loaded. It was left untouched
> per the project owner's request.

### Packages

The `auditor` package (`git:github.com/dluman/auditor`) is included by default, providing automated code review and quality analysis tools integrated into the agent workflow.

## Customizing

To adapt this template for your own project:

1. Edit `.pi/settings.json` to change the default model, thinking level, or add/remove packages.
2. Add additional extensions under `.pi/extensions/` as `.ts` or `.js` files.
3. Pi will automatically manage the `.pi/git/` and `.pi/.pi/` directories — add them to your `.gitignore`.

## License

This template is dedicated to the public domain under [CC0 1.0 Universal](LICENSE).
