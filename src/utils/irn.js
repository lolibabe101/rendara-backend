const crypto = require('crypto');

/**
 * Generate a FIRS-compliant Invoice Reference Number (IRN).
 *
 * Format (aligned with FIRS BIS e-invoicing spec):
 *   RND-{TIN}-{YYYYMM}-{InvoiceNumber}-{6-char hash}
 *
 * Example: RND-12345678-2025-INV-001-A3F9C2
 *
 * @param {string} tin            Business TIN
 * @param {string} invoiceNumber  Internal invoice number
 * @param {Date}   date           Invoice date (defaults to now)
 * @returns {string}
 */
const generateIRN = (tin, invoiceNumber, date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const period = `${year}${month}`;

  const hashInput = `${tin}|${invoiceNumber}|${period}|${Date.now()}`;
  const hash = crypto
    .createHash('sha256')
    .update(hashInput)
    .digest('hex')
    .substring(0, 6)
    .toUpperCase();

  // Strip non-alphanumeric from invoice number for safe embedding
  const safeInvoice = invoiceNumber.replace(/[^A-Z0-9]/gi, '-').toUpperCase();

  return `RND-${tin}-${period}-${safeInvoice}-${hash}`;
};

/**
 * Validate basic IRN structure.
 */
const validateIRN = (irn) => {
  const pattern = /^RND-\d+-\d{6}-[\w-]+-[A-F0-9]{6}$/;
  return pattern.test(irn);
};

module.exports = { generateIRN, validateIRN };
