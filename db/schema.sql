-- Schema do Dashboard de Relatórios (Postgres 13+)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL,
  -- ID numérico da conta de anúncios, sem o prefixo "act_"
  meta_ad_account_id      TEXT CHECK (meta_ad_account_id ~ '^[0-9]+$'),
  -- action_type da Meta contado como conversão (ex.: lead, purchase,
  -- onsite_conversion.messaging_conversation_started_7d)
  meta_conversion_action  TEXT NOT NULL DEFAULT 'lead',
  -- Customer ID do Google Ads, 10 dígitos sem hífen
  google_ads_customer_id  TEXT CHECK (google_ads_customer_id ~ '^[0-9]{10}$'),
  -- ID numérico da propriedade GA4
  ga4_property_id         TEXT CHECK (ga4_property_id ~ '^[0-9]+$'),
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_name_idx ON clients (lower(name));

CREATE TABLE IF NOT EXISTS reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  data             JSONB NOT NULL,
  analysis         JSONB,
  share_token      TEXT NOT NULL UNIQUE,
  share_expires_at TIMESTAMPTZ,
  share_revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS reports_client_idx ON reports (client_id, created_at DESC);
