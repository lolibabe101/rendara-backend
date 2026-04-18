const svc = require('./payroll.service');
const { computePenalty } = require('./payroll.engine');
const R = require('../../utils/response');

const listEmployees = async (req, res, next) => {
  try { return R.success(res, await svc.listEmployees(req.business.id)); }
  catch (err) { next(err); }
};
const createEmployee = async (req, res, next) => {
  try { return R.created(res, await svc.createEmployee(req.business.id, req.body), 'Employee added'); }
  catch (err) { next(err); }
};
const updateEmployee = async (req, res, next) => {
  try { return R.success(res, await svc.updateEmployee(req.business.id, req.params.id, req.body), 'Updated'); }
  catch (err) { next(err); }
};
const deactivateEmployee = async (req, res, next) => {
  try { await svc.deactivateEmployee(req.business.id, req.params.id); return R.success(res, null, 'Employee deactivated'); }
  catch (err) { next(err); }
};
const runPayroll = async (req, res, next) => {
  try {
    const result = await svc.runPayroll(req.business.id, req.user.id, req.body);
    return R.created(res, result, 'Payroll computed successfully');
  } catch (err) { next(err); }
};
const getPayrollRun = async (req, res, next) => {
  try { return R.success(res, await svc.getPayrollRun(req.business.id, req.params.id)); }
  catch (err) { next(err); }
};
const listPayrollRuns = async (req, res, next) => {
  try { return R.success(res, await svc.listPayrollRuns(req.business.id)); }
  catch (err) { next(err); }
};
const filePayroll = async (req, res, next) => {
  try {
    const result = await svc.filePayroll(req.business.id, req.params.id, req.body.reference);
    return R.success(res, result, 'Payroll filed to LIRS');
  } catch (err) { next(err); }
};
const calcPenalty = async (req, res, next) => {
  try {
    const { principal, daysLate, taxType } = req.body;
    const result = computePenalty(parseFloat(principal), parseInt(daysLate), taxType);
    return R.success(res, result);
  } catch (err) { next(err); }
};

module.exports = { listEmployees, createEmployee, updateEmployee, deactivateEmployee,
                   runPayroll, getPayrollRun, listPayrollRuns, filePayroll, calcPenalty };
