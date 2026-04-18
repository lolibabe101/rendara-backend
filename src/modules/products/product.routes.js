const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const ctrl = require('./product.controller');
const { requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

router.get('/', ctrl.list);

router.post('/', requireRole('owner', 'accountant'), [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('unitPrice').isFloat({ min: 0 }).withMessage('Valid unit price required'),
  body('unit').optional().trim(),
  body('vatApplicable').optional().isBoolean(),
  body('whtApplicable').optional().isBoolean(),
  body('whtRate').optional().isFloat({ min: 0, max: 100 }),
  validate,
], ctrl.create);

router.get('/:id', ctrl.getOne);

router.patch('/:id', requireRole('owner', 'accountant'), [
  body('unitPrice').optional().isFloat({ min: 0 }),
  body('whtRate').optional().isFloat({ min: 0, max: 100 }),
  validate,
], ctrl.update);

router.delete('/:id', requireRole('owner'), ctrl.remove);

module.exports = router;
