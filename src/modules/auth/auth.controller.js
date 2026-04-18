const authService = require('./auth.service');
const R = require('../../utils/response');

const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    const user = await authService.register({ email, password, firstName, lastName, phone });
    return R.created(res, user, 'Registration successful');
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const data = await authService.login(req.body);
    return R.success(res, data, 'Login successful');
  } catch (err) { next(err); }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refresh(refreshToken);
    return R.success(res, tokens, 'Token refreshed');
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    return R.success(res, null, 'Logged out successfully');
  } catch (err) { next(err); }
};

const getProfile = async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user.id);
    return R.success(res, profile);
  } catch (err) { next(err); }
};

const updateProfile = async (req, res, next) => {
  try {
    const updated = await authService.updateProfile(req.user.id, req.body);
    return R.success(res, updated, 'Profile updated');
  } catch (err) { next(err); }
};

const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.body);
    return R.success(res, null, 'Password changed successfully');
  } catch (err) { next(err); }
};

module.exports = { register, login, refresh, logout, getProfile, updateProfile, changePassword };
