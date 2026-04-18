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

-- ══════════════════════════════════════════════════════════════
-- RENDARA PRO — SCHEMA ADDITIONS v2.0
-- ══════════════════════════════════════════════════════════════

-- ─── SUBSCRIPTION PLANS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(50) NOT NULL,  -- free | basic | pro | enterprise
  display     VARCHAR(100) NOT NULL,
  price_ngn   NUMERIC(12,2) DEFAULT 0,
  price_annual_ngn NUMERIC(12,2) DEFAULT 0,
  max_invoices_month INTEGER DEFAULT 5,
  max_businesses INTEGER DEFAULT 1,
  max_team_members INTEGER DEFAULT 1,
  features    JSONB DEFAULT '[]',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SUBSCRIPTIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id           UUID REFERENCES subscription_plans(id),
  status            VARCHAR(30) DEFAULT 'trial', -- trial|active|past_due|cancelled|expired
  billing_cycle     VARCHAR(20) DEFAULT 'monthly', -- monthly|annual
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  paystack_customer_code VARCHAR(100),
  paystack_subscription_code VARCHAR(100),
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EMPLOYEES / PAYROLL ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255),
  phone         VARCHAR(20),
  designation   VARCHAR(100),
  department    VARCHAR(100),
  grade_level   VARCHAR(50),
  gross_salary  NUMERIC(15,2) NOT NULL DEFAULT 0,
  basic_salary  NUMERIC(15,2) DEFAULT 0,
  housing       NUMERIC(15,2) DEFAULT 0,
  transport     NUMERIC(15,2) DEFAULT 0,
  pension_rate  NUMERIC(5,2) DEFAULT 8.0,
  nhf_rate      NUMERIC(5,2) DEFAULT 2.5,
  bank_name     VARCHAR(100),
  account_number VARCHAR(20),
  tax_id        VARCHAR(50),
  date_employed DATE,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PAYROLL RUNS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  pay_period    VARCHAR(20) NOT NULL,  -- YYYY-MM
  run_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  total_gross   NUMERIC(15,2) DEFAULT 0,
  total_paye    NUMERIC(15,2) DEFAULT 0,
  total_pension NUMERIC(15,2) DEFAULT 0,
  total_nhf     NUMERIC(15,2) DEFAULT 0,
  total_net     NUMERIC(15,2) DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'draft',  -- draft|approved|filed
  filed_at      TIMESTAMPTZ,
  lirs_reference VARCHAR(100),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PAYROLL LINE ITEMS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_run_id  UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id),
  gross_salary    NUMERIC(15,2) NOT NULL,
  basic           NUMERIC(15,2) DEFAULT 0,
  housing         NUMERIC(15,2) DEFAULT 0,
  transport       NUMERIC(15,2) DEFAULT 0,
  gross_income    NUMERIC(15,2) DEFAULT 0,
  cra             NUMERIC(15,2) DEFAULT 0,
  pension_employee NUMERIC(15,2) DEFAULT 0,
  nhf             NUMERIC(15,2) DEFAULT 0,
  taxable_income  NUMERIC(15,2) DEFAULT 0,
  paye            NUMERIC(15,2) DEFAULT 0,
  net_pay         NUMERIC(15,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DOCUMENTS VAULT ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  doc_type      VARCHAR(50) NOT NULL, -- tcc|wht_cert|vat_cert|afs|tin|cac|other
  title         VARCHAR(255) NOT NULL,
  file_name     VARCHAR(255),
  file_url      TEXT,
  file_size     INTEGER,
  issued_by     VARCHAR(100),
  issued_date   DATE,
  expiry_date   DATE,
  reference     VARCHAR(100),
  notes         TEXT,
  uploaded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── WHT CREDIT CERTIFICATES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS wht_credits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES invoices(id),
  cert_number     VARCHAR(100),
  withheld_by     VARCHAR(255) NOT NULL,
  withheld_by_tin VARCHAR(20),
  amount_subject  NUMERIC(15,2) NOT NULL,
  wht_rate        NUMERIC(5,2) NOT NULL,
  wht_amount      NUMERIC(15,2) NOT NULL,
  period          VARCHAR(20),
  jurisdiction    VARCHAR(50) DEFAULT 'federal',
  status          VARCHAR(30) DEFAULT 'unmatched', -- unmatched|matched|applied
  applied_to_cit  BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TAX CALENDAR EVENTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_deadlines (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  tax_type      VARCHAR(50) NOT NULL,
  title         VARCHAR(255) NOT NULL,
  deadline_date DATE NOT NULL,
  period        VARCHAR(20),
  amount_due    NUMERIC(15,2) DEFAULT 0,
  status        VARCHAR(30) DEFAULT 'upcoming', -- upcoming|due|overdue|filed|paid
  filed_at      TIMESTAMPTZ,
  reference     VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RECURRING INVOICES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id),
  title         VARCHAR(255) NOT NULL,
  frequency     VARCHAR(20) NOT NULL,  -- monthly|quarterly|annual
  next_date     DATE NOT NULL,
  last_sent     DATE,
  items         JSONB NOT NULL DEFAULT '[]',
  notes         TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── COMPANY BRANDING ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_branding (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  logo_url      TEXT,
  brand_color   VARCHAR(20) DEFAULT '#00897B',
  invoice_footer TEXT,
  stamp_url     TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONSULTANT CLIENTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultant_clients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultant_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE,
  access_level    VARCHAR(30) DEFAULT 'full', -- full|view|file_only
  granted_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(consultant_id, business_id)
);

-- ─── PENALTY CALCULATIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS penalty_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  tax_type      VARCHAR(50) NOT NULL,
  period        VARCHAR(20),
  principal     NUMERIC(15,2) NOT NULL,
  days_late     INTEGER DEFAULT 0,
  penalty_rate  NUMERIC(5,2) DEFAULT 10.0,
  interest_rate NUMERIC(5,2) DEFAULT 21.0,
  penalty_amount NUMERIC(15,2) DEFAULT 0,
  interest_amount NUMERIC(15,2) DEFAULT 0,
  total_due     NUMERIC(15,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SEED SUBSCRIPTION PLANS ──────────────────────────────────
INSERT INTO subscription_plans (name, display, price_ngn, price_annual_ngn, max_invoices_month, max_businesses, max_team_members, features)
VALUES
  ('free',   'Free',        0,          0,         5,   1, 1,  '["5 invoices/month","Basic dashboard","NRS sandbox"]'),
  ('pro',    'Rendara Pro', 45000,      450000,    999, 5, 10, '["Unlimited invoices","All tax types","Payroll module","Document vault","WHT credits","Tax calendar","Team management","Priority support","CIT workbench","Recurring invoices"]'),
  ('enterprise', 'Enterprise', 120000,  1200000,  9999,20, 50, '["Everything in Pro","Multi-company","Consultant portal","Custom branding","Dedicated support","API access","SLA guarantee"]')
ON CONFLICT DO NOTHING;

-- ─── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employees_biz ON employees(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_biz ON payroll_runs(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_runs(pay_period);
CREATE INDEX IF NOT EXISTS idx_docs_biz ON documents(business_id);
CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_whtcred_biz ON wht_credits(business_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_biz ON tax_deadlines(business_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_date ON tax_deadlines(deadline_date);
CREATE INDEX IF NOT EXISTS idx_recur_biz ON recurring_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_subs_biz ON subscriptions(business_id);

