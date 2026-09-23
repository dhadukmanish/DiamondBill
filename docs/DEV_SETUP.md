# Local dev setup (this machine)

Windows 11 · repo at `E:\DIVYESH\DiamondBill` · PowerShell primary, Bash available.

The README quick-start does **not** work verbatim here. Two deviations, both deliberate:
pnpm comes from corepack, and Postgres runs on 5433 outside docker compose.

---

## 1. pnpm

pnpm is not installed globally. Once per machine:

```bash
corepack enable pnpm
corepack prepare pnpm@10.28.0 --activate     # version from package.json "packageManager"
```

## 2. Postgres — port 5433, standalone container

Port **5432 is already taken** by another project on this machine: the Windows service
`postgresql-x64-18` and a `loantracker_db` container. Neither belongs to DiamondBill —
**do not stop them.**

So `docker compose up -d` will always fail here with
`Bind for 0.0.0.0:5432 failed: port is already allocated`. `docker-compose.yml` is left
unmodified on purpose (it is correct for everyone else); we run our own container instead.

Docker Desktop does not autostart — launch `C:\Program Files\Docker\Docker\Docker Desktop.exe`
and wait for `docker info` to succeed.

**Every day:**
```bash
docker start diamondbill-postgres
```

**First time only** (if the container is gone):
```bash
docker run -d --name diamondbill-postgres \
  -e POSTGRES_USER=diamondbill -e POSTGRES_PASSWORD=diamondbill -e POSTGRES_DB=diamondbill \
  -p 5433:5432 -v diamondbill_pgdata:/var/lib/postgresql/data postgres:16-alpine
```
Data lives in the `diamondbill_pgdata` volume and survives container removal.

## 3. `apps/api/.env`

Gitignored. Copy from `.env.example` and set port **5433**:

```
DATABASE_URL=postgres://diamondbill:diamondbill@localhost:5433/diamondbill
JWT_SECRET=change-me-in-production
PORT=4000
CORS_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads
```

## 4. Run

```bash
pnpm install
pnpm db:migrate
pnpm db:seed          # idempotent — safe to re-run
pnpm dev
```

- API   → http://localhost:4000/api/health
- Web   → http://localhost:5173 → redirects to **`/signin`**
- Login → `admin@diamondbill.local` / `Admin@1234`

---

## Gotchas

| Symptom | Cause / fix |
| --- | --- |
| `curl http://localhost:5173` hangs (HTTP 000) | Vite binds IPv6 only. Use `curl -6 "http://[::1]:5173/"`. |
| `pnpm: command not found` | corepack not activated — see step 1. |
| `Bind for 0.0.0.0:5432 failed` | You ran `docker compose up -d`. Don't; see step 2. |
| `failed to connect to the docker API at npipe://…` | Docker Desktop isn't running. |
| `Ignored build scripts: esbuild@…` | Harmless. The esbuild binaries are present and Vite runs. |
| `does not provide an export named 'x'` right after editing `packages/shared` | tsx-watch reload race. It re-runs itself and recovers. Don't "fix" it. |
| `LF will be replaced by CRLF` on `git add` | Cosmetic Windows line-ending warning. |
| `Python was not found` | Python is not installed here (only the Store alias stub). Script with `node -e` instead. |

## Stopping for the day

```bash
# ports 4000 / 5173
Get-NetTCPConnection -LocalPort 4000,5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
docker stop diamondbill-postgres    # optional; data is safe either way
```
