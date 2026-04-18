const svc = require('./tax.service');
const R = require('../../utils/response');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, taxType, direction, status, period } = req.query;
    const { data, total } = await svc.list(req.business.id, { page, limit, taxType, direction, status, period });
    return R.paginate(res, data, total, page, limit);
  } catch (err) { next(err); }
};

const getSummary = async (req, res, next) => {
  try {
    const { period, taxType } = req.query;
    const summary = await svc.getSummary(req.business.id, { period, taxType });
    return R.success(res, summary);
  } catch (err) { next(err); }
};

const markRemitted = async (req, res, next) => {
  try {
    const { ids, remittanceDate, reference, notes } = req.body;
    const updated = await svc.markRemitted(req.business.id, ids, { remittanceDate, reference, notes });
    return R.success(res, updated, `${updated.length} entries marked as remitted`);
  } catch (err) { next(err); }
};

const createManual = async (req, res, next) => {
  try {
    const entry = await svc.createManual(req.business.id, req.body);
    return R.created(res, entry, 'Tax entry created');
  } catch (err) { next(err); }
};

module.exports = { list, getSummary, markRemitted, createManual };
