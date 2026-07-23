# Claude Opus 4.8 follow-up — P1-02 verification lock integration

You are the frontend agent collaborating with Codex on Philabantay V1. This is
a focused follow-up to `CLAUDE-OPUS-4.8-P1-02-PROMPT.md`, not a new redesign.
Codex owns Supabase migrations, RLS, Express, and shared backend contracts. You
own only the `apps/web` verification-lock shell, routing, restore behavior, and
frontend tests described below.

## Read first

1. `docs/plans/CLAUDE-OPUS-4.8-P1-02-PROMPT.md`
2. `docs/plans/00-V1-PRODUCT-CONTRACT.md`
3. `docs/plans/01-PHASE-1-FOUNDATION-IDENTITY.md`
4. `docs/plans/QA-TRACEABILITY-MATRIX.md`
5. `docs/plans/LOGIC-LOOPHOLE-RESCAN-2026-07-22.md`
6. `docs/systemarch/CODE-PATTERNS.md`
7. `docs/systemarch/ARCHITECTURE.md`

Then inspect the current working tree. Preserve the verification page and role
selection work already present; other agents have concurrent backend changes.

## Backend fact now available

Codex has added and tested the shared helper:

```ts
isProfessionalVerificationLocked(profile)
```

from `@barbershop/shared`. It is authoritative for both requested professional
roles (`barber` and `shop_owner`) whenever verification is not `verified`.
Replace the duplicate frontend predicate in `apps/web/src/lib/access.ts` with
the shared helper (or make the local module a thin re-export if imports would
otherwise churn). Do not edit the shared implementation.

Express and RLS now independently deny operational data to locked
professionals. `/api/v1/auth/me` and sign-out remain available.

## Live smoke-test findings to fix

The following was reproduced against local Supabase and the Express API on
2026-07-22:

### F-01 — forbidden public-content flash on session restoration (high)

Reproduction:

1. Sign up and request the barber role.
2. Reach `/verification` in the pending state.
3. Refresh or directly open `/`.
4. Immediately after `DOMContentLoaded`, the complete public landing/sign-in
   page is rendered.
5. Roughly one second later, the app redirects to `/verification`.

Cause to inspect: `Layout` renders route content while `AuthProvider` still has
`loading=true` and `profile=null`.

Required behavior: session restoration must resolve to guest, active user, or
locked professional before any route-specific content or navigation is shown.
Use a neutral, accessible loading shell while restoring. Do not flash the
landing page, hamburger menu, dashboard, settings, booking, hiring, or chat.

### F-02 — UI falsely claims evidence was submitted (high)

The current page says all of the following even though no verification
submission row, evidence upload, or reviewer queue action exists:

- “Registration received”
- “Under review by our team”
- “Your registration is in the review queue”
- “there is nothing else to send right now”

The role-selection button also says “Submit for verification”, but that action
currently only stores `requested_role`, `verification_status=pending`, and
`onboarding_completed=true`.

Required behavior until Codex lands the real submission contract:

- describe this honestly as a locked professional-role request / verification
  setup pending;
- do not claim documents were sent, a case exists, or a human review started;
- rename the onboarding action to wording such as “Continue to verification”;
- clearly state that evidence submission is not available yet and avoid fake
  progress steps;
- keep sign out available;
- do not invent local fake evidence, success state, or direct Supabase calls.

### F-03 — restore/status failure handling (medium)

`Check verification status` and session restoration need explicit busy,
success/no-change, expired-session, and network-failure feedback. Prevent
unhandled restore rejections. A failed refresh must not unlock content or leave
a blank page.

### F-04 — insufficient UI evidence (medium)

The existing tests cover the pure predicate only. Add focused tests for:

- loading gate prevents route content from rendering;
- pending owner and pending barber direct links land at `/verification`;
- locked shell has no operational menu/settings/dashboard controls;
- sign out remains available;
- honest copy does not claim a submitted/reviewed case;
- customer and verified-professional routing remains unchanged;
- rejected/suspended states remain fail-closed.

## What already passed and must remain true

- pending owner direct navigation is redirected to `/verification`;
- pending barber direct navigation to `/schedule` is redirected to
  `/verification`;
- the locked shell has no hamburger menu;
- sign out returns to the public landing page;
- the lock page has no horizontal overflow at a 390 px viewport;
- no browser console errors were observed;
- web unit tests, typecheck, and production build were green before this
  follow-up.

## File ownership

You may edit:

- `apps/web/src/components/Layout.tsx`
- `apps/web/src/components/RequireAuth.tsx`
- `apps/web/src/features/auth/AuthContext.tsx`
- `apps/web/src/lib/access.ts`
- `apps/web/src/pages/RoleSelectionPage.tsx`
- `apps/web/src/pages/VerificationLockPage.tsx`
- `apps/web/src/pages/VerificationLockPage.css`
- focused `apps/web/test/**` files and web test configuration/dependencies

Do not edit:

- `apps/api/**`
- `packages/shared/**`
- `supabase/**`
- unrelated dashboards, booking pages, hiring UI, or landing animations

If a missing API/DTO blocks an honest state, document the exact contract needed
instead of simulating success.

## Verification commands and handoff

Run the focused web tests, web typecheck, and production build. If browser
automation is available, repeat the refresh/deep-link reproduction at 390,
768, and 1280 px and confirm no forbidden-content flash.

End with:

```text
Findings fixed:
Changed files:
Behavior before/after:
Tests and exact results:
Responsive/accessibility checks:
Backend contracts still missing:
Known gaps:
Phase gate status: READY FOR CODEX INTEGRATION REVIEW / NOT READY
```

Stop after this focused follow-up. Do not start Phase 2.
