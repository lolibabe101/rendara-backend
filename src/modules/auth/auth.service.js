const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../../config/db');
const env = require('../../config/env');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
  const refreshToken = jwt.sign({ userId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
  return { accessToken, refreshToken };
};

const register = async ({ email, password, firstName, lastName, phone }) => {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const hash = await bcrypt.hash(password, env.bcryptRounds);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, first_name, last_name, phone, created_at`,
    [email.toLowerCase(), hash, firstName, lastName, phone || null]
  );

  return rows[0];
};

const login = async ({ email, password }) => {
  const { rows } = await db.query(
    'SELECT id, email, first_name, last_name, password_hash, is_active FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  const user = rows[0];
  if (!user) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }
  if (!user.is_active) {
    const err = new Error('Account deactivated');
    err.statusCode = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const { accessToken, refreshToken } = generateTokens(user.id);

  // Persist refresh token (7-day expiry)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, refreshToken, expiresAt]
  );

  // Fetch user's businesses for convenience
  const biz = await db.query(
    `SELECT b.id, b.name, ub.role FROM businesses b
     JOIN user_businesses ub ON ub.business_id = b.id
     WHERE ub.user_id = $1 AND b.is_active = TRUE`,
    [user.id]
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
    businesses: biz.rows,
  };
};

const refresh = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.refreshSecret);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  const { rows } = await db.query(
    'SELECT id, user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
    [token]
  );

  if (!rows.length) {
    const err = new Error('Refresh token not found or expired');
    err.statusCode = 401;
    throw err;
  }

  // Rotate: delete old, issue new
  await db.query('DELETE FROM refresh_tokens WHERE id = $1', [rows[0].id]);

  const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.userId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [decoded.userId, newRefresh, expiresAt]
  );

  return { accessToken, refreshToken: newRefresh };
};

const logout = async (token) => {
  await db.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
};

const getProfile = async (userId) => {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.is_verified, u.created_at,
            json_agg(json_build_object('id', b.id, 'name', b.name, 'role', ub.role)) AS businesses
     FROM users u
     LEFT JOIN user_businesses ub ON ub.user_id = u.id
     LEFT JOIN businesses b ON b.id = ub.business_id AND b.is_active = TRUE
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );
  return rows[0];
};

const updateProfile = async (userId, { firstName, lastName, phone }) => {
  const { rows } = await db.query(
    `UPDATE users SET first_name = COALESCE($1, first_name),
                      last_name  = COALESCE($2, last_name),
                      phone      = COALESCE($3, phone)
     WHERE id = $4
     RETURNING id, email, first_name, last_name, phone`,
    [firstName || null, lastName || null, phone || null, userId]
  );
  return rows[0];
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 400;
    throw err;
  }
  const hash = await bcrypt.hash(newPassword, env.bcryptRounds);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
  // Invalidate all refresh tokens
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
};

module.exports = { register, login, refresh, logout, getProfile, updateProfile, changePassword };
