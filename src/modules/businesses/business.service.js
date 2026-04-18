const db = require('../../config/db');

const createBusiness = async (userId, data) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO businesses
         (name, tin, rc_number, address, state, country, email, phone, sector,
          is_vat_registered, vat_number, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        data.name, data.tin, data.rcNumber || null, data.address || null,
        data.state || null, data.country || 'Nigeria', data.email || null,
        data.phone || null, data.sector || null,
        data.isVatRegistered || false, data.vatNumber || null, userId,
      ]
    );

    const business = rows[0];

    // Grant owner role to creator
    await client.query(
      'INSERT INTO user_businesses (user_id, business_id, role) VALUES ($1, $2, $3)',
      [userId, business.id, 'owner']
    );

    await client.query('COMMIT');
    return business;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getUserBusinesses = async (userId) => {
  const { rows } = await db.query(
    `SELECT b.*, ub.role AS user_role
     FROM businesses b
     JOIN user_businesses ub ON ub.business_id = b.id
     WHERE ub.user_id = $1 AND b.is_active = TRUE
     ORDER BY b.created_at DESC`,
    [userId]
  );
  return rows;
};

const getBusiness = async (businessId) => {
  const { rows } = await db.query(
    'SELECT * FROM businesses WHERE id = $1 AND is_active = TRUE',
    [businessId]
  );
  if (!rows.length) {
    const err = new Error('Business not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
};

const updateBusiness = async (businessId, data) => {
  const { rows } = await db.query(
    `UPDATE businesses SET
       name               = COALESCE($1, name),
       address            = COALESCE($2, address),
       state              = COALESCE($3, state),
       email              = COALESCE($4, email),
       phone              = COALESCE($5, phone),
       sector             = COALESCE($6, sector),
       is_vat_registered  = COALESCE($7, is_vat_registered),
       vat_number         = COALESCE($8, vat_number),
       rc_number          = COALESCE($9, rc_number)
     WHERE id = $10
     RETURNING *`,
    [
      data.name || null, data.address || null, data.state || null,
      data.email || null, data.phone || null, data.sector || null,
      data.isVatRegistered ?? null, data.vatNumber || null,
      data.rcNumber || null, businessId,
    ]
  );
  return rows[0];
};

const getBusinessMembers = async (businessId) => {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, ub.role, ub.created_at AS joined_at
     FROM users u
     JOIN user_businesses ub ON ub.user_id = u.id
     WHERE ub.business_id = $1`,
    [businessId]
  );
  return rows;
};

const inviteMember = async (businessId, inviterUserId, { email, role }) => {
  const { rows: users } = await db.query(
    'SELECT id FROM users WHERE email = $1', [email.toLowerCase()]
  );
  if (!users.length) {
    const err = new Error('User with that email not found. They must register first.');
    err.statusCode = 404;
    throw err;
  }
  const targetUserId = users[0].id;

  const existing = await db.query(
    'SELECT id FROM user_businesses WHERE user_id = $1 AND business_id = $2',
    [targetUserId, businessId]
  );
  if (existing.rows.length) {
    const err = new Error('User already has access to this business');
    err.statusCode = 409;
    throw err;
  }

  const { rows } = await db.query(
    'INSERT INTO user_businesses (user_id, business_id, role) VALUES ($1,$2,$3) RETURNING *',
    [targetUserId, businessId, role || 'accountant']
  );
  return rows[0];
};

const removeMember = async (businessId, userId) => {
  const { rows } = await db.query(
    'SELECT role FROM user_businesses WHERE user_id = $1 AND business_id = $2',
    [userId, businessId]
  );
  if (!rows.length) {
    const err = new Error('Member not found');
    err.statusCode = 404;
    throw err;
  }
  if (rows[0].role === 'owner') {
    const err = new Error('Cannot remove business owner');
    err.statusCode = 400;
    throw err;
  }
  await db.query(
    'DELETE FROM user_businesses WHERE user_id = $1 AND business_id = $2',
    [userId, businessId]
  );
};

module.exports = {
  createBusiness, getUserBusinesses, getBusiness,
  updateBusiness, getBusinessMembers, inviteMember, removeMember,
};
