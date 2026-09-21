import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { getAdapter } from "@agent-hub/adapters";
import { catalogFixtures } from "@agent-hub/catalog";
import type { ExtensionArtifact, HarnessId } from "@agent-hub/contracts";
import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { z } from "zod";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const widgetDir = join(here, "..", "widgets");

const UPSTREAM = process.env["AGENT_HUB_API_URL"] ?? "http://localhost:4100";
const UPSTREAM_TOKEN = process.env["AGENT_HUB_API_TOKEN"] ?? "";

const HARNESS_IDS = ["codex", "opencode", "omp", "claude-code"] as const;
type Harness = (typeof HARNESS_IDS)[number];

const server = new McpServer(
  { name: "agent-hub", version: "0.1.0" },
  {
    instructions:
      "Agent Hub routes drafts to one harness (codex, opencode, omp, claude-code). " +
      "Use list_harnesses to show routes, search_catalog to find extensions, " +
      "plan_install before any install, submit_run to queue work, get_run to check status. " +
      "Use search_actions to discover long-tail actions (validate, import, approve, cancel).",
  },
);

const bundle = readFileSync(require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8").replace(
  /export\{([^}]+)\};?\s*$/,
  (_: string, body: string) =>
    "globalThis.ExtApps={" +
    body
      .split(",")
      .map((p: string) => {
        const parts = p.split(" as ").map((s: string) => s.trim());
        const local: string = parts[0] ?? p;
        const exported: string = parts[1] ?? local;
        return `${exported}:${local}`;
      })
      .join(",") +
    "};",
);

function inlineWidget(name: string): string {
  const html = readFileSync(join(widgetDir, name), "utf8");
  return html.replace("/*__EXT_APPS_BUNDLE__*/", () => bundle);
}
const harnessPickerHtml = inlineWidget("harness-picker.html");
const catalogCarouselHtml = inlineWidget("catalog-carousel.html");
const approvalConfirmHtml = inlineWidget("approval-confirm.html");
const runProgressHtml = inlineWidget("run-progress.html");

type HarnessRow = { manifest: { id: string; displayName: string }; detection: { installed: boolean } };

async function upstream<T>(path: string, method?: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (UPSTREAM_TOKEN) headers["Authorization"] = `Bearer ${UPSTREAM_TOKEN}`;
  const res = await fetch(`${UPSTREAM}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Agent Hub API ${res.status} on ${path}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  return (await res.json()) as T;
}

function toolError(text: string) {
  return { isError: true as const, content: [{ type: "text" as const, text }] };
}

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: typeof payload === "string" ? payload : JSON.stringify(payload) }] };
}

const listHarnessesSchema = z.object({
  selected: z.string().optional().describe("Currently selected harness id, if any. Defaults to none."),
});
const searchCatalogSchema = z.object({
  query: z.string().optional().describe("Keyword filter over name/id. Omit to list all."),
  harness: z.enum(HARNESS_IDS).optional().describe("Filter to artifacts supported by this harness."),
  limit: z.number().int().min(1).max(50).default(10).describe("Max results. Hard cap at 50."),
});
const planInstallSchema = z.object({
  artifactId: z.string().describe("Catalog artifact id, e.g. github-mcp."),
  harness: z.enum(HARNESS_IDS).describe("Target harness for the install plan."),
});
const submitRunSchema = z.object({
  repository: z.string().describe("Repository to work on, e.g. owner/repo."),
  ref: z.string().default("main").describe("Branch or ref to run against."),
  prompt: z.string().min(1).describe("Task draft text. Must be non-empty."),
  harness: z.enum(HARNESS_IDS).describe("Harness route for this run."),
  target: z.enum(["local", "hosted"]).default("local").describe("Execution target."),
  artifactIds: z.array(z.string()).default([]).describe("Attached catalog artifact ids."),
  approvalIds: z.array(z.string()).default([]).describe("Approval grant ids covering the artifacts."),
});
const getRunSchema = z.object({ id: z.string().describe("Run id returned by submit_run.") });
const searchActionsSchema = z.object({ intent: z.string().describe("What you want to do, in plain English.") });
const executeActionSchema = z.object({
  action_id: z.string().describe("Action id from search_actions, e.g. cancel_run."),
  params: z.record(z.string(), z.unknown()).describe("Params object matching the action's shape."),
});

async function listHarnesses(args: z.infer<typeof listHarnessesSchema>) {
  let rows: HarnessRow[] | null = null;
  try {
    rows = await upstream<HarnessRow[]>(`/v1/harnesses`, "GET");
  } catch {
    rows = null;
  }
  const harnesses = await Promise.all(
    HARNESS_IDS.map(async (id: Harness) => {
      const fromApi = rows?.find((r: HarnessRow) => r.manifest.id === id);
      const adapter = getAdapter(id as HarnessId);
      const detection = fromApi?.detection ?? (await adapter.detect());
      return {
        id,
        displayName: adapter.manifest.displayName,
        command: id === "claude-code" ? "claude" : id,
        installed: detection.installed,
        selected: args.selected === id,
      };
    }),
  );
  return textResult({ harnesses });
}

async function searchCatalog(args: z.infer<typeof searchCatalogSchema>) {
  let items: ExtensionArtifact[] = catalogFixtures;
  try {
    items = await upstream<ExtensionArtifact[]>(`/v1/catalog`, "GET");
  } catch {
    items = catalogFixtures;
  }
  const q = (args.query ?? "").toLowerCase();
  const filtered = items
    .filter(
      (a: ExtensionArtifact) =>
        (!q || `${a.name} ${a.id}`.toLowerCase().includes(q)) &&
        (!args.harness || a.compatibility[args.harness as HarnessId] !== "unsupported"),
    )
    .slice(0, args.limit)
    .map((a: ExtensionArtifact) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      version: a.version,
      digest: a.digest,
      support: args.harness ? a.compatibility[args.harness as HarnessId] : undefined,
    }));
  const summary = `Found ${filtered.length} artifact${filtered.length === 1 ? "" : "s"}. Carousel rendered.\n\n`;
  return textResult(`${summary}${JSON.stringify({ items: filtered })}`);
}

async function planInstall(args: z.infer<typeof planInstallSchema>) {
  try {
    const plan = await upstream<unknown>(`/v1/install-plans`, "POST", { artifactId: args.artifactId, harness: args.harness });
    return textResult(plan);
  } catch (error) {
    const artifact = catalogFixtures.find((a: ExtensionArtifact) => a.id === args.artifactId);
    if (!artifact) return toolError(`Unknown artifact ${args.artifactId}. Use search_catalog to find valid ids.`);
    try {
      const plan = await getAdapter(args.harness as HarnessId).planInstall(artifact);
      return textResult(plan);
    } catch (fallback) {
      return toolError(fallback instanceof Error ? fallback.message : String(error));
    }
  }
}

async function submitRun(args: z.infer<typeof submitRunSchema>) {
  try {
    const run = await upstream<unknown>(`/v1/runs`, "POST", args);
    return textResult({ run, events: [] });
  } catch (error) {
    return toolError(
      `Run not queued (${error instanceof Error ? error.message : "upstream error"}). Start the API and set AGENT_HUB_API_URL.`,
    );
  }
}

async function getRun(args: z.infer<typeof getRunSchema>) {
  try {
    const run = await upstream<unknown>(`/v1/runs/${args.id}`, "GET");
    const events = await upstream<unknown>(`/v1/runs/${args.id}/events`, "GET");
    return textResult({ run, events });
  } catch (error) {
    return toolError(error instanceof Error ? error.message : `Unknown run ${args.id}.`);
  }
}

const ACTION_CATALOG = [
  { id: "validate_artifact", description: "Validate an artifact shape against catalog invariants. Read-only.", params: { artifact: "ExtensionArtifact object" } },
  { id: "import_marketplace", description: "Import a Claude marketplace manifest or a named custom artifact. Creates catalog entries.", params: { type: "claude-marketplace|custom" } },
  { id: "create_approval", description: "Create a digest- and capability-bound approval grant for an artifact on a harness/scope.", params: { artifactId: "string", harness: "HarnessId", scope: "local|hosted" } },
  { id: "cancel_run", description: "Request cancellation of a queued/active run. State-changing.", params: { id: "run id" } },
  { id: "run_events", description: "List events for a run. Read-only.", params: { id: "run id" } },
  { id: "harness_detail", description: "Detect status and capability matrix for one harness. Read-only.", params: { harness: "HarnessId" } },
];

async function searchActions(args: z.infer<typeof searchActionsSchema>) {
  const words = args.intent.toLowerCase().split(/\s+/);
  const score = (text: string) => words.filter((w: string) => text.includes(w)).length;
  const ranked = [...ACTION_CATALOG].sort((a, b) => score(JSON.stringify(b).toLowerCase()) - score(JSON.stringify(a).toLowerCase()));
  return textResult(ranked.slice(0, 10));
}

async function executeAction(args: z.infer<typeof executeActionSchema>) {
  try {
    switch (args.action_id) {
      case "validate_artifact":
        return textResult(await upstream<unknown>(`/v1/artifacts/validate`, "POST", (args.params as Record<string, unknown>)["artifact"]));
      case "import_marketplace":
        return textResult(await upstream<unknown>(`/v1/catalog/import`, "POST", args.params));
      case "create_approval":
        return textResult(await upstream<unknown>(`/v1/approvals`, "POST", args.params));
      case "cancel_run":
        return textResult(await upstream<unknown>(`/v1/runs/${String((args.params as Record<string, unknown>)["id"])}/cancel`, "POST", {}));
      case "run_events":
        return textResult(await upstream<unknown>(`/v1/runs/${String((args.params as Record<string, unknown>)["id"])}/events`, "GET"));
      case "harness_detail":
        return textResult(await upstream<unknown>(`/v1/harnesses/${String((args.params as Record<string, unknown>)["harness"])}`, "GET"));
      default:
        return toolError(`Unknown action ${args.action_id}. Use search_actions to find valid ids.`);
    }
  } catch (error) {
    return toolError(error instanceof Error ? error.message : "Upstream request failed.");
  }
}

registerAppTool(
  server,
  "list_harnesses",
  {
    title: "List harness routes",
    description:
      "List Agent Hub harness routes (codex, opencode, omp, claude-code) with detection status. Opens an interactive route picker. Does NOT run anything.",
    inputSchema: listHarnessesSchema,
    annotations: { title: "List harness routes", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: "ui://widgets/harness-picker.html" } },
  },
  listHarnesses,
);

registerAppTool(
  server,
  "search_catalog",
  {
    title: "Search extension catalog",
    description:
      "Search the Agent Hub extension catalog by keyword. Returns id, name, kind, version, digest, and per-harness support. Opens a carousel picker. Does NOT install anything — use plan_install next.",
    inputSchema: searchCatalogSchema,
    annotations: { title: "Search extension catalog", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: "ui://widgets/catalog-carousel.html" } },
  },
  searchCatalog,
);

registerAppTool(
  server,
  "plan_install",
  {
    title: "Plan extension install",
    description:
      "Preview the install plan for an artifact on a harness (commands, files, secrets, restart). Read-only preview — shows an approval dialog. Does NOT write files or create approvals.",
    inputSchema: planInstallSchema,
    annotations: { title: "Plan extension install", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: "ui://widgets/approval-confirm.html" } },
  },
  planInstall,
);

registerAppTool(
  server,
  "submit_run",
  {
    title: "Submit harness run",
    description:
      "Queue a run on a harness (repository, ref, prompt, target, artifact/approval ids). Returns the queued run. Shows a live status widget. Requires the Agent Hub API; this call creates server-side state.",
    inputSchema: submitRunSchema,
    annotations: { title: "Submit harness run", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: "ui://widgets/run-progress.html" } },
  },
  submitRun,
);

registerAppTool(
  server,
  "get_run",
  {
    title: "Get run status",
    description:
      "Fetch a run by id with its recent events. Read-only; shows the live status widget. For cancelling, use search_actions to find cancel_run.",
    inputSchema: getRunSchema,
    annotations: { title: "Get run status", readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: "ui://widgets/run-progress.html" } },
  },
  getRun,
);

server.registerTool(
  "search_actions",
  {
    title: "Search Agent Hub actions",
    description:
      "Find long-tail Agent Hub actions by intent (validate, import, approve, cancel, events, harness detail). Returns action ids and param shapes. Call execute_action with the chosen id. For core flows use list_harnesses, search_catalog, plan_install, submit_run, get_run instead.",
    inputSchema: searchActionsSchema,
    annotations: { title: "Search Agent Hub actions", readOnlyHint: true, destructiveHint: false },
  },
  searchActions,
);

server.registerTool(
  "execute_action",
  {
    title: "Execute Agent Hub action",
    description:
      "Execute a long-tail action by id. Get the id and params from search_actions first. Wraps the Agent Hub REST API documented in apps/api/src/index.ts (/v1/* routes). Mutating actions require the server-side AGENT_HUB_API_TOKEN.",
    inputSchema: executeActionSchema,
    annotations: { title: "Execute Agent Hub action", readOnlyHint: false, destructiveHint: true },
  },
  executeAction,
);

registerAppResource(server, "Harness Picker", "ui://widgets/harness-picker.html", {}, async () => ({
  contents: [{ uri: "ui://widgets/harness-picker.html", mimeType: RESOURCE_MIME_TYPE, text: harnessPickerHtml }],
}));

registerAppResource(server, "Catalog Carousel", "ui://widgets/catalog-carousel.html", {}, async () => ({
  contents: [{ uri: "ui://widgets/catalog-carousel.html", mimeType: RESOURCE_MIME_TYPE, text: catalogCarouselHtml }],
}));

registerAppResource(server, "Approval Confirm", "ui://widgets/approval-confirm.html", {}, async () => ({
  contents: [{ uri: "ui://widgets/approval-confirm.html", mimeType: RESOURCE_MIME_TYPE, text: approvalConfirmHtml }],
}));

registerAppResource(server, "Run Progress", "ui://widgets/run-progress.html", {}, async () => ({
  contents: [{ uri: "ui://widgets/run-progress.html", mimeType: RESOURCE_MIME_TYPE, text: runProgressHtml }],
}));

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "agent-hub-mcp", upstream: UPSTREAM });
});

app.get("/widget-preview", (req, res) => {
  const name = String(req.query["widget"] ?? "harness-picker.html");
  const allowed: Record<string, true> = {
    "harness-picker.html": true,
    "catalog-carousel.html": true,
    "approval-confirm.html": true,
    "run-progress.html": true,
  };
  if (!allowed[name]) {
    res.status(404).type("text").send("Unknown widget.");
    return;
  }
  const shim = `globalThis.ExtApps={applyHostStyleVariables:()=>{},App:class{
    constructor(){this.h={}} ontoolresult;onhostcontextchanged;
    async connect(){const p=new URLSearchParams(location.search).get("payload");
      if(p)this.ontoolresult?.({content:[{type:"text",text:p}]});}
    getHostContext(){return{theme:"light"}}
    sendMessage(m){console.log("sendMessage",m)} updateModelContext(){}
    callServerTool(){return Promise.resolve({content:[]})} openLink(){} downloadFile(){}
  }};`;
  res.type("html").send(inlineWidget(name).replace("/*__EXT_APPS_BUNDLE__*/", () => shim));
});

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number(process.env["PORT"] ?? 4200);
app.listen(port, () => {
  console.log(`agent-hub MCP app listening on :${port} (upstream ${UPSTREAM})`);
});
