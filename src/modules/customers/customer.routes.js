const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const ctrl = require('./customer.controller');
const { requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

// GET /api/businesses/:businessId/customers
router.get('/', ctrl.list);

// POST /api/businesses/:businessId/customers
router.post('/', requireRole('owner', 'accountant'), [
  body('name').trim().notEmpty().withMessage('Customer name is required'),
  body('tin').optional().trim(),
  body('email').optional().isEmail(),
  body('phone').optional().trim(),
  body('customerType').optional().isIn(['corporate', 'individual']),
  body('isWhtApplicable').optional().isBoolean(),
  validate,
], ctrl.create);

// GET /api/businesses/:businessId/customers/:id
router.get('/:id', ctrl.getOne);

// PATCH /api/businesses/:businessId/customers/:id
router.patch('/:id', requireRole('owner', 'accountant'), [
  body('email').optional().isEmail(),
  body('customerType').optional().isIn(['corporate', 'individual']),
  body('isWhtApplicable').optional().isBoolean(),
  validate,
], ctrl.update);

// DELETE /api/businesses/:businessId/customers/:id
router.delete('/:id', requireRole('owner'), ctrl.remove);

module.exports = router;
