# Agent handoff and collaboration guide

This guide lets Codex, Claude, Antigravity, Fable, or a human contributor work
in parallel without creating incompatible frontend/backend behavior.

## 1. Read before touching code

Every agent reads, in order:

1. `docs/plans/README.md`
2. `docs/plans/00-V1-PRODUCT-CONTRACT.md`
3. the active phase file
4. the relevant master specification
5. `docs/systemarch/CODE-PATTERNS.md`
6. `docs/systemarch/ARCHITECTURE.md`
7. current shared types/services and relevant migrations/routes
8. `docs/plans/OPEN-QUESTIONS.md`

The agent reports which requirement IDs it owns before editing.

## 2. Recommended work lanes

| Lane | Owns | Must not do alone |
| --- | --- | --- |
| Product/architecture | Policy, shared vocabulary, requirement IDs, phase gate | Change a decided policy silently |
| Shared contracts | Types, DTOs, Zod, pure rules, service interfaces | Implement UI-only alternate rules |
| Database/security | Migrations, functions, constraints, RLS, storage policies, SQL tests | Edit applied migration or assume Express protects RLS |
| Express/API | JWT/capability checks, routes, transactions/RPC calls, error mapping | Trust body-supplied tenant/role or expose service key |
| Adapter | `ApiBackend`, mock parity where retained, contract tests | Add page-specific fetch shortcuts |
| Frontend/Claude | Routes, pages, components, CSS, responsive/accessibility states | Invent backend data, hardcode accounts, call Supabase directly |
| QA | Unit/API/RLS/concurrency/E2E/accessibility/performance | Mark a phase complete from screenshots only |
| Docs/release | Traceability, runbooks, migration/release evidence | Describe planned behavior as current |

For the current collaboration, a clean split is:

- **Codex/backend lane:** shared contracts, migrations, RLS, RPCs, Express,
  `ApiBackend`, security/concurrency tests.
- **Claude/frontend lane:** route/page/component/CSS implementation against
  approved contracts, all responsive/accessibility/async states.
- **Third agent/QA lane:** independent contract/RLS/browser verification and
  traceability updates.

## 3. Contract-first handshake

Before frontend and backend begin a slice, agree on:

```text
Requirement IDs:
Current behavior:
Target behavior:
Request DTO/schema:
Response projection:
Allowed actions/deadlines:
Error codes:
Authorization and shop scope:
Idempotency/version behavior:
Empty/loading/stale/offline UI states:
Acceptance scenarios:
```

Checkpoint the shared contract first. Frontend may then use a typed fixture at
the component boundary for visual development, but the fixture must never
become runtime fake operational data.

## 4. File ownership during a slice

Avoid two agents editing the same high-conflict files simultaneously:

- `packages/shared/src/types.ts`
- `packages/shared/src/dto.ts` and shared schemas
- `packages/shared/src/services.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/config/navigation.ts`
- central Express app/router registration
- migration files
- global theme tokens

If both lanes need one of these, nominate one editor and send the other a patch
request. Preserve dirty/unrelated changes; never use hard reset or wholesale
file replacement to resolve overlap.

## 5. Task card template

Copy this into an agent prompt:

```markdown
### Task
[One vertical slice]

### Requirements
[IDs from QA-TRACEABILITY-MATRIX.md]

### Read first
- docs/plans/00-V1-PRODUCT-CONTRACT.md
- docs/plans/[active phase].md
- docs/plans/[relevant master spec].md
- docs/systemarch/CODE-PATTERNS.md
- docs/systemarch/ARCHITECTURE.md

### Current evidence
[Existing files/migrations/routes]

### Scope
[Files/domains this agent may change]

### Out of scope
[Adjacent work that must remain untouched]

### Contract
[DTO/response/errors/auth/version/idempotency]

### Acceptance
[Concrete tests and UI states]

### Handoff
Report changed files, migrations, tests, remaining risks, and contract drift.
Do not mark the phase complete.
```

## 6. Frontend prompt for Claude

```markdown
You are implementing the frontend lane of Philabantay V1. Read
docs/plans/README.md, docs/plans/00-V1-PRODUCT-CONTRACT.md, the active phase file,
docs/plans/UI-FRONTEND-MASTER-SPEC.md, docs/systemarch/CODE-PATTERNS.md, and
docs/systemarch/ARCHITECTURE.md first.

Use only the shared DataBackend contract. Do not import the mock backend, call
Supabase directly, hardcode accounts, create placeholder operational data, or
reimplement server permissions in the page. Keep role destinations in the
existing hamburger menu. Preserve the DoodleBoard/notebook style, responsive
CSS, portal/focus patterns, and reduced-motion support.

For the assigned requirement IDs, implement loading, empty, validation,
forbidden, stale, network/offline, busy, success, mobile/tablet/desktop,
keyboard, and screen-reader states. If a required contract method/error/action
does not exist, stop that mutation path and report the exact missing contract;
do not fake it.

At handoff, list changed files, routes/components, contract assumptions,
browser widths tested, accessibility checks, typecheck/build/test output, and
remaining blockers.
```

## 7. Backend prompt for Codex or another backend agent

```markdown
You are implementing the backend lane of Philabantay V1. Read
docs/plans/README.md, docs/plans/00-V1-PRODUCT-CONTRACT.md, the active phase file,
docs/plans/BACKEND-DATA-SECURITY-MASTER-SPEC.md, docs/systemarch/CODE-PATTERNS.md,
docs/systemarch/ARCHITECTURE.md, and the current migration chain first.

Implement inside out: shared type/DTO/Zod/pure rule -> forward migration with
constraints/indexes/RLS/grants -> transactional RPC -> Express JWT/capability/
shop-scope/validation/error mapping -> ApiBackend -> tests. Service role is
server-only and bypasses RLS, so scope every query. Sensitive mutations require
expected versions, idempotency where replayable, immutable audit event, and
outbox row in the same transaction when applicable.

Do not edit an applied migration, add seeded credentials, trust client role or
tenant IDs, overwrite history, or describe untested behavior as complete.
Report changed files, migration verification, direct-RLS/API/concurrency tests,
contract changes for frontend, and remaining risks.
```

## 8. Handoff report format

Every agent ends with:

```text
Requirements addressed:
Outcome:
Changed files:
Migration/API/route changes:
UI states/routes changed:
Tests run and exact result:
Security/tenant checks:
Known gaps or open questions:
Files another agent must now touch:
Phase gate status: NOT COMPLETE / READY FOR REVIEW
```

“Works on my screen” is not evidence. Include exact command/test result or mark
it not run.

## 9. Review rhythm

1. Product owner answers blocking open questions.
2. Contract lane proposes the slice and test cases.
3. Backend and frontend work in parallel after contract freeze.
4. QA tests both together against clean local Supabase.
5. Security/data and accessibility reviews run.
6. Product owner reviews the visible workflow.
7. Traceability row is updated; phase proceeds only when every exit item passes.

## 10. Conflict protocol

If code, migration, and plan disagree:

1. Do not fix it by guessing.
2. Capture current evidence and affected requirement IDs.
3. Determine whether it is stale docs, unfinished migration, or undecided policy.
4. For a security/data-integrity conflict, fail closed.
5. Add or answer an item in `OPEN-QUESTIONS.md` if product behavior changes.
6. Update contract, implementation, tests, and docs together.

This prevents one agent's convenient local assumption from becoming a permanent
cross-role loophole.
