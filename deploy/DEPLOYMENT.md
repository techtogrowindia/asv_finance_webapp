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

- **Server:** `85.208.51.93`, Ubuntu 24.04, Node v20 (root's nvm), pm2, nginx.
- **Domain:** `asvsmallfinance.com` → nginx → static frontend + `/api` proxy to the API.
- **Database:** PostgreSQL `asvfinance` (see [`db-setup.sql`](db-setup.sql)).
- **Execution model:** the `asv-finance` account is **login-only**. Everything runs
  via `sudo` as **root**, using **root's** nvm/node/npm/pm2 — same as the other apps
  on this box. `sudo` resets PATH, so commands must load root's nvm first. Define a
  helper for the session:

  ```bash
  # loads root's Node toolchain, then runs the given command as root
  RUN() { sudo bash -c 'export NVM_DIR=/root/.nvm; . "$NVM_DIR/nvm.sh"; '"$*"; }
  ```

---

## One-time server setup

```bash
# 1. Repo access: add a read-only deploy key (or a GitHub PAT) so the VPS can pull.
#    Prefer a per-repo deploy key. (Do NOT store passwords in git.)

# 2. Clone into /var/www (as root)
sudo git clone git@github.com:techtogrowindia/asv_finance_webapp.git /var/www/asv_finance_webapp
cd /var/www/asv_finance_webapp

# 3. Database (run once, as postgres — set real passwords first)
sudo -u postgres psql -f deploy/db-setup.sql

# 4. Environment file (NEVER committed — created on the server only)
sudo cp backend/.env.example backend/.env
sudo nano backend/.env                 # set real DB URLs + JWT secrets

# 5. Backend: install, migrate + RLS, seed, start under pm2 (all via root's nvm)
RUN 'cd /var/www/asv_finance_webapp/backend && npm ci && npm run prisma:generate'
RUN 'cd /var/www/asv_finance_webapp/backend && npm run migrate:deploy'   # migrate + apply rls.sql
RUN 'cd /var/www/asv_finance_webapp/backend && npm run seed'             # demo tenant + logins
RUN 'cd /var/www/asv_finance_webapp/backend && npm run build && pm2 start ecosystem.config.js && pm2 save'

# 6. Frontend: install + build (nginx serves the static output)
RUN 'cd /var/www/asv_finance_webapp/frontend && npm ci && npm run build'

# 7. nginx: install the site config, test, reload
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/asvsmallfinance.com
sudo ln -sf /etc/nginx/sites-available/asvsmallfinance.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 8. HTTPS
sudo certbot --nginx -d asvsmallfinance.com -d www.asvsmallfinance.com
```

## Routine updates (each release)

```bash
cd /var/www/asv_finance_webapp
sudo git pull origin main

# backend changed?
RUN 'cd /var/www/asv_finance_webapp/backend && npm ci && npm run migrate:deploy && npm run build && pm2 restart asvfinance-api'

# frontend changed?
RUN 'cd /var/www/asv_finance_webapp/frontend && npm ci && npm run build'   # nginx serves new dist
```

> A small `deploy/update.sh` can wrap the above once the app stabilises.

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

- **Execution as root via sudo:** `asv-finance` is login-only with passwordless
  sudo; all commands run as root using **root's** nvm/node/pm2. Because `sudo`
  resets PATH, always load nvm first (the `RUN` helper above, or
  `sudo bash -c 'export NVM_DIR=/root/.nvm; . "$NVM_DIR/nvm.sh"; <cmd>'`). pm2
  therefore runs under root — consistent with the server's other apps.
- **Secrets stay on the server** in `.env` (gitignored). The repo never holds
  passwords, keys, or the DB dump.
- **Uploads** (KYC images) and **backups** live outside the git tree so `git pull`
  never touches them.
- Two DB connection strings enforce the RLS security model: migrations run as the
  owner, the running API connects as the least-privilege app role.
- Consider a `dev` deployment later (branch `develop` → `asvfinance_dev` DB),
  mirroring the server's `t2gcrm_dev` / `t2gcrm_prod` split.
