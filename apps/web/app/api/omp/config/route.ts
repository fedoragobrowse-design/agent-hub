import { NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/omp";

export async function GET() {
  try {
    const entries = await getConfig();
    const groups: Record<string, Record<string, { value: unknown; type: string; options?: string[] }>> = {};
    for (const [key, entry] of Object.entries(entries)) {
      (groups[entry.group] ??= {})[key] = {
        value: entry.value,
        type: entry.type,
        ...(entry.options ? { options: entry.options } : {}),
      };
    }
    return NextResponse.json({ groups });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read config." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { key?: unknown; value?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send JSON with { key, value }." }, { status: 422 });
  }
  if (typeof body.key !== "string" || !body.key.trim() || typeof body.value !== "string") {
    return NextResponse.json({ error: "Send JSON with a key and a string value." }, { status: 422 });
  }
  try {
    await setConfig(body.key.trim(), body.value);
    const entries = await getConfig();
    return NextResponse.json({ key: body.key.trim(), value: entries[body.key.trim()]?.value ?? body.value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config set failed.";
    const status = message.includes("not editable here") ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
