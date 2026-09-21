import { NextResponse } from "next/server";
import { getServerCwd, listChildDirs } from "@/lib/omp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dir = searchParams.get("dir");
  try {
    if (!dir) return NextResponse.json({ cwd: await getServerCwd() });
    return NextResponse.json(await listChildDirs(dir));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list directories." },
      { status: 500 },
    );
  }
}
