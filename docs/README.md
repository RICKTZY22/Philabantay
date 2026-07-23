# Philabantay documentation hub

This directory is the study guide and technical source map for Philabantay.
Start with the numbered documents in order. They explain the system from the
outside in: what a person does, how the domain is modeled, where data moves,
how it is stored, and which parts are already implemented versus planned.

## Interactive visual study board

Open [Philabantay System Atlas](PROJECT-VISUALIZATION.html) for an interactive
visualization of the end-to-end workflow, appointment lifecycle, role/UML
relationships, data flows, database domains, security layers, and roadmap.

## Authoritative V1 build plan

The implementation plan has been consolidated into the repository-level
[`plans/`](plans/README.md) folder. Agents implementing new V1 work should
read that plan first. The numbered documents here explain the system and record
its evolution; older phase names are historical when they conflict with the
five-phase plan.

## Status legend

Every new design document uses these labels:

| Label | Meaning |
| --- | --- |
| **CURRENT** | Implemented in the repository and backed by code or migrations. |
| **PARTIAL** | Some of the path exists, but an important UI, API, storage, or policy piece is missing. |
| **PLANNED** | Approved design direction; not safe to describe as working software yet. |
| **DECISION** | Product behavior that still needs explicit owner approval before implementation. |

## Read these first

1. [System flowcharts](charts/01-SYSTEM-FLOWCHARTS.md) — the complete product story in
   pictures, from signup to shop closeout.
2. [UML and domain model](systemarch/02-UML-AND-DOMAIN-MODEL.md) — components, entities,
   state machines, and important sequences.
3. [Data-flow diagrams](charts/03-DATA-FLOW-DIAGRAMS.md) — who sends what data to
   which process and data store.
4. [Detailed workflows](systemarch/04-DETAILED-WORKFLOWS.md) — role-by-role operating
   procedures, edge cases, timers, and business rules.
5. [Database design](systemarch/05-DATABASE-DESIGN.md) — present Postgres schema,
   relationships, constraints, and planned extensions.
6. [Security design](security/06-SECURITY-DESIGN.md) — trust boundaries, authorization,
   RLS, verification documents, abuse controls, and release gates.
7. [Digital roadmap](roadmap/07-DIGITAL-ROADMAP.md) — project history, current state,
   future milestones, dependencies, and definition of done.
8. [Claude collaboration prompt](mdfiles/08-CLAUDE-COLLABORATION-PROMPT.md) — a
   copy-ready prompt for coordinating frontend work with the backend lane.

## Core reference documents

| Document | Use it for |
| --- | --- |
| [Architecture](systemarch/ARCHITECTURE.md) | Stack, provider tree, routing, state ownership, and backend seam. |
| [Code patterns](systemarch/CODE-PATTERNS.md) | Required dependency direction and implementation conventions. |
| [API](systemarch/API.md) | Current Express routes and response conventions. |
| [Supabase schema](systemarch/SUPABASE-SCHEMA.md) | Existing migrations and RLS summary. |
| [Features](mdfiles/FEATURES.md) | Screen inventory and real-versus-placeholder behavior. |
| [Product logic audit](roadmap/PRODUCT-LOGIC-AUDIT-AND-ROADMAP.md) | Booking loopholes and product-policy reasoning. |
| [Implementation roadmap](roadmap/IMPLEMENTATION-ROADMAP.md) | Earlier work-package plan retained for history and comparison; `plans/` is authoritative. |
| [Role and location guardrails](security/ROLE-AND-LOCATION-GUARDRAILS.md) | Role privacy and location constraints. |
| [Security contract](security/SECURITY.md) | Existing coding and deployment security rules. |
| [Credential audit](security/SECURITY-CREDENTIAL-AUDIT.md) | Removal of bundled accounts and secrets. |
| [Local Supabase verification](mdfiles/LOCAL-SUPABASE-VERIFICATION.md) | Local RLS/API verification evidence. |
| [Code audit](security/CODE_AUDIT.md) | Earlier security, correctness, and performance findings. |
| [Hands-on change log](mdfiles/HANDSON.md) | Recent implementation history for the next developer or AI session. |

## Source-of-truth rule

Documentation never overrides running code or a versioned database migration.
When a document and implementation disagree:

1. Treat migrations and shared contracts as the current technical truth.
2. Treat [`plans/`](plans/README.md) as the intended V1 implementation
   destination.
3. Use the numbered design documents for explanation and historical context.
4. Record the discrepancy before changing behavior.
5. Update the relevant contract, plan, tests, and documentation together.

The root `README.md` intentionally remains at the repository root because it is
the conventional entry point used by Git hosting and package tooling. All
long-form project documentation lives here.
