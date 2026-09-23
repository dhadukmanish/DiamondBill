---
description: Boot the DiamondBill local stack and report health
---

Bring up the local DiamondBill stack and report its state. Do not change any source files.

1. Read `docs/PROGRESS.md` and summarise in 3–4 lines: last commit, what is done, what is next.
2. Ensure pnpm is available: `pnpm -v`. If missing:
   `corepack enable pnpm && corepack prepare pnpm@10.28.0 --activate`
3. Ensure Postgres is up: `docker start diamondbill-postgres` (port **5433**).
   If Docker is not running, start Docker Desktop and wait for `docker info` to succeed.
   Never run `docker compose up -d` — 5432 is taken by other projects. Never stop
   `loantracker_db` or the `postgresql-x64-18` service.
4. Start `pnpm dev` in the background.
5. Verify and report:
   - `curl -s http://localhost:4000/api/health` → expect `{"message":"ok",...}`
   - `curl -s -o /dev/null -w '%{http_code}' -6 "http://[::1]:5173/"` → expect 200
     (Vite is IPv6-only; plain `localhost` hangs.)
6. Report `git status -sb` and the current HEAD.

Show any error in full and stop — do not fix it yourself unless asked.
