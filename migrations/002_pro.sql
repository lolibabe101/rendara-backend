-- ============================================================
-- Rendara Pro Schema — v2.0
-- Adds: subscriptions, payroll, employees, documents,
--       branding, wht_credits, tax_deadlines, recurring_invoices,
--       penalty_log, consultant_clients, admin tables
-- ============================================================

-- ── SUBSCRIPTION PLANS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(50) UNIQUE NOT NULL,  -- free|pro|enterprise
  display       VARCHAR(100) NOT NULL,
  price_ngn     NUMERIC(12,2) DEFAULT 0,
  price_annual  NUMERIC(12,2) DEFAULT 0,
  max_invoices_month INT DEFAULT 5,
  max_team_members   INT DEFAULT 1,
  features      JSONB DEFAULT '[]',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_plans (name, display, price_ngn, price_annual, max_invoices_month, max_team_members, features)
VALUES
  ('free',       'Free',         0,          0,          5,    1,  '["5 invoices/month","VAT & WHT tracker","Basic dashboard"]'),
  ('pro',        'Rendara Pro',  45000,      400000,     NULL, 10, '["Unlimited invoices","NRS e-filing","CIT workbench","Payroll & PAYE","Document vault","Tax calendar","WHT credits","Recurring invoices","Team management","Priority support"]'),
  ('enterprise', 'Enterprise',   150000,     1500000,    NULL, NULL,'["Everything in Pro","Multi-company","Consultant portal","White-labelling","Dedicated account manager","Custom integrations"]')
ON CONFLICT (name) DO NOTHING;

-- ── SUBSCRIPTIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  plan_id             UUID REFERENCES subscription_plans(id),
  status              VARCHAR(50) DEFAULT 'active',  -- active|past_due|cancelled|trialing
  billing_cycle       VARCHAR(20) DEFAULT 'monthly', -- monthly|annual
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end  TIMESTAMPTZ,
  paystack_customer_id VARCHAR(100),
  paystack_sub_code    VARCHAR(100),
  trial_ends_at       TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── EMPLOYEES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(255),
  phone           VARCHAR(20),
  designation     VARCHAR(150),
  department      VARCHAR(100),
  gross_salary    NUMERIC(15,2) NOT NULL,
  basic_salary    NUMERIC(15,2),
  housing         NUMERIC(15,2),
  transport       NUMERIC(15,2),
  pension_rate    NUMERIC(5,2) DEFAULT 8,
  nhf_rate        NUMERIC(5,2) DEFAULT 2.5,
  bank_name       VARCHAR(100),
  account_number  VARCHAR(20),
  tax_id          VARCHAR(50),
  date_employed   DATE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYROLL RUNS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  period          VARCHAR(20) NOT NULL,  -- YYYY-MM
  total_gross     NUMERIC(15,2) DEFAULT 0,
  total_net       NUMERIC(15,2) DEFAULT 0,
  total_paye      NUMERIC(15,2) DEFAULT 0,
  total_pension   NUMERIC(15,2) DEFAULT 0,
  total_nhf       NUMERIC(15,2) DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'draft',  -- draft|approved|paid|filed
  paye_ref        VARCHAR(100),
  filed_at        TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, period)
);

-- ── PAYROLL LINE ITEMS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_run_id  UUID REFERENCES payroll_runs(id) ON DELETE CASCADE NOT NULL,
  employee_id     UUID REFERENCES employees(id),
  employee_name   VARCHAR(255) NOT NULL,
  gross_salary    NUMERIC(15,2) NOT NULL,
  basic           NUMERIC(15,2),
  housing         NUMERIC(15,2),
  transport       NUMERIC(15,2),
  taxable_income  NUMERIC(15,2),
  paye            NUMERIC(15,2),
  pension_ee      NUMERIC(15,2),
  nhf             NUMERIC(15,2),
  other_deductions NUMERIC(15,2) DEFAULT 0,
  net_pay         NUMERIC(15,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── DOCUMENTS VAULT ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  doc_type      VARCHAR(100) NOT NULL,
  title         VARCHAR(255) NOT NULL,
  file_name     VARCHAR(255),
  file_url      TEXT,
  file_size     INTEGER,
  issued_by     VARCHAR(255),
  issued_date   DATE,
  expiry_date   DATE,
  reference     VARCHAR(100),
  notes         TEXT,
  uploaded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── COMPANY BRANDING ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_branding (
  business_id     UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  logo_url        TEXT,
  brand_color     VARCHAR(20) DEFAULT '#00897B',
  invoice_footer  TEXT,
  stamp_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── WHT CREDIT CERTIFICATES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS wht_credits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  invoice_id      UUID REFERENCES invoices(id),
  cert_number     VARCHAR(100),
  withheld_by     VARCHAR(255) NOT NULL,
  withheld_by_tin VARCHAR(50),
  amount_subject  NUMERIC(15,2) NOT NULL,
  wht_rate        NUMERIC(5,2) NOT NULL,
  wht_amount      NUMERIC(15,2) NOT NULL,
  period          VARCHAR(20),
  jurisdiction    VARCHAR(50) DEFAULT 'federal',
  status          VARCHAR(50) DEFAULT 'pending',  -- pending|applied|refunded
  applied_to_cit  BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── TAX DEADLINES CALENDAR ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_deadlines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  tax_type        VARCHAR(50) NOT NULL,  -- VAT|WHT|PAYE|CIT|ANNUAL|EDT
  title           VARCHAR(255) NOT NULL,
  deadline_date   DATE NOT NULL,
  period          VARCHAR(20),
  status          VARCHAR(50) DEFAULT 'upcoming',  -- upcoming|due|overdue|filed
  filed_at        TIMESTAMPTZ,
  reference       VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, tax_type, period)
);

-- ── RECURRING INVOICES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  customer_id   UUID REFERENCES customers(id),
  title         VARCHAR(255) NOT NULL,
  frequency     VARCHAR(50) NOT NULL,  -- monthly|quarterly|annual
  next_date     DATE NOT NULL,
  items         JSONB NOT NULL DEFAULT '[]',
  notes         TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  last_run_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PENALTY LOG ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penalty_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  tax_type        VARCHAR(50) NOT NULL,
  period          VARCHAR(20),
  principal       NUMERIC(15,2) NOT NULL,
  days_late       INTEGER DEFAULT 0,
  penalty_rate    NUMERIC(5,2) DEFAULT 10,
  penalty_amount  NUMERIC(15,2) DEFAULT 0,
  interest_amount NUMERIC(15,2) DEFAULT 0,
  total_due       NUMERIC(15,2) DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'outstanding',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONSULTANT CLIENT LINKS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS consultant_clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultant_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  role          VARCHAR(50) DEFAULT 'tax_consultant',
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(consultant_id, business_id)
);

-- ── AUDIT LOG ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(100),
  entity_id   UUID,
  details     JSONB,
  ip_address  VARCHAR(50),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employees_biz    ON employees(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_biz      ON payroll_runs(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period   ON payroll_runs(period);
CREATE INDEX IF NOT EXISTS idx_docs_biz         ON documents(business_id);
CREATE INDEX IF NOT EXISTS idx_docs_type        ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_whtc_biz         ON wht_credits(business_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_biz    ON tax_deadlines(business_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_date   ON tax_deadlines(deadline_date);
CREATE INDEX IF NOT EXISTS idx_recurring_biz    ON recurring_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_recurring_next   ON recurring_invoices(next_date);
CREATE INDEX IF NOT EXISTS idx_cc_consultant    ON consultant_clients(consultant_id);
CREATE INDEX IF NOT EXISTS idx_cc_business      ON consultant_clients(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_biz        ON audit_log(business_id);
CREATE INDEX IF NOT EXISTS idx_subs_biz         ON subscriptions(business_id);

-- ── AUTO-UPDATE TRIGGERS ──────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscriptions','employees','payroll_runs','business_branding',
    'wht_credits','recurring_invoices'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t
    );
  END LOOP;
END;
$$;
