# Repository Guidelines

## Project Overview
Agent Hub is a Bun/TypeScript monorepo for coordinating Codex, OpenCode, Oh My P(i), and Claude Code. It provides a Next.js flight deck, a Fastify API, a local CLI bridge, OCI-runner contracts, and approval-gated extension catalogues.

## Architecture & Data Flow
- **Shared contracts first:** `packages/contracts/src/index.ts` defines harness IDs, artifact/approval models, run lifecycle, install plans, bridge messages, and the `HarnessAdapter` interface.
- **Integration layer:** `packages/adapters/src/index.ts` maps each harness to a `CliAdapter`; it detects CLIs, checks compatibility, creates install plans, and applies config updates atomically.
- **Security and catalog:** `packages/catalog/src/index.ts` parses untrusted marketplace manifests into digest-bound artifacts without executing plugins. `packages/security/src/index.ts` binds approvals to an artifact digest, harness, scope, and capabilities.
- **Runtime boundaries:** `apps/api/src/index.ts` exposes `/v1/*`, holds development state in memory, and delegates to catalog/adapters/security. `apps/bridge/src/index.ts` is the local CLI/protocol boundary. `apps/runner/src/index.ts` produces constrained container specifications. `apps/web/app/page.tsx` is a client-side UI that uses fixtures until a managed API and bridge are connected.
- Preserve these boundaries: external input becomes a typed contract, catalog validation occurs before install planning, and approvals remain digest- and capability-bound. Do not represent local fixture/in-memory state as synchronized or executed production state.

## Key Directories
- `apps/web/` — Next.js 15 App Router UI and NextAuth GitHub sign-in.
- `apps/api/` — Fastify API; `src/index.ts` owns current routes and development-only in-memory stores.
- `apps/bridge/` — local harness detection CLI and JSON bridge-message validation.
- `apps/runner/` — hosted-runner OCI constraint builder.
- `packages/contracts/` — cross-package types and adapter contract.
- `packages/adapters/` — harness-specific detection/install-plan implementation.
- `packages/catalog/` — marketplace and custom-artifact import/validation.
- `packages/security/` — secret-vault interface, redaction, and approval validation.
- `packaging/` — Debian build, launcher, systemd OTA updater, and OTA simulation.

## Development Commands
Use the root workspace commands:

```sh
pnpm install
pnpm dev                                      # web UI
pnpm --filter @agent-hub/api dev              # Fastify API, default 127.0.0.1:4100
pnpm build
pnpm typecheck
pnpm lint
pnpm test
bun test packages/catalog/test/importers.test.ts
sh packaging/test-ota.sh
BUN_BIN="$(which bun)" sh packaging/build-deb.sh
```

`docker-compose.yml` supplies PostgreSQL 17 and Redis 7 for local services. Copy `.env.example` for GitHub auth, service URLs, and development storage configuration. The API mutating `/v1/*` routes require `AGENT_HUB_API_TOKEN`; set `WEB_ORIGIN` only when enabling API CORS.

## Code Conventions & Common Patterns
- TypeScript is strict (`tsconfig.base.json`); use ESM imports and shared types from `@agent-hub/contracts` rather than duplicating transport/domain shapes.
- Keep public APIs small and functional where possible: examples include `createApproval`, `approvalValid`, `getAdapter`, and `parseMessage`.
- Use `async` for I/O and external process work. Return structured result objects for validation (`{ valid, reason? }`); throw for invalid/invariant-breaking input with recovery-relevant messages.
- Treat catalog sources as hostile: accept HTTPS or `owner/repository` shorthand only; reject credentials and loopback endpoints; never fetch or execute plugin code during import.
- For local configuration changes, follow `CliAdapter.applyInstall`: create parent directories, write a restrictive temporary file, then rename atomically.
- UI state is local React state in `apps/web/app/page.tsx`; use typed `HarnessId`, `ExecutionTarget`, `RunState`, and `RunEvent`. Retain the pessimistic UX: show a submitted run only after API acceptance, and surface actionable errors in text.
- Preserve the design system in `DESIGN.md`: paper/ink surfaces, serif only for thesis/key comparison titles, monospace for commands/logs, no decorative glow or fake progress, and never color alone to convey state.

## Important Files
- `package.json` — root workspace scripts and pinned `pnpm@10.18.0` package manager.
- `pnpm-workspace.yaml` / `tsconfig.base.json` — workspace and compiler policy.
- `apps/api/src/index.ts` — API routing, auth hook, and development state.
- `apps/web/auth.ts` / `apps/web/middleware.ts` — GitHub OAuth and protected root route.
- `packages/contracts/src/index.ts` — canonical cross-runtime contract.
- `packages/catalog/src/index.ts` / `packages/security/src/index.ts` — import and approval invariants.
- `UX-CONTRACT.md` — canonical owners and verification expectations for UI capabilities.
- `docs/marketplace-imports.md` and `docs/release-and-ota.md` — import/release safety constraints.

## Runtime/Tooling Preferences
- Use **Bun** for installation, development, packaging, and the repository’s `bun:test` test source. The release workflow uses `bun install --frozen-lockfile`.
- Use **pnpm 10.18.0** for root workspace commands; dependencies between workspaces use `workspace:*`.
- The package is Linux amd64/Debian-specific. `packaging/build-deb.sh` requires `BUN_BIN` and produces `dist/agent-hub_<version>_amd64.deb` with the Bun runtime and locked dependencies embedded.
- Do not expose OAuth repository access from Hub sign-in: `apps/api/src/auth.ts` reserves repository access for an explicit, scoped GitHub App installation.

## Testing & QA
- Current permanent behavioral coverage is `packages/catalog/test/importers.test.ts`; it uses `bun:test` and covers Claude marketplace imports, private/pending custom artifacts, and invalid source URLs.
- Package manifests advertise `node --test`, but the existing test imports `bun:test`. Use the explicit Bun command above when exercising it; keep test commands and the runner aligned if modifying test tooling.
- Run `pnpm typecheck` before release-oriented changes. Test OTA behavior with `sh packaging/test-ota.sh`; it verifies both upgrade and already-current no-op paths using isolated fake binaries.
- For UI changes, verify the rendered Next.js surface and the UX-contract behaviors: keyboard/form validation, live-region notifications, timeline states, approval digest mismatch, and scrollbar style where applicable.
- For release work, follow `docs/release-and-ota.md`: typecheck, OTA simulation, Debian package inspection, and an isolated browser sign-in test before publishing a `vX.Y.Z` tag.
