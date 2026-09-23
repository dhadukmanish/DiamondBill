# Deploying DiamondBill

Production runs on a **Hostinger VPS**, as a Docker Compose stack behind the **host nginx**.
Day to day you never touch the server — you run `/deploy`.

| | |
| --- | --- |
| URL | https://md.pratishthabridal.in |
| VPS | `213.210.37.67` · Ubuntu 24.04 · 2 vCPU / 8 GB · hostname `mail.tathastuinternational.com` |
| App dir | `/opt/diamondbill` |
| SSH | `ssh -i ~/.ssh/diamondbill_vps root@213.210.37.67` |

## ⚠️ This VPS is shared and busy

It is **not** a dedicated box. It also runs:

- ~15 live sites on the host nginx — `pratishthabridal.com`, `clothing/fashion/mapi/motiwala.pratishthabridal.com`, `ck`/`studio.pratishthabridal.in`, `dtechintegrity.com`, `valentinesjewels.com`, `viratenterprise.com`, `lms-backend`/`motiwalalive`/`motiwalauat.divyeshsarvaiya.com`, `milk-backend.pratishthabridal.com`
- **a mail server** (`mail.tathastuinternational.com`)
- certbot managing ~10 certificates
- a gunicorn app on `127.0.0.1:8000`
- a broken **Coolify** install (`/data/coolify`) — its main container cannot start because port
  8000 is taken, and its Traefik proxy is not running

**Rules:** never restart nginx without `nginx -t` first; never `docker compose down` anything you
did not start; never touch `/data/coolify`; never free port 8000. One mistake takes down 15 sites
and email.

## Why not Coolify

Coolify is installed but dead — port 8000 conflict, and it would want to own :80/:443 where the
host nginx already lives. Fixing it risks every other site on the box. So DiamondBill uses the
same pattern as the other 15 sites: a loopback port + an nginx server block + certbot.

## Architecture

```
internet → host nginx :443 (certbot TLS)
         → 127.0.0.1:8091
         → web container (nginx, serves the SPA, proxies /api/ → api:4000)
         → api container (node, migrations on start)
         → db container (postgres 16, internal only)
```

| Service | Image | Notes |
| --- | --- | --- |
| `web` | nginx 1.27-alpine | bound to `127.0.0.1:${WEB_PORT}` only |
| `api` | node 20-alpine | entrypoint applies migrations before Fastify binds |
| `db` | postgres 16-alpine | `db-data` volume, **not** published to the host |

Because the web container proxies `/api` on the same origin, there is no CORS in production —
the same shape as the Vite dev proxy. Uploads live in the `api-uploads` volume and are **not**
backed up yet.

## Environment

`/opt/diamondbill/.env` on the server, from `.env.production.example`. Not in git.

| Var | Notes |
| --- | --- |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `JWT_SECRET` | `openssl rand -base64 48`. Changing it logs everyone out. |
| `CORS_ORIGIN` | `https://md.pratishthabridal.in` |
| `WEB_PORT` | `8091`. Must not clash — 8000, 8080, 3100 are taken. |
| `RUN_SEED` | `true` for the **first** deploy only, then back to `false` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | real credentials — never ship `Admin@1234` |

## Routine deploys

```
/deploy
```

It pushes what is committed, SSHes in, pulls, rebuilds, and verifies health. It reads its
config from **`~/.diamondbill-deploy.env`** (outside the repo):

```sh
DEPLOY_HOST=root@213.210.37.67
DEPLOY_KEY=~/.ssh/diamondbill_vps
DEPLOY_DIR=/opt/diamondbill
DEPLOY_HEALTH_URL=https://md.pratishthabridal.in/api/health
```

To deploy from the **home laptop**, generate a *separate* key there
(`ssh-keygen -t ed25519 -f ~/.ssh/diamondbill_vps -C "diamondbill-deploy@laptop"`), append its
`.pub` to the server's `~/.ssh/authorized_keys`, and create the same config file. Do not copy
the private key between machines.

> When appending a key, use `>>` only after checking the file ends in a newline — a previous
> append glued two keys onto one line here and broke both. Safer: `printf '\n%s\n' "<key>" >> ~/.ssh/authorized_keys`
> then validate every line with `ssh-keygen -l -f`.

## Migrations

The API entrypoint runs `node dist/db/migrate.js` on **every** start, before Fastify binds.
Drizzle skips already-applied ones, so restarts are safe. A failed migration stops the container
rather than serving a half-migrated schema — deliberate.

There is **no automatic rollback**. Before a destructive migration, snapshot the VPS
(Hostinger → Snapshots) and note it in `docs/PROGRESS.md`.

## Testing the production build locally

```bash
POSTGRES_PASSWORD=test JWT_SECRET=test CORS_ORIGIN=http://localhost:8099 RUN_SEED=true WEB_PORT=8099 \
  docker compose -p dbsmoke -f docker-compose.prod.yml up -d --build
curl http://localhost:8099/api/health
POSTGRES_PASSWORD=x JWT_SECRET=x CORS_ORIGIN=x docker compose -p dbsmoke down -v
```

## Troubleshooting

| Symptom | Where to look |
| --- | --- |
| 502 from the domain | `api` is down — `docker compose -f docker-compose.prod.yml logs api`, usually a failed migration |
| 502 and `web` is fine | nginx is proxying to the wrong port; check `WEB_PORT` vs the nginx server block |
| Container restart loop | a missing env var; compose fails loudly on unset required ones |
| Cert renewal fails | `certbot renew --dry-run`. Several *other* certs on this box are already expired — not ours |
| Login works then 401s | `JWT_SECRET` changed between deploys |
| nginx will not reload | `nginx -t` first. **Never** reload a config that fails the test — 15 sites go down |
