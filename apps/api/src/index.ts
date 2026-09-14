import Fastify from "fastify";
import cors from "@fastify/cors";
import { catalogFixtures, importClaudeMarketplace, importCustomArtifact, validateArtifact } from "@agent-hub/catalog";
import { getAdapter } from "@agent-hub/adapters";
import { createApproval } from "@agent-hub/security";
import type { ApprovalGrant, ExtensionArtifact, Run, RunEvent, RunRequest } from "@agent-hub/contracts";

const app = Fastify({ logger: true });
const allowedOrigin = process.env.WEB_ORIGIN;
await app.register(cors, { origin: allowedOrigin ? [allowedOrigin] : false });
app.addHook("onRequest", async (request, reply) => {
  if (!request.url.startsWith("/v1/") || request.method === "GET") return;
  const token = process.env.AGENT_HUB_API_TOKEN;
  const authorization = request.headers.authorization;
  if (!token || authorization !== `Bearer ${token}`) {
    return reply.code(401).send({ error: "Authenticated API token required." });
  }
});
const runs = new Map<string, Run>(); const events = new Map<string, RunEvent[]>(); const approvals = new Map<string, ApprovalGrant>();
const catalog = [...catalogFixtures];
app.get("/health", async () => ({ ok: true }));
app.get("/v1/catalog", async () => catalog);
app.post("/v1/catalog/import", async (request, reply) => {
  const body = request.body as { type?: "claude-marketplace" | "custom"; source?: string; manifest?: string; name?: string; kind?: ExtensionArtifact["kind"]; publisher?: string; version?: string; capabilities?: ExtensionArtifact["capabilities"] };
  try {
    const imported = body.type === "claude-marketplace"
      ? await importClaudeMarketplace({ source: body.source ?? "", manifest: body.manifest ?? "" })
      : body.type === "custom" && body.name && body.kind
        ? [await importCustomArtifact({ name: body.name, kind: body.kind, source: body.source ?? "", publisher: body.publisher ?? "Private import", version: body.version, capabilities: body.capabilities })]
        : null;
    if (!imported) return reply.code(422).send({ error: "Provide a Claude marketplace manifest or a named custom artifact." });
    for (const artifact of imported) if (!catalog.some((item) => item.digest === artifact.digest)) catalog.push(artifact);
    return reply.code(201).send(imported);
  } catch (error) { return reply.code(422).send({ error: error instanceof Error ? error.message : "Marketplace import failed." }); }
});
app.get("/v1/harnesses", async () => Promise.all(["codex", "opencode", "omp", "claude-code"].map(async (id) => {
  const adapter = getAdapter(id as RunRequest["harness"]);
  return { manifest: adapter.manifest, detection: await adapter.detect(), capabilities: await adapter.capabilities() };
})));
app.get("/v1/harnesses/:id", async (request, reply) => { const id = (request.params as { id: string }).id; if (!["codex", "opencode", "omp", "claude-code"].includes(id)) return reply.code(404).send({ error: "Unknown harness" }); const adapter = getAdapter(id as RunRequest["harness"]); return { manifest: adapter.manifest, detection: await adapter.detect(), capabilities: await adapter.capabilities() }; });
app.post("/v1/artifacts/validate", async (request, reply) => { const problems = validateArtifact(request.body as ExtensionArtifact); return reply.code(problems.length ? 422 : 200).send({ valid: !problems.length, problems }); });
app.post("/v1/install-plans", async (request, reply) => { const body = request.body as { artifactId: string; harness: RunRequest["harness"] }; const artifact = catalog.find((item) => item.id === body.artifactId); if (!artifact) return reply.code(404).send({ error: "Unknown artifact" }); const adapter = getAdapter(body.harness); const validation = await adapter.validate(artifact); if (!validation.valid) return reply.code(422).send(validation); return adapter.planInstall(artifact); });
app.post("/v1/approvals", async (request, reply) => { const body = request.body as { artifactId: string; harness: RunRequest["harness"]; scope: "local" | "hosted" }; const artifact = catalog.find((item) => item.id === body.artifactId); if (!artifact) return reply.code(404).send({ error: "Unknown artifact" }); const grant = createApproval(artifact, body.harness, body.scope, artifact.capabilities); approvals.set(grant.id, grant); return grant; });
app.post("/v1/runs", async (request, reply) => { const body = request.body as RunRequest; if (!body.prompt?.trim()) return reply.code(422).send({ error: "A prompt is required." }); const run: Run = { id: crypto.randomUUID(), request: body, state: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; runs.set(run.id, run); events.set(run.id, [{ id: crypto.randomUUID(), runId: run.id, at: run.createdAt, type: "state", message: "Run queued" }]); return reply.code(201).send(run); });
app.get("/v1/runs/:id", async (request, reply) => { const run = runs.get((request.params as { id: string }).id); return run ?? reply.code(404).send({ error: "Unknown run" }); });
app.get("/v1/runs/:id/events", async (request) => events.get((request.params as { id: string }).id) ?? []);
app.post("/v1/runs/:id/cancel", async (request, reply) => { const run = runs.get((request.params as { id: string }).id); if (!run) return reply.code(404).send({ error: "Unknown run" }); run.state = "cancelled"; run.updatedAt = new Date().toISOString(); events.get(run.id)?.push({ id: crypto.randomUUID(), runId: run.id, at: run.updatedAt, type: "state", message: "Cancellation requested" }); return run; });
await app.listen({ port: Number(process.env.PORT ?? 4100), host: process.env.HOST ?? "127.0.0.1" });
