# ASV Finance — Technical Architecture

Companion to [`../CLAUDE.md`](../CLAUDE.md). This is the developer-facing detail:
data model, multi-tenancy/RLS design, API surface, and folder layout. Business
context and plain-language explanation live in `CLAUDE.md`.

---

## 1. System overview

```
React SPA (web) ─┐
                 ├──HTTPS──▶ NestJS API (/api/v1) ──▶ PostgreSQL (RLS)
Mobile app  ─────┘                    │
 (later)                              └──▶ Object storage (KYC images, on disk/S3-compatible)
```

- **Frontend:** React + TypeScript + Vite. State via React Query. Role-aware routing.
- **Backend:** NestJS (TypeScript), REST, versioned `/api/v1`. Prisma or TypeORM
  as ORM (Prisma preferred for typed queries; must support setting a per-request
  session variable for RLS — see §3).
- **DB:** PostgreSQL (shared server instance, UTF8 / C.UTF-8). Following the
  server's house convention (hotel_pms / t2gcrm / vaultguard): database
  `asvfinance` owned by role **`asvfinance_owner`** (owns objects, runs
  migrations); the API connects as **`asvfinance_app`** (least-privilege, DML
  only, **NOT** superuser / `BYPASSRLS` / table owner) so RLS always applies.
  Setup script: [`../deploy/db-setup.sql`](../deploy/db-setup.sql). Optional
  `asvfinance_dev` DB mirrors the t2gcrm dev/prod split.
- **Auth:** JWT (access + refresh). Claims: `sub` (employee id), `tenant_id`,
  `role`, `branch_id`. Passwords hashed with argon2id.

---

## 2. Multi-tenancy & security model

**Strategy:** shared database, shared schema, `tenant_id uuid NOT NULL` on every
business table, enforced by **PostgreSQL Row-Level Security**.

Layers of defense (all must hold):

1. **JWT** carries `tenant_id`, `role`, `branch_id`. Signed, short-lived access token.
2. **Request context:** a NestJS middleware/interceptor opens a DB connection/
   transaction and runs:
   ```sql
   SET LOCAL app.tenant_id   = '<tenant uuid>';
   SET LOCAL app.branch_id   = '<branch id>';
   SET LOCAL app.role        = '<role>';
   SET LOCAL app.employee_id = '<employee id>';
   ```
3. **RLS policies** on every table filter by `tenant_id = current_setting('app.tenant_id')::uuid`.
   Example:
   ```sql
   ALTER TABLE client ENABLE ROW LEVEL SECURITY;
   ALTER TABLE client FORCE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON client
     USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
   ```
4. **Branch/center scoping** for FDO/BM is applied as an *additional* WHERE in the
   query layer (and optionally a second RLS policy keyed on `app.role`/`app.branch_id`).
   FDO → only assigned centers; BM → only own branch; HO → whole tenant.
5. **Connection pooling caveat:** because RLS depends on `SET LOCAL`, every request
   MUST run inside a transaction on a dedicated connection and reset on release.
   Use `SET LOCAL` (transaction-scoped) — never plain `SET`. Verify the pooler
   (PgBouncer) is in *session* or *transaction* mode compatible with this.

**Golden rule:** the API server never trusts `tenant_id`/`branch_id` from the
client body — only from the verified JWT.

---

## 3. Core data model (ERD sketch)

All tables include: `id uuid pk`, `tenant_id uuid`, `created_at`, `updated_at`,
`created_by`, `updated_by`, `is_active`. Money as `numeric(14,2)`. Dates as `date`.

```
tenant (finance company)
  ├─ branch                (code, name, working_date)
  │    ├─ employee         (fdo_code, name, role[FDO|BM|HO], login, password_hash, branch_id)
  │    │     └─ employee_center   (m:n  employee ⇄ center assignment)
  │    └─ center           (code, name, address, meeting_day, meeting_time,
  │          │              meeting_place, formation_date, next_meeting_date,
  │          │              lat, lng, mobile, status, fdo_id)
  │          └─ group_unit  (group_no 1..5, center_id)
  │                └─ client (member_no 1..5, client_code[PMF…], name, dob, gender,
  │                     │      caste, community, religion, occupation, qualification,
  │                     │      marital_status, spouse_name, spouse_occupation,
  │                     │      children_count, monthly_income, monthly_expense,
  │                     │      house_status, father_name, mother_name,
  │                     │      present_address, permanent_address, pincode,
  │                     │      post_office, district, state, country,
  │                     │      lat, lng, date_of_joining, status)
  │                     ├─ kyc          (mobile, voter_id, other_id, pan, smart_card,
  │                     │                 ration_card, uid_masked)
  │                     ├─ co_applicant (name, gender, dob, relation, mobile,
  │                     │                 voter_id, other_id, pan)   [nominee]
  │                     └─ kyc_document (doc_type_id, image_path, uploaded_at)
  │
  ├─ MASTERS (tenant-scoped lookups)
  │    ├─ loan_product   (name, flat_rate, tenure, default_frequency)
  │    ├─ purpose        (name)               ← large searchable list
  │    ├─ frequency      (code[DLY|WKS|MNS|MON], days_between)
  │    └─ document_type  (name, required_for[CLIENT|NOMINEE|BOTH], is_mandatory)
  │
  ├─ LOANS
  │    ├─ loan_application (client_id, product_id, purpose_id, frequency_id,
  │    │                    requested_amount, sanctioned_amount, status, admission_fee)
  │    └─ loan             (loan_account[PMF…/cycle], cycle_no, client_id, product_id,
  │          │              loan_amount, interest_amount, total_amount, total_dues,
  │          │              disbursal_date, due_start_date, maturity_date,
  │          │              closed_date, loan_type[OPEN|CLOSED], status)
  │          └─ repayment_schedule (due_no, due_date, due_pri, due_int, due_amt,
  │                                  coll_date, coll_pri, coll_int, coll_amt,
  │                                  due_balance)
  │
  ├─ COLLECTIONS & CASH
  │    ├─ demand          (demand_date, fdo_id, type[CENTERWISE|CLIENTWISE], lines…)
  │    ├─ collection      (loan_id, schedule_id, collected_on, pri, int, amount,
  │    │                    mode[CASH|UPI…], entered_by)
  │    └─ eod_closing     (branch_id, eod_date, opening_balance, total_receipts,
  │                         total_payments, closing_balance, status, done_at, done_by)
  │
  └─ audit_log (entity, entity_id, action, before, after, employee_id, at)
```

### Notes / rules
- **Client ID** display format `branch.center.group.member` (e.g. `5.29.1.1`);
  `client_code` (`PMF005179`) is the persistent account number.
- **Loan account** = `{client_code}/{cycle_no}` (e.g. `PMF005179/2`).
- **Schedule engine** (flat interest): `interest = loan_amount × flat_rate`;
  `total = loan + interest`; `instalment = total / total_dues`; spread over dates
  by `frequency.days_between` from `due_start_date`. **Per-instalment principal/
  interest split rule = TBC with client** (do not hardcode 750/250 until confirmed).
- **Eligibility gate** before sanction (matches the yellow warnings): existing
  loan balance, arrears, missing mandatory `document_type`s for client + nominee,
  missing photos. Optionally RBI checks (income ≤ 3L, FOIR ≤ 50%).
- **Working date:** reads `branch.working_date`, never `now()`, for demand/schedule/EOD.

---

## 4. API surface (v1, first cut — Employee portal)

```
POST   /api/v1/auth/login            → JWT (tenant, role, branch)
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/me                     → profile, assigned centers, working date
GET    /api/v1/dashboard              → cards + center-wise arrear/demand/collection

# Masters (read for FDO)
GET    /api/v1/centers                → my centers
GET    /api/v1/centers/:id/groups
GET    /api/v1/loan-products | /purposes | /frequencies | /document-types

# Utilities / verification services
GET    /api/v1/lookup/pincode/:code   → post office, district, state, country
POST   /api/v1/kyc/verify             → duplicate/existing-client check

# Clients
GET    /api/v1/clients?center=&q=     → client search
POST   /api/v1/clients                → enroll (KYC + demographics + nominee)
GET    /api/v1/clients/:id
PATCH  /api/v1/clients/:id            → KYC update (incl. lat/lng)
POST   /api/v1/clients/:id/co-applicant
POST   /api/v1/clients/:id/documents  → upload KYC document (multipart)

# Loans
GET    /api/v1/clients/:id/loans      → existing loan details
POST   /api/v1/loan-applications      → apply (runs eligibility gate)
GET    /api/v1/loan-applications/:id
GET    /api/v1/loans/:id/schedule
GET    /api/v1/loans/:id/ledger

# Demand & collections
GET    /api/v1/demand?date=&type=&fdo=   → demand sheet
GET    /api/v1/collections/due?date=      → today's collectable list
POST   /api/v1/collections                → post a collection (maker)
# (verification/approval, EOD, disbursement = BM endpoints, later)

# Reports (printable → PDF/Excel)
GET    /api/v1/reports/application-form/:clientId.pdf
GET    /api/v1/reports/loan-schedule/:loanId.pdf
GET    /api/v1/reports/loan-ledger/:loanId.pdf
```

Conventions: JSON, `snake_case` DB / `camelCase` API, RFC7807-style error bodies,
pagination via `?page=&limit=`, all list endpoints tenant+scope filtered server-side.

---

## 5. Repository layout (monorepo)

```
ASV_Finance/
├── CLAUDE.md
├── docs/
│   └── ARCHITECTURE.md          ← this file
├── backend/                     ← NestJS API
│   ├── src/
│   │   ├── common/ (auth, rls-context, guards, audit)
│   │   ├── modules/ (clients, loans, collections, reports, masters, …)
│   │   └── main.ts
│   ├── prisma/ (schema.prisma, migrations, rls.sql)
│   └── package.json
├── frontend/                    ← React SPA (field-officer portal)
│   ├── src/ (pages, components, api, auth)
│   └── package.json
├── deploy/                      ← nginx conf, pm2 ecosystem.config.js, .env.example
└── README.md
```

---

## 6. Non-functional requirements

- **Security:** RLS-enforced tenancy; argon2 passwords; HTTPS/TLS; no secrets in
  git (`.env`); rate-limit auth; session idle timeout; audit log on all money ops;
  maker-checker on disbursement; soft-delete only.
- **Reliability:** DB transactions around collections/EOD; nightly pg backups.
- **Performance:** dashboard/monitoring queries are heavy → indexed on
  `(tenant_id, branch_id, center_id, due_date)`; consider materialized summaries.
- **Localization:** Tamil labels; Indian number formatting (lakh/crore); INR.
- **Offline (future mobile):** design collection/enrollment endpoints to accept
  batched, idempotent writes (client-generated UUIDs) for later sync.
- **Auditability:** immutable `audit_log`; financial rows never hard-deleted.

---

## 7. Build sequence (Employee portal first)

1. **Foundation:** repo, DB, Prisma schema, RLS policies + tests proving no
   cross-tenant/cross-branch leakage, auth + JWT + RLS context wiring, app shell.
2. **Masters + lookups:** products, purposes, frequencies, document types,
   pincode lookup, KYC verify.
3. **Client:** enrollment, KYC docs, KYC update (GPS), co-applicant, search.
4. **Loans:** application + eligibility gate + schedule engine (flat interest).
5. **Demand + collections** (pending screen review).
6. **Reports/print:** application form, schedule, ledger.

Each step ships with automated tests, especially **tenant-isolation tests** (the
"no data leakage" guarantee).
