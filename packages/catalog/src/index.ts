import type { ExtensionArtifact, HarnessId } from "@agent-hub/contracts";

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
