# Pi Starting Configuration — Restrictive LLM Proxy

This repository is a **basic starting configuration** for the [Pi coding agent](https://github.com/earendil-works/pi). It is designed to be used with a **restrictive LLM proxy** (`llm-server`, deployed at `https://llm.chompe.rs`) and is intended as a **basis for distribution with programming assignments and other course materials that incorporate LLMs**.

Instructors and maintainers can copy this configuration into an assignment repository, adjust it as needed, and give students a ready-to-run agent setup that routes requests through a controlled, institution-managed proxy.

## What This Configuration Provides

- A minimal, working Pi configuration that connects to a restrictive LLM proxy.
- A provider extension (`chompers`) that authenticates users through the proxy and forwards requests under institutional control.
- A default model and behavior settings tuned for general coding assistance.
- An optional quality-analysis package (`auditor`) that can be enabled or removed per assignment.

Students do not need to configure providers, model endpoints, or authentication flows themselves; they only need to install Pi, set the required environment variables, and run `/login chompers`.

## Quick Start (For Students)

1. **Obtain this configuration** as part of your assignment repository.

2. **Install Pi** (requires Node.js ≥ 20):

   ```bash
   npm install -g @earendil-works/pi-coding-agent
   ```

3. **Set the required environment variables**:

   ```bash
   cp .env.template .env
   # Edit .env with the Zen API key supplied by your instructor
   source .env
   ```

   The proxy requires two gates:

   - A **GitHub Enterprise session token**, obtained via OAuth device flow or by
     exchanging a `GITHUB_TOKEN`.
   - The **Zen API key**, supplied by your instructor and sent as `X-Zen-Api-Key`.

   The active extension automatically loads `.env` from the project root, so a
   plain `source .env` is sufficient.

4. **Launch Pi and authenticate**:

   ```bash
   pi
   ```

   Inside Pi, run:

   ```
   /login chompers
   ```

   If you set `GITHUB_TOKEN` in `.env`, the login exchanges it immediately.
   Otherwise, Pi displays a GitHub device code; open the URL in your browser,
   enter the code, and authorize the GitHub App. Pi will then exchange the
   device code for a proxy session token.

## Repository Structure

```
.
└── .pi/
    ├── settings.json            # Agent configuration (provider, model, behavior)
    ├── extensions/
    │   ├── chompers-auth.ts     # Provider extension for the restrictive proxy
    │   └── opencode-models.json # Inlined model catalog exposed by the proxy
    ├── lib/
    │   └── llm-server-auth.ts   # OAuth / session-token helpers
    ├── git/                     # Pi package cache (auto-managed)
    └── .pi/                     # Session data (auto-managed)
```

## Configuration

Pi behavior is driven by `.pi/settings.json`. The default configuration includes:

| Setting                | Value               | Description                                  |
|------------------------|---------------------|----------------------------------------------|
| `defaultProvider`      | `chompers`          | Uses the restrictive LLM proxy (`llm-server`)|
| `defaultModel`         | `deepseek-v4-flash` | Default model exposed by the proxy           |
| `defaultThinkingLevel` | `medium`            | Balanced reasoning depth                     |
| `retry.enabled`        | `true`              | Automatic retry on transient failures        |
| `compaction.enabled`   | `true`              | Context window management                    |
| `enableSkillCommands`  | `true`              | Built-in skill command support               |

### Provider Extension

The `.pi/extensions/chompers-auth.ts` file registers a `chompers` provider that
routes through the restrictive LLM proxy. It preserves the upstream model
catalog, adds the required `X-Zen-Api-Key` header, and registers an OAuth flow so
users can authenticate with `/login chompers`.

The built-in `opencode` provider is hidden (registered with an empty model list)
to avoid showing duplicate models next to the proxy models.

Authentication logic is in `.pi/lib/llm-server-auth.ts`:

- **With `GITHUB_TOKEN` set:** `/login chompers` exchanges the token directly
  for a proxy session token.
- **Without `GITHUB_TOKEN`:** `/login chompers` starts a GitHub device flow and
  polls the proxy until the session token is issued.

The provider declares `apiKey: "$ZEN_API_KEY"` so Pi considers it configured at
startup, which lets `defaultProvider: "chompers"` and
`defaultModel: "deepseek-v4-flash"` be selected immediately. The actual
`Authorization: Bearer` header is injected at request time from the OAuth
credential stored by Pi after `/login chompers`.

The session token lasts for the lifetime configured by the proxy (default 8
hours). When it expires, re-run `/login chompers`. To log out, run `/logout` and
select `chompers`.

### Packages

The `auditor` package (`git:github.com/dluman/auditor`) is included by default
and provides automated code-review and quality-analysis tools. Instructors can
remove it from `.pi/settings.json` if it is not needed for a given assignment.

## Distributing With Assignments

This configuration is intended to be copied into assignment repositories. When
distributing it:

1. Keep the `.pi/` directory under version control.
2. Add `.pi/git/` and `.pi/.pi/` to `.gitignore` so students do not commit cache
   and session data.
3. Provide students with the required `ZEN_API_KEY` (and optionally a
   `GITHUB_TOKEN` if you want to skip the device flow).
4. Edit `.pi/settings.json` to select the model, thinking level, and packages
   appropriate for the assignment.
5. Add or remove extensions under `.pi/extensions/` as needed.

## Customizing

- Change the default model in `.pi/settings.json`.
- Add or remove packages in `.pi/settings.json`.
- Add assignment-specific extensions under `.pi/extensions/`.
- See [`dluman/llm-server`](https://github.com/dluman/llm-server) for proxy
  source and deployment details.

## License

This starting configuration is dedicated to the public domain under [CC0 1.0 Universal](LICENSE).
