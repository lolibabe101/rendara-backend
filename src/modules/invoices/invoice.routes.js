const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const ctrl = require('./invoice.controller');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

// ── Public: buyer IRN verification ───────────────────────────────────────────
// GET /api/invoices/verify/:irn
router.get('/verify/:irn', ctrl.verifyIRN);

// All routes below require auth + business context (applied in app.js)

// GET /api/businesses/:businessId/invoices
router.get('/', ctrl.list);

// POST /api/businesses/:businessId/invoices
router.post('/', requireRole('owner', 'accountant'), [
  body('items').isArray({ min: 1 }).withMessage('At least one line item required'),
  body('items.*.description').trim().notEmpty().withMessage('Item description required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Valid quantity required'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Valid unit price required'),
  body('items.*.vatRate').optional().isFloat({ min: 0, max: 100 }),
  body('items.*.whtRate').optional().isFloat({ min: 0, max: 100 }),
  body('customerId').optional().isUUID(),
  body('invoiceDate').optional().isDate(),
  body('dueDate').optional().isDate(),
  body('currency').optional().isIn(['NGN', 'USD', 'GBP', 'EUR']),
  validate,
], ctrl.create);

// GET /api/businesses/:businessId/invoices/:id
router.get('/:id', ctrl.getOne);

// PATCH /api/businesses/:businessId/invoices/:id
router.patch('/:id', requireRole('owner', 'accountant'), [
  body('items').optional().isArray({ min: 1 }),
  body('customerId').optional().isUUID(),
  body('invoiceDate').optional().isDate(),
  body('dueDate').optional().isDate(),
  validate,
], ctrl.update);

// POST /api/businesses/:businessId/invoices/:id/issue
router.post('/:id/issue', requireRole('owner', 'accountant'), ctrl.issue);

// POST /api/businesses/:businessId/invoices/:id/submit-firs
router.post('/:id/submit-firs', requireRole('owner', 'accountant'), ctrl.submitFIRS);

// POST /api/businesses/:businessId/invoices/:id/mark-paid
router.post('/:id/mark-paid', requireRole('owner', 'accountant'), ctrl.markPaid);

// POST /api/businesses/:businessId/invoices/:id/cancel
router.post('/:id/cancel', requireRole('owner', 'accountant'), ctrl.cancel);

module.exports = router;
