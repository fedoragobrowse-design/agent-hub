import type { RunRequest } from "@agent-hub/contracts";

export interface ContainerSpec { image: string; readOnlyRootFilesystem: true; privileged: false; dockerSocket: false; workspaceMount: "/workspace"; networkAllowlist: string[]; environment: Record<string, string>; }
export function createContainerSpec(request: RunRequest, networkAllowlist: string[]): ContainerSpec {
  return { image: `ghcr.io/agent-hub/${request.harness}:pinned`, readOnlyRootFilesystem: true, privileged: false, dockerSocket: false, workspaceMount: "/workspace", networkAllowlist, environment: { AGENT_HUB_RUNNER: "1", AGENT_HUB_REPOSITORY: request.repository, AGENT_HUB_REF: request.ref } };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log("Runner contract ready. A production worker provisions the returned OCI spec through its cloud runtime.");
