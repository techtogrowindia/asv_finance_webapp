# ASV Finance — Deployment (git push/pull to VPS)

**Workflow:** develop locally → **push** to GitHub → **pull** on the VPS → build →
restart via **pm2**. nginx serves the built frontend and reverse-proxies the API.
This mirrors how the other apps on the server are run.

```
 Local dev ──git push──▶ GitHub (techtogrowindia/asv_finance_webapp)
                                     │
                                     │ git pull   (on the VPS)
                                     ▼
        VPS  /var/www/asv_finance_webapp
             ├── backend/   → build → pm2 restart asvfinance-api
             └── frontend/  → build → nginx serves frontend/dist
```

- **Server:** `85.208.51.93`, Ubuntu 24.04, Node v20 (nvm), pm2, nginx.
- **Domain:** `asvsmallfinance.com` → nginx → static frontend + `/api` proxy to the API.
- **Database:** PostgreSQL `asvfinance` (see [`db-setup.sql`](db-setup.sql)).

---

## One-time server setup

```bash
# 1. Repo access: add a read-only deploy key (or use a GitHub PAT) so the VPS
#    can pull. Prefer a per-repo deploy key over personal credentials.
#    (Private repo → the VPS needs its own key; do NOT store passwords in git.)

# 2. Clone into /var/www
cd /var/www
git clone git@github.com:techtogrowindia/asv_finance_webapp.git
# (or https with a PAT)

# 3. Database (run once, as postgres — set real passwords first)
sudo -u postgres psql -f /var/www/asv_finance_webapp/deploy/db-setup.sql

# 4. Environment files (NEVER committed — created on the server only)
#    backend/.env  → DB URLs, JWT secret, etc.  (see backend/.env.example)
cp backend/.env.example backend/.env   # then edit with real values

# 5. Backend: install, migrate (as owner), build, start under pm2
cd backend
npm ci
npm run migrate:deploy          # runs migrations as asvfinance_owner
npm run build
pm2 start ecosystem.config.js   # process name: asvfinance-api
pm2 save

# 6. Frontend: install, build (nginx serves the static output)
cd ../frontend
npm ci
npm run build                   # outputs frontend/dist

# 7. nginx: point the domain at frontend/dist and proxy /api → 127.0.0.1:<port>
#    then: sudo nginx -t && sudo systemctl reload nginx
# 8. HTTPS: sudo certbot --nginx -d asvsmallfinance.com
```

## Routine updates (each release)

```bash
cd /var/www/asv_finance_webapp
git pull origin main

# backend changed?
cd backend && npm ci && npm run migrate:deploy && npm run build && pm2 restart asvfinance-api

# frontend changed?
cd ../frontend && npm ci && npm run build   # nginx picks up new dist automatically
```

> A small `deploy/update.sh` script can wrap the above once the apps exist.

---

## Environment variables (server-only, in `backend/.env`)

| Var | Meaning |
|-----|---------|
| `DATABASE_URL` | Runtime connection as **`asvfinance_app`** (RLS-governed) |
| `MIGRATION_DATABASE_URL` | Migration connection as **`asvfinance_owner`** (DDL) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets |
| `PORT` | API port (proxied by nginx) |
| `UPLOAD_DIR` | Path for KYC images (outside git, backed up) |
| `NODE_ENV` | `production` |

## Notes

- **Secrets stay on the server** in `.env` (gitignored). The repo never holds
  passwords, keys, or the DB dump.
- **Uploads** (KYC images) and **backups** live outside the git tree so `git pull`
  never touches them.
- Two DB connection strings enforce the RLS security model: migrations run as the
  owner, the running API connects as the least-privilege app role.
- Consider a `dev` deployment later (branch `develop` → `asvfinance_dev` DB),
  mirroring the server's `t2gcrm_dev` / `t2gcrm_prod` split.
