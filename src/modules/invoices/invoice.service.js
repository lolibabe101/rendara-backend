const db = require('../../config/db');
const { generateIRN } = require('../../utils/irn');
const { submitInvoice: submitToFIRS } = require('../../utils/firs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calculate line-item totals and roll up invoice sums. */
const computeTotals = (items) => {
  let subtotal = 0;
  let vatAmount = 0;
  let whtAmount = 0;

  const computed = items.map((item) => {
    const lineSubtotal = parseFloat(item.quantity) * parseFloat(item.unitPrice);
    const vat = item.vatApplicable !== false
      ? lineSubtotal * (parseFloat(item.vatRate || 7.5) / 100)
      : 0;
    const wht = item.whtApplicable
      ? lineSubtotal * (parseFloat(item.whtRate || 0) / 100)
      : 0;

    subtotal  += lineSubtotal;
    vatAmount += vat;
    whtAmount += wht;

    return {
      ...item,
      lineSubtotal: +lineSubtotal.toFixed(2),
      computedVat: +vat.toFixed(2),
      computedWht: +wht.toFixed(2),
      lineTotal:   +lineSubtotal.toFixed(2),
    };
  });

  return {
    items: computed,
    subtotal:    +subtotal.toFixed(2),
    vatAmount:   +vatAmount.toFixed(2),
    whtAmount:   +whtAmount.toFixed(2),
    totalAmount: +(subtotal + vatAmount - whtAmount).toFixed(2),
  };
};

/** Generate a sequential invoice number: INV-YYYYMM-NNNN */
const generateInvoiceNumber = async (businessId) => {
  const now = new Date();
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { rows } = await db.query(
    `SELECT COUNT(*) FROM invoices
     WHERE business_id = $1 AND invoice_number LIKE $2`,
    [businessId, `${prefix}%`]
  );
  const seq = String(parseInt(rows[0].count) + 1).padStart(4, '0');
  return `${prefix}-${seq}`;
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

const list = async (businessId, { page = 1, limit = 20, status, customerId, from, to, search }) => {
  const offset = (page - 1) * limit;
  const conditions = ['i.business_id = $1'];
  const params = [businessId];
  let p = 2;

  if (status)     { conditions.push(`i.status = $${p++}`);       params.push(status); }
  if (customerId) { conditions.push(`i.customer_id = $${p++}`);  params.push(customerId); }
  if (from)       { conditions.push(`i.invoice_date >= $${p++}`); params.push(from); }
  if (to)         { conditions.push(`i.invoice_date <= $${p++}`); params.push(to); }
  if (search)     {
    conditions.push(`(i.invoice_number ILIKE $${p} OR c.name ILIKE $${p})`);
    params.push(`%${search}%`); p++;
  }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT i.*, c.name AS customer_name, COUNT(*) OVER() AS total_count
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE ${where}
     ORDER BY i.invoice_date DESC, i.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, limit, offset]
  );

  const total = rows[0]?.total_count || 0;
  return { data: rows.map(({ total_count, ...r }) => r), total };
};

const getOne = async (businessId, id) => {
  const { rows } = await db.query(
    `SELECT i.*, c.name AS customer_name, c.tin AS customer_tin,
            c.email AS customer_email, c.address AS customer_address
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id = $1 AND i.business_id = $2`,
    [id, businessId]
  );
  if (!rows.length) {
    const err = new Error('Invoice not found');
    err.statusCode = 404;
    throw err;
  }

  const invoice = rows[0];

  const { rows: items } = await db.query(
    `SELECT ii.*, p.name AS product_name
     FROM invoice_items ii
     LEFT JOIN products p ON p.id = ii.product_id
     WHERE ii.invoice_id = $1
     ORDER BY ii.created_at ASC`,
    [id]
  );

  return { ...invoice, items };
};

const create = async (businessId, userId, data) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const invoiceNumber = await generateInvoiceNumber(businessId);
    const { items, subtotal, vatAmount, whtAmount, totalAmount } = computeTotals(data.items);

    const { rows } = await client.query(
      `INSERT INTO invoices
         (business_id, customer_id, invoice_number, invoice_date, due_date,
          subtotal, vat_amount, wht_amount, total_amount, notes, currency, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        businessId,
        data.customerId || null,
        invoiceNumber,
        data.invoiceDate || new Date().toISOString().split('T')[0],
        data.dueDate || null,
        subtotal, vatAmount, whtAmount, totalAmount,
        data.notes || null,
        data.currency || 'NGN',
        userId,
      ]
    );

    const invoice = rows[0];

    // Insert line items
    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_items
           (invoice_id, product_id, description, quantity, unit_price,
            vat_rate, vat_amount, wht_rate, wht_amount, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          invoice.id, item.productId || null, item.description,
          item.quantity, item.unitPrice,
          item.vatRate || 7.5, item.computedVat,
          item.whtRate || 0, item.computedWht,
          item.lineTotal,
        ]
      );
    }

    await client.query('COMMIT');
    return { ...invoice, items };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const update = async (businessId, id, data) => {
  const existing = await getOne(businessId, id);
  if (!['draft'].includes(existing.status)) {
    const err = new Error('Only draft invoices can be edited');
    err.statusCode = 400;
    throw err;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let subtotal = existing.subtotal;
    let vatAmount = existing.vat_amount;
    let whtAmount = existing.wht_amount;
    let totalAmount = existing.total_amount;

    if (data.items && data.items.length) {
      const computed = computeTotals(data.items);
      subtotal    = computed.subtotal;
      vatAmount   = computed.vatAmount;
      whtAmount   = computed.whtAmount;
      totalAmount = computed.totalAmount;

      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

      for (const item of computed.items) {
        await client.query(
          `INSERT INTO invoice_items
             (invoice_id, product_id, description, quantity, unit_price,
              vat_rate, vat_amount, wht_rate, wht_amount, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id, item.productId || null, item.description,
            item.quantity, item.unitPrice,
            item.vatRate || 7.5, item.computedVat,
            item.whtRate || 0, item.computedWht,
            item.lineTotal,
          ]
        );
      }
    }

    const { rows } = await client.query(
      `UPDATE invoices SET
         customer_id  = COALESCE($1, customer_id),
         invoice_date = COALESCE($2, invoice_date),
         due_date     = COALESCE($3, due_date),
         notes        = COALESCE($4, notes),
         subtotal     = $5,
         vat_amount   = $6,
         wht_amount   = $7,
         total_amount = $8
       WHERE id = $9
       RETURNING *`,
      [
        data.customerId || null,
        data.invoiceDate || null,
        data.dueDate || null,
        data.notes || null,
        subtotal, vatAmount, whtAmount, totalAmount, id,
      ]
    );

    await client.query('COMMIT');
    return getOne(businessId, id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Issue an invoice: generates IRN, changes status to 'issued',
 * and auto-creates tax ledger entries + bookkeeping income entry.
 */
const issue = async (businessId, id) => {
  const invoice = await getOne(businessId, id);
  if (invoice.status !== 'draft') {
    const err = new Error('Only draft invoices can be issued');
    err.statusCode = 400;
    throw err;
  }

  const { rows: biz } = await db.query(
    'SELECT tin, name FROM businesses WHERE id = $1', [businessId]
  );

  const irn = generateIRN(biz[0].tin, invoice.invoice_number, new Date(invoice.invoice_date));

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Update invoice
    await client.query(
      `UPDATE invoices SET status = 'issued', irn = $1 WHERE id = $2`,
      [irn, id]
    );

    const period = invoice.invoice_date.toISOString
      ? invoice.invoice_date.toISOString().substring(0, 7)
      : String(invoice.invoice_date).substring(0, 7);

    // VAT tax entry (payable)
    if (parseFloat(invoice.vat_amount) > 0) {
      await client.query(
        `INSERT INTO tax_entries
           (business_id, invoice_id, tax_type, tax_period, amount, direction)
         VALUES ($1,$2,'VAT',$3,$4,'payable')`,
        [businessId, id, period, invoice.vat_amount]
      );
    }

    // WHT tax entry (receivable — buyer withholds from seller)
    if (parseFloat(invoice.wht_amount) > 0) {
      await client.query(
        `INSERT INTO tax_entries
           (business_id, invoice_id, tax_type, tax_period, amount, direction)
         VALUES ($1,$2,'WHT',$3,$4,'receivable')`,
        [businessId, id, period, invoice.wht_amount]
      );
    }

    // Bookkeeping: income entry
    await client.query(
      `INSERT INTO bookkeeping_entries
         (business_id, entry_type, category, description, amount, entry_date, invoice_id, created_by)
       VALUES ($1,'income','Sales Revenue',$2,$3,$4,$5,$6)`,
      [
        businessId,
        `Invoice ${invoice.invoice_number}`,
        invoice.total_amount,
        invoice.invoice_date,
        id,
        invoice.created_by,
      ]
    );

    await client.query('COMMIT');
    return getOne(businessId, id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Submit issued invoice to FIRS.
 */
const submitFIRS = async (businessId, id) => {
  const invoice = await getOne(businessId, id);
  if (!['issued', 'submitted'].includes(invoice.status)) {
    const err = new Error('Invoice must be issued before FIRS submission');
    err.statusCode = 400;
    throw err;
  }
  if (!invoice.irn) {
    const err = new Error('Invoice has no IRN. Issue the invoice first.');
    err.statusCode = 400;
    throw err;
  }

  const { rows: biz } = await db.query('SELECT * FROM businesses WHERE id = $1', [businessId]);
  const { rows: items } = await db.query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1', [id]
  );

  const customer = invoice.customer_id ? {
    name: invoice.customer_name,
    tin: invoice.customer_tin,
    address: invoice.customer_address,
  } : null;

  const result = await submitToFIRS(invoice, biz[0], customer, items);

  const status = result.success ? 'accepted' : 'rejected';

  await db.query(
    `INSERT INTO firs_submissions
       (business_id, invoice_id, response_code, response_message, status, payload, response)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      businessId, id,
      result.response.code,
      result.response.message,
      status,
      JSON.stringify(result.payload),
      JSON.stringify(result.response),
    ]
  );

  await db.query(
    `UPDATE invoices SET
       firs_status        = $1,
       firs_submission_id = $2,
       status             = $3
     WHERE id = $4`,
    [
      status,
      result.response.submissionId || null,
      result.success ? 'submitted' : invoice.status,
      id,
    ]
  );

  return { result, invoice: await getOne(businessId, id) };
};

const markPaid = async (businessId, id) => {
  const invoice = await getOne(businessId, id);
  if (!['issued', 'submitted'].includes(invoice.status)) {
    const err = new Error('Invoice must be issued or submitted to be marked paid');
    err.statusCode = 400;
    throw err;
  }
  await db.query(`UPDATE invoices SET status = 'paid' WHERE id = $1`, [id]);
  return getOne(businessId, id);
};

const cancel = async (businessId, id) => {
  const invoice = await getOne(businessId, id);
  if (invoice.status === 'paid') {
    const err = new Error('Paid invoices cannot be cancelled');
    err.statusCode = 400;
    throw err;
  }
  await db.query(`UPDATE invoices SET status = 'cancelled' WHERE id = $1`, [id]);
  return getOne(businessId, id);
};

const verifyIRN = async (irn) => {
  const { rows } = await db.query(
    `SELECT i.irn, i.invoice_number, i.invoice_date, i.total_amount,
            i.status, i.firs_status, b.name AS business_name, b.tin AS business_tin
     FROM invoices i
     JOIN businesses b ON b.id = i.business_id
     WHERE i.irn = $1`,
    [irn]
  );
  if (!rows.length) {
    const err = new Error('IRN not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
};

module.exports = { list, getOne, create, update, issue, submitFIRS, markPaid, cancel, verifyIRN };
