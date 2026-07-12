-- =============================================================================
-- One-off migration: unify KYC numbers under DocumentType (admin-managed),
-- replacing the fixed Kyc model and CoApplicant's voter_id/other_id/pan columns
-- with a dynamic kyc_number table (mirrors kyc_document).
--
-- Run as the OWNER role (asvfinance_owner) against the production DB, BEFORE
-- `prisma db push` on the final schema. Safe by construction: every existing
-- number is copied into kyc_number and verified BEFORE the old columns/table
-- are dropped in the same transaction.
-- =============================================================================
BEGIN;

-- ---- 1. Extend document_type (additive) ------------------------------------
ALTER TABLE document_type ADD COLUMN IF NOT EXISTS requires_number boolean NOT NULL DEFAULT true;
ALTER TABLE document_type ADD COLUMN IF NOT EXISTS requires_photo  boolean NOT NULL DEFAULT true;
ALTER TABLE document_type ADD COLUMN IF NOT EXISTS mask_value      boolean NOT NULL DEFAULT false;

UPDATE document_type SET requires_number = false WHERE name IN ('CLIENT PHOTO', 'NOMINEE PHOTO', 'PASSBOOK');
UPDATE document_type SET mask_value = true WHERE name IN ('CLIENT UID FRONT', 'NOMINEE UID FRONT');

-- New number-only proof types (BOTH = one master row serves client + nominee).
INSERT INTO document_type (id, tenant_id, name, applies_to, requires_number, requires_photo, mask_value, is_mandatory, is_active, created_at)
SELECT gen_random_uuid(), t.id, v.name, 'BOTH', true, false, false, false, true, now()
FROM tenant t, (VALUES ('PAN CARD'), ('RATION CARD'), ('OTHER ID')) AS v(name)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ---- 2. Create kyc_number (matches the Prisma KycNumber model exactly) -----
CREATE TABLE IF NOT EXISTS kyc_number (
  id                uuid NOT NULL PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  client_id         uuid NOT NULL REFERENCES client(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  document_type_id  uuid NOT NULL REFERENCES document_type(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  party             "DocumentParty" NOT NULL DEFAULT 'CLIENT',
  value             text NOT NULL,
  updated_at        timestamp(3) NOT NULL,
  UNIQUE (client_id, document_type_id, party)
);
CREATE INDEX IF NOT EXISTS kyc_number_tenant_id_client_id_idx ON kyc_number (tenant_id, client_id);

-- ---- 3. Migrate kyc -> kyc_number (party = CLIENT) -------------------------
INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), k.tenant_id, k.client_id, dt.id, 'CLIENT', k.uid, now()
FROM kyc k JOIN document_type dt ON dt.tenant_id = k.tenant_id AND dt.name = 'CLIENT UID FRONT'
WHERE k.uid IS NOT NULL AND k.uid <> '';

INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), k.tenant_id, k.client_id, dt.id, 'CLIENT', k.voter_id, now()
FROM kyc k JOIN document_type dt ON dt.tenant_id = k.tenant_id AND dt.name = 'CLIENT VID FRONT'
WHERE k.voter_id IS NOT NULL AND k.voter_id <> '';

INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), k.tenant_id, k.client_id, dt.id, 'CLIENT', k.pan, now()
FROM kyc k JOIN document_type dt ON dt.tenant_id = k.tenant_id AND dt.name = 'PAN CARD'
WHERE k.pan IS NOT NULL AND k.pan <> '';

INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), k.tenant_id, k.client_id, dt.id, 'CLIENT', k.ration_card, now()
FROM kyc k JOIN document_type dt ON dt.tenant_id = k.tenant_id AND dt.name = 'RATION CARD'
WHERE k.ration_card IS NOT NULL AND k.ration_card <> '';

INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), k.tenant_id, k.client_id, dt.id, 'CLIENT', k.smart_card, now()
FROM kyc k JOIN document_type dt ON dt.tenant_id = k.tenant_id AND dt.name = 'SMART CARD'
WHERE k.smart_card IS NOT NULL AND k.smart_card <> '';

INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), k.tenant_id, k.client_id, dt.id, 'CLIENT', k.other_id, now()
FROM kyc k JOIN document_type dt ON dt.tenant_id = k.tenant_id AND dt.name = 'OTHER ID'
WHERE k.other_id IS NOT NULL AND k.other_id <> '';

-- ---- 4. Migrate co_applicant -> kyc_number (party = NOMINEE) ---------------
INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), ca.tenant_id, ca.client_id, dt.id, 'NOMINEE', ca.voter_id, now()
FROM co_applicant ca JOIN document_type dt ON dt.tenant_id = ca.tenant_id AND dt.name = 'NOMINEE VID FRONT'
WHERE ca.voter_id IS NOT NULL AND ca.voter_id <> '';

INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), ca.tenant_id, ca.client_id, dt.id, 'NOMINEE', ca.pan, now()
FROM co_applicant ca JOIN document_type dt ON dt.tenant_id = ca.tenant_id AND dt.name = 'PAN CARD'
WHERE ca.pan IS NOT NULL AND ca.pan <> '';

INSERT INTO kyc_number (id, tenant_id, client_id, document_type_id, party, value, updated_at)
SELECT gen_random_uuid(), ca.tenant_id, ca.client_id, dt.id, 'NOMINEE', ca.other_id, now()
FROM co_applicant ca JOIN document_type dt ON dt.tenant_id = ca.tenant_id AND dt.name = 'OTHER ID'
WHERE ca.other_id IS NOT NULL AND ca.other_id <> '';

-- ---- 5. Verification (abort if counts don't reconcile) ---------------------
DO $$
DECLARE
  kyc_nonblank int;
  ca_nonblank int;
  migrated int;
BEGIN
  SELECT
    count(*) FILTER (WHERE uid IS NOT NULL AND uid <> '') +
    count(*) FILTER (WHERE voter_id IS NOT NULL AND voter_id <> '') +
    count(*) FILTER (WHERE pan IS NOT NULL AND pan <> '') +
    count(*) FILTER (WHERE ration_card IS NOT NULL AND ration_card <> '') +
    count(*) FILTER (WHERE smart_card IS NOT NULL AND smart_card <> '') +
    count(*) FILTER (WHERE other_id IS NOT NULL AND other_id <> '')
  INTO kyc_nonblank FROM kyc;

  SELECT
    count(*) FILTER (WHERE voter_id IS NOT NULL AND voter_id <> '') +
    count(*) FILTER (WHERE pan IS NOT NULL AND pan <> '') +
    count(*) FILTER (WHERE other_id IS NOT NULL AND other_id <> '')
  INTO ca_nonblank FROM co_applicant;

  SELECT count(*) INTO migrated FROM kyc_number;

  IF migrated <> (kyc_nonblank + ca_nonblank) THEN
    RAISE EXCEPTION 'KYC migration mismatch: expected % rows, found %', kyc_nonblank + ca_nonblank, migrated;
  END IF;

  RAISE NOTICE 'KYC migration verified: % rows migrated (kyc=%, co_applicant=%)', migrated, kyc_nonblank, ca_nonblank;
END $$;

-- ---- 6. Drop the now-redundant old columns/table ---------------------------
ALTER TABLE co_applicant DROP COLUMN voter_id, DROP COLUMN other_id, DROP COLUMN pan;
DROP TABLE kyc;

COMMIT;
