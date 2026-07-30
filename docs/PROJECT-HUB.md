---
aliases:
  - Philabantay Project Hub
tags:
  - philabantay
  - project-hub
  - source-of-truth
---

# Philabantay project hub

This is the Obsidian home note and the shortest reliable route into the project.
Obsidian is only the reader/editor: durable project memory remains ordinary,
Git-tracked Markdown that Codex, Claude, Antigravity, and humans can all read.

## Start here every session

1. [Current state](memory/CURRENT-STATE.md) — active packet, blockers, and exact
   next action.
2. [Roadmap status](plans/ROADMAP-STATUS.md) — verified packet-by-packet status.
3. [Agent handoff rules](plans/AGENT-HANDOFF.md) — collaboration lanes and
   required report format.
4. [Open questions](plans/OPEN-QUESTIONS.md) — decisions that must not be
   silently guessed.
5. [Session log](memory/SESSION-LOG.md) — concise append-only work history.
6. [Decision log](memory/DECISIONS.md) — durable decisions and their reasons.

## Product and implementation

| Need | Open |
| --- | --- |
| V1 boundaries and non-negotiable behavior | [V1 product contract](plans/00-V1-PRODUCT-CONTRACT.md) |
| Active implementation sequence | [Implementation work breakdown](plans/06-IMPLEMENTATION-WORKBREAKDOWN.md) |
| Cost-aware model and effort assignment | [Model routing guide](plans/MODEL-ROUTING-GUIDE.md) |
| Active UI-redesign lane brief | [UI redesign Codex brief](plans/UI-REDESIGN-CODEX-BRIEF.md) |
| Phase 1 | [Foundation and identity](plans/01-PHASE-1-FOUNDATION-IDENTITY.md) |
| Phase 2 | [Shops, workforce, availability](plans/02-PHASE-2-SHOP-WORKFORCE-AVAILABILITY.md) |
| Phase 3 | [Booking and live operations](plans/03-PHASE-3-BOOKING-LIVE-OPERATIONS.md) |
| Phase 4 | [Trust, insights, experience](plans/04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md) |
| Phase 5 | [Production rollout](plans/05-PHASE-5-PRODUCTION-ROLLOUT.md) |
| UI contract | [UI/frontend master spec](plans/UI-FRONTEND-MASTER-SPEC.md) |
| Backend/security contract | [Backend/data/security master spec](plans/BACKEND-DATA-SECURITY-MASTER-SPEC.md) |

## Technical truth

| Need | Open |
| --- | --- |
| Structure, dependencies, and data flow | [Architecture](systemarch/ARCHITECTURE.md) |
| Required implementation conventions | [Code patterns](systemarch/CODE-PATTERNS.md) |
| Database design | [Database design](systemarch/05-DATABASE-DESIGN.md) |
| API surface | [API reference](systemarch/API.md) |
| Supabase and RLS summary | [Supabase schema](systemarch/SUPABASE-SCHEMA.md) |
| Security invariants | [Security contract](security/SECURITY.md) |
| Role/location boundaries | [Role and location guardrails](security/ROLE-AND-LOCATION-GUARDRAILS.md) |
| Verification evidence | [Local Supabase verification](mdfiles/LOCAL-SUPABASE-VERIFICATION.md) |
| Automated evidence | [Test catalog](testing/README.md) |
| Requirements-to-tests mapping | [QA traceability matrix](plans/QA-TRACEABILITY-MATRIX.md) |

## Visual study

- [Philabantay project map](PHILABANTAY-PROJECT-MAP.canvas) - interactive
  Obsidian canvas for the roadmap, active packet, architecture, repository,
  verification gates, model routing, and authoritative notes.
- [System flowcharts](charts/01-SYSTEM-FLOWCHARTS.md)
- [UML and domain model](systemarch/02-UML-AND-DOMAIN-MODEL.md)
- [Data-flow diagrams](charts/03-DATA-FLOW-DIAGRAMS.md)
- [Detailed workflows](systemarch/04-DETAILED-WORKFLOWS.md)
- [Interactive system atlas](PROJECT-VISUALIZATION.html)

## Memory rules

- Do not paste full plans into memory notes. Link to the authoritative file.
- Current state stays short enough to read in under two minutes.
- Session log is append-only; roadmap status changes only after evidence.
- Decisions include the date, reason, consequences, and superseded decision.
- Secrets, passwords, tokens, personal evidence, and precise private locations
  never belong in this vault.
- Obsidian plugins are optional conveniences, never project dependencies.

## Templates

- [Agent handoff template](templates/AGENT-HANDOFF-TEMPLATE.md)
- [Decision template](templates/DECISION-TEMPLATE.md)
- [Work session template](templates/WORK-SESSION-TEMPLATE.md)
