// ══════════════════════════════════════════════════════════════
// Telegram Bot Adapter
// Webhook at /api/messaging/telegram
// ══════════════════════════════════════════════════════════════
const https = require('https');
const engine = require('./engine');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Send a message to a Telegram chat
async function sendMessage(chatId, text, options = {}) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const payload = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
    ...options,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({ ok: false, body }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Handle an incoming Telegram webhook
async function handleWebhook(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return { ok: true };

  const chatId = msg.chat.id.toString();
  const firstName = msg.from?.first_name || '';
  const lastName = msg.from?.last_name || '';
  const displayName = `${firstName} ${lastName}`.trim() || msg.from?.username || 'User';

  try {
    const result = await engine.handleMessage({
      platform: 'telegram',
      externalId: chatId,
      text: msg.text,
      displayName,
      messageId: msg.message_id?.toString(),
    });

    if (result?.reply) {
      await sendMessage(chatId, result.reply);
      // Log outgoing
      const channel = await engine.findChannel('telegram', chatId);
      if (channel) await engine.logMessage(channel.id, channel.business_id, 'telegram', 'outgoing', result.reply);
    }
  } catch (err) {
    console.error('[telegram] handler error:', err.message);
    try { await sendMessage(chatId, '⚠️ Something went wrong. Please try again.'); } catch {}
  }
  return { ok: true };
}

// Register the webhook with Telegram (call this once on deploy)
async function setWebhook(webhookUrl) {
  const payload = JSON.stringify({ url: webhookUrl });
  return new Promise((resolve, reject) => {
    const req = https.request(`${TELEGRAM_API}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ ok:false, body }); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { handleWebhook, sendMessage, setWebhook };
