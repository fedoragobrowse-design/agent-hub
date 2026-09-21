import { NextResponse } from "next/server";
import { discoverMarketplace, listPlugins, setPluginState, type PluginAction } from "@/lib/omp";

const ACTIONS: PluginAction[] = ["install", "uninstall", "enable", "disable", "upgrade"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const discover = searchParams.get("discover");
  try {
    if (discover !== null) return NextResponse.json({ marketplace: await discoverMarketplace(discover || undefined) });
    return NextResponse.json({ plugins: await listPlugins() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list plugins." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { action?: unknown; name?: unknown; scope?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send JSON with { action, name }." }, { status: 422 });
  }
  if (!ACTIONS.includes(body.action as PluginAction) || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json(
      { error: "Send JSON with action install|uninstall|enable|disable|upgrade and a plugin name." },
      { status: 422 },
    );
  }
  if (body.scope !== undefined && body.scope !== "user" && body.scope !== "project") {
    return NextResponse.json({ error: 'Scope must be "user" or "project".' }, { status: 422 });
  }
  try {
    const result = await setPluginState(
      body.action as PluginAction,
      body.name.trim(),
      body.scope as "user" | "project" | undefined,
    );
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plugin action failed." },
      { status: 500 },
    );
  }
}
