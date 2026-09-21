# Agent Hub

Agent Hub is a multi-harness control plane for Codex, OpenCode, Oh My P(i), and Claude Code. It includes a flight-deck UI, a typed API, a local bridge protocol, a secure extension catalog, and disposable hosted runner contracts.

## Start locally

```bash
pnpm install
pnpm dev
```

The web app uses seeded data until an API URL is configured. Start the API with `pnpm --filter @agent-hub/api dev`.

## MCP app

`apps/mcp` is a remote streamable-HTTP MCP app (`POST /mcp`, health at `GET /health`) that wraps the same API with hybrid tools: `list_harnesses`, `search_catalog`, `plan_install`, `submit_run`, `get_run` (each with an inline widget) plus `search_actions`/`execute_action` for validate/import/approve/cancel/events/detail. It reads `AGENT_HUB_API_URL` and the server-side `AGENT_HUB_API_TOKEN`; the MCP surface itself is authless. Serve widget HTML locally at `GET /widget-preview?widget=<name>&payload=<json>`. Start it with `PORT=4200 bun apps/mcp/src/server.ts` alongside the API, then add `http://localhost:4200/mcp` as a custom connector.

`apps/api/db/schema.sql` is the initial PostgreSQL schema. It intentionally stores opaque vault references, not provider or GitHub tokens.

## Security posture

Credentials are represented by opaque references. The production `SecretVault` implementation must use a cloud KMS; the included development vault is deliberately marked unsafe outside local development. Extensions require an approval bound to their immutable digest, target harness, and declared capabilities.

## Desktop apps

Tagged `vX.Y.Z` releases publish two artifacts on GitHub Releases:

- **Linux:** `agent-hub_<version>_amd64.deb` — install with `sudo dpkg -i`. Registers **Agent Hub** in launchers; opens a native Electron window backed by the local service (`agent-hub` stays available for terminal use). Build locally: `BUN_BIN="$(which bun)" VERSION="<version>" ./packaging/build-deb.sh`.
- **Windows:** `agent-hub_<version>_win-x64.zip` — portable bundle (Electron win32 runtime + Bun runtime + production web build, no installer). Extract and run `agent-hub\electron-win\electron.exe agent-hub\apps\desktop` (web service starts automatically via `agent-hub\agent-hub.cmd`). Build locally: `VERSION="<version>" ./packaging/build-win.sh`.

For GitHub sign-in, configure `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, and a strong `AUTH_SECRET` in `~/.config/agent-hub/environment` (Linux) or `%APPDATA%\agent-hub\environment` (Windows, same `KEY=value` lines). The desktop launcher creates this user-owned, mode-0600 template on first launch. The OAuth App callback must be `http://127.0.0.1:3010/api/auth/callback/github`. Without those values, the app keeps GitHub sign-in disabled instead of sending users to a failing provider.

## Automatic updates

Linux release packages use a systemd timer (`agent-hub-update.timer`) to check GitHub Releases daily. It downloads the next `.deb` only when the release checksum matches, then installs it without user intervention. The Windows app checks the same Releases feed on startup and offers the matching `_win-x64.zip` download (checksum published alongside as `.sha256`) when a newer tag exists. The GitHub Actions release workflow injects its repository identifier into both artifacts; local builds intentionally leave the update source blank.

## Production readiness

GitHub authentication is real when `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, and `AUTH_SECRET` are configured. The flight deck deliberately refuses to invent a run when its managed API and bridge are not connected.

Cross-machine history, live events, encrypted credentials, and hosted execution require a deployed Agent Hub API backed by PostgreSQL, Redis, S3-compatible storage, and a KMS, plus a public outbound-WebSocket endpoint for bridges. The checked-in schema and bridge protocol define those boundaries; local development state is not presented as synchronized production data.

## Marketplace imports

The catalog can parse [Anthropic/Claude Code marketplace manifests](docs/marketplace-imports.md) and create explicit Claude Code install plans. Private HTTPS or GitHub custom sources are also supported as pending, approval-gated artifacts. Imports do not execute plugin code.
