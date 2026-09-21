import { NextResponse } from "next/server";
import { brokerStatus, checkGateway, getOmpVersion } from "@/lib/omp";

export async function GET() {
  const gateway = await checkGateway();
  let version = "unknown";
  try {
    version = await getOmpVersion();
  } catch {
    // Keep "unknown": status must not 500 when the binary probe fails.
  }
  let broker = { configured: false, accounts: 0 };
  try {
    const status = await brokerStatus();
    broker = { configured: status.configured, accounts: status.accounts };
  } catch {
    // Broker optional: report unconfigured rather than failing status.
  }
  return NextResponse.json({
    ok: true,
    omp: { version, binary: "omp" },
    gateway,
    broker,
  });
}
