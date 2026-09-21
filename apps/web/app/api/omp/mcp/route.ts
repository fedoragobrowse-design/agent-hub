import { NextResponse } from "next/server";
import { readMcpServers, readMcpServersDetailed, writeMcpServers } from "@/lib/omp";

export async function GET() {
  try {
    const detailed = await readMcpServersDetailed();
    const servers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(detailed)) {
      servers[name] = { ...(entry.config as Record<string, unknown>), source: entry.source };
    }
    return NextResponse.json({ servers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read MCP servers." },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    await writeMcpServers();
    return NextResponse.json({ servers: await readMcpServers() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not write MCP servers." },
      { status: 500 },
    );
  }
}
