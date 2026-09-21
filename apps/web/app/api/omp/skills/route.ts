import { NextResponse } from "next/server";
import { listSkills, setSkillState } from "@/lib/omp";

export async function GET() {
  try {
    const { skills, rulesEnabled } = await listSkills();
    return NextResponse.json({ skills, rulesEnabled });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list skills." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { name?: unknown; enabled?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send JSON with { name, enabled }." }, { status: 422 });
  }
  if (typeof body.name !== "string" || !body.name.trim() || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Send JSON with a skill name and enabled true|false." }, { status: 422 });
  }
  try {
    const result = await setSkillState(body.name.trim(), body.enabled);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Skill toggle failed." },
      { status: 500 },
    );
  }
}
