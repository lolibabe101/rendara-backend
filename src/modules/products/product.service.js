const db = require('../../config/db');

const list = async (businessId, { page = 1, limit = 20, search = '', activeOnly = true }) => {
  const offset = (page - 1) * limit;
  const searchParam = `%${search}%`;

  const { rows } = await db.query(
    `SELECT *, COUNT(*) OVER() AS total_count
     FROM products
     WHERE business_id = $1
       AND ($2 = '%%' OR name ILIKE $2 OR description ILIKE $2)
       AND ($3::boolean = FALSE OR is_active = TRUE)
     ORDER BY name ASC
     LIMIT $4 OFFSET $5`,
    [businessId, searchParam, activeOnly, limit, offset]
  );

  const total = rows[0]?.total_count || 0;
  return { data: rows.map(({ total_count, ...r }) => r), total };
};

const create = async (businessId, data) => {
  const { rows } = await db.query(
    `INSERT INTO products
       (business_id, name, description, unit_price, unit,
        vat_applicable, wht_applicable, wht_rate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      businessId, data.name, data.description || null,
      data.unitPrice, data.unit || 'unit',
      data.vatApplicable !== false,
      data.whtApplicable || false,
      data.whtRate || 0,
    ]
  );
  return rows[0];
};

const getOne = async (businessId, id) => {
  const { rows } = await db.query(
    'SELECT * FROM products WHERE id = $1 AND business_id = $2',
    [id, businessId]
  );
  if (!rows.length) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
};

const update = async (businessId, id, data) => {
  await getOne(businessId, id);
  const { rows } = await db.query(
    `UPDATE products SET
       name            = COALESCE($1, name),
       description     = COALESCE($2, description),
       unit_price      = COALESCE($3, unit_price),
       unit            = COALESCE($4, unit),
       vat_applicable  = COALESCE($5, vat_applicable),
       wht_applicable  = COALESCE($6, wht_applicable),
       wht_rate        = COALESCE($7, wht_rate),
       is_active       = COALESCE($8, is_active)
     WHERE id = $9 AND business_id = $10
     RETURNING *`,
    [
      data.name || null, data.description || null,
      data.unitPrice ?? null, data.unit || null,
      data.vatApplicable ?? null, data.whtApplicable ?? null,
      data.whtRate ?? null, data.isActive ?? null,
      id, businessId,
    ]
  );
  return rows[0];
};

const remove = async (businessId, id) => {
  await getOne(businessId, id);
  // Soft delete — products may be referenced by invoice items
  await db.query(
    'UPDATE products SET is_active = FALSE WHERE id = $1 AND business_id = $2',
    [id, businessId]
  );
};

module.exports = { list, create, getOne, update, remove };
