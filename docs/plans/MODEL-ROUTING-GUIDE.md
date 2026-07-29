# Model routing and effort guide

This is the authoritative cost-aware model assignment for the 39 V1 packets in
[the implementation work breakdown](06-IMPLEMENTATION-WORKBREAKDOWN.md). It
chooses models by risk and work type, not by phase prestige.

The **lead** owns the packet. The **targeted support/review** model is used only
for the named lane or final review; it should not repeat the whole packet.
Normal packet verification still follows the repository test and evidence
rules regardless of model.

## Model and effort policy

| Model | Default use | Recommended effort |
| --- | --- | --- |
| Terra | Documentation, inventories, mechanical refactors, fixtures, routine tests, and bounded CRUD after the contract is frozen. | `low` for mechanical work; `medium` for normal implementation; `high` only for a tightly bounded integration. |
| Claude Sonnet | Frontend flows, forms, responsive behavior, accessibility, browser smoke tests, and ordinary full-stack product work. | `medium` for a component or simple screen; `high` for multi-state workflows, accessibility, or browser verification. |
| Sol | Shared contracts, migrations, RLS, RPCs, Express/API work, concurrency, security, and operational correctness. | `high` for normal protected backend work; `xhigh` only for the packets explicitly marked below. |
| Claude Opus | Product/architecture ambiguity, threat modeling, policy review, independent adversarial review, and phase/release gates. | `high` for focused review; use extended thinking only for a genuinely unresolved cross-system decision. |

Effort names are intent labels. If Claude exposes thinking controls instead of
`low | medium | high | xhigh`, use short/no extended thinking for `low`, normal
thinking for `medium`, extended thinking for `high`, and the highest practical
extended-thinking budget only for `xhigh`.

## Spend controls

1. Start with the lead model and the listed effort. Do not open Opus or Sol
   merely to summarize files or repeat a green test run.
2. Use Terra for documentation and mechanical follow-up after a higher-cost
   model has frozen the contract.
3. Use Sonnet for the frontend lane when the backend contract is stable.
4. Escalate to Sol when the work changes authorization, RLS, transactions,
   migrations, time/capacity rules, or durable jobs.
5. Use Opus as a reviewer, not the routine implementer. Ask it to inspect the
   contract, diff, and evidence for named risks rather than recreate the change.
6. Do not use `max` or `ultra` by default. `xhigh` is already reserved below for
   race, security, durability, and release-critical packets.
7. A failed test does not automatically justify escalation. First localize the
   failure with the current model; escalate only when the cause crosses the
   listed risk boundary.

## Packet assignments

### Phase 1 - foundation and identity

| Packet | Lead | Effort | Targeted support/review |
| --- | --- | --- | --- |
| P1-01 Baseline and vocabulary | Terra | medium | Sol `medium` only if canonicalization changes persisted/API contracts. |
| P1-02 Professional access lock | Sol | high | Sonnet `medium` for lock UI; Opus `high` final authorization review. |
| P1-03 Employment-aware revocation | Sol | high | Opus `high` focused review of former/suspended and cross-shop access. |
| P1-04 Close direct-write bypasses | Sol | xhigh | Opus `high` adversarial review of authenticated and direct-RLS bypasses. |
| P1-05 Admin boundary | Sol | high | Sonnet `medium` for minimal admin UI; Opus `high` evidence-access review. |
| P1-06 Public/private catalogue split | Sol | high | Sonnet `medium` for discovery UI; Opus is unnecessary if projection tests are complete. |
| P1-07 Phase-1 adversarial gate | Opus | high | Sol `xhigh` only for reproducing and fixing security/race findings. |

### Phase 2 - shops, workforce, and authoritative availability

| Packet | Lead | Effort | Targeted support/review |
| --- | --- | --- | --- |
| P2-01 Shop lifecycle | Sol | high | Sonnet `high` for Shop Setup and lifecycle states. |
| P2-02 Shop facts | Sonnet | high | Sol `high` for migrations, RLS, media policy, and atomic commands. |
| P2-03 Hiring state | Terra | medium | Sonnet `medium` for UI; Sol `high` only for vacancy-state transaction review. |
| P2-04 Employment convergence | Sol | xhigh | Sonnet `high` for request journeys; Opus `high` final replay/race review. |
| P2-05 Provider capabilities | Sol | high | Sonnet `high` for owner/barber capability UI. |
| P2-06 Schedule authority | Sol | high | Sonnet `high` for calendar, request, approval, mobile, and a11y states. |
| P2-07 Availability engine | Sol | xhigh | Sonnet `high` for explainable slot UI; Opus `high` rule-completeness review. |
| P2-08 Phase-2 race gate | Opus | high | Sol `xhigh` for concurrency probes and remediation; Sonnet `medium` for browser journeys. |

### Phase 3 - booking and live operations

| Packet | Lead | Effort | Targeted support/review |
| --- | --- | --- | --- |
| P3-01 Request/accept/assign | Sol | high | Sonnet `high` for customer/owner assignment workflows. |
| P3-02 Change and disruption | Sol | xhigh | Sonnet `high` for consent/recovery states; Opus `high` policy-snapshot review. |
| P3-03 Check-in and visit | Sol | high | Sonnet `high` for check-in and visit lifecycle UI. |
| P3-04 No-show and appeals | Sol | high | Sonnet `high` for evidence/appeal states; Opus `high` focused fairness-policy review. |
| P3-05 Walk-ins | Sol | high | Sonnet `high` for staff, claim, guest, and account-linking journeys. |
| P3-06 Offline payments | Sol | high | Sonnet `medium` for collection UI; Opus `high` audit of money labels and correction/refund facts. |
| P3-07 Outbox and notifications | Sol | xhigh | Opus `high` atomicity, retry, and required-notification review. |
| P3-08 Durable closeout | Sol | xhigh | Opus `high` lease, replay, timeout, and recovery review. |
| P3-09 Phase-3 journey gate | Opus | high | Sol `high` for backend findings; Sonnet `high` for browser/a11y findings. |

### Phase 4 - trust, insights, settings, and role workspaces

| Packet | Lead | Effort | Targeted support/review |
| --- | --- | --- | --- |
| P4-01 Conversation membership | Sol | high | Sonnet `high` for chat states; Opus `high` only for retention/membership edge review. |
| P4-02 Disputes/moderation | Sol | high | Sonnet `high` for case UI; Opus `high` for escalation and immutable-decision policy. |
| P4-03 Ratings | Sol | high | Sonnet `medium` for rating/response UI; Terra `medium` for routine history tests. |
| P4-04 Analytics facts | Terra | high | Sol `high` reviews query truth, tenant scope, and money terminology. |
| P4-05 Owner workspace | Sonnet | high | Terra `medium` for fixtures/tests/docs; Sol `medium` only for missing protected commands. |
| P4-06 Barber workspace | Sonnet | high | Terra `medium` for routine tests/docs; Sol `medium` only for missing protected commands. |
| P4-07 Customer workspace | Sonnet | high | Terra `medium` for routine tests/docs; Sol `medium` only for missing protected commands. |
| P4-08 Settings and access | Sonnet | high | Sol `high` for identity, security, privacy, session, and notification commands. |
| P4-09 Phase-4 experience gate | Opus | high | Sonnet `high` for browser/a11y remediation; Sol `high` for authorization findings. |

### Phase 5 - production hardening and rollout

| Packet | Lead | Effort | Targeted support/review |
| --- | --- | --- | --- |
| P5-01 Job/runtime hardening | Sol | xhigh | Opus `high` scale-out, dead-letter, alert, and failure-mode review. |
| P5-02 Privacy/retention | Opus | high | Sol `high` for enforcement/jobs; Terra `medium` for inventory and runbooks. |
| P5-03 Security release gate | Sol | xhigh | Opus `high` independent threat and evidence review. |
| P5-04 Reliability gate | Sol | xhigh | Opus `high` RPO/RTO, restore, rollback, load, and provider-failure review. |
| P5-05 Release candidate | Opus | high | Sol `high` for backend findings; Sonnet `high` for clean-environment role journeys. |
| P5-06 Pilot rollout | Opus | high | Sol `high` for telemetry/rollback controls; Terra `medium` for support and rollout records. |

## Quick selection when work does not map cleanly to one packet

| Work | Start with |
| --- | --- |
| Status notes, test catalog updates, inventories, renames, or mechanical cleanup | Terra `low` or `medium` |
| One bounded React component or routine browser fix | Sonnet `medium` |
| Multi-screen UI, accessibility, responsive behavior, or authenticated smoke test | Sonnet `high` |
| Shared DTO/API work with a frozen design | Sol `high` |
| Migration, RLS, transaction, capacity, concurrency, durable job, or security fix | Sol `high`; use `xhigh` only when the packet table says so |
| Unresolved product policy or cross-phase architecture | Opus `high`, then hand implementation to the cheaper suitable model |
| Independent phase or release review | Opus `high`, with Sol/Sonnet fixing only findings in their lanes |

The routing guide controls cost, not completion. A cheaper model with complete
evidence is preferable to an expensive model without the required API, RLS,
race, browser, accessibility, and documentation gates.
