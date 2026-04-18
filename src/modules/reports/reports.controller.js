const db = require('../../config/db');
const R = require('../../utils/response');

/**
 * GET /api/businesses/:businessId/reports/dashboard
 * Key metrics for the business home screen.
 */
const dashboard = async (req, res, next) => {
  try {
    const businessId = req.business.id;

    // Invoice stats
    const { rows: invStats } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('cancelled'))                   AS total_invoices,
         COUNT(*) FILTER (WHERE status = 'draft')                              AS draft_count,
         COUNT(*) FILTER (WHERE status = 'issued')                             AS issued_count,
         COUNT(*) FILTER (WHERE status = 'submitted')                          AS submitted_count,
         COUNT(*) FILTER (WHERE status = 'paid')                               AS paid_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('cancelled','draft')), 0) AS total_invoiced,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0)         AS total_paid,
         COALESCE(SUM(total_amount) FILTER (WHERE status IN ('issued','submitted')), 0) AS outstanding
       FROM invoices
       WHERE business_id = $1`,
      [businessId]
    );

    // Revenue this month vs last month
    const { rows: revenue } = await db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month', entry_date) = DATE_TRUNC('month', NOW())), 0) AS this_month,
         COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month', entry_date) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')), 0) AS last_month
       FROM bookkeeping_entries
       WHERE business_id = $1 AND entry_type = 'income'`,
      [businessId]
    );

    // Expense this month
    const { rows: expenses } = await db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month', entry_date) = DATE_TRUNC('month', NOW())), 0) AS this_month,
         COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month', entry_date) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')), 0) AS last_month
       FROM bookkeeping_entries
       WHERE business_id = $1 AND entry_type = 'expense'`,
      [businessId]
    );

    // Pending tax obligations
    const { rows: taxPending } = await db.query(
      `SELECT tax_type, direction, SUM(amount) AS pending_amount
       FROM tax_entries
       WHERE business_id = $1 AND status = 'pending'
       GROUP BY tax_type, direction`,
      [businessId]
    );

    // FIRS submission stats
    const { rows: firsStats } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE firs_status = 'pending')   AS pending,
         COUNT(*) FILTER (WHERE firs_status = 'submitted') AS submitted,
         COUNT(*) FILTER (WHERE firs_status = 'accepted')  AS accepted,
         COUNT(*) FILTER (WHERE firs_status = 'rejected')  AS rejected
       FROM invoices
       WHERE business_id = $1 AND status NOT IN ('draft','cancelled')`,
      [businessId]
    );

    // Recent 5 invoices
    const { rows: recentInvoices } = await db.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount, i.status,
              i.firs_status, c.name AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.business_id = $1
       ORDER BY i.created_at DESC
       LIMIT 5`,
      [businessId]
    );

    return R.success(res, {
      invoices:      invStats[0],
      revenue:       revenue[0],
      expenses:      expenses[0],
      taxPending,
      firs:          firsStats[0],
      recentInvoices,
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/businesses/:businessId/reports/profit-loss?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
const profitLoss = async (req, res, next) => {
  try {
    const businessId = req.business.id;
    const { from, to } = req.query;

    const conditions = ['business_id = $1'];
    const params = [businessId];
    let p = 2;

    if (from) { conditions.push(`entry_date >= $${p++}`); params.push(from); }
    if (to)   { conditions.push(`entry_date <= $${p++}`); params.push(to); }

    const where = conditions.join(' AND ');

    const { rows } = await db.query(
      `SELECT
         entry_type,
         category,
         SUM(amount) AS total,
         COUNT(*) AS count
       FROM bookkeeping_entries
       WHERE ${where}
       GROUP BY entry_type, category
       ORDER BY entry_type, total DESC`,
      params
    );

    const income  = rows.filter((r) => r.entry_type === 'income');
    const expense = rows.filter((r) => r.entry_type === 'expense');

    const totalIncome  = income.reduce((s, r) => s + parseFloat(r.total), 0);
    const totalExpense = expense.reduce((s, r) => s + parseFloat(r.total), 0);

    return R.success(res, {
      period:      { from: from || 'all', to: to || 'all' },
      income:      { breakdown: income,  total: +totalIncome.toFixed(2) },
      expense:     { breakdown: expense, total: +totalExpense.toFixed(2) },
      netProfit:   +(totalIncome - totalExpense).toFixed(2),
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/businesses/:businessId/reports/tax-summary?period=YYYY-MM
 */
const taxSummary = async (req, res, next) => {
  try {
    const businessId = req.business.id;
    const { period } = req.query;

    const conditions = ['te.business_id = $1'];
    const params = [businessId];

    if (period) {
      conditions.push(`te.tax_period = $2`);
      params.push(period);
    }

    const { rows } = await db.query(
      `SELECT
         te.tax_type,
         te.tax_period,
         te.direction,
         te.status,
         SUM(te.amount) AS total_amount,
         COUNT(*)        AS entry_count
       FROM tax_entries te
       WHERE ${conditions.join(' AND ')}
       GROUP BY te.tax_type, te.tax_period, te.direction, te.status
       ORDER BY te.tax_period DESC, te.tax_type`,
      params
    );

    const vatPayable    = rows.filter((r) => r.tax_type === 'VAT' && r.direction === 'payable');
    const whtReceivable = rows.filter((r) => r.tax_type === 'WHT' && r.direction === 'receivable');

    return R.success(res, {
      period: period || 'all',
      vat:    { payable: vatPayable },
      wht:    { receivable: whtReceivable },
      raw:    rows,
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/businesses/:businessId/reports/invoices-trend?months=6
 * Monthly invoice volume and value trend.
 */
const invoicesTrend = async (req, res, next) => {
  try {
    const businessId = req.business.id;
    const months = parseInt(req.query.months || '6', 10);

    const { rows } = await db.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', invoice_date), 'YYYY-MM') AS month,
         COUNT(*) FILTER (WHERE status NOT IN ('cancelled','draft')) AS invoice_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('cancelled','draft')), 0) AS total_value,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0) AS paid_value,
         COALESCE(SUM(vat_amount)   FILTER (WHERE status NOT IN ('cancelled','draft')), 0) AS vat_collected,
         COALESCE(SUM(wht_amount)   FILTER (WHERE status NOT IN ('cancelled','draft')), 0) AS wht_withheld
       FROM invoices
       WHERE business_id = $1
         AND invoice_date >= DATE_TRUNC('month', NOW() - ($2 || ' months')::INTERVAL)
       GROUP BY DATE_TRUNC('month', invoice_date)
       ORDER BY month ASC`,
      [businessId, months - 1]
    );

    return R.success(res, rows);
  } catch (err) { next(err); }
};

module.exports = { dashboard, profitLoss, taxSummary, invoicesTrend };
