import { NextResponse } from "next/server";
import { findOmpModels, listOmpModels, refreshOmpModels } from "@/lib/omp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const refresh = searchParams.get("refresh");
  try {
    if (refresh === "1") await refreshOmpModels();
    const models = q ? await findOmpModels(q) : await listOmpModels();
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list OMP models." },
      { status: 500 },
    );
  }
}
