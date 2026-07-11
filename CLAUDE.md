# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working in this repo (developer guidance)

**Project state:** Foundation / architecture phase. This repo currently contains
**docs only — no application code yet** (no `package.json`, no build/lint/test
setup). Do **not** invent build or test commands; when the app is scaffolded, the
backend and frontend will each carry their own tooling under `backend/` and
`frontend/`. Update this section with real commands once they exist.

**Read before coding (the big-picture architecture spans multiple files):**
- `docs/ARCHITECTURE.md` — data model (ERD), multi-tenant RLS design, API surface, repo layout.
- `deploy/db-setup.sql` — PostgreSQL owner/app role model that the RLS security depends on.
- `deploy/DEPLOYMENT.md` — git push→pull to VPS, pm2 + nginx.
- Sections below — full business domain, loan process, and compliance rules.

**Architectural invariants (do not violate):**
1. **Multi-tenant isolation via PostgreSQL RLS is the core security model.** Every
   business table has `tenant_id` and uses `ENABLE`+`FORCE ROW LEVEL SECURITY`. The
   API connects as the least-privilege role **`asvfinance_app`** (never owner /
   superuser / `BYPASSRLS`); **migrations** run as **`asvfinance_owner`**. Each
   request runs in a transaction that first sets `SET LOCAL app.tenant_id` (and
   `app.branch_id`, `app.role`, `app.employee_id`) from the **JWT** — never from
   the client body. This requires transaction-scoped connections (watch PgBouncer
   mode). Any new table needs its tenant-isolation policy or it is a data-leak bug.
2. **API-first.** All business logic (loan math, eligibility, arrears, scoping)
   lives in the NestJS API; the React web app — and the future mobile app — are
   thin clients over the versioned `/api/v1`. Never put rules in the frontend.
3. **Domain hierarchy & scoping:** Tenant → Branch → Center → Group → Client.
   Roles FDO/BM/HO limit visibility (FDO = own centers, BM = own branch, HO =
   tenant). Enforce server-side.
4. **Use the branch `working_date`, never `now()`,** for demand/schedule/EOD logic.
5. **Money:** `numeric(14,2)`; UUID primary keys; **soft-delete only** on financial
   data; write an `audit_log` entry for money-affecting actions; **maker-checker**
   (separate approver) on disbursement.
6. **Loan schedule = flat interest** (interest added upfront, equal instalments).
   The exact per-instalment principal/interest split rule is **TBC — confirm with
   the client, do not hardcode** the 750/250 example.
7. **UI is original.** The reference product's screenshots are for *concept only* —
   never clone their layout, colours, or wording (see §6.4).
8. **Build order:** Employee (Field Officer) portal first; BM and HO later, but the
   schema/security must support all three from the start.

**Conventions:** DB `snake_case`, API `camelCase`; deploy is git push→pull (secrets
live only in the server's `backend/.env`, never in git).

---

# ASV Finance — Microfinance Loan Management Software

> This document explains **what we are building, why, and how**, in plain language.
> It is written so that **non-technical readers** (business owners, branch managers,
> field officers) can understand it, while also guiding the developers.
> Read this first before any work on the project.

---

## 1. What is this project?

**ASV Finance** runs a small finance business that lends money to **women's
self-help groups** (Tamil: *magalir suya udhavi kuzhu*). We are building the
software that manages this entire business — enrolling members, giving loans,
and collecting repayments.

- **Company name:** ASV Finance
- **Product / app name:** ASV Finance (working title "MAGILCHI-style" system)
- **Website / domain:** `asvsmallfinance.com`
- **Type of lending:** Group lending to women — the **JLG (Joint Liability Group)**
  model, the standard approach used across Tamil Nadu.

> **⚠️ Design principle — original UI, not a clone.**
> The screenshots we reviewed are from **another vendor's product (MAGILCHI)** and
> are used **only to understand the concepts, data, and workflow** — the *what*,
> not the *look*. ASV Finance must have its **own original UI/UX, layout, colour
> scheme, navigation, naming, and branding**. Do **not** copy that product's
> screens, styling, or wording. We replicate the *microfinance domain*, not their
> interface. (See §6.4 for our design direction.)

The software has **three kinds of users** (we build them one at a time):

| User | Tamil / local name | What they do |
|------|--------------------|--------------|
| **Field Officer (FDO)** | Field Development Officer | Goes to villages, enrolls members, applies for loans, collects weekly repayments. **← We build this portal FIRST.** |
| **Branch Manager (BM)** | Branch admin | Manages one branch: approves/verifies, closes the day (EOD), monitors collections, maintains master data. *(Later.)* |
| **Head Office (HO) / Company** | Company login | Sees all branches, company-wide reports. *(Later.)* |

> **Build order (decided):** **Employee (Field Officer) portal first.**
> Branch Manager and Head Office come later. But we design the database and
> security for all three from day one, so nothing has to be rebuilt.

---

## 2. How the business actually works (the loan process)

This is the real-world process the software must mirror. Understanding this is
more important than any technical detail.

### 2.1 The group structure

Money is **not** lent to individuals directly off the street. It is lent through
a strict group structure that creates social pressure to repay:

```
ASV Finance (the company)
    └── Branch            e.g. 005 - NATHAM  (an office covering an area)
          └── Center      e.g. 029 - NALLAKULAM  (one village / locality)
                └── Group  (5 groups per center)
                      └── Member  (5 women per group)
```

- **1 Center = 5 Groups**
- **1 Group = 5 Members (women)**
- So **1 Center = up to 25 members**.
- Every member has an ID like **`5.29.1.1`** = Branch 5 · Center 29 · Group 1 · Member 1.

### 2.2 Joint Liability — why groups matter

The loan has **no collateral** (no gold, no property). Instead, the **whole group
guarantees each loan**. If one member does not pay, it is the group's problem —
this "joint liability" is what makes repayment reliable. Members must:
- live close to each other and know each other,
- **not** be from the same family,
- typically be women aged ~20–60.

### 2.3 The weekly cycle (the heart of the business)

1. **Center Formation** — the FDO forms a center in a village: picks a
   **meeting day** (e.g. every **Tuesday**), meeting time, and meeting place.
   The center location is saved with **GPS latitude/longitude**.
2. **Enrollment + KYC** — each woman is enrolled with her details and **KYC**
   (Aadhaar/UID, Voter ID, PAN, Ration card, photo). A **co-applicant/nominee**
   (usually husband/family) is also recorded. Documents are uploaded.
3. **Loan Application** — the FDO applies for a loan for a member (e.g.
   **₹10,000** each; amounts like ₹20,000–₹50,000 also seen). A **purpose** is
   chosen (e.g. petty shop, tailoring, agri, etc.) and a **frequency**
   (weekly / monthly / daily).
4. **Verification & Disbursement** — the Branch Manager verifies the KYC and loan,
   then the loan is **disbursed** (money given). At this point the software
   generates a **repayment schedule**.
5. **Weekly Collection** — every week at the center meeting, the FDO collects the
   fixed instalment from each member and records it. Missed payments become
   **arrears**.
6. **End of Day (EOD)** — the branch reconciles the cash collected each day
   (opening balance + receipts − payments = closing balance) and "closes" the day.
7. **Closure** — when all instalments are paid, the loan is **CLOSED**. Good
   members get a **repeat loan** (a new "cycle", e.g. loan account `PMF005179/2`).

### 2.4 How the loan money is calculated (flat interest)

Example from a real member (VASSILA):

- Loan amount: **₹50,000**
- Interest added upfront: **₹12,000**
- **Total to repay: ₹62,000**
- Repaid in **62 weekly instalments of ₹1,000** each.
- Each ₹1,000 instalment splits into **principal + interest** (e.g. ₹750 + ₹250).

This is **flat-rate interest**: interest is calculated on the full loan up front
and added to the total, then divided into equal instalments.

> ⚠️ **TO CONFIRM with ASV Finance:** the exact rule for splitting each instalment
> into principal vs interest, and the flat interest rate(s) per product. The
> schedule generator needs this precise formula. Do not guess — ask.

### 2.5 Key daily tools for the field officer

- **Demand Sheet** — the list of "who owes how much today", per center or per member.
- **Collection entry** — recording what was actually collected.
- **Loan Ledger** — the full history of a loan: each instalment due vs collected,
  with a running balance. Printable for the member.
- **Monitoring reports** — Zero-Collection (who paid nothing), Collection Follow-up
  (arrears), Advance Collection (upcoming dues).

---

## 3. What other Tamil Nadu software does (so we match expectations)

We reviewed existing microfinance products used in Tamil Nadu (AMY Technologies,
Genius Technology, Jaguar Software, Bofin, Intelligrow, Websoftex). Common,
expected features we should plan for:

- **Center-native operation** — group meetings, attendance, and group liability
  are core, not add-ons.
- **Offline field collection** — the mobile app must work in villages with poor
  network and **sync later** (important for the future mobile app).
- **GPS + photo capture** — geo-tag centers/clients, capture meeting photos.
- **Arrears / PAR monitoring** — track overdue buckets (1/7/30/90 days).
- **Printable loan cards / schedules / receipts.**
- **Tamil language** support for field staff.
- **Credit bureau checks** (CIBIL / CRIF High Mark) and **UPI/BBPS** payments are
  common integrations — *future scope*, note but not build now.

---

## 4. Rules we must respect (RBI microfinance regulations, 2022)

Microfinance in India is governed by the **RBI (Regulatory Framework for
Microfinance) Directions, 2022**. We should build the software so these rules can
be **enforced as guardrails** (confirm with ASV Finance which apply to us):

- **Household income limit:** microfinance loans are for households with annual
  income up to **₹3,00,000**. → We should capture **household income** at enrollment.
- **50% repayment cap (FOIR):** total monthly loan repayments (this loan + all
  other loans of the household) must not exceed **50% of monthly household income**.
  → The system should be able to **check/flag** this before sanctioning.
- **No multiple-lending abuse:** a borrower cannot be in more than the allowed
  number of groups / borrow from too many lenders. → Duplicate-KYC checks matter
  (we already saw a "Verify" step for this).
- **Transparent pricing:** interest and all charges must be clearly disclosed;
  give the member a **loan card** with terms and grievance info.
- **Fair recovery:** no coercive collection. Record everything for audit.

> These are **business guardrails to design for**, not optional nice-to-haves.
> Flag to ASV Finance which they want enforced (hard-block) vs warned.

---

## 5. Security & privacy — "safe, secure, no data leakage"

We handle sensitive personal and financial data (Aadhaar, income, loans). The
users are **not technical**, so the software must be safe **by default**.
Non-negotiable principles:

1. **Multi-tenant isolation (no data leakage between companies).**
   The software is built so multiple finance companies could use it, each fully
   isolated. Every record is tagged with a **tenant (company) ID**, and the
   database itself enforces isolation using **PostgreSQL Row-Level Security (RLS)**
   — meaning even a programming mistake cannot leak one company's data to another.
2. **Branch/center scoping.** A field officer sees **only their own centers'**
   data; a branch manager sees only their branch. Enforced on the server, never
   trusted from the browser.
3. **Login & roles.** Secure login with **JWT tokens**; every user has a role
   (FDO / BM / HO) that limits what they can see and do.
4. **Passwords** are never stored in plain text (hashed with bcrypt/argon2).
   No passwords, card numbers, or Aadhaar numbers ever appear in web addresses/URLs.
5. **Encryption in transit** — HTTPS everywhere (TLS certificate for
   `asvsmallfinance.com`). Sensitive fields (e.g. Aadhaar) considered for
   encryption at rest.
6. **Audit trail** — every financial action records **who did it and when**.
   Nothing financial is hard-deleted; we mark records inactive instead.
7. **Maker-checker** — money-affecting actions (loan disbursement) are entered by
   one person and **verified/approved by another** (the Branch Manager).
8. **Session timeout** — inactive sessions log out automatically (the app already
   shows a "Clear Timeout" concept).
9. **Backups** — regular automated database backups on the server.
10. **Least privilege** — the app's database user has only the access it needs;
    it is separate from other apps sharing the server.

---

## 6. Technical architecture

> Plain summary: a **website** (React) that talks to a **server program** (the API)
> which stores everything in a **secure database** (PostgreSQL). Later, a **mobile
> app** will talk to the *same* API.

```
   ┌──────────────┐        ┌──────────────┐
   │  Web App     │        │  Mobile App  │   ← built later
   │  (React)     │        │  (React Native / Flutter) │
   │  Field Officer portal │        │  Field Officer app │
   └──────┬───────┘        └──────┬───────┘
          │   HTTPS (secure)      │
          └──────────┬───────────┘
                     ▼
          ┌────────────────────┐
          │   API server       │   ← all business rules & security live here
          │   (Node.js / NestJS)│      versioned at /api/v1
          └─────────┬──────────┘
                    ▼
          ┌────────────────────┐
          │   PostgreSQL DB     │   ← Row-Level Security keeps tenants separate
          │   (own DB on shared │
          │    VPS instance)    │
          └────────────────────┘
```

### 6.1 Technology choices (decided)

| Layer | Choice | Why |
|-------|--------|-----|
| Web frontend | **React** (SPA, TypeScript) | Modern, fast; the field-officer portal |
| Backend API | **Node.js + NestJS** (TypeScript) | One language across stack; clean, versioned REST API that the **mobile app will reuse** |
| Database | **PostgreSQL** | Strong for financial data + transactions; supports **Row-Level Security** |
| Multi-tenancy | **Shared schema + `tenant_id` + RLS** | One codebase, strong isolation, easy company-wide reporting |
| Auth | **JWT** (tenant_id + role in token) | Stateless; works for web and mobile |
| Process manager | **pm2** | Matches the server's existing apps |
| Web server | **nginx** | Serves the React build + reverse-proxies the API |
| Reports/print | Server-side PDF/Excel export | Loan cards, schedules, ledgers |

### 6.2 API-first principle

**All business logic (loan math, eligibility, arrears, security) lives in the API,
never in the browser.** The React web app is just the first client; the mobile app
will be the second and must behave identically. The API is versioned (`/api/v1`)
so the mobile app can depend on a stable contract.

### 6.3 The core data (simplified)

Every table below carries a `tenant_id` (company) and audit fields
(created/updated by + timestamp):

- **Tenant** (finance company) → **Branch** → **Center** → **Group** → **Client/Member**
- **Employee** (FDO/BM/HO) with role; assigned to branch/centers
- **KYC** + **KycDocument** (photo/ID uploads) + **CoApplicant/Nominee**
- **LoanProduct**, **Purpose**, **Frequency**, **DocumentType** (master data)
- **LoanApplication** → **Loan** (with cycle no, flat interest, totals)
- **RepaymentSchedule** (each instalment: due vs collected + running balance)
- **Collection** (daily cash posting) + **Demand** (what's due)
- **EODClosing** (daily cash reconciliation)
- **AuditLog**

> Full table design and API endpoint list live in **`docs/ARCHITECTURE.md`**.

### 6.4 UI / design direction (original — do NOT clone the reference)

The reference product's screens are for **workflow understanding only**. Our
interface is designed fresh for ASV Finance:

- **Own brand identity** — ASV Finance name, logo, and colour palette (not the
  reference's blue header/sidebar). Define a small design system (colours,
  typography, spacing, components) up front.
- **Modern, field-friendly UX** — large touch targets, minimal typing, dropdowns
  and search where the field officer works fast; mobile-responsive from day one
  (the same React components should adapt, easing the future mobile app).
- **Task-oriented layout** — organise screens around what the FDO is doing
  (enroll, apply, collect), not a literal copy of the reference's menu tree.
- **Tamil-first friendliness** — clear labels, bilingual where useful, Indian
  number formatting (lakh/crore), INR.
- **Accessibility & clarity** — readable contrast, clear validation messages
  (replace the reference's yellow warning list with our own clean inline
  eligibility feedback).
- **Reuse the domain, not the design** — same fields and rules (because the
  business is the same), but our own components, wording, and visual language.

> Rule of thumb: if someone put our app next to the reference product, it should
> look like a **different, better product** that happens to do the same job.

### 6.5 Deployment (where it runs)

- **Server:** VPS at `85.208.51.93`, Ubuntu 24.04, Node v20 (via nvm), pm2, nginx.
- **Layout:** `/var/www/asvfinance-backend` (API under pm2) and
  `/var/www/asvfinance-frontend` (React build served by nginx).
- **Domain:** `asvsmallfinance.com` → nginx → serves web app + proxies `/api`.
- **Database:** a dedicated PostgreSQL database + user inside the server's shared
  PostgreSQL instance (isolated from the other apps on the box).
- **HTTPS:** TLS certificate (Let's Encrypt) for the domain.

---

## 7. What we build first — Employee (Field Officer) Portal

Scope for phase 1 (mirrors the screens already reviewed):

1. **Login** + session timeout + role = FDO.
2. **Dashboard** — my centers, my clients, disbursement, portfolio outstanding,
   and my collection summary (opening arrear → demand → collection → closing arrear).
3. **Client** — Enrollment, KYC Documents upload, KYC Update (with GPS locate),
   Co-Applicant.
4. **Client Search.**
5. **Loan Module** — Loan Application (KYC panel, existing loans, eligibility
   warnings, sanctioned amount).
6. **Reports** — Demand Sheet; Client Application Form; Loan Schedule; Loan Ledger
   (all printable).
7. **Collections** — daily collection entry against demand. *(Screen still to be
   reviewed — confirm before building.)*

Foundations built alongside (used by every phase): tenant + RLS, roles, working
date, audit trail, master data, the flat-interest **schedule engine**.

---

## 8. Open questions (confirm with ASV Finance before building those parts)

1. **Loan interest:** exact flat rate(s) per product and the per-instalment
   principal/interest split rule (the ₹750/₹250 pattern).
2. **Collections posting** and **disbursement/approval** screens — not yet seen.
3. **Master data / Transactions / Utilities** detail — not yet seen.
4. Which **RBI guardrails** to hard-enforce vs warn (income limit, 50% cap).
5. Whether **credit-bureau (CIBIL/CRIF)** and **UPI/BBPS** integrations are in
   scope now or later.

---

## 9. Glossary (Tamil / microfinance terms)

| Term | Meaning |
|------|---------|
| Magalir suya udhavi kuzhu | Women's self-help group |
| JLG | Joint Liability Group — group guarantees the loan, no collateral |
| SHG | Self-Help Group |
| Center | A village/locality unit that holds up to 5 groups |
| Group | 5 members within a center |
| FDO | Field (Development) Officer — the field employee |
| BM | Branch Manager |
| HO | Head Office / company level |
| KYC | "Know Your Customer" — identity documents |
| Demand | Amount due to be collected |
| Arrear | Overdue (unpaid) amount |
| EOD | End of Day — daily cash reconciliation |
| Portfolio OS | Portfolio Outstanding — total loan money still to be recovered |
| Disbursement | Giving out the loan money |
| Cycle | Loan number for a repeat borrower (e.g. `/2` = second loan) |

---

*This file is the single source of truth for the project's intent. Update it as
decisions are made. Detailed data model and API design: see `docs/ARCHITECTURE.md`.*
