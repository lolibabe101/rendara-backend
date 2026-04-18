const router = require('express').Router({ mergeParams: true });
const ctrl = require('./reports.controller');

// GET /api/businesses/:businessId/reports/dashboard
router.get('/dashboard', ctrl.dashboard);

// GET /api/businesses/:businessId/reports/profit-loss
router.get('/profit-loss', ctrl.profitLoss);

// GET /api/businesses/:businessId/reports/tax-summary
router.get('/tax-summary', ctrl.taxSummary);

// GET /api/businesses/:businessId/reports/invoices-trend
router.get('/invoices-trend', ctrl.invoicesTrend);

module.exports = router;
