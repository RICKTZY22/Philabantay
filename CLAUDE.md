# Philabantay Claude entrypoint

Before changing code, read:

1. `docs/PROJECT-HUB.md`
2. `docs/memory/CURRENT-STATE.md`
3. `docs/plans/ROADMAP-STATUS.md`
4. `docs/plans/AGENT-HANDOFF.md`
5. `docs/systemarch/CODE-PATTERNS.md`
6. `docs/systemarch/ARCHITECTURE.md`
7. The active phase file and relevant security/testing documents linked from
   the project hub.

Treat migrations and shared contracts as current technical truth, and
`docs/plans/` as the intended V1 direction. Preserve unrelated dirty work.
Never mark a packet complete without recorded verification evidence.

The `docs/` directory is also the Philabantay Obsidian vault. If an `obsidian`
MCP server is available, use it for vault search, backlinks, focused section
updates, and opening notes for the user. Direct filesystem reads and edits
remain the fallback and technical source of truth. Obsidian must never become a
required build, test, or runtime dependency.

Never place API keys, passwords, tokens, private evidence, or precise private
locations in the vault. Do not copy the Obsidian Local REST API key into this
repository.

Before handing off:

- update `docs/memory/CURRENT-STATE.md` if the active packet, blocker, or next
  action changed;
- append a concise entry to `docs/memory/SESSION-LOG.md`;
- record product/architecture decisions in `docs/memory/DECISIONS.md`;
- update the authoritative roadmap/testing files when verified status changed.
