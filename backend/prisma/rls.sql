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
    'kyc','co_applicant','frequency','purpose','loan_product','document_type',
    'kyc_document','loan_application','loan','repayment_schedule'
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
CREATE OR REPLACE FUNCTION auth_login_lookup(p_login text)
RETURNS TABLE (
  id            uuid,
  tenant_id     uuid,
  branch_id     uuid,
  role          text,
  name          text,
  code          text,
  status        text,
  password_hash text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.tenant_id, e.branch_id, e.role::text, e.name, e.code,
         e.status::text, e.password_hash
  FROM employee e
  WHERE e.login = p_login
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_login_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_login_lookup(text) TO asvfinance_app;
