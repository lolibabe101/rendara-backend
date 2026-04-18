const svc = require('./invoice.service');
const R = require('../../utils/response');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, customerId, from, to, search } = req.query;
    const { data, total } = await svc.list(req.business.id, {
      page, limit, status, customerId, from, to, search,
    });
    return R.paginate(res, data, total, page, limit);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const invoice = await svc.getOne(req.business.id, req.params.id);
    return R.success(res, invoice);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const invoice = await svc.create(req.business.id, req.user.id, req.body);
    return R.created(res, invoice, 'Invoice created');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const invoice = await svc.update(req.business.id, req.params.id, req.body);
    return R.success(res, invoice, 'Invoice updated');
  } catch (err) { next(err); }
};

const issue = async (req, res, next) => {
  try {
    const invoice = await svc.issue(req.business.id, req.params.id);
    return R.success(res, invoice, 'Invoice issued — IRN generated');
  } catch (err) { next(err); }
};

const submitFIRS = async (req, res, next) => {
  try {
    const result = await svc.submitFIRS(req.business.id, req.params.id);
    const msg = result.result.success
      ? 'Invoice submitted to FIRS successfully'
      : 'FIRS submission failed — check firs_status for details';
    return R.success(res, result, msg);
  } catch (err) { next(err); }
};

const markPaid = async (req, res, next) => {
  try {
    const invoice = await svc.markPaid(req.business.id, req.params.id);
    return R.success(res, invoice, 'Invoice marked as paid');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const invoice = await svc.cancel(req.business.id, req.params.id);
    return R.success(res, invoice, 'Invoice cancelled');
  } catch (err) { next(err); }
};

// Public endpoint — no auth required (buyer IRN verification)
const verifyIRN = async (req, res, next) => {
  try {
    const data = await svc.verifyIRN(req.params.irn);
    return R.success(res, data, 'IRN verified');
  } catch (err) { next(err); }
};

module.exports = { list, getOne, create, update, issue, submitFIRS, markPaid, cancel, verifyIRN };
