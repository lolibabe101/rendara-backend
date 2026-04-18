const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./business.controller');
const { authenticate, businessContext, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

// All routes require authentication
router.use(authenticate);

// POST /api/businesses
router.post('/', [
  body('name').trim().notEmpty(),
  body('tin').trim().notEmpty().withMessage('TIN is required'),
  body('email').optional().isEmail(),
  validate,
], ctrl.create);

// GET /api/businesses
router.get('/', ctrl.list);

// Routes below require business context
router.use('/:businessId', businessContext);

// GET /api/businesses/:businessId
router.get('/:businessId', ctrl.getOne);

// PATCH /api/businesses/:businessId
router.patch('/:businessId', requireRole('owner', 'accountant'), [
  body('email').optional().isEmail(),
  validate,
], ctrl.update);

// GET /api/businesses/:businessId/members
router.get('/:businessId/members', ctrl.getMembers);

// POST /api/businesses/:businessId/members
router.post('/:businessId/members', requireRole('owner'), [
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['owner', 'accountant', 'viewer']),
  validate,
], ctrl.invite);

// DELETE /api/businesses/:businessId/members/:userId
router.delete('/:businessId/members/:userId', requireRole('owner'), ctrl.remove);

module.exports = router;
