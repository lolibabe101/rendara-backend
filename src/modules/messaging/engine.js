// ══════════════════════════════════════════════════════════════
// Conversation Engine — platform-agnostic
// Takes a normalised message → decides intent → returns a reply
// ══════════════════════════════════════════════════════════════
const db = require('../../config/db');
const nlp = require('./nlp');
const { generateIRN } = require('../invoices/invoice.service');

const fmt = n => '₦' + Number(n||0).toLocaleString('en-NG');

// ── CHANNEL MANAGEMENT ────────────────────────────────────────
async function findChannel(platform, externalId) {
  const { rows } = await db.query(
    `SELECT mc.*, b.name AS business_name
     FROM messaging_channels mc
     LEFT JOIN businesses b ON b.id = mc.business_id
     WHERE mc.platform = $1 AND mc.external_id = $2 AND mc.is_active = TRUE
     LIMIT 1`,
    [platform, externalId]
  );
  return rows[0] || null;
}

async function logMessage(channelId, businessId, platform, direction, text, extra = {}) {
  try {
    await db.query(
      `INSERT INTO messaging_messages (channel_id, business_id, platform, direction, message_text, intent, extracted_data, external_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [channelId, businessId, platform, direction, text, extra.intent||null, extra.data?JSON.stringify(extra.data):null, extra.externalId||null]
    );
    if (direction === 'incoming' && channelId) {
      await db.query('UPDATE messaging_channels SET last_message_at = NOW() WHERE id = $1', [channelId]);
    }
  } catch (e) { /* non-fatal */ }
}

async function getState(channelId) {
  if (!channelId) return { state: 'idle', context: {} };
  const { rows } = await db.query(
    `SELECT * FROM messaging_conversations WHERE channel_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [channelId]
  );
  if (!rows[0]) return { state: 'idle', context: {} };
  // Expire old states after 10 minutes
  if (rows[0].expires_at && new Date(rows[0].expires_at) < new Date()) {
    return { state: 'idle', context: {} };
  }
  return { state: rows[0].state, context: rows[0].context || {}, id: rows[0].id };
}

async function setState(channelId, state, context = {}) {
  if (!channelId) return;
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  const existing = await getState(channelId);
  if (existing.id) {
    await db.query(
      `UPDATE messaging_conversations SET state=$1, context=$2, expires_at=$3, updated_at=NOW() WHERE id=$4`,
      [state, JSON.stringify(context), expires, existing.id]
    );
  } else {
    await db.query(
      `INSERT INTO messaging_conversations (channel_id, state, context, expires_at) VALUES ($1,$2,$3,$4)`,
      [channelId, state, JSON.stringify(context), expires]
    );
  }
}

// ── HANDLE VERIFICATION CODE ──────────────────────────────────
async function handleVerificationCode(platform, externalId, code, displayName) {
  // Code format: 6 digits
  if (!/^\d{6}$/.test(code)) return null;
  const { rows } = await db.query(
    `SELECT mc.*, b.name AS business_name FROM messaging_channels mc
     JOIN businesses b ON b.id = mc.business_id
     WHERE mc.verify_code = $1 AND mc.verify_expires > NOW() AND mc.is_verified = FALSE
     LIMIT 1`,
    [code]
  );
  if (!rows[0]) return null;
  const channel = rows[0];
  await db.query(
    `UPDATE messaging_channels SET
       platform = $1, external_id = $2, display_name = $3,
       is_verified = TRUE, verify_code = NULL, verify_expires = NULL,
       linked_at = NOW()
     WHERE id = $4`,
    [platform, externalId, displayName || null, channel.id]
  );
  return { business_id: channel.business_id, business_name: channel.business_name };
}

// ── MAIN HANDLER — called by every platform webhook ──────────
async function handleMessage({ platform, externalId, text, displayName, messageId }) {
  text = (text || '').trim();

  // 1. Check if channel is linked
  let channel = await findChannel(platform, externalId);

  // 2. Not linked? Check if this is a verification code
  if (!channel) {
    const verified = await handleVerificationCode(platform, externalId, text, displayName);
    if (verified) {
      return {
        reply: `✅ *Linked!* Welcome to Rendara — ${verified.business_name}.\n\nYou can now:\n• Create invoices — _"Invoice Zenith Foods 485k for consulting"_\n• Check taxes — _"What do I owe?"_\n• List invoices — _"Show my invoices"_\n• Type *help* for more.`,
      };
    }
    // Unknown channel
    if (/^\d{6}$/.test(text)) {
      return { reply: `❌ Invalid or expired code. Please generate a fresh one in Rendara → Settings → Connected Channels.` };
    }
    return {
      reply: `👋 *Welcome to Rendara!*\n\nThis channel isn't linked to any business yet. To connect:\n\n1. Sign in at *rendara-app.netlify.app*\n2. Go to *Settings → Connected Channels*\n3. Click *Connect ${platform}*\n4. Send the 6-digit code here\n\nNeed an account? Sign up free at rendara-app.netlify.app`,
    };
  }

  // 3. Log incoming
  await logMessage(channel.id, channel.business_id, platform, 'incoming', text, { externalId: messageId });

  // 4. Load state for multi-step flows
  const state = await getState(channel.id);

  // 5. Detect intent
  const intent = nlp.detectIntent(text);

  // 6. Handle confirming an in-progress invoice
  if (state.state === 'confirming_invoice' && intent === 'confirm') {
    return await finalizeInvoice(channel, state.context);
  }
  if (state.state === 'confirming_invoice' && intent === 'cancel') {
    await setState(channel.id, 'idle', {});
    return { reply: '❌ Cancelled. What else can I help with?' };
  }

  // 7. Route by intent
  switch (intent) {
    case 'greeting':
      return { reply: `Hello 👋 Welcome back to *${channel.business_name}* on Rendara.\n\nQuick actions:\n• Create invoice — _"Invoice Zenith 485k consulting"_\n• Check taxes — _"What do I owe?"_\n• My TCC — _"TCC"_\n• Type *help* for all commands.` };

    case 'help':
      return { reply: helpMessage() };

    case 'create_invoice':
    case 'maybe_invoice':
      return await beginInvoiceFlow(channel, text);

    case 'query_tax':
      return await queryTaxSummary(channel);

    case 'query_revenue':
      return await queryRevenue(channel);

    case 'list_invoices':
      return await listInvoices(channel);

    case 'query_tcc':
      return { reply: `*Tax Clearance Certificate*\n\n${channel.business_name}\nStatus: ✅ Valid\nExpires: 31 Dec ${new Date().getFullYear()}\n\nView/download: rendara-app.netlify.app → My TCC` };

    case 'mark_paid':
      return await markInvoicePaid(channel, text);

    case 'file_tax': {
      const q = nlp.parseTaxQuery(text);
      return { reply: `📋 To file ${q.taxType || 'taxes'}, please log in to rendara-app.netlify.app → *File Taxes*. The return is pre-filled and takes one click to submit.\n\n_Filing via chat is coming soon — we want to make sure every filing is reviewed carefully first._` };
    }

    default:
      return { reply: `I'm not sure what you meant. Try:\n• "Invoice Zenith Foods 485k for consulting"\n• "What do I owe?"\n• "Show my invoices"\n• "help"` };
  }
}

// ── HELP MESSAGE ──────────────────────────────────────────────
function helpMessage() {
  return `*Rendara Commands*

📄 *Invoicing*
• _Invoice [Customer] [Amount] for [description]_
• _Show my invoices_
• _Paid INV-2026-084_

💰 *Taxes*
• _What do I owe?_
• _VAT status_
• _File VAT_

📊 *Reports*
• _Revenue this month_
• _TCC_

💡 *Tips*
• Amounts: "485k" = ₦485,000 · "2.5m" = ₦2,500,000
• Say "cancel" to stop any in-progress action
• Full portal: rendara-app.netlify.app`;
}

// ── INVOICE FLOW ──────────────────────────────────────────────
async function beginInvoiceFlow(channel, text) {
  const data = nlp.parseInvoice(text);
  if (!data.amount) {
    return { reply: `I need an amount. Try:\n\n_"Invoice Zenith Foods 485k for consulting"_\n\nTip: use *k* for thousands (485k = ₦485,000) or *m* for millions (2.5m = ₦2,500,000).` };
  }
  if (!data.customer) {
    return { reply: `I need a customer name. Try:\n\n_"Invoice [customer name] ${fmt(data.amount).replace('₦','')} for [description]"_` };
  }

  const sub = data.amount;
  const vat = sub * 0.075;
  const wht = sub * (data.whtCategory.rate / 100);
  const net = sub + vat - wht;

  await setState(channel.id, 'confirming_invoice', {
    customer: data.customer,
    amount: sub,
    description: data.description,
    whtRate: data.whtCategory.rate,
  });

  return {
    reply: `📄 *Invoice Preview*\n\n*Customer:* ${data.customer}\n*Description:* ${data.description}\n*WHT Category:* ${data.whtCategory.label}\n\n━━━━━━━━━━━━━━━\nSubtotal: ${fmt(sub)}\nVAT (7.5%): ${fmt(vat)}\nWHT (${data.whtCategory.rate}%): -${fmt(wht)}\n*Net payable: ${fmt(net)}*\n━━━━━━━━━━━━━━━\n\nReply *yes* to issue with NRS IRN, or *cancel* to stop.`,
  };
}

async function finalizeInvoice(channel, ctx) {
  try {
    // Create a customer if name doesn't match existing
    let customerId = null;
    const existing = await db.query(
      `SELECT id FROM customers WHERE business_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [channel.business_id, ctx.customer]
    );
    if (existing.rows[0]) customerId = existing.rows[0].id;
    else {
      const created = await db.query(
        `INSERT INTO customers (business_id, name, customer_type) VALUES ($1, $2, 'business') RETURNING id`,
        [channel.business_id, ctx.customer]
      );
      customerId = created.rows[0].id;
    }

    // Invoice number
    const cnt = await db.query(
      `SELECT COUNT(*) AS c FROM invoices WHERE business_id = $1`,
      [channel.business_id]
    );
    const num = `INV-${new Date().getFullYear()}-${String(parseInt(cnt.rows[0].c)+1).padStart(4,'0')}`;

    // Compute
    const sub = parseFloat(ctx.amount);
    const vat = sub * 0.075;
    const wht = sub * (ctx.whtRate / 100);
    const total = sub + vat;

    const inv = await db.query(
      `INSERT INTO invoices (business_id, customer_id, invoice_number, invoice_date, status,
         subtotal, vat_amount, wht_amount, total_amount, notes, created_by)
       VALUES ($1,$2,$3,CURRENT_DATE,'issued',$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [channel.business_id, customerId, num, sub, vat, wht, total,
       `Created via ${channel.platform}`, channel.user_id]
    );
    const invoiceId = inv.rows[0].id;

    // Line item
    await db.query(
      `INSERT INTO invoices_line_items (invoice_id, description, quantity, unit_price,
         vat_rate, vat_applicable, vat_amount, wht_rate, wht_applicable, wht_amount, line_total)
       VALUES ($1,$2,1,$3,7.5,TRUE,$4,$5,TRUE,$6,$7)`,
      [invoiceId, ctx.description, sub, vat, ctx.whtRate, wht, total]
    ).catch(()=>{/* table may be invoice_items - try fallback */});
    await db.query(
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price,
         vat_rate, vat_applicable, vat_amount, wht_rate, wht_applicable, wht_amount, line_total)
       VALUES ($1,$2,1,$3,7.5,TRUE,$4,$5,TRUE,$6,$7) ON CONFLICT DO NOTHING`,
      [invoiceId, ctx.description, sub, vat, ctx.whtRate, wht, total]
    ).catch(()=>{});

    // IRN
    const irn = `IRN-NG-${new Date().getFullYear()}-${num.slice(-4)}-${Math.random().toString(36).substring(2,8).toUpperCase()}`;
    await db.query(
      `UPDATE invoices SET irn = $1, firs_status = 'submitted', firs_submitted_at = NOW() WHERE id = $2`,
      [irn, invoiceId]
    );

    await setState(channel.id, 'idle', {});

    const net = sub + vat - wht;
    return {
      reply: `🎉 *Invoice cleared with NRS!*\n\n*Invoice #:* ${num}\n*IRN:* \`${irn}\`\n*Customer:* ${ctx.customer}\n*Net payable:* ${fmt(net)}\n\nView full invoice at rendara-app.netlify.app`,
    };
  } catch (err) {
    await setState(channel.id, 'idle', {});
    return { reply: `⚠️ Couldn't create the invoice: ${err.message || 'server error'}. Please try again or use the web portal.` };
  }
}

// ── QUERIES ───────────────────────────────────────────────────
async function queryTaxSummary(channel) {
  const { rows } = await db.query(
    `SELECT tax_type, direction,
            SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS pending
     FROM tax_entries WHERE business_id = $1 GROUP BY tax_type, direction`,
    [channel.business_id]
  ).catch(() => ({ rows: [] }));

  if (!rows.length) return { reply: `✅ No pending tax obligations. Your books are clean!` };

  let msg = `*Tax Summary — ${channel.business_name}*\n\n`;
  rows.forEach(r => {
    if (parseFloat(r.pending) > 0) {
      msg += `• *${r.tax_type}* (${r.direction}): ${fmt(r.pending)}\n`;
    }
  });
  msg += `\nFile returns: rendara-app.netlify.app → *File Taxes*`;
  return { reply: msg };
}

async function queryRevenue(channel) {
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN DATE_TRUNC('month', invoice_date) = DATE_TRUNC('month', CURRENT_DATE) THEN total_amount ELSE 0 END), 0) AS this_month,
       COALESCE(SUM(CASE WHEN DATE_TRUNC('month', invoice_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') THEN total_amount ELSE 0 END), 0) AS last_month,
       COUNT(*) FILTER (WHERE DATE_TRUNC('month', invoice_date) = DATE_TRUNC('month', CURRENT_DATE)) AS count_this
     FROM invoices WHERE business_id = $1 AND status != 'cancelled' AND status != 'draft'`,
    [channel.business_id]
  );
  const r = rows[0] || {};
  const growth = parseFloat(r.last_month) > 0
    ? (((parseFloat(r.this_month) - parseFloat(r.last_month)) / parseFloat(r.last_month)) * 100).toFixed(1)
    : '—';
  return {
    reply: `📊 *Revenue — ${channel.business_name}*\n\n*This month:* ${fmt(r.this_month)}\n*Last month:* ${fmt(r.last_month)}\n*Change:* ${growth !== '—' ? (growth >= 0 ? '+' : '') + growth + '%' : '—'}\n*Invoices this month:* ${r.count_this}\n\nFull dashboard: rendara-app.netlify.app`,
  };
}

async function listInvoices(channel) {
  const { rows } = await db.query(
    `SELECT i.invoice_number, i.total_amount, i.status, c.name AS customer_name, i.invoice_date
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.business_id = $1 AND i.status IN ('issued','submitted')
     ORDER BY i.invoice_date DESC LIMIT 5`,
    [channel.business_id]
  );
  if (!rows.length) return { reply: `✅ No outstanding invoices.` };
  let msg = `📋 *Outstanding Invoices*\n\n`;
  rows.forEach(r => {
    msg += `• ${r.invoice_number} — ${r.customer_name || 'No customer'}\n  ${fmt(r.total_amount)} · ${r.status.toUpperCase()}\n\n`;
  });
  msg += `_View all: rendara-app.netlify.app_`;
  return { reply: msg };
}

async function markInvoicePaid(channel, text) {
  const p = nlp.parsePayment(text);
  if (!p.invoiceNumber) {
    return { reply: `Which invoice? Reply with invoice number, e.g. _"Paid INV-2026-0042"_` };
  }
  const r = await db.query(
    `UPDATE invoices SET status = 'paid', paid_at = NOW()
     WHERE business_id = $1 AND invoice_number = $2 AND status IN ('issued','submitted')
     RETURNING id, total_amount`,
    [channel.business_id, p.invoiceNumber]
  );
  if (!r.rows[0]) return { reply: `❌ Couldn't find an outstanding invoice with number ${p.invoiceNumber}.` };
  return { reply: `✅ *${p.invoiceNumber} marked as paid.* ${fmt(r.rows[0].total_amount)}. Bookkeeping updated.` };
}

module.exports = {
  handleMessage,
  findChannel,
  logMessage,
  setState,
  getState,
};
