import { access, appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import type { ExtensionArtifact, HarnessAdapter, HarnessId, InstallPlan, RunEvent, RunRequest, SupportLevel } from "@agent-hub/contracts";

type Definition = { id: HarnessId; displayName: string; command: string; config: string; support: Record<ExtensionArtifact["kind"], SupportLevel> };
const definitions: Definition[] = [
  { id: "codex", displayName: "Codex", command: "codex", config: ".codex/config.toml", support: { mcp: "native", skill: "native", plugin: "native" } },
  { id: "opencode", displayName: "OpenCode", command: "opencode", config: "opencode.json", support: { mcp: "native", skill: "adapted", plugin: "native" } },
  { id: "omp", displayName: "Oh My P(i)", command: "omp", config: ".omp/mcp.json", support: { mcp: "native", skill: "native", plugin: "native" } },
  { id: "claude-code", displayName: "Claude Code", command: "claude", config: ".mcp.json", support: { mcp: "native", skill: "native", plugin: "native" } }
];

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
async function commandAvailable(command: string) { return new Promise<boolean>((resolve) => { const child = spawn(command, ["--version"], { stdio: "ignore" }); child.on("error", () => resolve(false)); child.on("exit", (code) => resolve(code === 0)); }); }

class CliAdapter implements HarnessAdapter {
  readonly manifest;
  constructor(private readonly definition: Definition, private readonly home = process.env.HOME ?? ".") { this.manifest = { id: definition.id, version: "1", displayName: definition.displayName }; }
  async detect() { const installed = await commandAvailable(this.definition.command); return { installed, path: installed ? this.definition.command : undefined }; }
  async capabilities() { return this.definition.support; }
  async validate(artifact: ExtensionArtifact) { const support = artifact.compatibility[this.definition.id]; return support === "unsupported" ? { valid: false, reason: `${artifact.name} is unsupported by ${this.definition.displayName}.` } : { valid: true }; }
  async planInstall(artifact: ExtensionArtifact): Promise<InstallPlan> {
    const support = artifact.compatibility[this.definition.id];
    const configPath = join(this.home, this.definition.config);
    const claudeMarketplace = this.definition.id === "claude-code" ? artifact.marketplace : undefined;
    return { artifact: { id: artifact.id, name: artifact.name, digest: artifact.digest, kind: artifact.kind }, harness: this.definition.id, support,
      commands: claudeMarketplace ? [`claude plugin marketplace add ${claudeMarketplace.source} --scope user`, `claude plugin install ${claudeMarketplace.plugin}@${claudeMarketplace.name}`] : support === "native" ? [`Configure ${this.definition.command} with ${artifact.name}`] : [`Add Hub skill bridge for ${artifact.name}`],
      files: [configPath], transports: artifact.transports ?? [], networkDestinations: artifact.capabilities.includes("network") ? [new URL(artifact.source.url).origin] : [],
      requiredSecrets: artifact.requiredSecrets, restartRequired: true };
  }
  async applyInstall(plan: InstallPlan) {
    if (plan.support === "unsupported") throw new Error("Cannot install an unsupported artifact.");
    const target = plan.files[0]; const temp = `${target}.agent-hub-tmp`;
    await mkdir(dirname(target), { recursive: true });
    const existing = await exists(target) ? await readFile(target, "utf8") : "";
    const marker = `\n# Agent Hub approved artifact ${plan.artifact.id} (${plan.artifact.digest})\n`;
    await writeFile(temp, `${existing}${marker}`, { mode: 0o600 }); await rename(temp, target);
  }
  async launch(request: RunRequest) { return { externalId: `${this.definition.id}-${crypto.randomUUID()}` }; }
  async cancel() { /* Harness-specific cancellation is implemented by the bridge runtime. */ }
  async *streamEvents(externalId: string): AsyncIterable<RunEvent> { yield { id: crypto.randomUUID(), runId: externalId, at: new Date().toISOString(), type: "state", message: "Harness connected" }; }
}

export const adapters = definitions.reduce<Record<HarnessId, HarnessAdapter>>((registry, definition) => {
  registry[definition.id] = new CliAdapter(definition);
  return registry;
}, {} as Record<HarnessId, HarnessAdapter>);
export const getAdapter = (harness: HarnessId) => adapters[harness];
