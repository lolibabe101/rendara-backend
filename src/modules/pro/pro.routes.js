// ══════════════════════════════════════════════════
// WHT CREDIT CERTIFICATES
// ══════════════════════════════════════════════════
const express = require('express');
const db = require('../../config/db');
const R = require('../../utils/response');
const { requireRole } = require('../../middleware/auth');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');

// WHT Credits Router
const whtCreditsRouter = express.Router({ mergeParams: true });

whtCreditsRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT wc.*, i.invoice_number FROM wht_credits wc
       LEFT JOIN invoices i ON i.id = wc.invoice_id
       WHERE wc.business_id = $1 ORDER BY wc.created_at DESC`,
      [req.business.id]
    );
    return R.success(res, rows);
  } catch (err) { next(err); }
});

whtCreditsRouter.post('/', requireRole('owner', 'accountant'), [
  body('withheldBy').trim().notEmpty(),
  body('amountSubject').isFloat({ min: 0 }),
  body('whtRate').isFloat({ min: 0, max: 100 }),
  body('whtAmount').isFloat({ min: 0 }),
  validate,
], async (req, res, next) => {
  try {
    const d = req.body;
    const { rows } = await db.query(
      `INSERT INTO wht_credits (business_id, invoice_id, cert_number, withheld_by,
         withheld_by_tin, amount_subject, wht_rate, wht_amount, period, jurisdiction)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.business.id, d.invoiceId||null, d.certNumber||null, d.withheldBy,
       d.withheldByTin||null, d.amountSubject, d.whtRate, d.whtAmount,
       d.period||null, d.jurisdiction||'federal']
    );
    return R.created(res, rows[0], 'WHT credit recorded');
  } catch (err) { next(err); }
});

whtCreditsRouter.patch('/:id/apply', requireRole('owner', 'accountant'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `UPDATE wht_credits SET status = 'applied', applied_to_cit = TRUE
       WHERE id = $1 AND business_id = $2 RETURNING *`,
      [req.params.id, req.business.id]
    );
    return R.success(res, rows[0], 'WHT credit applied to CIT');
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════
// COMPANY BRANDING
// ══════════════════════════════════════════════════
const brandingRouter = express.Router({ mergeParams: true });

brandingRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM business_branding WHERE business_id = $1',
      [req.business.id]
    );
    return R.success(res, rows[0] || { brand_color: '#00897B', logo_url: null, invoice_footer: null });
  } catch (err) { next(err); }
});

brandingRouter.put('/', requireRole('owner'), async (req, res, next) => {
  try {
    const { logoUrl, brandColor, invoiceFooter, stampUrl } = req.body;
    const { rows } = await db.query(
      `INSERT INTO business_branding (business_id, logo_url, brand_color, invoice_footer, stamp_url)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (business_id) DO UPDATE SET
         logo_url = COALESCE($2, business_branding.logo_url),
         brand_color = COALESCE($3, business_branding.brand_color),
         invoice_footer = COALESCE($4, business_branding.invoice_footer),
         stamp_url = COALESCE($5, business_branding.stamp_url),
         updated_at = NOW()
       RETURNING *`,
      [req.business.id, logoUrl||null, brandColor||null, invoiceFooter||null, stampUrl||null]
    );
    return R.success(res, rows[0], 'Branding saved');
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════
// TAX CALENDAR
// ══════════════════════════════════════════════════
const calendarRouter = express.Router({ mergeParams: true });

// Auto-generate deadlines for the current year based on business setup
const generateDeadlines = async (businessId) => {
  const year = new Date().getFullYear();
  const deadlines = [
    // VAT — monthly, due 21st of following month
    ...Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const due = new Date(year, month, 21);
      return { tax_type: 'VAT', title: `VAT Return — ${due.toLocaleString('en', { month: 'long' })} ${year}`, deadline_date: due.toISOString().split('T')[0], period: `${year}-${String(month).padStart(2, '0')}` };
    }),
    // WHT — monthly, due 21st
    ...Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const due = new Date(year, month, 21);
      return { tax_type: 'WHT', title: `WHT Return — ${due.toLocaleString('en', { month: 'long' })} ${year}`, deadline_date: due.toISOString().split('T')[0], period: `${year}-${String(month).padStart(2, '0')}` };
    }),
    // PAYE — monthly, due 10th
    ...Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const due = new Date(year, month, 10);
      return { tax_type: 'PAYE', title: `PAYE — ${due.toLocaleString('en', { month: 'long' })} ${year}`, deadline_date: due.toISOString().split('T')[0], period: `${year}-${String(month).padStart(2, '0')}` };
    }),
    { tax_type: 'CIT', title: `CIT Return — FY ${year - 1}`, deadline_date: `${year}-06-30`, period: `${year - 1}` },
    { tax_type: 'ANNUAL', title: `Annual Return — ${year}`, deadline_date: `${year}-04-26`, period: `${year}` },
    { tax_type: 'EDT', title: `Education Tax — FY ${year - 1}`, deadline_date: `${year}-06-30`, period: `${year - 1}` },
  ];
  return deadlines;
};

calendarRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM tax_deadlines WHERE business_id = $1 ORDER BY deadline_date ASC`,
      [req.business.id]
    );
    if (rows.length === 0) {
      // Auto-seed deadlines
      const deadlines = await generateDeadlines(req.business.id);
      for (const d of deadlines) {
        await db.query(
          `INSERT INTO tax_deadlines (business_id, tax_type, title, deadline_date, period)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [req.business.id, d.tax_type, d.title, d.deadline_date, d.period]
        );
      }
      const { rows: fresh } = await db.query(
        `SELECT * FROM tax_deadlines WHERE business_id = $1 ORDER BY deadline_date ASC`,
        [req.business.id]
      );
      return R.success(res, fresh);
    }
    // Update status based on date
    const today = new Date().toISOString().split('T')[0];
    const updated = rows.map(d => ({
      ...d,
      status: d.status === 'filed' ? 'filed' : d.deadline_date < today ? 'overdue' : d.deadline_date === today ? 'due' : 'upcoming',
      days_remaining: Math.ceil((new Date(d.deadline_date) - new Date(today)) / (1000 * 60 * 60 * 24)),
    }));
    return R.success(res, updated);
  } catch (err) { next(err); }
});

calendarRouter.patch('/:id/file', requireRole('owner', 'accountant'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `UPDATE tax_deadlines SET status = 'filed', filed_at = NOW(), reference = $1
       WHERE id = $2 AND business_id = $3 RETURNING *`,
      [req.body.reference || null, req.params.id, req.business.id]
    );
    return R.success(res, rows[0], 'Marked as filed');
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════
// RECURRING INVOICES
// ══════════════════════════════════════════════════
const recurringRouter = express.Router({ mergeParams: true });

recurringRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT ri.*, c.name AS customer_name FROM recurring_invoices ri
       LEFT JOIN customers c ON c.id = ri.customer_id
       WHERE ri.business_id = $1 ORDER BY ri.next_date ASC`,
      [req.business.id]
    );
    return R.success(res, rows);
  } catch (err) { next(err); }
});

recurringRouter.post('/', requireRole('owner', 'accountant'), [
  body('title').trim().notEmpty(),
  body('frequency').isIn(['monthly', 'quarterly', 'annual']),
  body('nextDate').isDate(),
  body('items').isArray({ min: 1 }),
  validate,
], async (req, res, next) => {
  try {
    const d = req.body;
    const { rows } = await db.query(
      `INSERT INTO recurring_invoices (business_id, customer_id, title, frequency, next_date, items, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.business.id, d.customerId||null, d.title, d.frequency, d.nextDate,
       JSON.stringify(d.items), d.notes||null, req.user.id]
    );
    return R.created(res, rows[0], 'Recurring invoice created');
  } catch (err) { next(err); }
});

recurringRouter.delete('/:id', requireRole('owner'), async (req, res, next) => {
  try {
    await db.query('UPDATE recurring_invoices SET is_active = FALSE WHERE id = $1 AND business_id = $2', [req.params.id, req.business.id]);
    return R.success(res, null, 'Recurring invoice deactivated');
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════
// SUBSCRIPTIONS
// ══════════════════════════════════════════════════
const subscriptionsRouter = express.Router({ mergeParams: true });

subscriptionsRouter.get('/plans', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY price_ngn ASC');
    return R.success(res, rows);
  } catch (err) { next(err); }
});

subscriptionsRouter.get('/current', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, sp.name AS plan_name, sp.display AS plan_display, sp.features,
              sp.max_invoices_month, sp.max_team_members
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.business_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [req.business.id]
    );
    if (!rows.length) {
      // Return free plan by default
      const { rows: plans } = await db.query("SELECT * FROM subscription_plans WHERE name = 'free'");
      return R.success(res, { plan_name: 'free', plan_display: 'Free', status: 'active', ...plans[0] });
    }
    return R.success(res, rows[0]);
  } catch (err) { next(err); }
});

subscriptionsRouter.post('/upgrade', requireRole('owner'), async (req, res, next) => {
  try {
    const { planName, billingCycle } = req.body;
    const { rows: plans } = await db.query('SELECT * FROM subscription_plans WHERE name = $1', [planName]);
    if (!plans.length) {
      const err = new Error('Plan not found'); err.statusCode = 404; throw err;
    }
    const plan = plans[0];
    const periodEnd = billingCycle === 'annual'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const { rows } = await db.query(
      `INSERT INTO subscriptions (business_id, plan_id, status, billing_cycle, current_period_end)
       VALUES ($1,$2,'active',$3,$4)
       ON CONFLICT (business_id) DO UPDATE SET
         plan_id = $2, status = 'active', billing_cycle = $3, current_period_end = $4, updated_at = NOW()
       RETURNING *`,
      [req.business.id, plan.id, billingCycle || 'monthly', periodEnd]
    );
    // TODO: Initiate Paystack charge here when API key available
    return R.success(res, { subscription: rows[0], plan, paystackReady: false,
      message: 'Subscription updated. Add PAYSTACK_SECRET_KEY to enable automatic billing.' });
  } catch (err) { next(err); }
});

module.exports = { whtCreditsRouter, brandingRouter, calendarRouter, recurringRouter, subscriptionsRouter };
