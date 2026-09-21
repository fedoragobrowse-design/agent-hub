# Agent Hub UX contract

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Harness selection | `FlightDeck` | `HarnessId` in `packages/contracts` | Codex, OpenCode, Oh My P(i), Claude Code | Button pressed state and draft routing |
| Conversation | `FlightDeck` | Local `ChatMessage` state | Harness, user, and system messages | Message order and accessible live region |
| Draft composer | `FlightDeck` | Prompt and selected artifacts | Local bridge or hosted target | Empty prompt recovery and cleared sent draft |
| Allowed tools | `FlightDeck` | `catalogFixtures` | Approved fixture artifacts | Checkbox state and attachment count |
| Marketplace | `FlightDeck` | `catalogFixtures` and compatibility matrix | Add/remove supported extensions per selected harness | Marketplace trigger, support label, and attachment state |
| Execution boundary | `FlightDeck` | Connected API/bridge availability | Draft only until connected | Explicit no-execution message |
| Authentication | `apps/web/auth.ts` | NextAuth session | GitHub sign-in/sign-out | Session control and protected route |

The UI must show a harness-specific draft only after the user chooses a harness. A draft is not an execution: without a connected managed API and bridge or runner, it must state that it has not run. Switching harnesses applies only to future drafts. Tool selection is explicit and visible at send time.
