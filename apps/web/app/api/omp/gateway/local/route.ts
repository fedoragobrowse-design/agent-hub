import { NextResponse } from "next/server";
import { localGatewayState, startLocalGateway, stopLocalGateway } from "@/lib/omp";

export async function GET() {
  try {
    return NextResponse.json(await localGatewayState());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read gateway state." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send JSON with { action: start|stop }." }, { status: 422 });
  }
  try {
    if (body.action === "start") return NextResponse.json(await startLocalGateway());
    if (body.action === "stop") return NextResponse.json(await stopLocalGateway());
    return NextResponse.json({ error: 'Action must be "start" or "stop".' }, { status: 422 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gateway action failed." },
      { status: 500 },
    );
  }
}
