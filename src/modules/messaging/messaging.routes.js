// ══════════════════════════════════════════════════════════════
// Messaging Routes
// - Public webhooks (no auth) for each platform
// - Business-scoped channel management (auth required)
// ══════════════════════════════════════════════════════════════
const express = require('express');
const db = require('../../config/db');
const R = require('../../utils/response');
const { requireRole } = require('../../middleware/auth');
const telegram = require('./telegram');

// ── PUBLIC WEBHOOK ROUTER (no auth) ──────────────────────────
const webhookRouter = express.Router();

// Telegram webhook
webhookRouter.post('/telegram', async (req, res) => {
  try {
    await telegram.handleWebhook(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[telegram webhook]', err.message);
    res.json({ ok: true }); // Always return 200 so Telegram doesn't retry
  }
});

// WhatsApp webhook (stub — activate when Meta API ready)
webhookRouter.get('/whatsapp', (req, res) => {
  // Meta verification challenge
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});
webhookRouter.post('/whatsapp', async (req, res) => {
  // TODO: wire WhatsApp adapter once Meta API credentials are set
  res.json({ ok: true });
});

// Facebook Messenger webhook (stub)
webhookRouter.get('/messenger', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.MESSENGER_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});
webhookRouter.post('/messenger', async (req, res) => {
  res.json({ ok: true });
});

// Instagram webhook (stub)
webhookRouter.post('/instagram', async (req, res) => {
  res.json({ ok: true });
});

// Setup endpoint to register Telegram webhook (call once after deploy)
webhookRouter.post('/setup-telegram', async (req, res) => {
  try {
    const url = req.body.webhookUrl || `${req.protocol}://${req.get('host')}/api/messaging/telegram`;
    const result = await telegram.setWebhook(url);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── BUSINESS-SCOPED CHANNEL ROUTER (auth required) ──────────
const channelRouter = express.Router({ mergeParams: true });

// List linked channels for this business
channelRouter.get('/channels', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, platform, external_id, display_name, is_verified, is_active, linked_at, last_message_at
       FROM messaging_channels
       WHERE business_id = $1 AND is_verified = TRUE
       ORDER BY linked_at DESC`,
      [req.business.id]
    );
    return R.success(res, rows);
  } catch (err) { next(err); }
});

// Generate a link code — user then sends this code from the platform to bind
channelRouter.post('/channels/generate-code', requireRole('owner', 'accountant'), async (req, res, next) => {
  try {
    const platform = req.body.platform || 'telegram';
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    // Create pending channel (placeholder external_id)
    const placeholderId = `pending-${code}`;
    const { rows } = await db.query(
      `INSERT INTO messaging_channels (business_id, user_id, platform, external_id, verify_code, verify_expires, is_verified, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE,TRUE)
       RETURNING id, verify_code, verify_expires`,
      [req.business.id, req.user.id, platform, placeholderId, code, expires]
    );

    return R.success(res, {
      code,
      expiresAt: expires,
      platform,
      instructions: platformInstructions(platform, code),
    }, 'Link code generated — send it from your chat app within 15 minutes');
  } catch (err) { next(err); }
});

// Remove a linked channel
channelRouter.delete('/channels/:id', requireRole('owner'), async (req, res, next) => {
  try {
    await db.query(
      `UPDATE messaging_channels SET is_active = FALSE WHERE id = $1 AND business_id = $2`,
      [req.params.id, req.business.id]
    );
    return R.success(res, null, 'Channel unlinked');
  } catch (err) { next(err); }
});

// Recent messages (audit trail)
channelRouter.get('/messages', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await db.query(
      `SELECT id, platform, direction, message_text, intent, created_at
       FROM messaging_messages
       WHERE business_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [req.business.id, limit]
    );
    return R.success(res, rows);
  } catch (err) { next(err); }
});

function platformInstructions(platform, code) {
  const base = {
    telegram: `1. Open Telegram and search for @${process.env.TELEGRAM_BOT_USERNAME || 'your_rendara_bot'}\n2. Start the bot\n3. Send the code: ${code}`,
    whatsapp: `1. Open WhatsApp\n2. Message the Rendara number\n3. Send the code: ${code}`,
    messenger: `1. Open Facebook Messenger\n2. Message the Rendara page\n3. Send the code: ${code}`,
    instagram: `1. Open Instagram DMs\n2. Message @rendara_ng\n3. Send the code: ${code}`,
  };
  return base[platform] || base.telegram;
}

module.exports = { webhookRouter, channelRouter };
