const svc = require('./product.service');
const R = require('../../utils/response');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', activeOnly = 'true' } = req.query;
    const { data, total } = await svc.list(req.business.id, {
      page, limit, search, activeOnly: activeOnly !== 'false',
    });
    return R.paginate(res, data, total, page, limit);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const product = await svc.create(req.business.id, req.body);
    return R.created(res, product, 'Product created');
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const product = await svc.getOne(req.business.id, req.params.id);
    return R.success(res, product);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const product = await svc.update(req.business.id, req.params.id, req.body);
    return R.success(res, product, 'Product updated');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await svc.remove(req.business.id, req.params.id);
    return R.success(res, null, 'Product deactivated');
  } catch (err) { next(err); }
};

module.exports = { list, create, getOne, update, remove };
