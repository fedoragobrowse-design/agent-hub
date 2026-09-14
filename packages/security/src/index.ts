import type { ApprovalGrant, Capability, ExtensionArtifact, HarnessId } from "@agent-hub/contracts";

export interface SecretVault { put(value: string): Promise<string>; reveal(reference: string): Promise<string>; }
export class DevelopmentVault implements SecretVault {
  private values = new Map<string, string>();
  async put(value: string) { const ref = `dev_secret_${crypto.randomUUID()}`; this.values.set(ref, value); return ref; }
  async reveal(reference: string) { const value = this.values.get(reference); if (!value) throw new Error("Unknown credential reference"); return value; }
}
export function redact(value: string, secrets: string[]) { return secrets.reduce((output, secret) => secret ? output.replaceAll(secret, "[REDACTED]") : output, value); }
export function createApproval(artifact: ExtensionArtifact, harness: HarnessId, scope: "local" | "hosted", capabilities: Capability[]): ApprovalGrant {
  const missing = artifact.capabilities.filter((capability) => !capabilities.includes(capability));
  if (missing.length) throw new Error(`Approval missing declared capabilities: ${missing.join(", ")}`);
  return { id: crypto.randomUUID(), artifactId: artifact.id, digest: artifact.digest, harness, scope, capabilities, grantedAt: new Date().toISOString() };
}
export function approvalValid(grant: ApprovalGrant, artifact: ExtensionArtifact, harness: HarnessId, scope: "local" | "hosted") {
  return grant.artifactId === artifact.id && grant.digest === artifact.digest && grant.harness === harness && grant.scope === scope && (!grant.expiresAt || new Date(grant.expiresAt) > new Date());
}
