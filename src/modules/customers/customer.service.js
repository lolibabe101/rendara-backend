const db = require('../../config/db');

const list = async (businessId, { page = 1, limit = 20, search = '' }) => {
  const offset = (page - 1) * limit;
  const searchParam = `%${search}%`;

  const { rows } = await db.query(
    `SELECT *, COUNT(*) OVER() AS total_count
     FROM customers
     WHERE business_id = $1
       AND ($2 = '%%' OR name ILIKE $2 OR email ILIKE $2 OR tin ILIKE $2)
     ORDER BY name ASC
     LIMIT $3 OFFSET $4`,
    [businessId, searchParam, limit, offset]
  );

  const total = rows[0]?.total_count || 0;
  return { data: rows.map(({ total_count, ...r }) => r), total };
};

const create = async (businessId, data) => {
  const { rows } = await db.query(
    `INSERT INTO customers
       (business_id, name, tin, email, phone, address, customer_type, is_wht_applicable)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      businessId, data.name, data.tin || null, data.email || null,
      data.phone || null, data.address || null,
      data.customerType || 'corporate', data.isWhtApplicable || false,
    ]
  );
  return rows[0];
};

const getOne = async (businessId, id) => {
  const { rows } = await db.query(
    'SELECT * FROM customers WHERE id = $1 AND business_id = $2',
    [id, businessId]
  );
  if (!rows.length) {
    const err = new Error('Customer not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
};

const update = async (businessId, id, data) => {
  await getOne(businessId, id);
  const { rows } = await db.query(
    `UPDATE customers SET
       name               = COALESCE($1, name),
       tin                = COALESCE($2, tin),
       email              = COALESCE($3, email),
       phone              = COALESCE($4, phone),
       address            = COALESCE($5, address),
       customer_type      = COALESCE($6, customer_type),
       is_wht_applicable  = COALESCE($7, is_wht_applicable)
     WHERE id = $8 AND business_id = $9
     RETURNING *`,
    [
      data.name || null, data.tin || null, data.email || null, data.phone || null,
      data.address || null, data.customerType || null,
      data.isWhtApplicable ?? null, id, businessId,
    ]
  );
  return rows[0];
};

const remove = async (businessId, id) => {
  await getOne(businessId, id);
  await db.query('DELETE FROM customers WHERE id = $1 AND business_id = $2', [id, businessId]);
};

module.exports = { list, create, getOne, update, remove };
