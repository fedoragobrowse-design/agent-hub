import { test, expect } from "bun:test";
import { importClaudeMarketplace, importCustomArtifact } from "../src/index";

const manifest = JSON.stringify({
  name: "sample-marketplace",
  version: "1.2.3",
  owner: { name: "Example team" },
  plugins: [{ name: "review-tools", source: { source: "github", repo: "example/review-tools" }, skills: ["./skills"], mcpServers: { review: {} } }]
});

test("imports Anthropic marketplace entries as Claude-native plugins", async () => {
  const [artifact] = await importClaudeMarketplace({ source: "example/marketplace", manifest });
  expect(artifact.id).toBe("claude-marketplace:sample-marketplace:review-tools");
  expect(artifact.marketplace).toEqual({ name: "sample-marketplace", source: "example/marketplace", plugin: "review-tools" });
  expect(artifact.compatibility["claude-code"]).toBe("native");
  expect(artifact.compatibility.codex).toBe("unsupported");
  expect(artifact.capabilities).toEqual(expect.arrayContaining(["filesystem-read", "network"]));
});

test("keeps custom imports private and pending review", async () => {
  const artifact = await importCustomArtifact({ name: "Internal MCP", kind: "mcp", source: "https://git.example.com/tools/mcp.git", publisher: "My team" });
  expect(artifact.visibility).toBe("private");
  expect(artifact.scan).toBe("pending");
  expect(artifact.compatibility.omp).toBe("native");
});

test("rejects local and credential-bearing marketplace URLs", async () => {
  await expect(importClaudeMarketplace({ source: "http://localhost:3000/plugins", manifest })).rejects.toThrow();
  await expect(importClaudeMarketplace({ source: "https://user:pass@example.com/plugins", manifest })).rejects.toThrow();
});
