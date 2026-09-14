"use client";
import { useMemo, useState } from "react";
import { catalogFixtures } from "@agent-hub/catalog";
import type { ExecutionTarget, HarnessId, RunEvent, RunState } from "@agent-hub/contracts";

const harnesses: Array<{ id: HarnessId; name: string; mark: string; state: string }> = [
  { id: "codex", name: "Codex", mark: "◇", state: "Ready" }, { id: "opencode", name: "OpenCode", mark: "⌁", state: "Ready" },
  { id: "omp", name: "Oh My P(i)", mark: "π", state: "Bridge needed" }, { id: "claude-code", name: "Claude Code", mark: "✦", state: "Ready" }
];
const starterEvents: RunEvent[] = [
  { id: "1", runId: "r", at: "09:42:18", type: "state", message: "Run accepted by hosted runner" },
  { id: "2", runId: "r", at: "09:42:20", type: "tool", message: "Cloned github.com/acme/atlas at main" },
  { id: "3", runId: "r", at: "09:42:23", type: "stdout", message: "Reading repository conventions and open issues" },
  { id: "4", runId: "r", at: "09:42:26", type: "approval", message: "GitHub MCP approved for this hosted run" }
];

function Status({ state }: { state: RunState | string }) { return <span className={`status ${state === "running" || state === "Ready" ? "status-active" : ""}`}><i />{state}</span>; }
function RunTimeline({ events }: { events: RunEvent[] }) { return <section className="timeline" aria-label="Run timeline"><div className="panel-heading"><div><p className="eyebrow">Live signal</p><h2>Chronological run log</h2></div><Status state="running" /></div><ol>{events.map((event) => <li key={event.id} className={`event event-${event.type}`}><time>{event.at}</time><span className="event-dot" aria-hidden="true" /><p>{event.message}</p></li>)}</ol></section>; }

export default function FlightDeck() {
  const [harness, setHarness] = useState<HarnessId>("codex"); const [target, setTarget] = useState<ExecutionTarget>("hosted");
  const [prompt, setPrompt] = useState("Trace the authentication boundary and propose the smallest safe fix."); const [selected, setSelected] = useState<string[]>(["github-mcp"]);
  const [runState, setRunState] = useState<RunState>("running"); const [events, setEvents] = useState(starterEvents); const [notice, setNotice] = useState<string | null>(null); const [signedIn, setSignedIn] = useState(true);
  const artifact = useMemo(() => catalogFixtures.filter((item) => selected.includes(item.id)), [selected]);
  function launch() { if (!prompt.trim()) { setNotice("Write a prompt before starting a run."); return; } setNotice(null); setRunState("queued"); setEvents((current) => [...current, { id: crypto.randomUUID(), runId: "r", at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), type: "state", message: `Queued on ${harness} via ${target} runner` }]); window.setTimeout(() => setRunState("running"), 550); }
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  return <main className="shell">
    <aside className="rail"><a className="brand" href="#top" aria-label="Agent Hub home"><span>AH</span><b>Agent<br />Hub</b></a><nav aria-label="Workspace navigation"><a className="nav-current" href="#run">Run</a><a href="#catalog">Catalog <em>2</em></a><a href="#runs">Runs</a><a href="#settings">Settings</a></nav><div className="rail-bottom"><p className="eyebrow">{signedIn ? "Signed in" : "Session"}</p><strong>{signedIn ? "octavia@github" : "Signed out"}</strong><button className="text-button" onClick={() => setSignedIn((value) => !value)}>{signedIn ? "Sign out" : "Sign in"}</button></div></aside>
    <div className="workspace" id="top"><header><div><p className="eyebrow">Agent Hub / personal workspace</p><h1>Independent orchestration<br />for coding agents</h1><p className="hero-copy">Compare harnesses, approve extensions, and run the right agent for the job.</p></div><div className="header-status"><span className="pulse" />Live system status</div></header>
      <section className="run-grid" id="run"><div className="composer panel"><div className="panel-heading"><div><p className="eyebrow">New execution</p><h2>Route a prompt</h2></div><span className="run-id">RUN-0184</span></div>
        <form noValidate onSubmit={(event) => { event.preventDefault(); launch(); }}><label htmlFor="prompt">Task</label><textarea className="resize-none" id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} aria-describedby="prompt-help" /><p id="prompt-help" className="field-help">Enter sends the task after you choose a runner. Shift+Enter adds a line.</p>
          <div className="choice-row"><fieldset><legend>Harness</legend><div className="segmented">{harnesses.map((item) => <button type="button" className={harness === item.id ? "selected" : ""} key={item.id} onClick={() => setHarness(item.id)} aria-pressed={harness === item.id}><span>{item.mark}</span>{item.name}</button>)}</div></fieldset><fieldset><legend>Execution</legend><div className="segmented two"><button type="button" className={target === "hosted" ? "selected" : ""} onClick={() => setTarget("hosted")} aria-pressed={target === "hosted"}>Hosted</button><button type="button" className={target === "local" ? "selected" : ""} onClick={() => setTarget("local")} aria-pressed={target === "local"}>Local bridge</button></div></fieldset></div>
          {notice && <p className="inline-alert" role="alert">{notice}</p>}<div className="submit-row"><div><Status state={runState} /><small>{target === "hosted" ? "Ephemeral container · scoped GitHub token" : "Outbound bridge connection only"}</small></div><button className="launch" type="submit"><span>Launch run</span><kbd>⌘↵</kbd></button></div>
        </form></div><RunTimeline events={events} /></section>
      <section className="lower-grid" id="catalog"><section className="panel integrations"><div className="panel-heading"><div><p className="eyebrow">Approved tools</p><h2>Extension loadout</h2></div><button className="text-button" onClick={() => setNotice("Catalog sources are ready for Hub, GitHub, and Claude marketplace imports.")}>Browse catalog</button></div>{catalogFixtures.map((item) => <label className="integration" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><span className="check" aria-hidden="true" /><span className="integration-copy"><b>{item.name}</b><small>{item.kind} · {item.source.publisher}</small></span><span className="risk">{item.capabilities.join(" · ")}</span><span className="compatibility" title={`${harness}: ${item.compatibility[harness]}`}>{item.compatibility[harness]}</span></label>)}<p className="approval-note">Each approval is pinned to artifact version, digest, harness, and scope. Changes require fresh review.</p></section>
        <section className="panel harness-panel"><div className="panel-heading"><div><p className="eyebrow">Connected surfaces</p><h2>Harness capability</h2></div><button className="icon-button" aria-label="Refresh harness detection" onClick={() => setNotice("Harness detection refreshed. Local bridges report their installed versions.")}>↻</button></div><div className="harness-list">{harnesses.map((item) => <div className="harness-row" key={item.id}><span className="harness-mark">{item.mark}</span><div><b>{item.name}</b><small>MCP native · plugin mapped</small></div><Status state={item.state} /></div>)}</div><a href="#settings" className="connect-link">Connect another harness <span>→</span></a></section></section>
      <section className="security-strip"><span className="lock">⌘</span><p><b>Secure by construction.</b> Secrets stay referenced, never logged. Hosted runs are unprivileged and destroyed at completion.</p><a href="#settings">Review security posture →</a></section>
    </div>
  </main>;
}
