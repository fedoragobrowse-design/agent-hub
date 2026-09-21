"use client";

import { useEffect, useRef, useState } from "react";

type ToolActivity = { id: string; name: string; intent: string; done: boolean; ok: boolean; summary: string };

type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system" | "activity";
  text: string;
  model?: string;
  tools?: ToolActivity[];
  cwd?: string;
};

type OmpModel = {
  provider: string;
  id: string;
  selector: string;
  name: string;
};

type PanelId =
  | "chat"
  | "models"
  | "sessions"
  | "tools"
  | "gateway"
  | "usage"
  | "mcp"
  | "plugins"
  | "skills"
  | "settings";

type McpServer = { type?: unknown; command?: unknown; args?: unknown; cwd?: unknown; description?: unknown; source?: unknown };
type SkillRow = { name: string; description: string; path: string; source: string };
type SessionRow = { id: string; path: string; title: string; updatedAt: string };
type ConfigField = { value: unknown; type: string; options?: string[] };
type ConfigGroups = Record<string, Record<string, ConfigField>>;
type UsageReport = {
  reports?: Array<{
    provider?: unknown;
    limits?: Array<{
      label?: unknown;
      id?: unknown;
      status?: unknown;
      amount?: { usedFraction?: unknown; remainingFraction?: unknown };
      window?: { label?: unknown; resetsAt?: unknown };
    }>;
  }>;
};

function formatReset(epochMs: number): string {
  const diff = epochMs - Date.now();
  if (diff <= 0) return "resetting…";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `resets in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `resets in ${hours}h`;
  const days = Math.round(hours / 24);
  return `resets in ${days}d`;
}
type OpsState = { processes?: unknown; worktrees?: unknown; collab?: unknown; note?: string; error?: string };
type GatewayState = {
  reachable: boolean;
  models?: { count: number; ids: string[] };
  note?: string;
  error?: string;
};
type PluginList = { npm?: unknown; marketplace?: unknown };
type LocalGateway = { running: boolean; pid?: number; url: string | null; managed: boolean; error?: string };

const PANELS: Array<{ id: PanelId; mark: string; label: string; hint: string }> = [
  { id: "chat", mark: "π", label: "Chat", hint: "buffered reply via omp" },
  { id: "models", mark: "⬢", label: "Models", hint: "find · refresh · roles" },
  { id: "sessions", mark: "💾", label: "Sessions", hint: "continue · export · share" },
  { id: "tools", mark: "⚡", label: "Tools & approvals", hint: "approval mode · ops" },
  { id: "gateway", mark: "⇄", label: "Gateway & broker", hint: "health · presence" },
  { id: "usage", mark: "🪙", label: "Usage", hint: "provider limits" },
  { id: "mcp", mark: "◫", label: "MCP", hint: "stdio servers" },
  { id: "plugins", mark: "★", label: "Plugins", hint: "install · marketplace" },
  { id: "skills", mark: "👁", label: "Skills", hint: "curator · rules" },
  { id: "settings", mark: "⟲", label: "Settings", hint: "omp config groups" },
];

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"];
const APPROVAL_MODES = ["always-ask", "write", "yolo"];
const RUN_MODES = [
  { id: "", label: "Agent", hint: "full tools" },
  { id: "plan", label: "Plan", hint: "read-only plan then build" },
  { id: "prewalk", label: "Prewalk", hint: "cheap model after plan" },
] as const;

type SlashEntry = { name: string; hint: string; detail: string; passthrough?: boolean };
const SLASH_CATS: Array<{ match: (n: string) => boolean; label: string }> = [
  { match: (n) => ["/new","/fresh","/clear","/drop","/compact","/shake","/handoff","/resume","/retry","/rename","/move","/add-dir","/remove-dir","/dirs"].includes(n), label: "Session" },
  { match: (n) => ["/model","/switch","/thinking"].includes(n), label: "Model" },
  { match: (n) => ["/agents","/todo","/queue","/enqueue"].includes(n), label: "Agents" },
  { match: (n) => ["/plan","/plan-review","/vibe","/goal","/guided-goal","/loop","/prewalk","/budget","/skillful","/extended-context","/computer","/fast"].includes(n), label: "Modes" },
  { match: (n) => ["/share","/collab","/fork","/branch","/tree","/export"].includes(n), label: "Share" },
  { match: (n) => n.startsWith("/marketplace")||["/discover","/install","/uninstall","/plugins","/reload-plugins"].includes(n), label: "Plugins" },
];
function slashCat(name: string): string {
  for (const c of SLASH_CATS) if (c.match(name)) return c.label;
  return "More";
}
const SLASH_COMMANDS: SlashEntry[] = [
  // session + lifecycle — sent straight to OMP so behavior matches the TUI
  { name: "/new", hint: "", detail: "Start a new session", passthrough: true },
  { name: "/fresh", hint: "", detail: "Reset provider stream state, keep transcript", passthrough: true },
  { name: "/clear", hint: "", detail: "Clear conversation context in place", passthrough: true },
  { name: "/drop", hint: "", detail: "Delete current session, start new", passthrough: true },
  { name: "/compact", hint: "[focus]", detail: "Manually compact session context", passthrough: true },
  { name: "/shake", hint: "", detail: "Drop heavy content (tool results, large blocks)", passthrough: true },
  { name: "/handoff", hint: "", detail: "Hand off context to a new session", passthrough: true },
  { name: "/resume", hint: "<id>", detail: "Resume a different session", passthrough: true },
  { name: "/retry", hint: "", detail: "Retry the last failed agent turn", passthrough: true },
  { name: "/rename", hint: "[title]", detail: "Rename current session", passthrough: true },
  { name: "/move", hint: "<dir>", detail: "Move session to a different directory", passthrough: true },
  { name: "/add-dir", hint: "<dir>", detail: "Add a workspace directory (multi-root)", passthrough: true },
  { name: "/remove-dir", hint: "<dir>", detail: "Remove a workspace directory", passthrough: true },
  { name: "/dirs", hint: "", detail: "List session workspace directories", passthrough: true },
  // model + thinking
  { name: "/model", hint: "<fuzzy>", detail: "Switch model: /model opus" },
  { name: "/switch", hint: "<fuzzy|@role>", detail: "Switch model, fuzzy ids or @role", passthrough: true },
  { name: "/thinking", hint: "<level>", detail: "off minimal low medium high xhigh max auto" },
  // agents + todos
  { name: "/agents", hint: "", detail: "Agents hub: per-agent model, prewalk, advisor", passthrough: true },
  { name: "/todo", hint: "[sub]", detail: "View/modify todo list: edit copy expand collapse export import append start done drop rm", passthrough: true },
  { name: "/queue", hint: "<msg>", detail: "Queue a message for after the agent yields", passthrough: true },
  { name: "/enqueue", hint: "", detail: "Enqueue memory consolidation", passthrough: true },
  // context + tools
  { name: "/context", hint: "", detail: "Context usage breakdown", passthrough: true },
  { name: "/tools", hint: "", detail: "Tools visible to the agent", passthrough: true },
  { name: "/force", hint: "<tool>", detail: "Force next turn to use a tool", passthrough: true },
  { name: "/mcp", hint: "[add|list|remove|test]", detail: "Manage MCP servers", passthrough: true },
  // modes
  { name: "/plan", hint: "", detail: "Toggle plan mode (plan before executing)", passthrough: true },
  { name: "/plan-review", hint: "", detail: "Re-open latest plan review", passthrough: true },
  { name: "/vibe", hint: "", detail: "Toggle vibe mode (fast persistent workers)", passthrough: true },
  { name: "/goal", hint: "[set|show|pause|resume|drop]", detail: "Persistent autonomous objective", passthrough: true },
  { name: "/guided-goal", hint: "", detail: "Agent interviews you, then sets goal", passthrough: true },
  { name: "/loop", hint: "", detail: "Loop controls", passthrough: true },
  { name: "/prewalk", hint: "", detail: "Arm one-shot model handoff", passthrough: true },
  { name: "/budget", hint: "", detail: "Adjust token budget", passthrough: true },
  { name: "/skillful", hint: "[on|off|status]", detail: "List skills in system prompt", passthrough: true },
  { name: "/extended-context", hint: "[on|off]", detail: "Toggle extended context windows", passthrough: true },
  { name: "/computer", hint: "[on|off|status]", detail: "Native computer-use prelude", passthrough: true },
  { name: "/fast", hint: "[on|off|status]", detail: "Priority service tier", passthrough: true },
  // advisor + memory
  { name: "/advisor", hint: "[on|off|status]", detail: "Second model reviews each turn" },
  { name: "/memory", hint: "[view|stats|diagnose|queue|sync|clear]", detail: "Memory maintenance", passthrough: true },
  // share + collab
  { name: "/export", hint: "<path>", detail: "Export session to HTML" },
  { name: "/share", hint: "", detail: "Share via encrypted link" },
  { name: "/collab", hint: "[view|status|stop|join|leave]", detail: "Live shared session", passthrough: true },
  { name: "/fork", hint: "", detail: "Fork from a previous message" },
  { name: "/branch", hint: "", detail: "Rewind, keep old path as branch", passthrough: true },
  { name: "/tree", hint: "", detail: "Navigate session tree", passthrough: true },
  // plugins
  { name: "/marketplace", hint: "[add|remove|update|list]", detail: "Manage marketplace sources", passthrough: true },
  { name: "/discover", hint: "", detail: "Browse available plugins", passthrough: true },
  { name: "/install", hint: "<plugin>", detail: "Install a plugin", passthrough: true },
  { name: "/uninstall", hint: "<plugin>", detail: "Uninstall a plugin", passthrough: true },
  { name: "/plugins", hint: "[list|enable|disable]", detail: "Manage installed plugins", passthrough: true },
  { name: "/reload-plugins", hint: "", detail: "Reload skills, commands, hooks, tools, agents, MCP", passthrough: true },
  // misc
  { name: "/git", hint: "", detail: "Git UI: diff viewer, staging, commit", passthrough: true },
  { name: "/session", hint: "[info|delete|pin|jobs]", detail: "Session management", passthrough: true },
  { name: "/usage", hint: "", detail: "Provider usage and limits", passthrough: true },
  { name: "/stats", hint: "", detail: "Local stats dashboard", passthrough: true },
  { name: "/changelog", hint: "[full]", detail: "Changelog entries", passthrough: true },
  { name: "/hotkeys", hint: "", detail: "Keyboard shortcuts", passthrough: true },
  { name: "/cleanse", hint: "", detail: "Detect and fix project diagnostics", passthrough: true },
  { name: "/debug", hint: "", detail: "Debug tools selector", passthrough: true },
  { name: "/help", hint: "", detail: "List commands" },
  { name: "/exit", hint: "", detail: "Exit (web: start fresh)" },
  { name: "/quit", hint: "", detail: "Quit (web: start fresh)" },
];
const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "I run on OMP. Ask anything — I answer through your local omp with the model you pick.",
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}) as unknown)) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed: ${response.status}`);
  return data;
}

function shortModel(selector: string): string {
  if (!selector) return "—";
  const tail = selector.split("/").pop();
  return tail && tail.length > 0 ? tail : selector;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type FriendlyProps = {
  groups: ConfigGroups;
  onSet: (key: string, value: string) => void;
};

function getVal(groups: ConfigGroups, key: string): unknown {
  for (const entries of Object.values(groups)) {
    if (key in entries) return entries[key]?.value;
  }
  return undefined;
}

function FriendlySettings({ groups, onSet }: FriendlyProps) {
  const theme = asString(getVal(groups, "theme.dark"));
  const shape = asString(getVal(groups, "composer.shape"));
  const thinking = asString(getVal(groups, "defaultThinkingLevel"));
  const approval = asString(getVal(groups, "tools.approvalMode"));
  const editMode = asString(getVal(groups, "edit.mode"));
  return (
    <div className="panel-list">
      <div className="panel-row">
        <b>Appearance</b>
        <small>Theme · composer shape</small>
        <div className="row-actions">
          <label>Theme <code>{theme || "—"}</code></label>
        </div>
        <div className="row-actions">
          <span>Composer</span>
          {(["box", "minimal", "bordered"] as const).map((opt) => (
            <button key={opt} type="button" disabled={shape === opt} onClick={() => onSet("composer.shape", opt)} aria-pressed={shape === opt}>
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-row">
        <b>Thinking default</b>
        <small>Current: {thinking || "—"}</small>
        <div className="row-actions">
          {(["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"] as const).map((opt) => (
            <button key={opt} type="button" disabled={thinking === opt} onClick={() => onSet("defaultThinkingLevel", opt)} aria-pressed={thinking === opt}>
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-row">
        <b>Approvals</b>
        <small>Tool approval mode</small>
        <div className="row-actions" role="radiogroup" aria-label="Approval mode">
          {(["always-ask", "write", "yolo"] as const).map((opt) => (
            <button key={opt} type="button" disabled={approval === opt} onClick={() => onSet("tools.approvalMode", opt)} aria-pressed={approval === opt}>
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-row">
        <b>Edit mode</b>
        <small>How file edits apply · current: {editMode || "—"}</small>
        <div className="row-actions">
          {(["hashline", "apply_patch", "patch", "replace", "sloppy"] as const).map((opt) => (
            <button key={opt} type="button" disabled={editMode === opt} onClick={() => onSet("edit.mode", opt)} aria-pressed={editMode === opt}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OmpDeck() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<OmpModel[]>([]);
  const [model, setModel] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [gateway, setGateway] = useState<{ reachable: boolean; url: string | null } | null>(null);
  const [broker, setBroker] = useState<{ configured: boolean; accounts: number } | null>(null);
  const [ompVersion, setOmpVersion] = useState("—");
  const [usagePct, setUsagePct] = useState<string | null>(null);
  const [thinking, setThinking] = useState("auto");
  const [advisor, setAdvisor] = useState(false);
  const [approvalMode, setApprovalMode] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [toolsInput, setToolsInput] = useState("");
  const [printThoughts, setPrintThoughts] = useState(false);
  const [resume, setResume] = useState("");
  const [mode, setMode] = useState("—");
  const [runMode, setRunMode] = useState<(typeof RUN_MODES)[number]["id"]>("");
  const [cwd, setCwd] = useState("");
  const [cwdPicker, setCwdPicker] = useState<{ parent: string; dirs: string[] } | null>(null);
  const [attached, setAttached] = useState<string[]>([]);
  const [browser, setBrowser] = useState<{ dir: string; parent: string; entries: Array<{ name: string; path: string; kind: string; size?: number }>; git: { isRepo: boolean; branch?: string; staged: string[]; unstaged: string[]; untracked: string[] } | null } | null>(null);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [diffView, setDiffView] = useState<string | null>(null);
  const [cwdError, setCwdError] = useState<string | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [liveTools, setLiveTools] = useState<ToolActivity[]>([]);
  const [thinkingPreview, setThinkingPreview] = useState("");
  const [panel, setPanel] = useState<PanelId>("chat");
  const listRef = useRef<HTMLOListElement>(null);
  const liveToolsRef = useRef<ToolActivity[]>([]);

  // Panel state
  const [modelQuery, setModelQuery] = useState("");
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsNote, setSessionsNote] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [gatewayInfo, setGatewayInfo] = useState<GatewayState | null>(null);
  const [localGateway, setLocalGateway] = useState<LocalGateway | null>(null);
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [ops, setOps] = useState<OpsState | null>(null);
  const [opsNote, setOpsNote] = useState<string | null>(null);
  const [mcp, setMcp] = useState<Record<string, McpServer> | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<PluginList | null>(null);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const [pluginsMsg, setPluginsMsg] = useState<string | null>(null);
  const [pluginName, setPluginName] = useState("");
  const [pluginScope, setPluginScope] = useState<"user" | "project">("user");
  const [marketQuery, setMarketQuery] = useState("");
  const [market, setMarket] = useState<unknown>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [rulesEnabled, setRulesEnabled] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillsMsg, setSkillsMsg] = useState<string | null>(null);
  const [configGroups, setConfigGroups] = useState<ConfigGroups | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"friendly" | "advanced">("friendly");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [modelRoles, setModelRoles] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void api<{ models?: OmpModel[] }>("/api/omp/models")
      .then((data) => {
        if (!active) return;
        const rows = data.models ?? [];
        setModels(rows);
        const preferred =
          rows.find((row) => row.selector === "opencode-go/muse-spark-1.3-contributor") ?? rows[0];
        if (preferred) setModel(preferred.selector);
      })
      .catch((error: Error) => {
        if (active) {
          setModelsError(error.message);
          setNotice("Could not list OMP models. Check the omp binary is installed.");
        }
      });
    void api<{ cwd?: string }>("/api/omp/cwd")
      .then((data) => {
        if (active && data.cwd) setCwd(data.cwd);
      })
      .catch(() => undefined);
    void api<{
      omp?: { version?: string };
      gateway?: { reachable: boolean; url: string | null };
      broker?: { configured: boolean; accounts: number };
    }>("/api/omp/status")
      .then((data) => {
        if (!active) return;
        if (data.gateway) setGateway(data.gateway);
        if (data.broker) setBroker(data.broker);
        if (data.omp?.version) setOmpVersion(data.omp.version);
      })
      .catch(() => undefined);
    void api<UsageReport>("/api/omp/usage")
      .then((data) => {
        if (!active) return;
        const first = data?.reports?.[0]?.limits?.[0]?.amount;
        if (typeof first?.usedFraction === "number") {
          setUsagePct(`${Math.round(first.usedFraction * 100)}%`);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [messages, sending, panel]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        fresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadPanel(id: PanelId) {
    try {
      if (id === "sessions" && sessions.length === 0 && !sessionsError) {
        const data = await api<{ sessions?: SessionRow[]; note?: string }>("/api/omp/sessions");
        setSessions(data.sessions ?? []);
        setSessionsNote(data.note ?? null);
      } else if (id === "usage" && !usage && !usageError) {
        const data = await api<UsageReport>("/api/omp/usage");
        setUsage(data);
      } else if (id === "gateway" && !gatewayInfo) {
        const data = await api<GatewayState>("/api/omp/gateway");
        setGatewayInfo(data);
        try {
          setLocalGateway(await api<LocalGateway>("/api/omp/gateway/local"));
        } catch {
          // Local gateway probe optional.
        }
      } else if (id === "tools" && !ops) {
      } else if (id === "mcp" && !mcp && !mcpError) {
        const data = await api<{ servers?: Record<string, McpServer> }>("/api/omp/mcp");
        setMcp(data.servers ?? {});
      } else if (id === "plugins" && !plugins && !pluginsError) {
        const data = await api<PluginList>("/api/omp/plugins");
        setPlugins(data);
      } else if (id === "skills" && skills.length === 0 && !skillsError) {
        const data = await api<{ skills?: SkillRow[]; rulesEnabled?: boolean }>("/api/omp/skills");
        setSkills(data.skills ?? []);
        setRulesEnabled(data.rulesEnabled ?? true);
      } else if (id === "settings" && !configGroups && !configError) {
        const data = await api<{ groups?: ConfigGroups }>("/api/omp/config");
        setConfigGroups(data.groups ?? {});
        const rolesRec = asRecord(data.groups?.["internal"]?.["modelRoles"]?.value);
        if (rolesRec) {
          const mapped: Record<string, string> = {};
          for (const [key, value] of Object.entries(rolesRec)) {
            if (typeof value === "string") mapped[key] = value;
          }
          setModelRoles(mapped);
        }
        const editModeVal = data.groups?.["files"]?.["edit.mode"]?.value;
        if (typeof editModeVal === "string" && editModeVal) setMode(editModeVal);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed.";
      if (id === "sessions") setSessionsError(message);
      else if (id === "usage") setUsageError(message);
      else if (id === "gateway") setGatewayInfo({ reachable: false, error: message });
      else if (id === "tools") setOps({ error: message });
      else if (id === "mcp") setMcpError(message);
      else if (id === "plugins") setPluginsError(message);
      else if (id === "skills") setSkillsError(message);
      else if (id === "settings") setConfigError(message);
    }
  }

  useEffect(() => {
    if (panel !== "chat") void loadPanel(panel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  useEffect(() => {
    liveToolsRef.current = liveTools;
  }, [liveTools]);

  type StreamEvent =
    | { type: "text"; delta: string }
    | { type: "thinking"; delta: string }
    | { type: "tool_start"; name: string; intent: string }
    | { type: "tool_end"; name: string; ok: boolean; summary: string }
    | { type: "done"; text: string; sessionId: string }
    | { type: "error"; message: string };

  function applySlashCommand(text: string): boolean {
    const match = text.match(/^\/(\S+)\s*(.*)$/);
    if (!match) return false;
    const name = match[1]?.toLowerCase() ?? "";
    const args = (match[2] ?? "").trim();
    if (name === "model" && args) {
      const needle = args.toLowerCase();
      const hits = models.filter(
        (row) =>
          row.selector.toLowerCase() === needle ||
          row.selector.toLowerCase().endsWith(`/${needle}`) ||
          row.name.toLowerCase() === needle ||
          row.selector.toLowerCase().includes(needle),
      );
      if (hits.length === 1 && hits[0]) {
        setModel(hits[0].selector);
        setNotice(`Model → ${hits[0].selector}.`);
      } else if (hits.length > 1) {
        setNotice(`Multiple matches: ${hits.slice(0, 5).map((row) => row.selector).join(", ")} — be more specific.`);
      } else {
        setModel(args);
        setNotice(`Model → ${args} (sent as fuzzy match).`);
      }
      setPrompt("");
      return true;
    }
    if (name === "thinking" && args) {
      if (THINKING_LEVELS.includes(args)) {
        setThinking(args);
        setNotice(`Thinking → ${args}.`);
      } else {
        setNotice(`Thinking levels: ${THINKING_LEVELS.join(" ")}.`);
      }
      setPrompt("");
      return true;
    }
    if (name === "advisor" && (args === "on" || args === "off" || args === "")) {
      setAdvisor(args === "on" || (args === "" && !advisor));
      setNotice(`Advisor ${args === "off" ? "off." : "on."}`);
      setPrompt("");
      return true;
    }
    return false;
  }

  async function openBrowser(dir?: string) {
    setBrowserError(null);
    try {
      const data = await api<{ dir: string; parent: string; entries: Array<{ name: string; path: string; kind: string; size?: number }>; git: { isRepo: boolean; branch?: string; staged: string[]; unstaged: string[]; untracked: string[] } | null }>(
        `/api/omp/files?dir=${encodeURIComponent(dir ?? (cwd || "."))}`,
      );
      setBrowser(data);
      setCwdPicker({ parent: data.parent, dirs: data.entries.filter((e) => e.kind === "dir").map((e) => e.path) });
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : "Could not browse files.");
    }
  }

  async function openDiff(file?: string, staged?: boolean) {
    try {
      const params = new URLSearchParams({ dir: cwd || ".", git: "diff", ...(file ? { file } : {}), ...(staged ? { staged: "1" } : {}) });
      const data = await api<{ diff?: string }>(`/api/omp/files?${params.toString()}`);
      setDiffView(data.diff ?? "(no diff)");
    } catch (error) {
      setDiffView(error instanceof Error ? error.message : "Could not load diff.");
    }
  }

  function attachFile(file: string) {
    setAttached((prev) => (prev.includes(file) ? prev : [...prev.slice(-4), file]));
  }

  async function openCwdPicker(dir?: string) {
    setCwdError(null);
    try {
      const data = await api<{ parent: string; dirs: string[] }>(
        `/api/omp/cwd?dir=${encodeURIComponent(dir ?? cwd)}`,
      );
      setCwdPicker(data);
    } catch (error) {
      setCwdError(error instanceof Error ? error.message : "Could not list directories.");
    }
  }

  async function send() {
    const text = prompt.trim();
    if (!text || sending) {
      if (!text) setNotice("Write a message before sending it.");
      return;
    }
    if (applySlashCommand(text)) return;
    const withFiles = attached.length > 0 ? `${attached.map((f) => `@${f}`).join(" ")} ${text}` : text;
    setAttached([]);
    setNotice(null);
    setSending(true);
    setSlashOpen(false);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: withFiles, cwd };
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    const assistantId = crypto.randomUUID();
    setStreamingText("");
    setLiveTools([]);
    setThinkingPreview("");
    setMessages((current) => [...current, { id: assistantId, role: "assistant", text: "", model, cwd }]);
    try {
      const body: Record<string, unknown> = {
        prompt: withFiles,
        model: model || undefined,
        resume: resume || undefined,
        thinking,
        advisor: advisor || undefined,
        approvalMode: approvalMode || undefined,
        autoApprove: autoApprove || undefined,
        tools: toolsInput.trim() || undefined,
        printThoughts: printThoughts || undefined,
        cwd: cwd || undefined,
      };
      if (runMode === "plan") {
        body["tools"] = "";
        body["approvalMode"] = "always-ask";
      }
      const response = await fetch("/api/omp/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.body) throw new Error(`OMP run failed: ${response.status}.`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let closed = false;
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((row) => row.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as StreamEvent;
          if (event.type === "text") {
            acc += event.delta;
            setStreamingText(acc);
            setMessages((current) => current.map((row) => (row.id === assistantId ? { ...row, text: acc } : row)));
          } else if (event.type === "thinking") {
            setThinkingPreview((prev) => (prev + event.delta).slice(-400));
          } else if (event.type === "tool_start") {
            setLiveTools((prev) => [...prev.slice(-7), { id: crypto.randomUUID(), name: event.name, intent: event.intent, done: false, ok: true, summary: "" }]);
          } else if (event.type === "tool_end") {
            setLiveTools((prev) => {
              const next = [...prev];
              const open = [...next].reverse().find((tool) => tool.name === event.name && !tool.done);
              if (open) {
                open.done = true;
                open.ok = event.ok;
                open.summary = event.summary;
              }
              return next;
            });
          } else if (event.type === "done") {
            closed = true;
            if (event.sessionId) setResume(event.sessionId);
            if (!acc && event.text) {
              acc = event.text;
              setMessages((current) => current.map((row) => (row.id === assistantId ? { ...row, text: acc } : row)));
            }
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
      setMessages((current) =>
        current.map((row) =>
          row.id === assistantId
            ? { ...row, text: acc || "(no text — see tool activity)", tools: liveToolsSnapshot() }
            : row,
        ),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "OMP could not answer.");
      setMessages((current) => current.filter((row) => row.id !== assistantId || row.text));
    } finally {
      setSending(false);
      setStreamingText("");
      setLiveTools([]);
      setThinkingPreview("");
    }
  }

  function liveToolsSnapshot() {
    return liveToolsRef.current;
  }

  function fresh() {
    setMessages(initialMessages);
    setPrompt("");
    setNotice(null);
    setResume("");
  }

  async function searchModels() {
    setModelsError(null);
    try {
      const data = await api<{ models?: OmpModel[] }>(
        modelQuery.trim() ? `/api/omp/models?q=${encodeURIComponent(modelQuery.trim())}` : "/api/omp/models",
      );
      setModels(data.models ?? []);
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : "Model search failed.");
    }
  }

  async function toggleGateway() {
    setGatewayBusy(true);
    try {
      const action = localGateway?.running ? "stop" : "start";
      const data = await api<LocalGateway>("/api/omp/gateway/local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setLocalGateway(data);
      setGatewayInfo(null);
      const remote = await api<GatewayState>("/api/omp/gateway");
      setGatewayInfo(remote);
    } catch (error) {
      setLocalGateway((prev) => ({ running: prev?.running ?? false, url: prev?.url ?? null, managed: false, error: error instanceof Error ? error.message : "Gateway action failed." }));
    } finally {
      setGatewayBusy(false);
    }
  }

  async function refreshModels() {
    setModelsError(null);
    try {
      const data = await api<{ models?: OmpModel[] }>("/api/omp/models?refresh=1");
      setModels(data.models ?? []);
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : "Model refresh failed.");
    }
  }

  async function sessionAction(action: "export" | "share", id: string) {
    setSessionResult(null);
    try {
      const data = await api<{ path?: string; url?: string; result?: string }>("/api/omp/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      setSessionResult(data.path ? `Exported to ${data.path}` : (data.url ?? data.result ?? "Done."));
    } catch (error) {
      setSessionResult(error instanceof Error ? error.message : "Session action failed.");
    }
  }

  async function pluginAction(action: "install" | "uninstall" | "enable" | "disable" | "upgrade", name: string) {
    setPluginsMsg(null);
    try {
      const data = await api<{ result?: string }>("/api/omp/plugins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, name, scope: pluginScope }),
      });
      setPluginsMsg(data.result || `${action} ${name}: ok`);
      const listed = await api<PluginList>("/api/omp/plugins");
      setPlugins(listed);
    } catch (error) {
      setPluginsMsg(error instanceof Error ? error.message : "Plugin action failed.");
    }
  }

  async function discover(query?: string) {
    setMarketError(null);
    try {
      const q = (query ?? marketQuery).trim();
      const data = await api<{ marketplace?: unknown }>(
        `/api/omp/plugins?discover=${encodeURIComponent(q)}`,
      );
      setMarket(data.marketplace ?? null);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "Marketplace lookup failed.");
    }
  }

  async function toggleSkill(name: string, enabled: boolean) {
    setSkillsMsg(null);
    try {
      await api("/api/omp/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, enabled }),
      });
      setSkillsMsg(`${name} ${enabled ? "enabled" : "disabled"}.`);
      const data = await api<{ skills?: SkillRow[] }>("/api/omp/skills");
      setSkills(data.skills ?? []);
    } catch (error) {
      setSkillsMsg(error instanceof Error ? error.message : "Skill toggle failed.");
    }
  }

  async function setConfigKey(key: string, value: string) {
    setConfigMsg(null);
    try {
      const data = await api<{ key?: string; value?: unknown }>("/api/omp/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      setConfigMsg(`${data.key ?? key} = ${displayValue(data.value)}.`);
      const listed = await api<{ groups?: ConfigGroups }>("/api/omp/config");
      setConfigGroups(listed.groups ?? {});
    } catch (error) {
      setConfigMsg(error instanceof Error ? error.message : "Config set failed.");
    }
  }

  const grouped = new Map<string, OmpModel[]>();
  for (const row of models.slice(0, 400)) {
    const list = grouped.get(row.provider) ?? [];
    list.push(row);
    grouped.set(row.provider, list);
  }

  const pluginRows: Array<{ name: string; scope: string; version: string }> = [];
  if (plugins) {
    for (const list of [asArray(plugins.npm), asArray(plugins.marketplace)]) {
      for (const raw of list) {
        const rec = asRecord(raw);
        if (!rec) continue;
        const name = asString(rec["id"]) || asString(rec["name"]) || "?";
        const items = Array.isArray(rec["entries"]) ? rec["entries"] : [raw];
        for (const item of items) {
          const entry = asRecord(item);
          if (!entry) continue;
          pluginRows.push({
            name,
            scope: asString(entry["scope"]) || asString(rec["scope"]) || "?",
            version: asString(entry["version"]) || "?",
          });
        }
      }
    }
  }

  const usageLimits: Array<{ label: string; provider: string; window: string; pct: number; status: string; remaining: string; resets: string }> = [];
  for (const report of usage?.reports ?? []) {
    const provider = asString(report.provider) || "?";
    for (const limit of report.limits ?? []) {
      const frac = limit.amount?.usedFraction;
      if (typeof frac === "number") {
        const remainingFrac = limit.amount?.remainingFraction;
        const resetsAt = limit.window?.resetsAt;
        usageLimits.push({
          label: `${provider} · ${asString(limit.label) || asString(limit.id) || "limit"}`,
          provider,
          window: asString(limit.label) || asString(limit.window?.label) || asString(limit.id) || "limit",
          pct: Math.round(frac * 100),
          status: asString(limit.status) || "ok",
          remaining: typeof remainingFrac === "number" ? `${Math.round(remainingFrac * 100)}%` : "—",
          resets: typeof resetsAt === "number" ? formatReset(resetsAt) : "",
        });
      }
    }
  }

  const started = messages.length > 1 || sending;
  const empty = panel === "chat" && !started;
  const slashQuery = prompt.startsWith("/") ? prompt.slice(1).split(/\s/)[0]?.toLowerCase() ?? "" : "";
  const slashMatches =
    prompt.startsWith("/") && slashQuery.length > 0
      ? [
          ...SLASH_COMMANDS.filter((entry) => entry.name.slice(1).startsWith(slashQuery)),
          ...SLASH_COMMANDS.filter(
            (entry) => !entry.name.slice(1).startsWith(slashQuery) && (entry.name.includes(slashQuery) || entry.detail.toLowerCase().includes(slashQuery)),
          ),
        ].slice(0, 10)
      : prompt === "/"
        ? SLASH_COMMANDS.slice(0, 10)
        : [];
  const composer = (
    <form
      className="composer"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {notice && (
        <p className="inline-alert" role="alert">
          {notice}
        </p>
      )}
      <button
        type="button"
        className="composer-cwd"
        onClick={() => void openBrowser()}
        title="Working directory — click to change"
      >
        <span aria-hidden="true">📁</span> {cwd || "…"}
        {cwdError ? ` · ${cwdError}` : ""}
      </button>
      {(cwdPicker || browser) && (
        <div className="prompt-box file-browser" role="dialog" aria-label="File browser">
          <b>{browser?.dir ?? cwd}</b>
          <div className="row-actions">
            <button
              type="button"
              className="primary"
              disabled={!browser?.dir || browser.dir === cwd}
              onClick={() => { if (browser?.dir) { setCwd(browser.dir); setCwdPicker(null); setBrowser(null); setDiffView(null); } }}
              title="Work in the folder shown above"
            >
              ✓ Use this folder
            </button>
          </div>
          {browser?.git?.isRepo && (
            <small> · {browser.git.branch} · {browser.git.unstaged.length + browser.git.staged.length} changed</small>
          )}
          <div className="browser-entries">
            <button type="button" onClick={() => { const parent = browser?.parent ?? cwdPicker?.parent; if (parent) void openBrowser(parent); }}>
              ↑ parent
            </button>
            {(browser?.entries ?? []).slice(0, 40).map((entry) => (
              entry.kind === "dir" ? (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => void openBrowser(entry.path)}
                  title={entry.path}
                >
                  📁 {entry.name}
                </button>
              ) : (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => attachFile(entry.path)}
                  title={`Attach ${entry.path}`}
                >
                  📄 {entry.name}
                </button>
              )
            ))}
          </div>
          {browser?.git?.isRepo && (browser.git.unstaged.length > 0 || browser.git.staged.length > 0 || browser.git.untracked.length > 0) && (
            <div className="git-panel">
              <b>git {browser.git.branch}</b>
              {browser.git.unstaged.slice(0, 8).map((file) => (
                <div key={file} className="git-row">
                  <span>M {file}</span>
                  <button type="button" onClick={() => void openDiff(file, false)}>diff</button>
                  <button type="button" onClick={() => attachFile(`${cwd}/${file}`)}>attach</button>
                </div>
              ))}
              {browser.git.untracked.slice(0, 8).map((file) => (
                <div key={file} className="git-row">
                  <span>? {file}</span>
                  <button type="button" onClick={() => attachFile(`${cwd}/${file}`)}>attach</button>
                </div>
              ))}
              <div className="row-actions">
                <button type="button" onClick={() => void openDiff(undefined, false)}>full diff --stat</button>
              </div>
            </div>
          )}
          {browserError && <small>{browserError}</small>}
          {diffView && (
            <pre className="diff-view">{diffView.slice(0, 4000)}</pre>
          )}
          <form
            className="row-actions"
            onSubmit={(event) => { event.preventDefault(); const input = new FormData(event.currentTarget).get("path"); if (typeof input === "string" && input.trim()) void openBrowser(input.trim()); }}
          >
            <input name="path" className="model-select" placeholder="/home/user/project…" aria-label="Go to path" style={{ flex: 1 }} />
            <button type="submit">Go</button>
          </form>
          <div className="prompt-actions">
            <button type="button" onClick={() => { setCwdPicker(null); setBrowser(null); setDiffView(null); }}>
              Close
            </button>
          </div>
        </div>
      )}
      {attached.length > 0 && (
        <div className="attached-chips">
          {attached.map((file) => (
            <span key={file} className="attached-chip" title={file}>
              📎 {file.split("/").pop()}
              <button type="button" aria-label={`Remove ${file}`} onClick={() => setAttached((prev) => prev.filter((f) => f !== file))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-box">
        <label className="sr-only" htmlFor="prompt">
          Message Oh My P(i)
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => {
            const next = event.target.value;
            setPrompt(next);
            const isSlash = next.startsWith("/");
            setSlashOpen(isSlash);
            setSlashIndex(0);
          }}
          onKeyDown={(event) => {
            if (slashOpen && slashMatches.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setSlashIndex((prev) => (event.key === "ArrowDown" ? (prev + 1) % slashMatches.length : (prev - 1 + slashMatches.length) % slashMatches.length));
            } else if (slashOpen && slashMatches.length > 0 && event.key === "Tab") {
              event.preventDefault();
              const pick = slashMatches[slashIndex];
              if (pick) setPrompt(`${pick.name} `);
              setSlashOpen(false);
            } else if (slashOpen && slashMatches.length > 0 && event.key === "Enter" && !event.shiftKey && slashMatches[slashIndex] && prompt.trim() === slashMatches[slashIndex]?.name) {
              event.preventDefault();
              setPrompt(`${slashMatches[slashIndex]?.name} `);
              setSlashOpen(false);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            } else if (event.key === "Escape") {
              setSlashOpen(false);
              setCwdPicker(null);
              setBrowser(null);
              setDiffView(null);
            }
          }}
          placeholder="How can I help you today? Try / for commands."
          rows={2}
        />
        {slashOpen && slashMatches.length > 0 && (
          <div className="slash-menu" role="listbox" aria-label="Slash commands">
            {(() => {
              const groups = new Map<string, Array<{ entry: (typeof slashMatches)[number]; index: number }>>();
              slashMatches.forEach((entry, index) => {
                const cat = slashCat(entry.name);
                const list = groups.get(cat) ?? [];
                list.push({ entry, index });
                groups.set(cat, list);
              });
              return [...groups.entries()].map(([cat, items]) => (
                <div key={cat} className="slash-group">
                  <div className="slash-group-label">{cat}</div>
                  {items.map(({ entry, index }) => (
                    <button
                      key={entry.name}
                      type="button"
                      role="option"
                      aria-selected={index === slashIndex}
                      className={index === slashIndex ? "slash-item active" : "slash-item"}
                      onMouseEnter={() => setSlashIndex(index)}
                      onClick={() => { setPrompt(`${entry.name} `); setSlashOpen(false); }}
                    >
                      <b>{entry.name}</b> <span>{entry.hint}</span>
                      <small>{entry.detail}</small>
                    </button>
                  ))}
                </div>
              ));
            })()}
          </div>
        )}
        {(streamingText || liveTools.length > 0 || thinkingPreview) && (
          <div className="tool-card" data-state="in-progress" aria-live="polite">
            <div className="tool-head">
              <span className="gold-label">agent working{thinkingPreview ? ` · ${thinkingPreview.slice(-80)}` : ""}</span>
              <span>{liveTools.filter((tool) => tool.done).length}/{liveTools.length} tools</span>
            </div>
            {liveTools.slice(-5).map((tool) => (
              <div key={tool.id}>
                {tool.done ? (tool.ok ? "✓" : "✗") : "…"} {tool.name}{tool.intent ? ` — ${tool.intent}` : ""}{tool.summary ? ` · ${tool.summary}` : ""}
              </div>
            ))}
          </div>
        )}
        <div className="composer-actions">
          <div className="composer-tools">
            <label className="sr-only" htmlFor="composer-model">Model</label>
            <select
              id="composer-model"
              className="composer-tool composer-select"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              title={model || "Model"}
            >
              {models.length === 0 && <option value="">model…</option>}
              {[...grouped.entries()].slice(0, 40).map(([provider, rows]) => (
                <optgroup key={provider || "?"} label={provider || "?"}>
                  {rows.slice(0, 30).map((row) => (
                    <option key={row.selector} value={row.selector} title={row.selector}>
                      {row.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <label className="sr-only" htmlFor="composer-thinking">Thinking</label>
            <select
              id="composer-thinking"
              className="composer-tool composer-select"
              value={thinking}
              onChange={(event) => setThinking(event.target.value)}
              title="Thinking level"
            >
              {THINKING_LEVELS.map((level) => (
                <option key={level} value={level}>
                  ◒ {level}
                </option>
              ))}
            </select>
            <div className="composer-tool-group" role="group" aria-label="Run mode">
              {RUN_MODES.map((entry) => (
                <button
                  key={entry.id || "agent"}
                  type="button"
                  className="composer-tool"
                  aria-pressed={runMode === entry.id}
                  title={entry.hint}
                  onClick={() => setRunMode(runMode === entry.id ? "" : entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="composer-tool"
              aria-pressed={advisor}
              title="Advisor reviews each turn"
              onClick={() => setAdvisor((v) => !v)}
            >
              Advisor
            </button>
            <button
              type="button"
              className="composer-tool"
              aria-pressed={autoApprove}
              title="Auto-approve tool calls"
              onClick={() => setAutoApprove((v) => !v)}
            >
              Auto
            </button>
          </div>
          <button className="send" type="submit" disabled={sending || !prompt.trim()} aria-label="Send">
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <main className="chat-shell">
      <aside className="switchboard" aria-label="OMP controls">
        <a className="brand" href="#chat" aria-label="OMP home">
          <span className="brand-sigil">⬢</span>
          <span>Oh My P(i)</span>
        </a>
        <button className="new-chat" type="button" onClick={fresh} title="Start fresh (Ctrl+K)">
          <span aria-hidden="true">＋</span> New chat <kbd>⌃K</kbd>
        </button>

        <nav className="tool-picker" aria-label="Panels">
          <div className="harness-list">
            {PANELS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === panel ? "harness active" : "harness"}
                onClick={() => setPanel(item.id)}
                aria-current={item.id === panel ? "page" : undefined}
              >
                <span className="harness-mark" aria-hidden="true">
                  {item.mark}
                </span>
                <span>
                  <b>{item.label}</b>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <section className="harness-picker" aria-labelledby="model-heading">
          <h2 id="model-heading">Model · {models.length || "…"}</h2>
          <p className="model-hint">
            Pick model + thinking in the composer below.
            {(gateway || modelsError) && (
              <>
                {" "}
                {gateway?.url ? (gateway.reachable ? "gateway reachable" : "gateway offline") : "gateway not configured"}
                {modelsError ? <> · {modelsError}</> : null}
              </>
            )}
          </p>
        </section>

        <section className="tool-picker" aria-labelledby="run-heading">
          <h2 id="run-heading">Defaults</h2>
          <p className="model-hint">
            Advisor {advisor ? "on" : "off"} · auto-approve {autoApprove ? "on" : "off"} · approval {approvalMode || "default"}.
            Toggle per message in the composer.
          </p>
        </section>

        <section className="tool-picker" aria-labelledby="about-heading">
          <h2 id="about-heading">Local · omp {ompVersion}</h2>
          <p className="model-hint">
            Chat runs through your local omp binary; broker credentials never reach the browser.
          </p>
        </section>
      </aside>

      <section className={empty ? "chat-stage chat-empty" : "chat-stage"} id="chat" aria-label="OMP conversation">
        <header className="route-header">
          <span>Free plan</span>
          <span aria-hidden="true">·</span>
          <a className="upgrade-link" href="#chat" onClick={(event) => { event.preventDefault(); setPanel("usage"); }}>
            Usage
          </a>
          <span className="gateway-dot" data-ok={gateway ? String(gateway.reachable) : "false"}>
            <i aria-hidden="true" />
            {gateway?.url ? (gateway.reachable ? "gateway reachable" : "offline") : "gateway not configured"}
          </span>
        </header>
        {empty ? (
          <div className="conversation conversation-empty" aria-live="polite">
            <div className="conversation-intro">
              <h1>{greeting()}</h1>
              <p className="intro-detail">Local omp · {shortModel(model)}{thinking !== "auto" ? ` · ${thinking}` : ""}</p>
              {resume && (
                <div className="prompt-box" role="status">
                  Continuing session <code>{resume}</code>.
                  <div className="prompt-actions">
                    <button type="button" onClick={() => setResume("")}>
                      Forget session
                    </button>
                  </div>
                </div>
              )}
            </div>
            {composer}
          </div>
        ) : (
          <>
            {panel === "chat" && (
              <div className="conversation" aria-live="polite">
                {resume && (
                  <div className="prompt-box" role="status">
                    Continuing session <code>{resume}</code>.
                    <div className="prompt-actions">
                      <button type="button" onClick={() => setResume("")}>
                        Forget session
                      </button>
                    </div>
                  </div>
                )}
                <ol className="message-list" ref={listRef}>
                  {messages.map((message) => (
                    <li className={`message message-${message.role}`} key={message.id}>
                      {message.role === "assistant" && (
                        <span className="harness-mark" aria-hidden="true">
                          ⬢
                        </span>
                      )}
                      <div>
                        {message.role !== "system" && (
                          <p className="message-author">
                            {message.role === "assistant" ? "Oh My P(i)" : "You"}
                            {message.cwd ? <span> · {message.cwd.split("/").pop()}</span> : null}
                          </p>
                        )}
                        <p>{message.text}</p>
                        {message.tools && message.tools.length > 0 && (
                          <div className="tool-card" data-state="done">
                            <div className="tool-head">
                              <span className="gold-label">tool activity</span>
                              <span>{message.tools.filter((tool) => tool.done).length}/{message.tools.length}</span>
                            </div>
                            {message.tools.map((tool) => (
                              <div key={tool.id}>
                                {tool.done ? (tool.ok ? "✓" : "✗") : "…"} {tool.name}
                                {tool.intent ? ` — ${tool.intent}` : ""}
                                {tool.summary ? ` · ${tool.summary}` : ""}
                              </div>
                            ))}
                          </div>
                        )}
                        {message.role === "assistant" && message.model && (
                          <p className="model-sublabel">{message.model}</p>
                        )}
                        {message.role === "assistant" && message.text && (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="copy-btn"
                              onClick={() => void navigator.clipboard.writeText(message.text).catch(() => setNotice("Copy failed — select the text manually."))}
                            >
                              Copy
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                  {sending && streamingText === "" && liveTools.length === 0 && (
                    <li className="message message-assistant" aria-label="Waiting for reply">
                      <span className="harness-mark" aria-hidden="true">
                        ⬢
                      </span>
                      <div>
                        <p className="message-author">Oh My P(i)</p>
                        <p>Working…</p>
                      </div>
                    </li>
                  )}
                </ol>
              </div>
            )}
          </>
        )}
        {panel === "models" && (
          <div className="conversation" aria-label="Models panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>Models</strong>.
              </p>
              <h1>Pick a model.</h1>
              <p className="intro-detail">Grouped by provider. Role shortcuts resolve via modelRoles.</p>
            </div>
            {modelsError && (
              <div className="alert-box" role="alert">
                {modelsError}
              </div>
            )}
            <div className="panel-actions">
              <input
                className="model-select"
                style={{ maxWidth: 260 }}
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder="find pattern, e.g. glm"
                aria-label="Find models"
              />
              <button type="button" onClick={() => void searchModels()}>
                Find
              </button>
              <button type="button" onClick={() => void refreshModels()}>
                Refresh ⟲
              </button>
              {(["default", "smol", "slow", "plan"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  title={modelRoles[role] ?? "role mapping not loaded"}
                  onClick={() => {
                    const mapped = modelRoles[role];
                    if (mapped) setModel(mapped);
                    else setNotice(`No modelRoles mapping for "${role}" — load Settings first.`);
                  }}
                >
                  {role}
                </button>
              ))}
            </div>
            <div className="panel-list">
              {models.slice(0, 200).map((row) => (
                <div className="panel-row" key={row.selector}>
                  <b>{row.name}</b>
                  <code>
                    {row.selector} · {row.provider}
                  </code>
                  <div className="row-actions">
                    <button type="button" onClick={() => setModel(row.selector)} disabled={model === row.selector}>
                      {model === row.selector ? "Selected" : "Select"}
                    </button>
                  </div>
                </div>
              ))}
              {models.length === 0 && (
                <div className="panel-row">
                  <b>No models loaded.</b>
                  <small>Use Find or Refresh, or check the route error above.</small>
                </div>
              )}
            </div>
          </div>
        )}

        {panel === "sessions" && (
          <div className="conversation" aria-label="Sessions panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>Sessions</strong>.
              </p>
              <h1>Past runs.</h1>
              <p className="intro-detail">Newest first, from the local sessions dir.</p>
            </div>
            {sessionsError && (
              <div className="alert-box" role="alert">
                {sessionsError}
              </div>
            )}
            {sessionsNote && (
              <div className="alert-box" data-tone="info" role="status">
                {sessionsNote}
              </div>
            )}
            {sessionResult && (
              <div className="prompt-box" role="status">
                {sessionResult}
              </div>
            )}
            <div className="panel-list">
              {sessions.map((session) => (
                <div className="panel-row session-row" key={session.id}>
                  <div>
                    <b>{session.title}</b>
                    <code>{session.id}</code>
                  </div>
                  <time>{session.updatedAt}</time>
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setResume(session.id);
                        setPanel("chat");
                      }}
                    >
                      Continue
                    </button>
                    <button type="button" onClick={() => void sessionAction("export", session.id)}>
                      Export
                    </button>
                    <button type="button" onClick={() => void sessionAction("share", session.id)}>
                      Share
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {panel === "tools" && (
          <div className="conversation" aria-label="Tools panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>Tools &amp; approvals</strong>.
              </p>
              <h1>Guard the run.</h1>
              <p className="intro-detail">Approval choices attach to every chat send.</p>
            </div>
            <div className="tool-card" data-state="done">
              <div className="tool-head">
                <span className="gold-label">approval mode</span>
                <span>{approvalMode || "omp default"}</span>
              </div>
              <div className="row-actions panel-actions" role="radiogroup" aria-label="Approval mode">
                <button type="button" onClick={() => setApprovalMode("")} disabled={approvalMode === ""}>
                  default
                </button>
                {APPROVAL_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setApprovalMode(m)}
                    disabled={approvalMode === m}
                    aria-pressed={approvalMode === m}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <label className="tool-option">
                <input
                  type="checkbox"
                  checked={autoApprove}
                  onChange={(event) => setAutoApprove(event.target.checked)}
                />
                <span>
                  <b>Auto-approve all tool calls</b>
                  <small>Sends --auto-approve with chat</small>
                </span>
              </label>
              <label className="tool-option">
                <input
                  type="checkbox"
                  checked={printThoughts}
                  onChange={(event) => setPrintThoughts(event.target.checked)}
                />
                <span>
                  <b>Print thoughts</b>
                  <small>Include thinking blocks in print output</small>
                </span>
              </label>
              <div className="panel-form">
                <label htmlFor="tools-filter">Tool filter (comma list, empty = all)</label>
                <input
                  id="tools-filter"
                  value={toolsInput}
                  onChange={(event) => setToolsInput(event.target.value)}
                  placeholder="read,bash,edit,grep"
                />
              </div>
            </div>
            <h2 className="gold-label">Processes · worktrees · collab</h2>
            {opsNote && (
              <div className="alert-box" data-tone="info" role="status">
                {opsNote}
              </div>
            )}
            {ops?.error ? (
              <div className="alert-box" role="alert">
                {ops.error}
              </div>
            ) : ops ? (
              <div className="tool-card" data-state="done" style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify({ processes: ops.processes, worktrees: ops.worktrees, collab: ops.collab }, null, 2)}
              </div>
            ) : (
              <div className="panel-row">
                <b>Loading ops…</b>
              </div>
            )}
          </div>
        )}

        {panel === "gateway" && (
          <div className="conversation" aria-label="Gateway panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>Gateway &amp; broker</strong>.
              </p>
              <h1>Reachability.</h1>
              <p className="intro-detail">Credentials stay server-side; only presence is shown.</p>
            </div>
            <div className="panel-list">
              <div className="panel-row">
                <b>Local gateway {localGateway?.running ? "· running" : "· stopped"}</b>
                <code>{localGateway?.url ?? "http://127.0.0.1:4000"}{localGateway?.pid ? ` · pid ${localGateway.pid}` : ""}</code>
                {localGateway?.error && <small>{localGateway.error}</small>}
                <small>Spawns `omp auth-gateway serve` on loopback. Needs a configured broker or it exits.</small>
                <div className="row-actions">
                  <button type="button" disabled={gatewayBusy} onClick={() => void toggleGateway()}>
                    {gatewayBusy ? "Working…" : localGateway?.running ? "Stop gateway" : "Start gateway"}
                  </button>
                </div>
              </div>
              <div className="panel-row">
                <b>Gateway</b>
                <code>{gateway?.url ?? "not configured"}</code>
                <small>{gateway?.reachable ? "reachable" : "offline"}</small>
              </div>
              <div className="panel-row">
                <b>Broker</b>
                <code>
                  {broker ? (broker.configured ? `configured · ${broker.accounts} account(s)` : "not configured") : "—"}
                </code>
                <small>auth-broker holds credentials locally; browser never sees tokens</small>
              </div>
              {gatewayInfo?.error ? (
                <div className="alert-box" role="alert">
                  {gatewayInfo.error}
                </div>
              ) : (
                gatewayInfo && (
                  <div className="panel-row">
                    <b>Gateway models</b>
                    <code>
                      {gatewayInfo.models?.count ?? 0} models
                      {(gatewayInfo.models?.ids ?? []).length > 0 &&
                        ` · ${(gatewayInfo.models?.ids ?? []).join(", ")}`}
                    </code>
                    {gatewayInfo.note && <small>{gatewayInfo.note}</small>}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {panel === "usage" && (
          <div className="conversation" aria-label="Usage panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>Usage</strong>.
              </p>
              <h1>How much fuel is left.</h1>
              <p className="intro-detail">Live from <code>omp usage</code> — resets count down in plain words.</p>
            </div>
            {usageError && (
              <div className="alert-box" role="alert">
                {usageError}
              </div>
            )}
            <div className="panel-list">
              {usageLimits.map((limit) => (
                <div className="panel-row usage-card" key={limit.label} data-status={limit.pct > 90 ? "crit" : limit.pct > 70 ? "warn" : "ok"}>
                  <div className="usage-top">
                    <b>{limit.provider}</b>
                    <span className="usage-badge">{limit.status === "ok" ? "healthy" : limit.status}</span>
                  </div>
                  <div className="usage-title">{limit.window}</div>
                  <div
                    className="usage-meter"
                    data-status={limit.pct > 90 ? "crit" : limit.pct > 70 ? "warn" : "ok"}
                    role="img"
                    aria-label={`${limit.label}: ${limit.pct}% used, ${limit.remaining}`}
                  >
                    <i style={{ width: `${Math.min(100, limit.pct)}%` }} />
                  </div>
                  <div className="usage-meta">
                    <span><b>{limit.pct}%</b> used · {limit.remaining} left</span>
                    <span>{limit.resets}</span>
                  </div>
                </div>
              ))}
              {!usage && !usageError && (
                <div className="panel-row">
                  <b>Loading usage…</b>
                </div>
              )}
            </div>
          </div>
        )}

        {panel === "mcp" && (
          <div className="conversation" aria-label="MCP panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>MCP</strong>.
              </p>
              <h1>Servers.</h1>
              <p className="intro-detail">mcp.json plus every installed plugin recipe.</p>
            </div>
            {mcpError && (
              <div className="alert-box" role="alert">
                {mcpError}
              </div>
            )}
            <div className="alert-box" data-tone="info" role="status">
              MCP edits are read-only in this build. Edit ~/.omp/agent/mcp.json directly, then reload this panel.
            </div>
            <div className="panel-list">
              {mcp &&
                Object.entries(mcp).map(([name, server]) => (
                  <div className="panel-row" key={name}>
                    <b>{name}</b>
                    <code>
                      {asString(server.type) || asString(server.command) || "?"} · {asString(server.command) || "?"}{" "}
                      {Array.isArray(server.args) ? server.args.map((arg) => String(arg)).join(" ") : ""}
                    </code>
                    {asString(server.cwd) && <small>cwd: {asString(server.cwd)}</small>}
                    {asString(server.description) && <small>{asString(server.description)}</small>}
                    {asString(server.source) && <small>source: {asString(server.source)}</small>}
                  </div>
                ))}
              {mcp && Object.keys(mcp).length === 0 && (
                <div className="panel-row">
                  <b>No MCP servers configured.</b>
                </div>
              )}
            </div>
          </div>
        )}

        {panel === "plugins" && (
          <div className="conversation" aria-label="Plugins panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>Plugins</strong>.
              </p>
              <h1>Extensions.</h1>
              <p className="intro-detail">Install, enable, disable, upgrade — failures print stderr verbatim.</p>
            </div>
            {pluginsError && (
              <div className="alert-box" role="alert">
                {pluginsError}
              </div>
            )}
            {pluginsMsg && (
              <div className="prompt-box" role="status">
                {pluginsMsg}
              </div>
            )}
            <div className="panel-actions">
              <input
                className="model-select"
                style={{ maxWidth: 280 }}
                value={pluginName}
                onChange={(event) => setPluginName(event.target.value)}
                placeholder="plugin id, e.g. foo@marketplace"
                aria-label="Plugin name"
              />
              <select
                className="model-select"
                style={{ maxWidth: 120 }}
                value={pluginScope}
                onChange={(event) => setPluginScope(event.target.value as "user" | "project")}
                aria-label="Plugin scope"
              >
                <option value="user">user</option>
                <option value="project">project</option>
              </select>
              <button type="button" onClick={() => pluginName.trim() && void pluginAction("install", pluginName.trim())}>
                Install
              </button>
            </div>
            <div className="panel-list">
              {pluginRows.map((row) => (
                <div className="panel-row" key={`${row.name}:${row.scope}`}>
                  <b>{row.name}</b>
                  <code>
                    {row.version} · {row.scope}
                  </code>
                  <div className="row-actions">
                    <button type="button" onClick={() => void pluginAction("enable", row.name)}>
                      Enable
                    </button>
                    <button type="button" onClick={() => void pluginAction("disable", row.name)}>
                      Disable
                    </button>
                    <button type="button" onClick={() => void pluginAction("upgrade", row.name)}>
                      Upgrade
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void pluginAction("uninstall", row.name)}
                    >
                      Uninstall
                    </button>
                  </div>
                </div>
              ))}
              {pluginRows.length === 0 && !pluginsError && (
                <div className="panel-row">
                  <b>No plugins installed.</b>
                </div>
              )}
            </div>
            <h2 className="gold-label">Marketplace</h2>
            <div className="panel-actions">
              <input
                className="model-select"
                style={{ maxWidth: 260 }}
                value={marketQuery}
                onChange={(event) => setMarketQuery(event.target.value)}
                placeholder="marketplace or plugin name"
                aria-label="Marketplace query"
              />
              <button type="button" onClick={() => void discover()}>
                Discover
              </button>
              <button
                type="button"
                title="Browse fedoragobrowse-design/agent-hub-marketplace"
                onClick={() => { setMarketQuery("agent-hub"); void discover("agent-hub"); }}
              >
                Agent Hub ★
              </button>
            </div>
            {[
              { name: "chess-muserelf", blurb: "Local chess vs muserelf engine." },
              { name: "fritzing", blurb: "Fritzing .fzz + custom parts via fz CLI." },
              { name: "pico", blurb: "Pico over USB: REPL, sync, flash." },
              { name: "kicad", blurb: "KiCad schematics, PCBs, ERC/DRC." },
            ].map((entry) => (
              <div className="panel-row" key={entry.name}>
                <b>{entry.name}@agent-hub</b>
                <small>{entry.blurb}</small>
                <div className="row-actions">
                  <button type="button" onClick={() => void pluginAction("install", `${entry.name}@agent-hub`)}>
                    Install
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {panel === "skills" && (
          <div className="conversation" aria-label="Skills panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>Skills</strong>.
              </p>
              <h1>Curator.</h1>
              <p className="intro-detail">Toggle via skills.ignoredSkills. Rules: {rulesEnabled ? "on" : "off"}.</p>
            </div>
            {skillsError && (
              <div className="alert-box" role="alert">
                {skillsError}
              </div>
            )}
            {skillsMsg && (
              <div className="prompt-box" role="status">
                {skillsMsg}
              </div>
            )}
            <div className="panel-list">
              {skills.map((skill) => (
                <div className="panel-row" key={skill.name}>
                  <b>{skill.name}</b>
                  <small>{skill.description || "no description"}</small>
                  <code>
                    {skill.source} · {skill.path}
                  </code>
                  <div className="row-actions">
                    <button type="button" onClick={() => void toggleSkill(skill.name, true)}>
                      Enable
                    </button>
                    <button type="button" onClick={() => void toggleSkill(skill.name, false)}>
                      Disable
                    </button>
                  </div>
                </div>
              ))}
              {skills.length === 0 && !skillsError && (
                <div className="panel-row">
                  <b>No skills found.</b>
                </div>
              )}
            </div>
          </div>
        )}

        {panel === "settings" && (
          <div className="conversation" aria-label="Settings panel">
            <div className="conversation-intro">
              <p>
                Working with <strong>Settings</strong>.
              </p>
              <h1>OMP config.</h1>
              <p className="intro-detail">Everyday controls up top; every raw key under Advanced.</p>
            </div>
            <div className="panel-actions" role="tablist" aria-label="Settings view">
              <button type="button" role="tab" aria-selected={settingsTab === "friendly"} onClick={() => setSettingsTab("friendly")} disabled={settingsTab === "friendly"}>
                Friendly
              </button>
              <button type="button" role="tab" aria-selected={settingsTab === "advanced"} onClick={() => setSettingsTab("advanced")} disabled={settingsTab === "advanced"}>
                Advanced
              </button>
            </div>
            {configError && (
              <div className="alert-box" role="alert">
                {configError}
              </div>
            )}
            {configMsg && (
              <div className="prompt-box" role="status">
                {configMsg}
              </div>
            )}
            {settingsTab === "friendly" && configGroups && (
              <FriendlySettings groups={configGroups} onSet={(key, value) => void setConfigKey(key, value)} />
            )}
            {settingsTab === "advanced" && configGroups &&
              Object.entries(configGroups).map(([group, entries]) => (
                <section key={group} aria-label={`${group} settings`}>
                  <h2 className="gold-label">{group}</h2>
                  <div className="panel-list">
                    {Object.entries(entries).map(([key, entry]) => {
                      const masked = entry.value === "********";
                      const readonly = group === "internal" || masked;
                      const current = displayValue(entry.value);
                      const draft = edits[key] ?? current;
                      return (
                        <div className="panel-row" key={key}>
                          <b>{key}</b>
                          {masked ? (
                            <code>********</code>
                          ) : entry.type === "boolean" ? (
                            <label className="tool-option">
                              <input
                                type="checkbox"
                                checked={entry.value === true}
                                disabled={readonly}
                                onChange={(event) =>
                                  void setConfigKey(key, event.target.checked ? "true" : "false")
                                }
                              />
                              <span>
                                <small>{entry.value === true ? "true" : "false"}</small>
                              </span>
                            </label>
                          ) : entry.type === "enum" && entry.options ? (
                            <select
                              className="model-select"
                              value={typeof entry.value === "string" ? entry.value : current}
                              disabled={readonly}
                              onChange={(event) => void setConfigKey(key, event.target.value)}
                              aria-label={key}
                            >
                              {entry.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <div className="row-actions">
                                <input
                                  className="model-select"
                                  value={draft}
                                  disabled={readonly}
                                  onChange={(event) =>
                                    setEdits((prev) => ({ ...prev, [key]: event.target.value }))
                                  }
                                  aria-label={key}
                                />
                                <button
                                  type="button"
                                  disabled={readonly || draft === current}
                                  onClick={() => void setConfigKey(key, draft)}
                                >
                                  Set
                                </button>
                              </div>
                              <small>type: {entry.type}</small>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
          </div>
        )}

        {panel === "chat" && !empty && composer}
      </section>
    </main>
  );
}
