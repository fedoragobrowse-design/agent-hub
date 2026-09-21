import { NextResponse } from "next/server";
import { listSessions } from "@/lib/omp";
import { spawn } from "node:child_process";

function runOmp(args: string[]): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const child = spawn("omp", args, { stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString();
  });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve(out);
    else reject(new Error(err.trim() || `omp exited ${code ?? "unknown"}`));
  });
  child.stdin.end();
  return promise;
}

export async function GET() {
  try {
    const sessions = await listSessions();
    if (sessions.length === 0) return NextResponse.json({ sessions, note: "No sessions found." });
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list sessions." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { action?: unknown; id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send JSON with { action, id }." }, { status: 422 });
  }
  if ((body.action !== "export" && body.action !== "share") || typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: 'Send JSON with action "export"|"share" and a session id.' }, { status: 422 });
  }
  const id = body.id.trim();
  const sessions = await listSessions();
  const match = sessions.find((s) => s.id === id || s.id.startsWith(id) || s.path === id);
  if (!match) {
    return NextResponse.json({ error: `No session found for "${id}".` }, { status: 404 });
  }
  try {
    if (body.action === "export") {
      const outPath = `/tmp/omp-session-${match.id.replace(/[^A-Za-z0-9_-]/g, "_")}.html`;
      const out = await runOmp(["--export", match.path, outPath]);
      return NextResponse.json({ path: outPath, result: out.trim() });
    }
    const out = await runOmp(["share", match.path]);
    return NextResponse.json({ url: out.trim() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Session action failed." },
      { status: 500 },
    );
  }
}
