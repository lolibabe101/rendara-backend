const svc = require('./bookkeeping.service');
const R = require('../../utils/response');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, entryType, category, from, to, search } = req.query;
    const { data, total } = await svc.list(req.business.id, {
      page, limit, entryType, category, from, to, search,
    });
    return R.paginate(res, data, total, page, limit);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const entry = await svc.create(req.business.id, req.user.id, req.body);
    return R.created(res, entry, 'Entry created');
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const entry = await svc.getOne(req.business.id, req.params.id);
    return R.success(res, entry);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const entry = await svc.update(req.business.id, req.params.id, req.body);
    return R.success(res, entry, 'Entry updated');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await svc.remove(req.business.id, req.params.id);
    return R.success(res, null, 'Entry deleted');
  } catch (err) { next(err); }
};

const getCategories = (req, res) => {
  return R.success(res, svc.getCategories());
};

module.exports = { list, create, getOne, update, remove, getCategories };
