import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type OmpMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  model?: string;
};

export type OmpModel = {
  provider: string;
  id: string;
  selector: string;
  name: string;
  contextWindow: number | null;
  reasoning: boolean;
};

export type OmpSession = { id: string; path: string; title: string; updatedAt: string };

export type OmpPrintOptions = {
  model?: string;
  resume?: string;
  thinking?: string;
  advisor?: boolean;
  approvalMode?: string;
  autoApprove?: boolean;
  tools?: string;
  printThoughts?: boolean;
  cwd?: string;
  maxTime?: string;
};

export type OmpEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; name: string; intent: string }
  | { type: "tool_end"; name: string; ok: boolean; summary: string }
  | { type: "done"; text: string; sessionId: string }
  | { type: "error"; message: string };

function runOmp(args: string[], input?: string, timeoutMs = 120000): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof (timer as unknown as { unref?: unknown }).unref === "function") {
    (timer as unknown as { unref: () => void }).unref();
  }
  const child = spawn("omp", args, { stdio: ["pipe", "pipe", "pipe"], signal: controller.signal });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString();
  });
  child.on("error", (error) => {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      reject(new Error(`omp timed out after ${timeoutMs}ms: omp ${args.join(" ")}`));
    } else {
      reject(error);
    }
  });
  child.on("close", (code, signal) => {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      reject(new Error(`omp timed out after ${timeoutMs}ms: omp ${args.join(" ")}`));
    } else if (code === 0) {
      resolve(out);
    } else {
      reject(new Error(err.trim() || `omp exited ${code ?? signal ?? "unknown"}`));
    }
  });
  if (input !== undefined) child.stdin.write(input);
  child.stdin.end();
  return promise;
}

export async function listOmpModels(): Promise<OmpModel[]> {
  const raw = await runOmp(["models", "--json"]);
  const parsed = JSON.parse(raw) as { models?: OmpModel[] } | OmpModel[];
  return Array.isArray(parsed) ? parsed : (parsed.models ?? []);
}

export async function findOmpModels(pattern: string): Promise<OmpModel[]> {
  const raw = await runOmp(["models", "find", pattern, "--json"]);
  try {
    const parsed = JSON.parse(raw) as { models?: OmpModel[] } | OmpModel[];
    return Array.isArray(parsed) ? parsed : (parsed.models ?? []);
  } catch {
    return [{ provider: "", id: pattern, selector: pattern, name: raw.trim(), contextWindow: null, reasoning: false }];
  }
}

export async function refreshOmpModels(): Promise<string> {
  return (await runOmp(["models", "refresh"], undefined, 300000)).trim();
}

export async function getOmpVersion(): Promise<string> {
  const raw = (await runOmp(["--version"])).trim();
  const match = raw.match(/omp\/(\S+)/);
  return match?.[1] ?? raw;
}

export async function ompPrint(
  prompt: string,
  modelOrOpts?: string | OmpPrintOptions,
  resume?: string,
): Promise<string> {
  const opts: OmpPrintOptions =
    typeof modelOrOpts === "string" ? { resume } : { ...(modelOrOpts ?? {}), resume: modelOrOpts?.resume ?? resume };
  const model = typeof modelOrOpts === "string" ? modelOrOpts : modelOrOpts?.model;
  const args = ["--no-session", "-p", "--mode", "json"];
  if (model) args.push("--model", model);
  if (opts.resume) args.push("--resume", opts.resume);
  if (opts.thinking) args.push("--thinking", opts.thinking);
  if (opts.advisor) args.push("--advisor");
  if (opts.approvalMode) args.push("--approval-mode", opts.approvalMode);
  if (opts.autoApprove) args.push("--auto-approve");
  if (opts.tools) args.push("--tools", opts.tools);
  if (opts.printThoughts) args.push("--print-thoughts");
  if (opts.cwd) args.push("--cwd", opts.cwd);
  if (opts.maxTime) args.push("--max-time", opts.maxTime);
  args.push(prompt);
  const raw = await runOmp(args, undefined, 300000);
  const lines = raw.split("\n").filter(Boolean);
  let text = "";
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
      };
      if (
        (event.type === "message" || event.type === "message_end" || event.type === "turn_end") &&
        event.message?.role === "assistant"
      ) {
        const parts = event.message.content ?? [];
        const joined = parts
          .filter((part) => part.type === "text" && part.text)
          .map((part) => part.text as string)
          .join("");
        if (joined) text = joined;
      }
    } catch {
      // Non-JSON line: ignore.
    }
  }
  return text.trim();
}

type JsonEvent = {
  type?: string;
  assistantMessageEvent?: { type?: string; delta?: string; content?: string; toolCall?: { name?: string; arguments?: unknown } };
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  intent?: string;
  result?: { content?: Array<{ text?: string }> };
  isError?: boolean;
  message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
};

function summarizeResult(result: JsonEvent["result"]): string {
  const parts = result?.content ?? [];
  const text = parts.map((part) => part.text ?? "").join("").trim();
  if (!text) return "";
  const first = text.split("\n")[0] ?? "";
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}

/** Streams one `omp -p --mode json` run as UI events. Resolves with the final text. */
export async function streamOmp(
  prompt: string,
  opts: OmpPrintOptions,
  onEvent: (event: OmpEvent) => void,
): Promise<{ text: string; sessionId: string }> {
  const args = ["--no-session", "-p", "--mode", "json"];
  if (opts.model) args.push("--model", opts.model);
  if (opts.resume) args.push("--resume", opts.resume);
  if (opts.thinking) args.push("--thinking", opts.thinking);
  if (opts.advisor) args.push("--advisor");
  if (opts.approvalMode) args.push("--approval-mode", opts.approvalMode);
  if (opts.autoApprove) args.push("--auto-approve");
  if (opts.tools) args.push("--tools", opts.tools);
  if (opts.printThoughts) args.push("--print-thoughts");
  if (opts.cwd) args.push("--cwd", opts.cwd);
  if (opts.maxTime) args.push("--max-time", opts.maxTime);
  args.push(prompt);

  const { promise, resolve, reject } = Promise.withResolvers<{ text: string; sessionId: string }>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300000);
  const child = spawn("omp", args, {
    stdio: ["ignore", "pipe", "pipe"],
    signal: controller.signal,
    cwd: opts.cwd,
  });
  let buffer = "";
  let text = "";
  let sessionId = "";
  let err = "";
  const pendingTools = new Map<string, string>();

  function handleLine(line: string): void {
    if (!line.trim()) return;
    let event: JsonEvent;
    try {
      event = JSON.parse(line) as JsonEvent;
    } catch {
      return;
    }
    if (event.type === "session" && typeof (event as unknown as { id?: unknown }).id === "string") {
      sessionId = (event as unknown as { id: string }).id;
    }
    const inner = event.assistantMessageEvent;
    if (event.type === "message_update" && inner) {
      if (inner.type === "text_delta" && inner.delta) {
        text += inner.delta;
        onEvent({ type: "text", delta: inner.delta });
      } else if (inner.type === "thinking_delta" && inner.delta) {
        onEvent({ type: "thinking", delta: inner.delta });
      } else if (inner.type === "toolcall_end" && inner.toolCall?.name) {
        onEvent({ type: "tool_start", name: inner.toolCall.name, intent: "" });
      }
    } else if (event.type === "tool_execution_start" && event.toolName) {
      if (event.toolCallId) pendingTools.set(event.toolCallId, event.toolName);
      onEvent({
        type: "tool_start",
        name: event.toolName,
        intent: typeof event.intent === "string" ? event.intent : "",
      });
    } else if (event.type === "tool_execution_end") {
      const name = (event.toolName ?? (event.toolCallId ? pendingTools.get(event.toolCallId) : undefined)) ?? "tool";
      if (event.toolCallId) pendingTools.delete(event.toolCallId);
      onEvent({ type: "tool_end", name, ok: !event.isError, summary: summarizeResult(event.result) });
    } else if (
      (event.type === "message_end" || event.type === "turn_end") &&
      event.message?.role === "assistant"
    ) {
      const joined = (event.message.content ?? [])
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text as string)
        .join("");
      if (joined && !text) {
        text = joined;
        onEvent({ type: "text", delta: joined });
      }
    }
  }

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString();
  });
  child.on("error", (error) => {
    clearTimeout(timer);
    if (controller.signal.aborted) reject(new Error("omp run timed out after 5 minutes."));
    else reject(error);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (buffer.trim()) handleLine(buffer);
    if (controller.signal.aborted) {
      reject(new Error("omp run timed out after 5 minutes."));
    } else if (code === 0) {
      onEvent({ type: "done", text: text.trim(), sessionId });
      resolve({ text: text.trim(), sessionId });
    } else {
      onEvent({ type: "error", message: err.trim() || `omp exited ${code ?? "unknown"}` });
      reject(new Error(err.trim() || `omp exited ${code ?? "unknown"}`));
    }
  });
  return promise;
}

export async function checkGateway(): Promise<{ reachable: boolean; url: string | null }> {
  const url = process.env["OMP_GATEWAY_URL"];
  if (!url) return { reachable: false, url: null };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(3000) });
    return { reachable: res.ok, url };
  } catch {
    return { reachable: false, url };
  }
}

export async function gatewayStatus(): Promise<{ ok: boolean; version: string }> {
  const url = process.env["OMP_GATEWAY_URL"];
  if (!url) return { ok: false, version: "" };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(5000) });
    let version = "";
    try {
      const data = (await res.json()) as { version?: unknown };
      if (typeof data.version === "string") version = data.version;
    } catch {
      // Non-JSON health response: reachability only.
    }
    return { ok: res.ok, version };
  } catch {
    return { ok: false, version: "" };
  }
}

export async function gatewayModels(): Promise<unknown> {
  const url = process.env["OMP_GATEWAY_URL"];
  if (!url) throw new Error("OMP_GATEWAY_URL is not configured.");
  const headers: Record<string, string> = {};
  const token = process.env["OMP_GATEWAY_TOKEN"];
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${url.replace(/\/$/, "")}/v1/models`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Gateway models request failed: ${res.status}`);
  return res.json() as Promise<unknown>;
}

export type LocalGatewayState = {
  running: boolean;
  pid?: number;
  url: string | null;
  managed: boolean;
};

let gatewayChild: ChildProcess | null = null;

function gatewayPort(): string {
  return process.env["OMP_GATEWAY_PORT"] ?? "4000";
}

export function localGatewayUrl(): string {
  if (process.env["OMP_GATEWAY_URL"]) return process.env["OMP_GATEWAY_URL"];
  return `http://127.0.0.1:${gatewayPort()}`;
}

async function probeGateway(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function localGatewayState(): Promise<LocalGatewayState> {
  const url = localGatewayUrl();
  if (gatewayChild?.pid && !gatewayChild.killed) {
    return { running: await probeGateway(url), pid: gatewayChild.pid, url, managed: true };
  }
  gatewayChild = null;
  return { running: await probeGateway(url), pid: undefined, url, managed: false };
}

export async function startLocalGateway(): Promise<LocalGatewayState> {
  const existing = await localGatewayState();
  if (existing.running) return existing;
  gatewayChild = spawn("omp", ["auth-gateway", "serve", `--bind=127.0.0.1:${gatewayPort()}`, "--no-auth"], {
    stdio: "ignore",
    detached: true,
  });
  gatewayChild.unref();
  const url = localGatewayUrl();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await probeGateway(url)) {
      return { running: true, pid: gatewayChild.pid, url, managed: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Local gateway did not become reachable on " + url + ". Is a broker configured?");
}

export async function stopLocalGateway(): Promise<LocalGatewayState> {
  if (gatewayChild && !gatewayChild.killed) {
    gatewayChild.kill("SIGTERM");
  }
  gatewayChild = null;
  const url = localGatewayUrl();
  return { running: await probeGateway(url), pid: undefined, url, managed: false };
}

export async function getUsageReport(): Promise<unknown> {
  const raw = await runOmp(["usage", "--json"]);
  return JSON.parse(raw) as unknown;
}

export async function brokerStatus(): Promise<{ configured: boolean; accounts: number; raw: string }> {
  try {
    const raw = (await runOmp(["auth-broker", "status"])).trim();
    const configured = !/no auth-broker configured/i.test(raw);
    return { configured, accounts: configured ? 1 : 0, raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/no auth-broker configured/i.test(message)) return { configured: false, accounts: 0, raw: message };
    throw error;
  }
}

export async function brokerAccounts(): Promise<unknown> {
  try {
    const raw = await runOmp(["auth-broker", "list", "--json"]);
    return JSON.parse(raw) as unknown;
  } catch {
    return { accounts: [] };
  }
}

export async function listPlugins(): Promise<unknown> {
  const raw = await runOmp(["plugin", "list", "--json"]);
  return JSON.parse(raw) as unknown;
}

export type PluginAction = "install" | "uninstall" | "enable" | "disable" | "upgrade";

export async function setPluginState(action: PluginAction, name: string, scope?: "user" | "project"): Promise<string> {
  const args = ["plugin", action, name];
  if (scope) args.push("--scope", scope);
  return (await runOmp(args, undefined, 300000)).trim();
}

export async function discoverMarketplace(name?: string): Promise<unknown> {
  const args = name ? ["plugin", "discover", name, "--json"] : ["plugin", "marketplace", "list", "--json"];
  const raw = await runOmp(args);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

export async function readConfig(): Promise<string> {
  return runOmp(["config", "list"]);
}

export type ConfigEntry = { value: unknown; type: string; options?: string[]; group: string };

const SECRET_KEY_PATTERN = /token|secret|apikey|api_key|password/i;
const CONFIG_BLOCKLIST = new Set(["auth.broker.token", "images.urls.credentials"]);

export function isConfigEditable(key: string): boolean {
  return !CONFIG_BLOCKLIST.has(key) && !SECRET_KEY_PATTERN.test(key);
}

export async function getConfig(): Promise<Record<string, ConfigEntry>> {
  const raw = await readConfig();
  const entries: Record<string, ConfigEntry> = {};
  let group = "general";
  for (const line of raw.split("\n")) {
    const groupMatch = line.match(/^\[([^\]]+)\]/);
    if (groupMatch?.[1]) {
      group = groupMatch[1];
      continue;
    }
    const entry = line.match(/^ {2}(\S+) = (.*) \(([^()]*)\)$/);
    if (!entry?.[1] || entry[2] === undefined || entry[3] === undefined) continue;
    const key = entry[1];
    const rawValue = entry[2].trim();
    const typeToken = entry[3].trim();
    let type = typeToken;
    let options: string[] | undefined;
    if (typeToken.includes("|")) {
      options = typeToken.split("|");
      type = "enum";
    } else if (typeToken === "(not set)") {
      type = "string";
    }
    let value: unknown = rawValue;
    if (rawValue === "(not set)") value = "";
    else if (type === "boolean") value = rawValue === "true";
    else if (type === "number") value = Number(rawValue);
    else if (rawValue.startsWith("[") || rawValue.startsWith("{") || rawValue.startsWith('"')) {
      try {
        value = JSON.parse(rawValue) as unknown;
      } catch {
        value = rawValue;
      }
    }
    if (!isConfigEditable(key)) {
      entries[key] = { value: "********", type, group, ...(options ? { options } : {}) };
    } else {
      entries[key] = { value, type, group, ...(options ? { options } : {}) };
    }
  }
  return entries;
}

export async function setConfig(key: string, value: string): Promise<string> {
  if (!isConfigEditable(key)) throw new Error(`"${key}" is not editable here.`);
  return (await runOmp(["config", "set", key, value])).trim();
}

export async function listProcesses(): Promise<unknown> {
  const raw = await runOmp(["ps", "list", "--json", "--plain"]);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

export async function listWorktrees(): Promise<unknown> {
  const raw = await runOmp(["worktree", "list", "--json"]);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

export async function listCollab(): Promise<unknown> {
  const raw = await runOmp(["collab", "list", "--json"]);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

function agentDir(): string {
  return process.env["PI_CODING_AGENT_DIR"] ?? path.join(os.homedir(), ".omp", "agent");
}

async function collectJsonlFiles(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth < 0) return;
  let entries: Array<{ name: string; isFile: boolean; isDir: boolean }>;
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    entries = dirents.map((d) => ({ name: d.name, isFile: d.isFile(), isDir: d.isDirectory() }));
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile && entry.name.endsWith(".jsonl")) out.push(full);
    else if (entry.isDir && depth > 0) await collectJsonlFiles(full, depth - 1, out);
  }
}

export async function getServerCwd(): Promise<string> {
  return path.resolve(process.cwd(), "..", "..");
}

export async function listChildDirs(dir: string): Promise<{ parent: string; dirs: string[] }> {
  const resolved = path.resolve(dir || process.cwd());
  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const allowed = [repoRoot, os.homedir()];
  const ok = allowed.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!ok) throw new Error("Directory must stay inside the repo or home directory.");
  const dirents = await fs.readdir(resolved, { withFileTypes: true });
  const dirs = dirents
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
    .map((entry) => entry.name)
    .sort()
    .slice(0, 100);
  return { parent: path.dirname(resolved), dirs: dirs.map((name) => path.join(resolved, name)) };
}

export async function listSessions(): Promise<OmpSession[]> {
  const files: string[] = [];
  await collectJsonlFiles(path.join(agentDir(), "sessions"), 3, files);
  const withStats = await Promise.all(
    files.map(async (file) => {
      try {
        const stat = await fs.stat(file);
        return { file, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  const sorted = withStats
    .filter((row): row is { file: string; mtime: number } => row !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 100);
  const sessions = await Promise.all(
    sorted.map(async ({ file, mtime }) => {
      let title = path.basename(file, ".jsonl");
      try {
        const head = (await fs.readFile(file, "utf8")).slice(0, 8192);
        for (const line of head.split("\n")) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as { type?: string; title?: string };
            if (event.type === "title" && typeof event.title === "string" && event.title) {
              title = event.title;
              break;
            }
          } catch {
            continue;
          }
        }
      } catch {
        // Unreadable session file: keep basename as title.
      }
      return {
        id: path.basename(file, ".jsonl"),
        path: file,
        title,
        updatedAt: new Date(mtime).toISOString(),
      } satisfies OmpSession;
    }),
  );
  return sessions;
}

export type McpServerEntry = { config: unknown; source: string; path: string };

export async function readMcpServers(): Promise<Record<string, unknown>> {
  const aggregated = await readMcpServersDetailed();
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(aggregated)) out[name] = entry.config;
  return out;
}

export async function readMcpServersDetailed(): Promise<Record<string, McpServerEntry>> {
  const servers: Record<string, McpServerEntry> = {};
  const file = path.join(agentDir(), "mcp.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    for (const [name, config] of Object.entries(parsed.mcpServers ?? {})) {
      servers[name] = { config, source: "mcp.json", path: file };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pluginCache = path.join(os.homedir(), ".omp", "plugins", "cache", "plugins");
  let pluginDirs: string[];
  try {
    pluginDirs = await fs.readdir(pluginCache);
  } catch {
    pluginDirs = [];
  }
  for (const dir of pluginDirs) {
    const mcpDir = path.join(pluginCache, dir, "mcp");
    let files: string[];
    try {
      files = await fs.readdir(mcpDir);
    } catch {
      continue;
    }
    for (const name of files.filter((entry) => entry.endsWith(".json"))) {
      const full = path.join(mcpDir, name);
      try {
        const recipe = JSON.parse(await fs.readFile(full, "utf8")) as { command?: unknown } & Record<string, unknown>;
        if (!recipe.command) continue;
        const serverName = path.basename(name, ".json");
        const key = servers[serverName] ? `${serverName} (${dir.split("___")[0]})` : serverName;
        servers[key] = { config: recipe, source: `plugin ${dir}`, path: full };
      } catch {
        continue;
      }
    }
  }
  return servers;
}

export async function writeMcpServers(): Promise<never> {
  throw new Error("MCP edits are read-only in this build. Edit ~/.omp/agent/mcp.json directly.");
}

export type SkillInfo = {
  name: string;
  description: string;
  globs?: string[];
  alwaysApply?: boolean;
  path: string;
  source: string;
};

function parseFrontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const fields: Record<string, string> = {};
  if (!match?.[1]) return fields;
  for (const line of match[1].split("\n")) {
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (field?.[1]) fields[field[1]] = field[2].trim().replace(/^["']|["']$/g, "");
  }
  return fields;
}

export async function listSkills(): Promise<{ skills: SkillInfo[]; rulesEnabled: boolean }> {
  const roots: Array<{ dir: string; source: string }> = [{ dir: path.join(agentDir(), "skills"), source: "omp" }];
  const pluginCache = path.join(os.homedir(), ".omp", "plugins", "cache", "plugins");
  try {
    const pluginDirs = await fs.readdir(pluginCache);
    for (const dir of pluginDirs) {
      roots.push({ dir: path.join(pluginCache, dir, "skills"), source: `plugin ${dir.split("___")[0]}` });
    }
  } catch {
    // No plugin cache: user skills only.
  }
  const skills: SkillInfo[] = [];
  for (const { dir, source } of roots) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const candidates = [
        path.join(dir, name, "SKILL.md"),
        path.join(dir, name, name, "SKILL.md"),
        path.join(dir, "SKILL.md"),
      ];
      let skillFile: string | null = null;
      for (const candidate of candidates) {
        try {
          await fs.access(candidate);
          skillFile = candidate;
          break;
        } catch {
          continue;
        }
      }
      if (!skillFile) continue;
      try {
        const text = await fs.readFile(skillFile, "utf8");
        const front = parseFrontmatter(text);
        skills.push({
          name: front["name"] ?? name,
          description: front["description"] ?? "",
          path: skillFile,
          source,
        });
      } catch {
        continue;
      }
    }
  }
  let rulesEnabled = true;
  try {
    const config = await getConfig();
    const skillsOn = config["skills.enabled"]?.value;
    const builtin = config["ttsr.builtinRules"]?.value;
    rulesEnabled = skillsOn !== false && builtin !== false;
  } catch {
    // Config unreadable: assume rules enabled.
  }
  return { skills, rulesEnabled };
}

export async function setSkillState(name: string, enabled: boolean): Promise<string> {
  const config = await getConfig();
  const ignoredRaw = config["skills.ignoredSkills"]?.value;
  const ignored: string[] = Array.isArray(ignoredRaw) ? ignoredRaw.map(String) : [];
  let next: string[];
  if (enabled) next = ignored.filter((entry) => entry !== name);
  else if (ignored.includes(name)) next = ignored;
  else next = [...ignored, name];
  return setConfig("skills.ignoredSkills", JSON.stringify(next));
}
