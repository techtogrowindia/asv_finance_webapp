-- ASV Finance — Row-Level Security policies + auth bootstrap.
-- Run AFTER `prisma migrate deploy`, as the OWNER role (asvfinance_owner), via:
--   npm run rls:apply     (prisma db execute against MIGRATION_DATABASE_URL)
--
-- Model: every tenant-scoped table isolates rows by tenant_id, compared against
-- the per-request GUC `app.tenant_id` set with SET LOCAL from the JWT. With no
-- context set, current_setting(..., true) returns NULL → the predicate is false →
-- zero rows (default-deny). FORCE guarantees the policy applies even to the owner
-- when it does NOT have BYPASSRLS; the owner keeps BYPASSRLS only for bootstrap.

-- ---- Tenant-scoped tables (isolate by tenant_id) ---------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branch','employee','center','employee_center','group_unit','client',
    'co_applicant','frequency','purpose','loan_product','document_type',
    'kyc_document','kyc_number','loan_application','loan','repayment_schedule',
    'collection','audit_log','eod_closing','access_role','savings_txn',
    'collection_correction','savings_refund_request'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
    $f$, t);
  END LOOP;
END $$;

-- ---- Tenant table itself (isolate by id) -----------------------------------
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant;
CREATE POLICY tenant_isolation ON tenant
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- ---- Auth bootstrap --------------------------------------------------------
-- Login must find an employee BEFORE any tenant context exists. This function is
-- SECURITY DEFINER, owned by asvfinance_owner (BYPASSRLS), so it can look up the
-- login across tenants. It returns only what auth needs. The app role may EXECUTE
-- it but cannot read the employee table directly without tenant context.
-- Return signature changed (added permissions) — CREATE OR REPLACE cannot alter
-- a function's return type, so drop the old one first.
DROP FUNCTION IF EXISTS auth_login_lookup(text);
CREATE OR REPLACE FUNCTION auth_login_lookup(p_login text)
RETURNS TABLE (
  id            uuid,
  tenant_id     uuid,
  branch_id     uuid,
  role          text,
  name          text,
  code          text,
  status        text,
  password_hash text,
  permissions   text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.tenant_id, e.branch_id, e.role::text, e.name, e.code,
         e.status::text, e.password_hash,
         -- Action permissions from the assigned role (empty if none/inactive).
         CASE WHEN ar.is_active THEN coalesce(ar.permissions, '{}') ELSE '{}' END
  FROM employee e
  LEFT JOIN access_role ar ON ar.id = e.access_role_id
  WHERE e.login = p_login
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_login_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_login_lookup(text) TO asvfinance_app;

-- ---- EOD auto-close bootstrap -----------------------------------------------
-- The nightly auto-close job runs without an authenticated request (no JWT), so
-- it needs to discover which tenants/branches are due across tenant boundaries
-- before any RLS context can be set — same problem as login, same fix pattern
-- (SECURITY DEFINER, owner-only, returns just the ids). The actual closing still
-- runs through normal withTenant() calls per branch, one at a time.
CREATE OR REPLACE FUNCTION eod_autoclose_candidates()
RETURNS TABLE (tenant_id uuid, branch_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.tenant_id, b.id
  FROM branch b
  JOIN tenant t ON t.id = b.tenant_id
  WHERE t.auto_close_eod = true AND t.is_active = true AND b.is_active = true;
$$;

REVOKE ALL ON FUNCTION eod_autoclose_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eod_autoclose_candidates() TO asvfinance_app;
