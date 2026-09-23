# DiamondBill — Agent Context

Diamond trading / jewellery finance ERP. pnpm-workspace monorepo.

> **New session? Read [docs/PROGRESS.md](docs/PROGRESS.md) first** — it says what is done,
> what is next, and what is broken. Then read only the doc you need:
> [docs/DEV_SETUP.md](docs/DEV_SETUP.md) (env quirks) ·
> [docs/CONVENTIONS.md](docs/CONVENTIONS.md) (code patterns) ·
> [README.md](README.md) (stack + roadmap).

---

## Ground rules

1. **Never commit `.jetro/`.** It holds real credentials and this repo is **public**
   (https://github.com/dhadukmanish/DiamondBill). It is gitignored now — do not un-ignore it.
2. **Errors go to the user verbatim.** When a command fails, paste the full error and stop.
   Do not silently "fix" the user's code unless they asked for a fix.
3. **Setup/verify tasks mean no code changes.** If a task says "verify", touching source files
   is out of scope — report the problem instead.
4. **Don't touch `docker-compose.yml`.** Port 5432 is taken on this machine by other projects;
   the local DB runs on **5433** via a standalone container. See docs/DEV_SETUP.md.
5. **Ask before stopping another project's service or container.** `loantracker_db` and the
   Windows `postgresql-x64-18` service are not ours.
6. **Update `docs/PROGRESS.md` at the end of a work package** — that file is how the next
   session avoids re-discovering everything.

## Layout

```
apps/api          Fastify 5 + Drizzle + postgres driver   → http://localhost:4000
apps/web          Vite 5 + React 18 + TanStack Query      → http://localhost:5173 (proxies /api)
packages/shared   enums, zod schemas, permissions, nav, filter types — used by BOTH apps
```

`@diamondbill/shared` is consumed as source; after editing it, the API's `tsx watch` and Vite
both reload. A transient `does not provide an export named 'x'` during that reload is a race,
not a bug — it self-resolves.

## Commands

| Command | Notes |
| --- | --- |
| `pnpm install` | |
| `pnpm dev` | api + web in parallel |
| `pnpm db:migrate` / `pnpm db:seed` | seed is idempotent (backfills existing tenant) |
| `pnpm db:generate` | generate a migration after editing `apps/api/src/db/schema` |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces |

Login: `admin@diamondbill.local` / `Admin@1234` — the page is at **`/signin`**, not `/login`.

## Non-obvious environment facts

- **pnpm is not installed globally.** It comes from corepack:
  `corepack enable pnpm && corepack prepare pnpm@10.28.0 --activate`
- **Postgres is on 5433**, not 5432, and NOT from docker compose. Start it with
  `docker start diamondbill-postgres` (launch Docker Desktop manually first).
- **Vite binds IPv6 only.** `curl http://localhost:5173` hangs; use `curl -6 "http://[::1]:5173/"`.
- The `Ignored build scripts: esbuild@…` pnpm warning is harmless here — esbuild binaries exist.

## Delegate to a subagent

Heavy, output-noisy work should not run in the main conversation — it burns the context window.
Use these (`.claude/agents/`):

- **`qa-verify`** — browser QA: log in, open pages, check console/network, report pass/fail.
- **`repo-scout`** — "where does feature X live in this monorepo?"
- **`db-check`** — inspect the Postgres schema/rows on :5433 to confirm a migration or seed.

Slash commands (`.claude/commands/`): `/start-session`, `/safe-commit`, `/handoff`.

---

## Jetro plugin (unrelated to this project)

A Jetro MCP server is attached to this workspace and exposes `jet_render`, `jet_canvas`,
`jet_query`, `jet_exec`, `jet_parse`, `jet_template`. Its backend is offline / not signed in.
None of it is used by DiamondBill — ignore these tools unless the user asks for them.

> Jetro's own tooling previously owned this whole file and may try to regenerate it.
> If this DiamondBill content ever disappears from CLAUDE.md, restore it from git history.
