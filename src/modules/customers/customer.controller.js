const svc = require('./customer.service');
const R = require('../../utils/response');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const { data, total } = await svc.list(req.business.id, { page, limit, search });
    return R.paginate(res, data, total, page, limit);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const customer = await svc.create(req.business.id, req.body);
    return R.created(res, customer, 'Customer created');
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const customer = await svc.getOne(req.business.id, req.params.id);
    return R.success(res, customer);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const customer = await svc.update(req.business.id, req.params.id, req.body);
    return R.success(res, customer, 'Customer updated');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await svc.remove(req.business.id, req.params.id);
    return R.success(res, null, 'Customer deleted');
  } catch (err) { next(err); }
};

module.exports = { list, create, getOne, update, remove };
