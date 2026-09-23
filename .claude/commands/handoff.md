---
description: Update docs/PROGRESS.md so the next session can pick up cleanly
---

Write the session handoff. The point is that a fresh agent with **zero** chat history can
resume from `docs/PROGRESS.md` alone.

1. Read `docs/PROGRESS.md`.
2. Update it from what actually happened this session:
   - the header line: last-updated date, current HEAD hash, branch/sync state
   - the roadmap table — flip anything that got finished
   - **What is verified working** — only things you genuinely observed passing
   - **Known issues / open decisions** — add new ones, delete resolved ones
   - **Next up** — the concrete next task, and anything left half-done
   - **Session log** — one new line at the top
3. If something non-obvious about the *environment* was discovered (a port, a tool quirk, a
   workaround), put it in `docs/DEV_SETUP.md` instead. If it is a *code pattern*, put it in
   `docs/CONVENTIONS.md`. PROGRESS.md is for status only.
4. Show the user the diff. Do not commit unless they ask (`/safe-commit` does that).

Be honest: record failures and half-finished work as such. An over-optimistic handoff is worse
than none.
