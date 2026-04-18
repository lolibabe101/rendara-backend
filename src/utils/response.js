/**
 * Consistent API response helpers.
 * All responses follow: { success, message, data?, meta? }
 */

const success = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(statusCode).json(body);
};

const created = (res, data, message = 'Created successfully') =>
  success(res, data, message, 201);

const error = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const notFound = (res, message = 'Resource not found') =>
  error(res, message, 404);

const badRequest = (res, message = 'Bad request', errors = null) =>
  error(res, message, 400, errors);

const unauthorized = (res, message = 'Unauthorized') =>
  error(res, message, 401);

const forbidden = (res, message = 'Forbidden') =>
  error(res, message, 403);

const conflict = (res, message = 'Conflict') =>
  error(res, message, 409);

const paginate = (res, data, total, page, limit, message = 'Success') =>
  success(res, data, message, 200, {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit),
  });

module.exports = { success, created, error, notFound, badRequest, unauthorized, forbidden, conflict, paginate };
