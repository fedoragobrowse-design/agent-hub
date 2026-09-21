import { NextResponse } from "next/server";
import { ompPrint } from "@/lib/omp";

type ChatBody = {
  prompt?: unknown;
  model?: unknown;
  resume?: unknown;
  thinking?: unknown;
  advisor?: unknown;
  approvalMode?: unknown;
  autoApprove?: unknown;
  tools?: unknown;
  printThoughts?: unknown;
};

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Send JSON with a prompt." }, { status: 422 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "Write a message before sending it." }, { status: 422 });
  try {
    const text = await ompPrint(prompt, {
      model: typeof body.model === "string" ? body.model : undefined,
      resume: typeof body.resume === "string" ? body.resume : undefined,
      thinking: typeof body.thinking === "string" ? body.thinking : undefined,
      advisor: body.advisor === true,
      approvalMode: typeof body.approvalMode === "string" ? body.approvalMode : undefined,
      autoApprove: body.autoApprove === true,
      tools: typeof body.tools === "string" ? body.tools : undefined,
      printThoughts: body.printThoughts === true,
    });
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OMP could not answer." },
      { status: 500 },
    );
  }
}
