import { NextResponse } from "next/server";
import { listCollab, listProcesses, listWorktrees } from "@/lib/omp";

async function safe<T>(load: () => Promise<T>): Promise<{ value: T | [] ; failed: boolean }> {
  try {
    return { value: await load(), failed: false };
  } catch {
    return { value: [], failed: true };
  }
}

export async function GET() {
  const [processes, worktrees, collab] = await Promise.all([
    safe(listProcesses),
    safe(listWorktrees),
    safe(listCollab),
  ]);
  const failed = [processes.failed && "processes", worktrees.failed && "worktrees", collab.failed && "collab"].filter(
    Boolean,
  );
  return NextResponse.json({
    processes: processes.value,
    worktrees: worktrees.value,
    collab: collab.value,
    ...(failed.length > 0 ? { note: `No data for: ${failed.join(", ")}.` } : {}),
  });
}
