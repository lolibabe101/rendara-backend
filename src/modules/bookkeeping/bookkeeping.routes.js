const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const ctrl = require('./bookkeeping.controller');
const { requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

// GET /api/businesses/:businessId/bookkeeping/categories
router.get('/categories', ctrl.getCategories);

// GET /api/businesses/:businessId/bookkeeping
router.get('/', ctrl.list);

// POST /api/businesses/:businessId/bookkeeping
router.post('/', requireRole('owner', 'accountant'), [
  body('entryType').isIn(['income', 'expense']).withMessage('Entry type must be income or expense'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('entryDate').optional().isDate(),
  body('invoiceId').optional().isUUID(),
  validate,
], ctrl.create);

// GET /api/businesses/:businessId/bookkeeping/:id
router.get('/:id', ctrl.getOne);

// PATCH /api/businesses/:businessId/bookkeeping/:id
router.patch('/:id', requireRole('owner', 'accountant'), [
  body('entryType').optional().isIn(['income', 'expense']),
  body('amount').optional().isFloat({ min: 0.01 }),
  body('entryDate').optional().isDate(),
  validate,
], ctrl.update);

// DELETE /api/businesses/:businessId/bookkeeping/:id
router.delete('/:id', requireRole('owner'), ctrl.remove);

module.exports = router;
