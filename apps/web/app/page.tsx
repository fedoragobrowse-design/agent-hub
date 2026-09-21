"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  text: string;
  model?: string;
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

type McpServer = { type?: unknown; command?: unknown; args?: unknown; cwd?: unknown };
type SkillRow = { name: string; description: string; path: string; source: string };
type SessionRow = { id: string; path: string; title: string; updatedAt: string };
type ConfigField = { value: unknown; type: string; options?: string[] };
type ConfigGroups = Record<string, Record<string, ConfigField>>;
type UsageReport = {
  reports?: Array<{
    provider?: unknown;
    limits?: Array<{ label?: unknown; id?: unknown; status?: unknown; amount?: { usedFraction?: unknown } }>;
  }>;
};
type OpsState = { processes?: unknown; worktrees?: unknown; collab?: unknown; note?: string; error?: string };
type GatewayState = {
  reachable: boolean;
  models?: { count: number; ids: string[] };
  note?: string;
  error?: string;
};
type PluginList = { npm?: unknown; marketplace?: unknown };

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
  const [panel, setPanel] = useState<PanelId>("chat");
  const listRef = useRef<HTMLOListElement>(null);

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
      } else if (id === "tools" && !ops) {
        const data = await api<OpsState>("/api/omp/ops");
        setOps({ processes: data.processes, worktrees: data.worktrees, collab: data.collab });
        setOpsNote(typeof data.note === "string" ? data.note : null);
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

  async function send() {
    const text = prompt.trim();
    if (!text || sending) {
      if (!text) setNotice("Write a message before sending it.");
      return;
    }
    setNotice(null);
    setSending(true);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    try {
      const data = await api<{ text?: string }>("/api/omp/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          model: model || undefined,
          resume: resume || undefined,
          thinking,
          advisor: advisor || undefined,
          approvalMode: approvalMode || undefined,
          autoApprove: autoApprove || undefined,
          tools: toolsInput.trim() || undefined,
          printThoughts: printThoughts || undefined,
        }),
      });
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: data.text ?? "", model },
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "OMP could not answer.");
    } finally {
      setSending(false);
    }
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

  const usageLimits: Array<{ label: string; pct: number; status: string }> = [];
  for (const report of usage?.reports ?? []) {
    const provider = asString(report.provider) || "?";
    for (const limit of report.limits ?? []) {
      const frac = limit.amount?.usedFraction;
      if (typeof frac === "number") {
        usageLimits.push({
          label: `${provider} · ${asString(limit.label) || asString(limit.id) || "limit"}`,
          pct: Math.round(frac * 100),
          status: asString(limit.status) || "ok",
        });
      }
    }
  }

  const started = messages.length > 1 || sending;
  const empty = panel === "chat" && !started;
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
      <div className="composer-box">
        <label className="sr-only" htmlFor="prompt">
          Message Oh My P(i)
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="How can I help you today?"
          rows={2}
        />
        <div className="composer-actions">
          <div className="composer-tools">
            <button type="button" className="composer-tool" aria-label="Attach" title="Attach (not wired)">
              ＋
            </button>
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
            <span title={`model ${model || "loading"} · thinking ${thinking}`}>
              {shortModel(model)} · {thinking}
            </span>
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
        <button className="new-chat" type="button" onClick={fresh}>
          <span aria-hidden="true">＋</span> New chat
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
          <label className="sr-only" htmlFor="model">
            Model
          </label>
          <select
            id="model"
            className="model-select"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            {models.length === 0 && <option value="">Loading models…</option>}
            {[...grouped.entries()].map(([provider, rows]) => (
              <optgroup key={provider || "?"} label={provider || "?"}>
                {rows.map((row) => (
                  <option key={row.selector} value={row.selector}>
                    {row.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {(gateway || modelsError) && (
            <p className="model-hint">
              {gateway?.url ? (gateway.reachable ? "gateway reachable" : "gateway offline") : "gateway not configured"}
              {modelsError ? <> · {modelsError}</> : null}
            </p>
          )}
        </section>

        <section className="tool-picker" aria-labelledby="run-heading">
          <h2 id="run-heading">Run options</h2>
          <label className="tool-option">
            <span aria-hidden="true">◒</span>
            <span>
              <b>Thinking</b>
              <select
                className="model-select"
                value={thinking}
                onChange={(event) => setThinking(event.target.value)}
                aria-label="Thinking level"
              >
                {THINKING_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="tool-option">
            <input
              type="checkbox"
              checked={advisor}
              onChange={(event) => setAdvisor(event.target.checked)}
            />
            <span>
              <b>Advisor</b>
              <small>Passively reviews each turn</small>
            </span>
          </label>
          <label className="tool-option">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(event) => setAutoApprove(event.target.checked)}
            />
            <span>
              <b>Auto-approve</b>
              <small>Skip approval prompts</small>
            </span>
          </label>
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
                          <p className="message-author">{message.role === "assistant" ? "Oh My P(i)" : "You"}</p>
                        )}
                        <p>{message.text}</p>
                        {message.role === "assistant" && message.model && (
                          <p className="intro-detail">{message.model}</p>
                        )}
                      </div>
                    </li>
                  ))}
                  {sending && (
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
              <h1>Limits.</h1>
              <p className="intro-detail">Straight from omp usage.</p>
            </div>
            {usageError && (
              <div className="alert-box" role="alert">
                {usageError}
              </div>
            )}
            <div className="panel-list">
              {usageLimits.map((limit) => (
                <div className="panel-row" key={limit.label}>
                  <b>{limit.label}</b>
                  <code>
                    {limit.pct}% used · {limit.status}
                  </code>
                  <div
                    className="usage-meter"
                    data-status={limit.pct > 90 ? "crit" : limit.pct > 70 ? "warn" : "ok"}
                    role="img"
                    aria-label={`${limit.label}: ${limit.pct}% used`}
                  >
                    <i style={{ width: `${Math.min(100, limit.pct)}%` }} />
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
              <p className="intro-detail">Read from ~/.omp/agent/mcp.json.</p>
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
                      {asString(server.type) || "?"} · {asString(server.command) || "?"}{" "}
                      {Array.isArray(server.args) ? server.args.map((arg) => String(arg)).join(" ") : ""}
                    </code>
                    {asString(server.cwd) && <small>cwd: {asString(server.cwd)}</small>}
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
              <p className="intro-detail">Secrets render ******** and are not editable. Internal is read-only.</p>
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
            {configGroups &&
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
