const svc = require('./business.service');
const R = require('../../utils/response');

const create = async (req, res, next) => {
  try {
    const business = await svc.createBusiness(req.user.id, req.body);
    return R.created(res, business, 'Business created');
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const businesses = await svc.getUserBusinesses(req.user.id);
    return R.success(res, businesses);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    return R.success(res, req.business);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const updated = await svc.updateBusiness(req.business.id, req.body);
    return R.success(res, updated, 'Business updated');
  } catch (err) { next(err); }
};

const getMembers = async (req, res, next) => {
  try {
    const members = await svc.getBusinessMembers(req.business.id);
    return R.success(res, members);
  } catch (err) { next(err); }
};

const invite = async (req, res, next) => {
  try {
    const member = await svc.inviteMember(req.business.id, req.user.id, req.body);
    return R.created(res, member, 'Member invited');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await svc.removeMember(req.business.id, req.params.userId);
    return R.success(res, null, 'Member removed');
  } catch (err) { next(err); }
};

module.exports = { create, list, getOne, update, getMembers, invite, remove };
