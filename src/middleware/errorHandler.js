const logger = require('../utils/logger');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // PostgreSQL unique violation
  if (err.code === '23505') {
    const detail = err.detail || '';
    const field = detail.match(/\((.+?)\)/)?.[1] || 'field';
    return res.status(409).json({
      success: false,
      message: `A record with that ${field} already exists`,
    });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist',
    });
  }

  // PostgreSQL not-null violation
  if (err.code === '23502') {
    return res.status(400).json({
      success: false,
      message: `Required field missing: ${err.column}`,
    });
  }

  const statusCode = err.statusCode || 500;
  const message =
    statusCode < 500 ? err.message : 'Internal server error';

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  return res.status(statusCode).json({
    success: false,
    message,
    ...(env.isDev && { stack: err.stack }),
  });
};

module.exports = errorHandler;
