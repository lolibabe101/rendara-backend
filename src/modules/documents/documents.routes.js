// ── SERVICE ───────────────────────────────────────────────────
const db = require('../../config/db');
const R = require('../../utils/response');
const router = require('express').Router({ mergeParams: true });
const { requireRole } = require('../../middleware/auth');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');

const list = async (businessId, type) => {
  const { rows } = await db.query(
    `SELECT * FROM documents WHERE business_id = $1 ${type ? 'AND doc_type = $2' : ''}
     ORDER BY created_at DESC`,
    type ? [businessId, type] : [businessId]
  );
  return rows;
};

const create = async (businessId, userId, data) => {
  const { rows } = await db.query(
    `INSERT INTO documents (business_id, doc_type, title, file_name, file_url, file_size,
       issued_by, issued_date, expiry_date, reference, notes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [businessId, data.docType, data.title, data.fileName||null, data.fileUrl||null,
     data.fileSize||null, data.issuedBy||null, data.issuedDate||null,
     data.expiryDate||null, data.reference||null, data.notes||null, userId]
  );
  return rows[0];
};

const remove = async (businessId, id) => {
  await db.query('DELETE FROM documents WHERE id = $1 AND business_id = $2', [id, businessId]);
};

// ── CONTROLLER ────────────────────────────────────────────────
const listDocs = async (req, res, next) => {
  try { return R.success(res, await list(req.business.id, req.query.type)); }
  catch (err) { next(err); }
};
const createDoc = async (req, res, next) => {
  try { return R.created(res, await create(req.business.id, req.user.id, req.body), 'Document saved'); }
  catch (err) { next(err); }
};
const deleteDoc = async (req, res, next) => {
  try { await remove(req.business.id, req.params.id); return R.success(res, null, 'Deleted'); }
  catch (err) { next(err); }
};

// ── ROUTES ────────────────────────────────────────────────────
router.get('/', listDocs);
router.post('/', requireRole('owner', 'accountant'), [
  body('docType').notEmpty(),
  body('title').trim().notEmpty(),
  validate,
], createDoc);
router.delete('/:id', requireRole('owner'), deleteDoc);

module.exports = router;
