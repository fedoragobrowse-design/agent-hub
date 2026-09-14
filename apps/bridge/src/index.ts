#!/usr/bin/env node
import { adapters, getAdapter } from "@agent-hub/adapters";
import type { BridgeMessage, HarnessId } from "@agent-hub/contracts";

const command = process.argv[2] ?? "doctor";
if (command === "doctor") {
  const rows = await Promise.all(Object.values(adapters).map(async (adapter) => ({ harness: adapter.manifest.displayName, ...(await adapter.detect()), capabilities: await adapter.capabilities() })));
  console.table(rows.map(({ harness, installed, version }) => ({ harness, installed, version: version ?? "not detected" })));
}
if (command === "capabilities") {
  const harness = process.argv[3] as HarnessId; if (!harness || !(harness in adapters)) throw new Error("Usage: agent-hub-bridge capabilities <codex|opencode|omp|claude-code>");
  console.log(JSON.stringify(await getAdapter(harness).capabilities(), null, 2));
}

export function parseMessage(value: string): BridgeMessage {
  const message = JSON.parse(value) as BridgeMessage;
  if (message.version !== "1" || !message.type || !message.requestId) throw new Error("Invalid bridge protocol message.");
  return message;
}
