import { NextResponse } from "next/server";
import { gitDiff, gitStatus, listChildDirs, listDir } from "@/lib/omp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dir = searchParams.get("dir") ?? undefined;
  const git = searchParams.get("git");
  const file = searchParams.get("file") ?? undefined;
  const staged = searchParams.get("staged") === "1";
  try {
    if (git === "status" && dir) return NextResponse.json({ status: await gitStatus(dir) });
    if (git === "diff" && dir) return NextResponse.json({ diff: await gitDiff(dir, file, staged) });
    if (dir) {
      const listing = await listDir(dir);
      const status = await gitStatus(listing.dir).catch(() => null);
      return NextResponse.json({ ...listing, git: status });
    }
    return NextResponse.json(await listChildDirs("."));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not browse files." },
      { status: 500 },
    );
  }
}
