import type { ExtensionArtifact, HarnessId } from "@agent-hub/contracts";

type MarketplacePlugin = {
  name?: unknown; description?: unknown; version?: unknown; source?: unknown;
  mcpServers?: unknown; hooks?: unknown; skills?: unknown; agents?: unknown;
};
type MarketplaceManifest = {
  name?: unknown; version?: unknown; description?: unknown;
  owner?: { name?: unknown }; plugins?: unknown;
};

const claudeOnly = { codex: "unsupported", opencode: "unsupported", omp: "unsupported", "claude-code": "native" } as const;

export function normalizeMarketplaceSource(source: string) {
  const trimmed = source.trim();
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) return trimmed;
  const url = new URL(trimmed);
  if (url.protocol !== "https:") throw new Error("Marketplace imports require HTTPS or owner/repository shorthand.");
  if (url.username || url.password || /^(localhost|127\.|0\.0\.0\.0|::1$)/i.test(url.hostname)) throw new Error("Marketplace source is not a permitted public HTTPS endpoint.");
  return url.toString();
}

function declaredCapabilities(plugin: MarketplacePlugin): ExtensionArtifact["capabilities"] {
  const capabilities = new Set<ExtensionArtifact["capabilities"][number]>();
  if (plugin.mcpServers) capabilities.add("network");
  if (plugin.skills || plugin.agents) capabilities.add("filesystem-read");
  if (plugin.hooks) { capabilities.add("shell"); capabilities.add("filesystem-write"); }
  return [...capabilities];
}

function pluginSource(source: unknown, marketplaceSource: string) {
  if (typeof source === "string") return source;
  if (source && typeof source === "object") {
    const value = source as Record<string, unknown>;
    if (typeof value.repo === "string") return value.repo;
    if (typeof value.url === "string") return value.url;
    if (typeof value.package === "string") return `npm:${value.package}`;
  }
  return marketplaceSource;
}

/** Parses the published Claude Code marketplace contract without executing plugin code. */
export async function importClaudeMarketplace(input: { source: string; manifest: string; visibility?: "public" | "private" }) {
  const source = normalizeMarketplaceSource(input.source);
  if (input.manifest.length > 512_000) throw new Error("Marketplace manifest exceeds the 512 KB import limit.");
  let manifest: MarketplaceManifest;
  try { manifest = JSON.parse(input.manifest) as MarketplaceManifest; } catch { throw new Error("Marketplace manifest is not valid JSON."); }
  if (typeof manifest.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.name)) throw new Error("Marketplace name must be lowercase kebab-case.");
  const marketplaceName = manifest.name;
  if (!Array.isArray(manifest.plugins)) throw new Error("Marketplace manifest must contain a plugins array.");
  const publisher = typeof manifest.owner?.name === "string" ? manifest.owner.name : marketplaceName;
  const visibility = input.visibility ?? "private";
  return Promise.all(manifest.plugins.map(async (candidate) => {
    const plugin = candidate as MarketplacePlugin;
    if (typeof plugin.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(plugin.name) || !plugin.source) throw new Error("Every marketplace plugin needs a kebab-case name and source.");
    const version = typeof plugin.version === "string" ? plugin.version : typeof manifest.version === "string" ? manifest.version : "unversioned";
    const digest = await digestArtifact(JSON.stringify({ source, marketplace: marketplaceName, plugin }));
    return {
      id: `claude-marketplace:${marketplaceName}:${plugin.name}`,
      name: plugin.name,
      version,
      digest,
      kind: "plugin",
      source: { type: "claude-marketplace", url: pluginSource(plugin.source, source), publisher },
      marketplace: { name: marketplaceName, source, plugin: plugin.name },
      capabilities: declaredCapabilities(plugin), requiredSecrets: [], compatibility: claudeOnly,
      scan: visibility === "public" ? "pending" : "passed", visibility
    } satisfies ExtensionArtifact;
  }));
}

/** Creates a private custom listing. It stays pending until a scanner attests to its digest. */
export async function importCustomArtifact(input: { name: string; kind: ExtensionArtifact["kind"]; source: string; publisher: string; version?: string; capabilities?: ExtensionArtifact["capabilities"] }) {
  const source = normalizeMarketplaceSource(input.source);
  if (!input.name.trim()) throw new Error("Custom artifact name is required.");
  const digest = await digestArtifact(JSON.stringify({ source, name: input.name, version: input.version ?? "unversioned" }));
  return {
    id: `custom:${digest.slice(7, 23)}`, name: input.name.trim(), version: input.version ?? "unversioned", digest, kind: input.kind,
    source: { type: source.includes("github.com") ? "github" : "git", url: source, publisher: input.publisher.trim() || "Private import" },
    capabilities: input.capabilities ?? [], requiredSecrets: [], compatibility: {
      codex: input.kind === "mcp" ? "native" : "unsupported", opencode: input.kind === "mcp" ? "native" : "unsupported", omp: input.kind === "mcp" ? "native" : "unsupported", "claude-code": input.kind === "mcp" ? "native" : "adapted"
    }, scan: "pending", visibility: "private"
  } satisfies ExtensionArtifact;
}

/** Browser- and server-safe immutable SHA-256 digest. */
export async function digestArtifact(content: string) {
  const bytes = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function validateArtifact(artifact: ExtensionArtifact): string[] {
  const errors: string[] = [];
  if (!artifact.digest.startsWith("sha256:")) errors.push("Artifact must have an immutable sha256 digest.");
  if (artifact.visibility === "public" && artifact.scan !== "passed") errors.push("Public artifacts must pass scanning.");
  if (!artifact.source.url.startsWith("https://") && artifact.source.type !== "hub") errors.push("External source must use HTTPS.");
  if (!artifact.name.trim()) errors.push("Artifact name is required.");
  return errors;
}

export function supportFor(artifact: ExtensionArtifact, harness: HarnessId) { return artifact.compatibility[harness]; }

export const catalogFixtures: ExtensionArtifact[] = [{
  id: "github-mcp", name: "GitHub MCP", version: "1.3.0", digest: "sha256:0f90db5a1d0ef75640fd", kind: "mcp",
  source: { type: "hub", url: "https://hub.agent.example/artifacts/github-mcp", publisher: "Agent Hub verified" },
  license: "MIT", capabilities: ["network", "oauth"], requiredSecrets: [], transports: ["http"], scan: "passed", visibility: "public",
  compatibility: { codex: "native", opencode: "native", omp: "native", "claude-code": "native" }
}, {
  id: "review-skill", name: "Prism review", version: "0.8.1", digest: "sha256:8a90dd42d88c4a209e12", kind: "skill",
  source: { type: "github", url: "https://github.com/example/prism-review", publisher: "example" }, license: "Apache-2.0",
  capabilities: ["filesystem-read"], requiredSecrets: [], scan: "passed", visibility: "public",
  compatibility: { codex: "native", opencode: "adapted", omp: "native", "claude-code": "native" }
}];
