const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');
const { unauthorized, forbidden } = require('../utils/response');

/**
 * Verify JWT access token and attach user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, env.jwt.secret);

    const { rows } = await db.query(
      'SELECT id, email, first_name, last_name, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows.length || !rows[0].is_active) {
      return unauthorized(res, 'User not found or deactivated');
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    if (err.name === 'JsonWebTokenError') return unauthorized(res, 'Invalid token');
    next(err);
  }
};

/**
 * Resolve business context from :businessId route param.
 * Attaches req.business and req.businessRole.
 * Must be used AFTER authenticate.
 */
const businessContext = async (req, res, next) => {
  try {
    const businessId = req.params.businessId || req.body.business_id;
    if (!businessId) return forbidden(res, 'Business context required');

    const { rows } = await db.query(
      `SELECT b.*, ub.role AS user_role
       FROM businesses b
       JOIN user_businesses ub ON ub.business_id = b.id
       WHERE b.id = $1 AND ub.user_id = $2 AND b.is_active = TRUE`,
      [businessId, req.user.id]
    );

    if (!rows.length) {
      return forbidden(res, 'Access denied to this business');
    }

    req.business = rows[0];
    req.businessRole = rows[0].user_role;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Restrict route to specific roles within the business.
 * @param  {...string} roles  e.g. requireRole('owner', 'accountant')
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.businessRole || !roles.includes(req.businessRole)) {
    return forbidden(res, `Requires role: ${roles.join(' or ')}`);
  }
  next();
};

module.exports = { authenticate, businessContext, requireRole };
