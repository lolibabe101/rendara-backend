const db = require('../../config/db');

const list = async (businessId, { page = 1, limit = 20, taxType, direction, status, period }) => {
  const offset = (page - 1) * limit;
  const conditions = ['business_id = $1'];
  const params = [businessId];
  let p = 2;

  if (taxType)   { conditions.push(`tax_type = $${p++}`);  params.push(taxType.toUpperCase()); }
  if (direction) { conditions.push(`direction = $${p++}`); params.push(direction); }
  if (status)    { conditions.push(`status = $${p++}`);    params.push(status); }
  if (period)    { conditions.push(`tax_period = $${p++}`);params.push(period); }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT *, COUNT(*) OVER() AS total_count
     FROM tax_entries
     WHERE ${where}
     ORDER BY tax_period DESC, created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, limit, offset]
  );

  const total = rows[0]?.total_count || 0;
  return { data: rows.map(({ total_count, ...r }) => r), total };
};

const getSummary = async (businessId, { period, taxType }) => {
  const conditions = ['te.business_id = $1'];
  const params = [businessId];
  let p = 2;

  if (period)  { conditions.push(`te.tax_period = $${p++}`);              params.push(period); }
  if (taxType) { conditions.push(`te.tax_type = $${p++}`);                params.push(taxType.toUpperCase()); }

  const { rows } = await db.query(
    `SELECT
       tax_type,
       tax_period,
       direction,
       status,
       SUM(amount) AS total_amount,
       COUNT(*) AS entry_count
     FROM tax_entries te
     WHERE ${conditions.join(' AND ')}
     GROUP BY tax_type, tax_period, direction, status
     ORDER BY tax_period DESC, tax_type`,
    params
  );
  return rows;
};

const markRemitted = async (businessId, ids, { remittanceDate, reference, notes }) => {
  if (!Array.isArray(ids) || !ids.length) {
    const err = new Error('No entry IDs provided');
    err.statusCode = 400;
    throw err;
  }

  // Verify all entries belong to this business
  const { rows: checks } = await db.query(
    `SELECT id FROM tax_entries
     WHERE id = ANY($1::uuid[]) AND business_id = $2`,
    [ids, businessId]
  );

  if (checks.length !== ids.length) {
    const err = new Error('One or more entries not found');
    err.statusCode = 404;
    throw err;
  }

  const { rows } = await db.query(
    `UPDATE tax_entries SET
       status           = 'remitted',
       remittance_date  = $1,
       reference        = COALESCE($2, reference),
       notes            = COALESCE($3, notes)
     WHERE id = ANY($4::uuid[]) AND business_id = $5
     RETURNING *`,
    [remittanceDate || new Date().toISOString().split('T')[0], reference || null, notes || null, ids, businessId]
  );

  return rows;
};

const createManual = async (businessId, data) => {
  const { rows } = await db.query(
    `INSERT INTO tax_entries
       (business_id, tax_type, tax_period, amount, direction, notes, reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      businessId,
      data.taxType.toUpperCase(),
      data.taxPeriod,
      data.amount,
      data.direction,
      data.notes || null,
      data.reference || null,
    ]
  );
  return rows[0];
};

module.exports = { list, getSummary, markRemitted, createManual };
