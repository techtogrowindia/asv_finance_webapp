-- =============================================================================
-- ASV Finance — PostgreSQL database & role setup
-- Run once on the VPS as the postgres superuser:  sudo -u postgres psql -f db-setup.sql
--
-- Follows the server's house convention (see hotel_pms / t2gcrm / vaultguard):
--   database <app>  owned by <app>_owner  ; application connects as <app>_app
--
-- IMPORTANT for security (Row-Level Security / multi-tenant isolation):
--   * <app>_owner  owns the tables and RUNS MIGRATIONS.
--   * <app>_app    is what the API connects as — it is NOT a superuser, does NOT
--                  have BYPASSRLS, and does NOT own the tables. Combined with
--                  "ALTER TABLE ... FORCE ROW LEVEL SECURITY" this guarantees RLS
--                  applies to every query the application makes.
--   * Replace the placeholder passwords below BEFORE running. Do NOT commit real
--     passwords to git — keep them only in the server's .env.
-- =============================================================================

-- ---- Roles -----------------------------------------------------------------
-- Owner role: owns the database and all objects. Used for migrations, seeding,
-- and SECURITY DEFINER helper functions (e.g. login lookup). It has BYPASSRLS so
-- it can read/write across tenants for those bootstrap tasks even though tables
-- use FORCE ROW LEVEL SECURITY. The running API must NEVER connect as this role.
CREATE ROLE asvfinance_owner LOGIN PASSWORD 'CHANGE_ME_OWNER' BYPASSRLS;

-- Application role: least-privilege, used by the running API. RLS ALWAYS applies
-- to it (no BYPASSRLS, not a superuser, not the table owner).
CREATE ROLE asvfinance_app   LOGIN PASSWORD 'CHANGE_ME_APP';

-- ---- Database --------------------------------------------------------------
CREATE DATABASE asvfinance OWNER asvfinance_owner ENCODING 'UTF8';

-- (Optional, mirrors t2gcrm_dev / t2gcrm_prod if you want a dev copy:)
-- CREATE DATABASE asvfinance_dev OWNER asvfinance_owner ENCODING 'UTF8';

-- Let the app role connect; revoke public connect for tightness.
REVOKE CONNECT ON DATABASE asvfinance FROM PUBLIC;
GRANT  CONNECT ON DATABASE asvfinance TO asvfinance_app;

-- ---- Schema grants (run while connected to the asvfinance database) --------
\connect asvfinance

-- Objects live in the default 'public' schema, owned by the owner role.
ALTER SCHEMA public OWNER TO asvfinance_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT  USAGE ON SCHEMA public TO asvfinance_app;

-- Default privileges: whatever asvfinance_owner creates later (via migrations),
-- automatically grant DML (no DDL) to the app role. RLS still governs the rows.
ALTER DEFAULT PRIVILEGES FOR ROLE asvfinance_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO asvfinance_app;
ALTER DEFAULT PRIVILEGES FOR ROLE asvfinance_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO asvfinance_app;

-- Reminder (do NOT do this): never grant BYPASSRLS or superuser to asvfinance_app.
-- Every tenant table must be created with:
--     ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE <t> FORCE  ROW LEVEL SECURITY;   -- so even the owner obeys RLS
--     CREATE POLICY tenant_isolation ON <t>
--       USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
--       WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
