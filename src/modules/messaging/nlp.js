// ══════════════════════════════════════════════════════════════
// NLP Parser — extracts intent and structured data from free text
// Supports Nigerian English, Pidgin, and common business shorthand
// ══════════════════════════════════════════════════════════════

// Normalise Nigerian number formats: "485k" → 485000, "2m" → 2000000, "2.5m" → 2500000
function parseAmount(text) {
  if (!text) return null;
  const cleaned = text.toString().toLowerCase().replace(/[₦,\s]/g, '');
  // Try patterns like 485k, 2m, 2.5m, 500000, 500,000
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*k$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*m$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num);
}

// Detect intent from message
function detectIntent(text) {
  const t = (text || '').toLowerCase().trim();

  // Greetings
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|how\s+far|wetin\s+dey)/.test(t)) return 'greeting';

  // Help
  if (/^(help|menu|commands?|what can you do|how does this work)/.test(t) || t === '/help' || t === '/start') return 'help';

  // Create invoice
  if (/^(new|create|raise|make|generate|issue)\s+invoice/.test(t) || /^invoice\s+\w+/.test(t) || /^bill\s+\w+/.test(t)) return 'create_invoice';

  // Query tax obligations
  if (/(what|how much).*(owe|due|vat|wht|paye|cit|tax)/.test(t) || /^(my )?(tax(es)?|vat|wht|paye|cit)(\s+(status|due|balance))?\??$/.test(t)) return 'query_tax';

  // Revenue / invoice status
  if (/(how much|total).*(invoice|revenue|sales|this month|today|week)/.test(t)) return 'query_revenue';
  if (/^(revenue|sales|invoices?)(\s+(this\s+(month|week)|today|mtd))?\??$/.test(t)) return 'query_revenue';

  // List invoices
  if (/^(list|show|my)\s+(invoices|receivables|outstanding)/.test(t) || /^(unpaid|outstanding)\s+invoices?/.test(t)) return 'list_invoices';

  // Mark paid
  if (/(mark|set|record).*(paid|payment)/.test(t) || /^paid\s+\w+/.test(t)) return 'mark_paid';

  // File tax
  if (/^file\s+(vat|wht|paye|cit|taxes?)/.test(t)) return 'file_tax';

  // TCC
  if (/^(my )?tcc/.test(t) || /tax clearance/.test(t)) return 'query_tcc';

  // Confirmation
  if (/^(yes|yeah|yep|confirm|ok|okay|sure|go|proceed|👍|✅)$/.test(t)) return 'confirm';
  if (/^(no|nope|cancel|stop|abort|❌)$/.test(t)) return 'cancel';

  // Default: try to parse as invoice if contains amount
  if (/\d+\s*(k|m|,\d{3})/i.test(t) || /₦\s*\d/.test(t)) return 'maybe_invoice';

  return 'unknown';
}

// Extract invoice data from text
// Examples:
//   "Invoice Zenith Foods 485k for consulting"
//   "New invoice for GTB Bank, amount 2.5m, supply of laptops"
//   "Bill Adekunle Motors 150000 vehicle repair"
function parseInvoice(text) {
  const result = { customer: null, amount: null, description: null, whtCategory: null };
  if (!text) return result;

  // Strip intent keywords
  let cleaned = text.replace(/^(new\s+|create\s+|raise\s+|make\s+|generate\s+|issue\s+)?(invoice|bill)\s+/i, '').trim();
  cleaned = cleaned.replace(/^(for|to)\s+/i, '');

  // Extract amount (with k/m suffix or plain numbers)
  const amountMatch = cleaned.match(/(?:₦\s*)?([\d,]+(?:\.\d+)?)\s*([km])?(?=\s|$|[,\.])/i);
  if (amountMatch) {
    const suffix = amountMatch[2] ? amountMatch[2].toLowerCase() : '';
    const raw = amountMatch[1].replace(/,/g, '') + suffix;
    result.amount = parseAmount(raw);
    // Remove amount from text for cleaner parsing
    cleaned = cleaned.replace(amountMatch[0], '').trim();
  }

  // Detect WHT category from keywords
  const whtMap = [
    { kw: ['consulting', 'consultancy', 'advisory', 'professional', 'legal', 'audit'], rate: 10, label: 'Consulting — 10%' },
    { kw: ['rent', 'lease'], rate: 10, label: 'Rent/Lease — 10%' },
    { kw: ['construction', 'building', 'civil works'], rate: 5, label: 'Construction — 5%' },
    { kw: ['supply', 'goods', 'materials', 'equipment', 'laptop', 'computer'], rate: 5, label: 'Supply of Goods — 5%' },
    { kw: ['transport', 'logistics', 'haulage', 'delivery'], rate: 5, label: 'Transport — 5%' },
    { kw: ['director', 'board fees'], rate: 10, label: 'Director Fees — 10%' },
  ];
  const lowerText = text.toLowerCase();
  for (const entry of whtMap) {
    if (entry.kw.some(k => lowerText.includes(k))) {
      result.whtCategory = { rate: entry.rate, label: entry.label };
      break;
    }
  }
  if (!result.whtCategory) {
    result.whtCategory = { rate: 10, label: 'Consulting — 10% (default)' };
  }

  // Extract customer — look for patterns like "for X" or "X amount" structure
  // Everything before the amount is likely the customer if not already used
  // Strategy: split by commas and find the likely customer name
  const parts = cleaned.split(/[,;]/).map(p => p.trim()).filter(Boolean);
  if (parts.length) {
    // First part before amount is usually the customer
    result.customer = parts[0].replace(/^(for|to)\s+/i, '').trim();
    // Rest is description
    if (parts.length > 1) {
      result.description = parts.slice(1).join(', ').replace(/^(for|description:?)\s+/i, '').trim();
    }
  }

  // If no description, try to extract from "for X" pattern in original
  if (!result.description) {
    const forMatch = text.match(/\bfor\s+([a-z][a-z0-9\s\-]+)(?:\s*[,\.]|\s*$)/i);
    if (forMatch) result.description = forMatch[1].trim();
  }

  if (!result.description) result.description = 'Services rendered';

  return result;
}

// Parse "mark paid" commands: "Paid INV-2026-084" or "Zenith paid"
function parsePayment(text) {
  const result = { invoiceNumber: null, customer: null };
  const invMatch = text.match(/(INV[-\s]?\d{4}[-\s]?\d+)/i);
  if (invMatch) result.invoiceNumber = invMatch[1].toUpperCase().replace(/\s/g, '-');
  const paidMatch = text.match(/^([a-z][a-z\s]+?)\s+(paid|settled)/i);
  if (paidMatch) result.customer = paidMatch[1].trim();
  return result;
}

// Parse tax query: "file VAT for April"
function parseTaxQuery(text) {
  const t = text.toLowerCase();
  const types = { vat: 'VAT', wht: 'WHT', paye: 'PAYE', cit: 'CIT' };
  for (const [kw, tax] of Object.entries(types)) {
    if (t.includes(kw)) return { taxType: tax };
  }
  return { taxType: null };
}

module.exports = {
  parseAmount,
  detectIntent,
  parseInvoice,
  parsePayment,
  parseTaxQuery,
};
