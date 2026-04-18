-- ============================================================
-- Rendara Database Schema - v1.0
-- Run: npm run migrate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  phone         VARCHAR(20),
  is_verified   BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BUSINESSES (multi-tenant) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               VARCHAR(255) NOT NULL,
  tin                VARCHAR(20) UNIQUE NOT NULL,
  rc_number          VARCHAR(50),
  address            TEXT,
  state              VARCHAR(100),
  country            VARCHAR(100) DEFAULT 'Nigeria',
  email              VARCHAR(255),
  phone              VARCHAR(20),
  sector             VARCHAR(100),
  is_vat_registered  BOOLEAN DEFAULT FALSE,
  vat_number         VARCHAR(50),
  logo_url           TEXT,
  created_by         UUID REFERENCES users(id),
  is_active          BOOLEAN DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USER ↔ BUSINESS ACCESS (RBAC) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_businesses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  role        VARCHAR(50) DEFAULT 'owner',   -- owner | accountant | viewer
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, business_id)
);

-- ─── CUSTOMERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  name                VARCHAR(255) NOT NULL,
  tin                 VARCHAR(20),
  email               VARCHAR(255),
  phone               VARCHAR(20),
  address             TEXT,
  customer_type       VARCHAR(50) DEFAULT 'corporate',  -- corporate | individual
  is_wht_applicable   BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRODUCTS / SERVICES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  unit_price      NUMERIC(15,2) NOT NULL DEFAULT 0,
  unit            VARCHAR(50) DEFAULT 'unit',
  vat_applicable  BOOLEAN DEFAULT TRUE,
  wht_applicable  BOOLEAN DEFAULT FALSE,
  wht_rate        NUMERIC(5,2) DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INVOICES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id          UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  customer_id          UUID REFERENCES customers(id),
  invoice_number       VARCHAR(100) UNIQUE NOT NULL,
  irn                  VARCHAR(255) UNIQUE,
  invoice_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date             DATE,
  status               VARCHAR(50) DEFAULT 'draft',      -- draft|issued|submitted|paid|cancelled
  subtotal             NUMERIC(15,2) DEFAULT 0,
  vat_amount           NUMERIC(15,2) DEFAULT 0,
  wht_amount           NUMERIC(15,2) DEFAULT 0,
  total_amount         NUMERIC(15,2) DEFAULT 0,
  notes                TEXT,
  firs_status          VARCHAR(50) DEFAULT 'pending',    -- pending|submitted|accepted|rejected
  firs_submission_id   VARCHAR(255),
  currency             VARCHAR(10) DEFAULT 'NGN',
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INVOICE LINE ITEMS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id   UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  product_id   UUID REFERENCES products(id),
  description  TEXT NOT NULL,
  quantity     NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price   NUMERIC(15,2) NOT NULL,
  vat_rate     NUMERIC(5,2) DEFAULT 7.5,
  vat_amount   NUMERIC(15,2) DEFAULT 0,
  wht_rate     NUMERIC(5,2) DEFAULT 0,
  wht_amount   NUMERIC(15,2) DEFAULT 0,
  line_total   NUMERIC(15,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TAX ENTRIES (WHT / VAT LEDGER) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  invoice_id       UUID REFERENCES invoices(id),
  tax_type         VARCHAR(20) NOT NULL,               -- VAT | WHT
  tax_period       VARCHAR(20),                        -- YYYY-MM
  amount           NUMERIC(15,2) NOT NULL,
  direction        VARCHAR(20) NOT NULL,               -- payable | receivable
  status           VARCHAR(50) DEFAULT 'pending',      -- pending | remitted
  remittance_date  DATE,
  reference        VARCHAR(100),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BOOKKEEPING ENTRIES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookkeeping_entries (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  entry_type   VARCHAR(20) NOT NULL,    -- income | expense
  category     VARCHAR(100),
  description  TEXT NOT NULL,
  amount       NUMERIC(15,2) NOT NULL,
  entry_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  reference    VARCHAR(100),
  invoice_id   UUID REFERENCES invoices(id),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FIRS SUBMISSION LOG ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS firs_submissions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      UUID REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id       UUID REFERENCES invoices(id),
  submitted_at     TIMESTAMPTZ DEFAULT NOW(),
  response_code    VARCHAR(50),
  response_message TEXT,
  status           VARCHAR(50) DEFAULT 'pending',    -- pending|accepted|rejected
  payload          JSONB,
  response         JSONB
);

-- ─── REFRESH TOKENS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_business   ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer   ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date       ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_items_invoice       ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tax_business        ON tax_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_tax_period          ON tax_entries(tax_period);
CREATE INDEX IF NOT EXISTS idx_tax_type            ON tax_entries(tax_type);
CREATE INDEX IF NOT EXISTS idx_bk_business         ON bookkeeping_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_bk_date             ON bookkeeping_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_customers_business  ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business   ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_ub_user             ON user_businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_ub_business         ON user_businesses(business_id);
CREATE INDEX IF NOT EXISTS idx_rt_token            ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_rt_user             ON refresh_tokens(user_id);

-- ─── AUTO-UPDATE updated_at TRIGGER ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','businesses','customers','products',
    'invoices','tax_entries','bookkeeping_entries'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t
    );
  END LOOP;
END;
$$;
