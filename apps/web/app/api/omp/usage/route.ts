import { NextResponse } from "next/server";
import { getUsageReport } from "@/lib/omp";

export async function GET() {
  try {
    const report = await getUsageReport();
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read usage." },
      { status: 500 },
    );
  }
}
