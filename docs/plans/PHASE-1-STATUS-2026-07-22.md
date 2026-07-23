# Phase 1 execution status — 2026-07-22

> **Superseded 2026-07-23.** Phase 1 is now complete and the automated gate is
> green. Several packet states below (for example P1-05 "Open" and P1-07
> "Blocked") were accurate on 2026-07-22 but are now done. See
> [ROADMAP-STATUS.md](ROADMAP-STATUS.md) for current cross-phase status; this
> file is retained as the historical 2026-07-22 checkpoint.

This is the current integration checkpoint for agents. It records verified
evidence, not visual completion. Phase 2 must not start until P1-07 is green.

## Packet status

| Packet | State | Verified now | Still required |
| --- | --- | --- | --- |
| P1-01 Baseline and vocabulary | Partial | API availability, overlap, and performance queries use canonical states. | Remove legacy operational branches from web/mock and prove adapter parity. |
| P1-02 Professional access lock | Partial | Express and direct RLS lock pending/rejected/suspended barber and owner requests; `/auth/me` and sign out remain available. | Real submission/evidence/admin decisions; fix restore flash and dishonest review copy. |
| P1-03 Employment-aware revocation | Green | Verified/current-employment checks protect shifts, attendance, chat, appointment assignment, capabilities, and join-code commands. Termination and suspension denial, former-staff isolation, remembered-code rejection, and command races pass against local Supabase. | Browser session-expiry presentation remains part of P1-07, not a backend authorization gap. |
| P1-04 Direct-write closure | Green | Transactional booking creation/reschedule/reassignment, immutable snapshots, global mutation lock ordering, check-in hash protection, append-only events, and customer/provider race guards. Authenticated staff/chat/application command bypasses are revoked. | Raw service-role appointment update remains tracked hardening debt, not an authenticated bypass. |
| P1-05 Admin boundary | Open | Admin is not selectable in public onboarding. | Separate MFA/capability/reviewer boundary, audited evidence access and decisions. |
| P1-06 Public/private catalogue | Green | Anonymous rate-limited `/catalog` routes, strict public DTO validation, allowlisted database projections, current-employment eligibility, and unauthenticated `ApiBackend` calls pass unit and local integration tests. | Shop draft/published/suspended lifecycle remains Phase 2 scope. |
| P1-07 Adversarial gate | Blocked | Current customer/owner/barber/cross-shop/former/suspended/direct-JWT/race matrix passes. | Complete P1-02 UI follow-up and P1-05 verification/admin boundary, then rerun browser/accessibility and the full admin matrix. |

## Latest clean automated gate

The database was reset from migrations on local Supabase after a recoverable
pre-reset backup. Migrations applied through:

```text
20260722000700_command_boundary_and_lock_order.sql
```

Results:

```text
API:        42/42 passed
  Docker/local-Supabase integration: 22/22 passed
Shared:     27/27 passed
Web:        19/19 passed
Typecheck:  all workspaces passed
Build:      production build passed
Diff check: passed
DB lint:    passed with 3 non-blocking unused-variable warnings in wrapped
            appointment functions
```

The pre-reset backup is outside the repository at:

```text
C:\Users\Erick\AppData\Local\Temp\philabantay-backups\20260722-121314
```

## Live browser smoke result

Passed:

- pending owner operational deep link redirects to `/verification`;
- pending barber `/schedule` deep link redirects to `/verification`;
- locked shell exposes no operational hamburger/menu;
- sign out returns to the public landing page;
- no horizontal overflow at 390 px;
- no console warning/error was observed.

Failed:

- a fresh `/` load flashes public landing/sign-in content before the restored
  locked session redirects;
- the page claims a registration/evidence submission is in human review even
  though no submission/reviewer record exists.

These are tracked as `LR-033` and `LR-034` in the loophole rescan.

## Current lane ownership

Codex backend lane:

1. Implement the frozen P1-05 verification submission/evidence/admin contract.
2. Close the hiring-listing/application transaction race in its Phase 2 packet.
3. Run the P1-07 admin/direct-JWT/browser/accessibility gate and reconcile docs.

Claude Opus frontend lane, in order:

1. [`CLAUDE-OPUS-4.8-P1-02-FOLLOWUP.md`](CLAUDE-OPUS-4.8-P1-02-FOLLOWUP.md)
2. [`CLAUDE-OPUS-4.8-P1-01-BOOKING-UI.md`](CLAUDE-OPUS-4.8-P1-01-BOOKING-UI.md)

Do not let either lane edit the other lane's high-conflict files without an
explicit handoff.
