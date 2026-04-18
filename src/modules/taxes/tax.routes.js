const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const ctrl = require('./tax.controller');
const { requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

// GET /api/businesses/:businessId/taxes
router.get('/', ctrl.list);

// GET /api/businesses/:businessId/taxes/summary
router.get('/summary', ctrl.getSummary);

// POST /api/businesses/:businessId/taxes
router.post('/', requireRole('owner', 'accountant'), [
  body('taxType').isIn(['VAT', 'WHT']).withMessage('Tax type must be VAT or WHT'),
  body('taxPeriod').matches(/^\d{4}-\d{2}$/).withMessage('Tax period must be YYYY-MM'),
  body('amount').isFloat({ min: 0.01 }),
  body('direction').isIn(['payable', 'receivable']),
  validate,
], ctrl.createManual);

// PATCH /api/businesses/:businessId/taxes/remit
router.patch('/remit', requireRole('owner', 'accountant'), [
  body('ids').isArray({ min: 1 }).withMessage('Provide at least one entry ID'),
  body('ids.*').isUUID(),
  body('remittanceDate').optional().isDate(),
  validate,
], ctrl.markRemitted);

module.exports = router;
