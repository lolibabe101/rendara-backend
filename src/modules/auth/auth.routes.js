const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('phone').optional().isMobilePhone(),
  validate,
], ctrl.register);

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
], ctrl.login);

// POST /api/auth/refresh
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token required'),
  validate,
], ctrl.refresh);

// POST /api/auth/logout
router.post('/logout', [
  body('refreshToken').notEmpty(),
  validate,
], ctrl.logout);

// GET /api/auth/me
router.get('/me', authenticate, ctrl.getProfile);

// PATCH /api/auth/me
router.patch('/me', authenticate, [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('phone').optional().isMobilePhone(),
  validate,
], ctrl.updateProfile);

// POST /api/auth/change-password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  validate,
], ctrl.changePassword);

module.exports = router;
