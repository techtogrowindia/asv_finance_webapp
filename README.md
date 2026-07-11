# ASV Finance — Microfinance Loan Management System

Loan management software for **ASV Finance**, a small finance company lending to
women's self-help groups (*magalir suya udhavi kuzhu*) using the Joint Liability
Group (JLG) model in Tamil Nadu.

- **Domain:** asvsmallfinance.com
- **Repo:** https://github.com/techtogrowindia/asv_finance_webapp

## Documentation

- **[CLAUDE.md](CLAUDE.md)** — plain-language master spec: business process,
  security, RBI compliance, and architecture (read this first).
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — data model, multi-tenant RLS
  design, API surface, repo layout.
- **[deploy/db-setup.sql](deploy/db-setup.sql)** — PostgreSQL database & role setup.

## Stack

React (web) + Node.js/NestJS API (`/api/v1`) + PostgreSQL (Row-Level Security for
multi-tenant isolation). Deploys on VPS via pm2 + nginx. Same API will serve a
future mobile app.

## Status

🚧 Foundation / architecture phase. Building the **Employee (Field Officer)
portal** first; Branch Manager and Head Office tiers later.

## Structure (planned)

```
backend/    NestJS API
frontend/   React web app (field-officer portal)
deploy/     nginx conf, pm2 config, DB setup
docs/       architecture & design docs
```
