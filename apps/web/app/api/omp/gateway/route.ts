import { NextResponse } from "next/server";
import { gatewayModels, gatewayStatus } from "@/lib/omp";
function summarizeModels(data: unknown): { count: number; ids: string[] } {
  let list: unknown[] = [];
  if (Array.isArray(data)) list = data;
  else if (typeof data === "object" && data !== null && "data" in data && Array.isArray(data.data)) {
    list = data.data;
  }
  const ids: string[] = [];
  for (const entry of list) {
    if (typeof entry === "object" && entry !== null && "id" in entry && typeof entry.id === "string") {
      ids.push(entry.id);
      if (ids.length >= 5) break;
    }
  }
  return { count: list.length, ids };
}

export async function GET() {
  let health = { ok: false, version: "" };
  try {
    health = await gatewayStatus();
  } catch {
    // Unreachable gateway: report below, never 500.
  }
  if (!health.ok) return NextResponse.json({ reachable: false, health, models: { count: 0, ids: [] } });
  try {
    const models = summarizeModels(await gatewayModels());
    return NextResponse.json({ reachable: true, health, models });
  } catch (error) {
    return NextResponse.json({
      reachable: true,
      health,
      models: { count: 0, ids: [] },
      note: error instanceof Error ? error.message : "Could not list gateway models.",
    });
  }
}
