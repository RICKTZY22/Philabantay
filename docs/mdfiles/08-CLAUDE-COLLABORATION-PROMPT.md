# 8. Claude collaboration prompt

Copy the prompt below into Claude when you want it to audit and plan the
frontend lane alongside Codex. It deliberately asks for a report before code so
the two agents do not overwrite one another or build UI for nonexistent backend
capabilities.

## Copy-ready prompt

```text
You are collaborating with Codex on Philabantay, a React 19 + Express +
Supabase barbershop platform. This first pass is a frontend/workflow audit and
work-package proposal. Do not implement product features until I approve your
report.

READ FIRST, IN THIS ORDER
1. docs/README.md
2. docs/charts/01-SYSTEM-FLOWCHARTS.md
3. docs/systemarch/02-UML-AND-DOMAIN-MODEL.md
4. docs/charts/03-DATA-FLOW-DIAGRAMS.md
5. docs/systemarch/04-DETAILED-WORKFLOWS.md
6. docs/systemarch/05-DATABASE-DESIGN.md
7. docs/security/06-SECURITY-DESIGN.md
8. docs/roadmap/07-DIGITAL-ROADMAP.md
9. docs/systemarch/ARCHITECTURE.md
10. docs/systemarch/CODE-PATTERNS.md
11. docs/systemarch/API.md
12. docs/systemarch/SUPABASE-SCHEMA.md
13. docs/mdfiles/HANDSON.md

Then inspect git status, the current routes/components, shared DataBackend
contract, and relevant Express routes. The working tree contains user, Claude,
and Codex changes. Never reset, discard, replace, or rewrite unrelated changes.

AUTHORITY ORDER WHEN SOURCES CONFLICT
1. Current versioned Supabase migrations and shared contracts
2. Current Express route/authorization behavior and passing tests
3. Current React behavior verified in the browser
4. Numbered design documents as the intended destination
5. Older roadmaps/audits as historical context

Report every conflict. Do not silently choose whichever source is easiest.
Clearly label CURRENT, PARTIAL, PLANNED, and DECISION behavior.

CURRENT TECHNICAL TRUTH TO PRESERVE
- The frontend is configured to use ApiBackend/Express/Supabase, not mock data.
- The canonical appointment backend already supports requested, confirmed,
  checked-in, in-progress, awaiting-confirmation, completed, declined, expired,
  cancelled, customer-no-show, and disputed states.
- It has explicit command endpoints, optimistic versions, immutable events,
  hashed expiring check-in codes, automatic request expiry/finalization,
  overlap protection, owner reassignment, and completed-visit rating checks.
- Owner verification lock exists, but verification submissions/documents/admin
  review are incomplete.
- Basic shop/service API writes exist, but full Shop Setup, hours, photos, and
  publication lifecycle are incomplete and DataBackend write methods are
  missing.
- Hiring currently uses hiring_listings and a direct join code. Owner
  invitation, safer join request/confirmation, and atomic openings auto-close
  are planned.
- Payment collection does not exist. Any current money chart is completed
  service value, not collected revenue.

YOUR AUDIT SCOPE
1. Inventory every current route/screen for:
   - guest
   - customer
   - pending/rejected professional
   - verified job-seeking barber
   - employed barber
   - verified owner without a shop
   - active owner
   - admin
2. Map every visible action to:
   - DataBackend method
   - Express route
   - required role/verification/employment/shop state
   - success result
   - loading, empty, validation, authorization, conflict, and network states
3. Compare the UI with the planned workflows for:
   - barber and owner verification
   - admin review
   - Shop Setup and publication
   - services, hours, map pin, photos, policies
   - hiring on/off/full
   - barber applications, owner invitations, contact, and join requests
   - appointment request, accept, decline, assign, reassign
   - check-in, start, finish, customer confirmation, dispute
   - cancellation, no-show, daily closeout attention queue
   - ratings and filters
   - staff, messages, analytics, settings, and accessibility
4. Review the numbered Mermaid diagrams and flag any flow that:
   - has no UI entry point
   - contradicts the current backend
   - invents unsupported persistence
   - lacks an important alternative/error path
5. Propose a behavior-preserving frontend module structure under:
   - apps/web/src/dashboards/{customer,barber,owner}
   - apps/web/src/features/{avatar,chat,settings,customer-bookings,
     barber-schedule,owner-reservations,owner-staff,owner-stats,hiring,
     shop-setup}
   Pages remain route orchestration boundaries. Shared feature UI takes explicit
   role/context instead of being copied.
6. Propose the role information architecture and low-fidelity desktop/mobile
   structures. Owner home must be operations-first:
   - needs attention
   - today's appointments and chair states
   - staff availability
   - hiring/shift actions
   - compact summary
   Analytics belongs in a separate hamburger-menu destination.
7. Review performance:
   - role bundle code-splitting
   - avoid request waterfalls
   - pagination for unbounded lists
   - memoize genuinely expensive chart derivations
   - loading skeletons
   - avoid unnecessary looping animation/filter cost
   - measure bundle/render behavior before and after
8. Review accessibility:
   - keyboard order and visible focus
   - dialog/focus trap semantics
   - status communicated by text, not color only
   - screen-reader live updates
   - reduced motion
   - readable-font mode
   - chart table equivalents
   - narrow viewport and touch targets

DELIVERABLE FORMAT
A. Executive summary
B. Current route/screen inventory
C. Gap matrix with columns:
   role | screen | user goal | current UI | backend support | missing dependency |
   risk | recommended state | priority
D. Diagram/workflow contradictions with exact file/line evidence
E. Proposed hamburger-menu information architecture per role
F. Low-fidelity desktop/mobile screen structures
G. Proposed frontend folder/file ownership
H. Performance and accessibility baseline plan
I. Ordered frontend work packages with dependencies and exit gates
J. Backend dependency handoff for Codex using this exact template:

   BACKEND DEPENDENCY
   Feature:
   User/role:
   Required DataBackend method:
   Required request/response shape:
   Required states/errors:
   Security/ownership rule:
   UI blocked until:

HARD BOUNDARIES
- Do not edit supabase/migrations, apps/api, packages/shared, environment files,
  credentials, package files, or lockfiles during this audit.
- Do not call Supabase directly from React. UI uses DataBackend only.
- Do not add hardcoded accounts, credentials, tokens, secrets, join codes, fake
  records, sample analytics, or verification bypasses.
- Do not fall back to MockBackend to hide missing API behavior.
- Do not invent DataBackend methods and pretend they work. Hand the dependency
  to Codex first.
- Do not use local UI state as durable business truth.
- Do not add duplicate top navigation tabs. Role destinations belong in the
  hamburger menu.
- Preserve the notebook/doodle identity while prioritizing legibility,
  accessibility, and performance.
- Do not change business logic during the structural/performance refactor.
- Do not create a commit or reset anything unless I explicitly request it.

Stop after the report and wait for approval. End by listing the exact frontend
files you propose to own so Codex can avoid editing them concurrently.
```

## Follow-up implementation prompt template

After reviewing Claude’s report, use this smaller prompt for one approved work
package at a time:

```text
Implement only this approved Philabantay frontend work package:

[PASTE ONE APPROVED WORK PACKAGE HERE]

Re-read docs/systemarch/ARCHITECTURE.md, docs/systemarch/CODE-PATTERNS.md, and the relevant numbered
workflow document. First inspect git status and the current files. Preserve all
unrelated changes.

Your owned files for this package:
[LIST FILES APPROVED FOR CLAUDE]

Codex-owned or forbidden files:
- supabase/migrations/**
- apps/api/**
- packages/shared/** unless Codex has already delivered and approved a contract
- environment/package/lock files

Use only existing DataBackend methods. If one is missing or its response cannot
represent the workflow, stop that subpart and issue a BACKEND DEPENDENCY handoff
instead of mocking it.

Requirements:
- loading, empty, success, validation, authorization, conflict, network, and
  retry states
- duplicate-submit resistance
- keyboard/mobile/reduced-motion behavior
- no canned/fake data
- no direct Supabase calls
- no business-rule duplication
- preserve notebook/doodle identity

Run the scoped typecheck/tests and inspect the affected screen in the browser.
Report files changed, behavior verified, remaining dependencies, and any
current-vs-planned documentation conflict. Stop after this one package.
```

## Collaboration rule

Claude and Codex should never edit the same feature contract simultaneously.
Claude reports a missing backend dependency; Codex implements and tests the
shared/migration/API/adapter path; Claude then consumes the released contract.
Browser verification is joint, and the relevant numbered document is updated
with the same change.
