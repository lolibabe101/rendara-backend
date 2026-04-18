-- ============================================================
-- Rendara Messaging & Social Integration Schema v1.0
-- ============================================================

-- ── PLATFORM LINKS ────────────────────────────────────────────
-- Links a user/business to a channel (WhatsApp number, Telegram chat ID, etc.)
CREATE TABLE IF NOT EXISTS messaging_channels (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  user_id       UUID REFERENCES users(id),
  platform      VARCHAR(50) NOT NULL,            -- telegram|whatsapp|messenger|instagram|sms
  external_id   VARCHAR(255) NOT NULL,           -- chat_id, phone, page_id, etc.
  display_name  VARCHAR(255),
  is_verified   BOOLEAN DEFAULT FALSE,
  verify_code   VARCHAR(10),
  verify_expires TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT TRUE,
  linked_at     TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  UNIQUE(platform, external_id)
);

-- ── INCOMING MESSAGE LOG ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS messaging_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id    UUID REFERENCES messaging_channels(id) ON DELETE CASCADE,
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  platform      VARCHAR(50) NOT NULL,
  direction     VARCHAR(10) NOT NULL,            -- incoming|outgoing
  external_id   VARCHAR(255),                    -- platform message id
  message_text  TEXT,
  message_type  VARCHAR(50) DEFAULT 'text',      -- text|image|document|voice
  attachments   JSONB DEFAULT '[]',
  intent        VARCHAR(100),                    -- create_invoice|query_tax|approve_invoice...
  extracted_data JSONB,
  response_sent BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONVERSATION STATE ────────────────────────────────────────
-- Multi-step conversations (e.g. creating invoice in steps)
CREATE TABLE IF NOT EXISTS messaging_conversations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id    UUID REFERENCES messaging_channels(id) ON DELETE CASCADE,
  state         VARCHAR(100) NOT NULL,           -- idle|collecting_invoice|confirming...
  context       JSONB DEFAULT '{}',
  expires_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── RETRY QUEUE (for failed NRS calls, etc.) ──────────────────
CREATE TABLE IF NOT EXISTS messaging_retry_queue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  action_type   VARCHAR(100) NOT NULL,           -- firs_submit|send_message...
  payload       JSONB NOT NULL,
  attempts      INTEGER DEFAULT 0,
  max_attempts  INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  last_error    TEXT,
  status        VARCHAR(50) DEFAULT 'pending',  -- pending|processing|completed|failed
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PLATFORM CONFIGS (per business) ───────────────────────────
-- Lets each business configure their own WhatsApp number, Telegram bot token etc.
CREATE TABLE IF NOT EXISTS messaging_platform_configs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  platform      VARCHAR(50) NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}',     -- credentials, webhook url, etc.
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, platform)
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_msgch_biz       ON messaging_channels(business_id);
CREATE INDEX IF NOT EXISTS idx_msgch_platform  ON messaging_channels(platform, external_id);
CREATE INDEX IF NOT EXISTS idx_msgs_channel    ON messaging_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_msgs_biz        ON messaging_messages(business_id);
CREATE INDEX IF NOT EXISTS idx_msgs_created    ON messaging_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_channel    ON messaging_conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_retry_status    ON messaging_retry_queue(status, next_retry_at);
