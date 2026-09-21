import { streamOmp, type OmpEvent } from "@/lib/omp";

export const runtime = "nodejs";

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
  cwd?: unknown;
  maxTime?: unknown;
};

function encode(event: OmpEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return new Response("data: {\"type\":\"error\",\"message\":\"Send JSON with a prompt.\"}\n\n", {
      status: 422,
      headers: { "content-type": "text/event-stream" },
    });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return new Response("data: {\"type\":\"error\",\"message\":\"Write a message before sending it.\"}\n\n", {
      status: 422,
      headers: { "content-type": "text/event-stream" },
    });
  }
  const opts = {
    model: typeof body.model === "string" ? body.model : undefined,
    resume: typeof body.resume === "string" ? body.resume : undefined,
    thinking: typeof body.thinking === "string" ? body.thinking : undefined,
    advisor: body.advisor === true,
    approvalMode: typeof body.approvalMode === "string" ? body.approvalMode : undefined,
    autoApprove: body.autoApprove === true,
    tools: typeof body.tools === "string" ? body.tools : undefined,
    printThoughts: body.printThoughts === true,
    cwd: typeof body.cwd === "string" ? body.cwd : undefined,
    maxTime: typeof body.maxTime === "string" ? body.maxTime : undefined,
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: OmpEvent) => controller.enqueue(new TextEncoder().encode(encode(event)));
      void streamOmp(prompt, opts, send)
        .catch((error: Error) => send({ type: "error", message: error.message }))
        .finally(() => controller.close());
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}
