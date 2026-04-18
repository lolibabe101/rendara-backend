const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const ctrl = require('./payroll.controller');
const { requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

// Employees
router.get('/employees', ctrl.listEmployees);
router.post('/employees', requireRole('owner', 'accountant'), [
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('grossSalary').isFloat({ min: 1 }),
  validate,
], ctrl.createEmployee);
router.patch('/employees/:id', requireRole('owner', 'accountant'), ctrl.updateEmployee);
router.delete('/employees/:id', requireRole('owner'), ctrl.deactivateEmployee);

// Payroll runs
router.get('/runs', ctrl.listPayrollRuns);
router.post('/runs', requireRole('owner', 'accountant'), [
  body('payPeriod').matches(/^\d{4}-\d{2}$/).withMessage('payPeriod must be YYYY-MM'),
  validate,
], ctrl.runPayroll);
router.get('/runs/:id', ctrl.getPayrollRun);
router.post('/runs/:id/file', requireRole('owner', 'accountant'), ctrl.filePayroll);

// Penalty calculator
router.post('/penalty', [
  body('principal').isFloat({ min: 0 }),
  body('daysLate').isInt({ min: 0 }),
  validate,
], ctrl.calcPenalty);

module.exports = router;
