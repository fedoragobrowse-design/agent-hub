export const HARNESS_IDS = ["codex", "opencode", "omp", "claude-code"] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];
export type ExtensionKind = "mcp" | "skill" | "plugin";
export type SupportLevel = "native" | "adapted" | "unsupported";
export type RunState = "queued" | "preparing" | "running" | "awaiting_approval" | "succeeded" | "failed" | "cancelled";
export type ExecutionTarget = "local" | "hosted";
export type Capability = "network" | "filesystem-read" | "filesystem-write" | "shell" | "secret" | "oauth";

export interface ExtensionArtifact {
  id: string; name: string; version: string; digest: string; kind: ExtensionKind;
  source: { type: "hub" | "github" | "claude-marketplace" | "url" | "git"; url: string; publisher: string };
  marketplace?: { name: string; source: string; plugin: string };
  license?: string; capabilities: Capability[]; requiredSecrets: string[];
  transports?: Array<"stdio" | "http" | "sse">;
  compatibility: Record<HarnessId, SupportLevel>;
  scan: "pending" | "passed" | "rejected"; visibility: "public" | "private";
}

export interface ApprovalGrant {
  id: string; artifactId: string; digest: string; harness: HarnessId; scope: "local" | "hosted";
  capabilities: Capability[]; grantedAt: string; expiresAt?: string;
}

export interface RunRequest {
  repository: string; ref: string; prompt: string; harness: HarnessId; target: ExecutionTarget;
  credentialRef?: string; artifactIds: string[]; approvalIds: string[];
}

export interface Run {
  id: string; request: RunRequest; state: RunState; createdAt: string; updatedAt: string;
  summary?: string; error?: string;
}

export interface RunEvent {
  id: string; runId: string; at: string; type: "state" | "stdout" | "stderr" | "tool" | "approval";
  message: string; raw?: unknown;
}

export interface InstallPlan {
  artifact: Pick<ExtensionArtifact, "id" | "name" | "digest" | "kind">;
  harness: HarnessId; support: SupportLevel; commands: string[]; files: string[];
  transports: string[]; networkDestinations: string[]; requiredSecrets: string[]; restartRequired: boolean;
}

export interface HarnessAdapter {
  readonly manifest: { id: HarnessId; version: string; displayName: string };
  detect(): Promise<{ installed: boolean; version?: string; path?: string }>;
  capabilities(): Promise<Record<ExtensionKind, SupportLevel>>;
  validate(artifact: ExtensionArtifact): Promise<{ valid: boolean; reason?: string }>;
  planInstall(artifact: ExtensionArtifact): Promise<InstallPlan>;
  applyInstall(plan: InstallPlan): Promise<void>;
  launch(request: RunRequest): Promise<{ externalId: string }>;
  cancel(externalId: string): Promise<void>;
  streamEvents(externalId: string): AsyncIterable<RunEvent>;
}

export interface BridgeMessage<T = unknown> { version: "1"; type: string; requestId: string; payload: T; }
