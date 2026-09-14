# Agent Hub

Agent Hub is a multi-harness control plane for Codex, OpenCode, Oh My P(i), and Claude Code. It includes a flight-deck UI, a typed API, a local bridge protocol, a secure extension catalog, and disposable hosted runner contracts.

## Start locally

```bash
pnpm install
pnpm dev
```

The web app uses seeded data until an API URL is configured. Start the API with `pnpm --filter @agent-hub/api dev`.

`apps/api/db/schema.sql` is the initial PostgreSQL schema. It intentionally stores opaque vault references, not provider or GitHub tokens.

## Security posture

Credentials are represented by opaque references. The production `SecretVault` implementation must use a cloud KMS; the included development vault is deliberately marked unsafe outside local development. Extensions require an approval bound to their immutable digest, target harness, and declared capabilities.

## Debian package

On Linux x86_64, run `./packaging/build-deb.sh`. The resulting package embeds the Bun runtime and locked dependencies; install with `sudo dpkg -i dist/agent-hub_0.1.0_amd64.deb`, then run `agent-hub`.

## Automatic updates

Release-built packages use a systemd timer to check GitHub Releases daily. It downloads the next `.deb` only when the release checksum matches, then installs it without user intervention. The GitHub Actions release workflow injects its repository identifier into the artifact; local builds intentionally leave the update source blank.

## Production readiness

GitHub authentication is real when `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, and `AUTH_SECRET` are configured. The flight deck deliberately refuses to invent a run when its managed API and bridge are not connected.

Cross-machine history, live events, encrypted credentials, and hosted execution require a deployed Agent Hub API backed by PostgreSQL, Redis, S3-compatible storage, and a KMS, plus a public outbound-WebSocket endpoint for bridges. The checked-in schema and bridge protocol define those boundaries; local development state is not presented as synchronized production data.

## Marketplace imports

The catalog can parse [Anthropic/Claude Code marketplace manifests](docs/marketplace-imports.md) and create explicit Claude Code install plans. Private HTTPS or GitHub custom sources are also supported as pending, approval-gated artifacts. Imports do not execute plugin code.
