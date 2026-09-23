---
description: Deploy DiamondBill to production (md.pratishthabridal.in)
argument-hint: "[--skip-checks]"
---

Deploy the current `main` to production. Read `docs/DEPLOY.md` first if anything is unclear —
**especially the warning that this VPS also runs ~15 other live sites and a mail server.**

Config lives outside the repo at `~/.diamondbill-deploy.env` (the repo is public):
`DEPLOY_HOST`, `DEPLOY_KEY`, `DEPLOY_DIR`, `DEPLOY_HEALTH_URL`.
If it is missing, stop and tell the user to create it — do not guess.

## 1. Pre-flight (local)

- `git status -sb`. Dirty tree → **stop** and show the user. Deploying is not committing;
  let them run `/safe-commit`.
- Branch must be `main` and not behind origin.
- Unless `$ARGUMENTS` has `--skip-checks`:
  - `pnpm typecheck`
  - `docker build -f apps/api/Dockerfile -t diamondbill-api:preflight .`
  - `docker build -f apps/web/Dockerfile -t diamondbill-web:preflight .`
  Any failure aborts. Show the full output; do not fix it yourself.
- Show what is shipping: `git log --oneline -5`.

## 2. Push

`git push` if anything is unpushed. The server deploys from GitHub.

## 3. Deploy (on the server)

```bash
ssh -i "$DEPLOY_KEY" "$DEPLOY_HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/diamondbill
git fetch --all
git reset --hard origin/main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
REMOTE
```

`--build` is required — images are built on the server, not pulled.

## 4. Verify

Poll `$DEPLOY_HEALTH_URL` until it returns `{"message":"ok",...}` (allow ~5 min for the build).
Use a background `until` loop, not foreground sleeps. Then check and report each:

- `GET $DEPLOY_HEALTH_URL` → 200, `status: up`
- `GET https://md.pratishthabridal.in/` → 200, HTML
- TLS cert valid and not near expiry
- `docker compose ps` shows `web`, `api`, `db` all up, `db` healthy

On failure: fetch `docker compose -f docker-compose.prod.yml logs --tail 60 api`, show it
verbatim, and **stop**. Do not roll back or re-deploy on your own — ask.

## 5. After

Report the commit deployed, container states, health result, and elapsed time.
Offer to add a line to `docs/PROGRESS.md`.

## Never

- Never run migrations by hand — the api entrypoint does it on start.
- Never `docker compose down -v` — `-v` destroys the production database volume.
- Never restart or reconfigure the **host nginx** without `nginx -t` passing first;
  ~15 other live sites and mail depend on it.
- Never touch `/data/coolify`, the gunicorn app on :8000, or containers you did not start.
- Never set `RUN_SEED=true` against an existing production database without asking.
- Never print the contents of `/opt/diamondbill/.env`.
