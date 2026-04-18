const { validationResult } = require('express-validator');
const { badRequest } = require('../utils/response');

/**
 * Run after express-validator chains.
 * Returns 400 with field-level errors if validation fails.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));
    return badRequest(res, 'Validation failed', formatted);
  }
  next();
};

module.exports = validate;
