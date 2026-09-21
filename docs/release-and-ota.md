# Releasing Agent Hub

## What a release contains

A release tag in the form `vX.Y.Z` starts the GitHub Actions release workflow. It type-checks the workspace, runs the OTA simulation, builds `agent-hub_X.Y.Z_amd64.deb` and `agent-hub_X.Y.Z_win-x64.zip`, generates SHA-256 checksums for both, and attaches all four files to the matching GitHub Release.

The release build embeds the canonical GitHub repository identifier. On Linux the package enables a systemd timer that checks the latest release daily (with a randomized delay), verifies the downloaded checksum, and installs a newer package automatically. On Windows the desktop app checks the same Releases feed at startup and offers the matching `_win-x64.zip` when a newer tag exists (checksum in the sibling `.sha256` file).

## Before publishing

1. Configure the deployed service: GitHub OAuth credentials, a strong `AUTH_SECRET`, PostgreSQL, Redis, object storage, KMS, and the authenticated bridge WebSocket endpoint.
2. Verify the managed API owns run history and events. Development-only in-memory state is never a substitute for synchronized data.
3. Run the workspace typecheck, OTA simulation, package inspection, and an isolated browser sign-in test using non-production credentials.
4. Review the capability matrix and extension approvals. A changed artifact digest, capability, or secret requirement requires new approval.

## Publishing

Create the GitHub tag and release through an account with repository release permissions. The workflow publishes both assets and checksums; do not manually replace any release asset after publication.

## After publishing

Document the release in GitHub Release notes with:

- the version, release date, and compatibility changes by harness;
- security-impacting changes and any required user action;
- migration or rollback guidance;
- both asset checksums and known limitations;
- confirmation of whether existing installations will update automatically.

Monitor the first workflow run and one clean Debian installation. Confirm the `agent-hub-update.timer` is enabled and that the package refuses a checksum mismatch. On Windows, confirm the startup update prompt appears when a newer tag exists. If a release must be withdrawn, unpublish it and publish a superseding fixed version; do not silently mutate the release binary.

## Current boundary

The repository contains the API schema, bridge protocol, adapters, UI, package, and release workflow. It does not include a deployed Postgres/Redis/S3/KMS environment or a hosted runner control plane. Until those services are provisioned and verified, use the repository as a secure implementation baseline rather than claiming cross-machine synchronization or hosted execution.
