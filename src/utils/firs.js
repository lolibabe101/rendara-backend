const env = require('../config/env');
const logger = require('./logger');

/**
 * FIRS e-Invoicing API Service
 *
 * Currently runs in sandbox mode (simulates FIRS responses).
 * To go live: set FIRS_SANDBOX=false and FIRS_API_KEY in .env.
 * The real endpoint calls are already wired — only the simulation block
 * needs to be removed once FIRS opens the public API.
 */

const buildPayload = (invoice, business, customer, items) => ({
  sellerTIN: business.tin,
  sellerName: business.name,
  sellerAddress: business.address,
  buyerTIN: customer?.tin || '',
  buyerName: customer?.name || '',
  buyerAddress: customer?.address || '',
  invoiceNumber: invoice.invoice_number,
  irn: invoice.irn,
  invoiceDate: invoice.invoice_date,
  currency: invoice.currency,
  lineItems: items.map((i) => ({
    description: i.description,
    quantity: parseFloat(i.quantity),
    unitPrice: parseFloat(i.unit_price),
    vatRate: parseFloat(i.vat_rate),
    vatAmount: parseFloat(i.vat_amount),
    lineTotal: parseFloat(i.line_total),
  })),
  subtotal: parseFloat(invoice.subtotal),
  vatAmount: parseFloat(invoice.vat_amount),
  whtAmount: parseFloat(invoice.wht_amount),
  totalAmount: parseFloat(invoice.total_amount),
});

const submitInvoice = async (invoice, business, customer, items) => {
  const payload = buildPayload(invoice, business, customer, items);

  if (env.firs.sandbox) {
    logger.info(`[FIRS SANDBOX] Simulating submission for IRN: ${invoice.irn}`);

    // Simulate ~500ms network latency
    await new Promise((r) => setTimeout(r, 500));

    // Simulate a ~95% acceptance rate
    const accepted = Math.random() > 0.05;
    return {
      success: accepted,
      payload,
      response: {
        code: accepted ? '200' : '422',
        message: accepted
          ? 'Invoice accepted by FIRS'
          : 'Validation error: missing buyer TIN',
        submissionId: accepted
          ? `FIRS-SIM-${Date.now()}`
          : null,
      },
    };
  }

  // ── Live FIRS API call ──────────────────────────────────────────────────────
  try {
    const res = await fetch(env.firs.apiUrl + '/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.firs.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return {
      success: res.ok,
      payload,
      response: data,
    };
  } catch (err) {
    logger.error('FIRS API call failed', { error: err.message });
    throw new Error('FIRS submission failed: ' + err.message);
  }
};

module.exports = { submitInvoice };
