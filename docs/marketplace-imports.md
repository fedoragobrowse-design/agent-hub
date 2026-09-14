# Marketplace imports

Agent Hub treats marketplaces as untrusted catalogs. Importing a manifest creates listings and installation plans; it never downloads or executes a plugin.

## Anthropic / Claude Code marketplaces

Use `POST /v1/catalog/import` with an authenticated API token and a Claude Code `marketplace.json` document:

```json
{
  "type": "claude-marketplace",
  "source": "anthropics/claude-code",
  "manifest": "{...contents of .claude-plugin/marketplace.json...}"
}
```

Each entry is recorded as a Claude Code-native plugin with an immutable SHA-256 digest. The resulting install plan uses the official Claude Code flow:

```text
claude plugin marketplace add anthropics/claude-code --scope user
claude plugin install plugin-name@marketplace-name
```

Plugins that are native only to Claude Code are not advertised as portable skills or plugins for other harnesses. The Hub keeps their compatibility matrix explicit.

## Private custom imports

Use the same endpoint for a private HTTPS or GitHub shorthand source:

```json
{
  "type": "custom",
  "name": "Internal release notes MCP",
  "kind": "mcp",
  "source": "https://git.example.com/platform/release-notes-mcp.git",
  "publisher": "Platform team",
  "version": "2026.09"
}
```

Custom imports reject non-HTTPS, loopback, and credential-bearing URLs. They begin in `pending` scan status and remain private. An approval must bind the imported digest, selected harness, execution scope, and declared capabilities before an installation can be applied.

## Production importer service

The API endpoint intentionally accepts the already-fetched marketplace document. A deployed importer worker should fetch remote manifests through an egress allowlist, enforce size and redirect limits, preserve the source revision, run malware/secret/license scans, and write approved records to PostgreSQL. It must not perform arbitrary server-side fetches from a user-supplied URL.
