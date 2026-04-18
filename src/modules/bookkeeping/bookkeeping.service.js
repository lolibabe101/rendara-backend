const db = require('../../config/db');

const INCOME_CATEGORIES = [
  'Sales Revenue', 'Service Revenue', 'Interest Income',
  'Other Income', 'Grant', 'Rental Income',
];

const EXPENSE_CATEGORIES = [
  'Cost of Sales', 'Salaries & Wages', 'Rent & Utilities',
  'Transportation', 'Marketing', 'Professional Fees',
  'Office Supplies', 'Equipment', 'Bank Charges', 'Tax Payments',
  'Insurance', 'Depreciation', 'Miscellaneous',
];

const list = async (businessId, { page = 1, limit = 20, entryType, category, from, to, search }) => {
  const offset = (page - 1) * limit;
  const conditions = ['be.business_id = $1'];
  const params = [businessId];
  let p = 2;

  if (entryType) { conditions.push(`be.entry_type = $${p++}`); params.push(entryType); }
  if (category)  { conditions.push(`be.category = $${p++}`);   params.push(category); }
  if (from)      { conditions.push(`be.entry_date >= $${p++}`);params.push(from); }
  if (to)        { conditions.push(`be.entry_date <= $${p++}`);params.push(to); }
  if (search)    {
    conditions.push(`(be.description ILIKE $${p} OR be.reference ILIKE $${p})`);
    params.push(`%${search}%`); p++;
  }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT be.*, COUNT(*) OVER() AS total_count
     FROM bookkeeping_entries be
     WHERE ${where}
     ORDER BY be.entry_date DESC, be.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, limit, offset]
  );

  const total = rows[0]?.total_count || 0;
  return { data: rows.map(({ total_count, ...r }) => r), total };
};

const create = async (businessId, userId, data) => {
  const { rows } = await db.query(
    `INSERT INTO bookkeeping_entries
       (business_id, entry_type, category, description, amount,
        entry_date, reference, invoice_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      businessId,
      data.entryType,
      data.category || null,
      data.description,
      data.amount,
      data.entryDate || new Date().toISOString().split('T')[0],
      data.reference || null,
      data.invoiceId || null,
      userId,
    ]
  );
  return rows[0];
};

const getOne = async (businessId, id) => {
  const { rows } = await db.query(
    'SELECT * FROM bookkeeping_entries WHERE id = $1 AND business_id = $2',
    [id, businessId]
  );
  if (!rows.length) {
    const err = new Error('Entry not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
};

const update = async (businessId, id, data) => {
  await getOne(businessId, id);
  const { rows } = await db.query(
    `UPDATE bookkeeping_entries SET
       entry_type  = COALESCE($1, entry_type),
       category    = COALESCE($2, category),
       description = COALESCE($3, description),
       amount      = COALESCE($4, amount),
       entry_date  = COALESCE($5, entry_date),
       reference   = COALESCE($6, reference)
     WHERE id = $7 AND business_id = $8
     RETURNING *`,
    [
      data.entryType || null, data.category || null, data.description || null,
      data.amount ?? null, data.entryDate || null, data.reference || null,
      id, businessId,
    ]
  );
  return rows[0];
};

const remove = async (businessId, id) => {
  const entry = await getOne(businessId, id);
  if (entry.invoice_id) {
    const err = new Error('Cannot delete entries linked to an invoice');
    err.statusCode = 400;
    throw err;
  }
  await db.query(
    'DELETE FROM bookkeeping_entries WHERE id = $1 AND business_id = $2',
    [id, businessId]
  );
};

const getCategories = () => ({ income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES });

module.exports = { list, create, getOne, update, remove, getCategories };
