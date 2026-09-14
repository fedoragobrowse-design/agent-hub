# Agent Hub UX contract

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Run composer | `RunComposer` | This contract | Hosted or local bridge | Form and API contract tests |
| Form | `RunComposer` | This contract | Prompt field and runner selectors | Validation and keyboard tests |
| Timeline | `RunTimeline` | This contract | Idle, live, failed, cancelled | Keyboard and stream-state tests |
| Extension approval | `ApprovalCard` | `packages/security` | Local or hosted scope | Digest mismatch test |
| Toast/status | `StatusNotice` | This contract | Polite success; inline recovery error | Live-region test |
| Scrollbars | `globals.css` | `DESIGN.md` | Stable gutter on log panel | Computed-style check |
| Toast | `StatusNotice` | This contract | Polite success; inline recovery error | Live-region test |
| Scrollbar | `globals.css` | `DESIGN.md` | Stable gutter on log panel | Computed-style check |

Runs use pessimistic mutation feedback: the UI only shows a submitted run after the API accepts it. Cancellation is idempotent. Deleting logs requires confirmation in the production API; no client-side deletion is irreversible by itself.
