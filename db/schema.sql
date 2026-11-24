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

-- Conexões OAuth (Meta / Google) feitas pela tela de Integrações.
-- O token fica CRIPTOGRAFADO (AES-256-GCM, chave INTEGRATIONS_KEY do .env).
CREATE TABLE IF NOT EXISTS integrations (
  provider         TEXT PRIMARY KEY CHECK (provider IN ('meta', 'google')),
  account_name     TEXT NOT NULL,
  account_id       TEXT NOT NULL,
  token_encrypted  TEXT NOT NULL,
  scopes           TEXT NOT NULL DEFAULT '',
  expires_at       TIMESTAMPTZ,
  connected_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permissões individuais (NULL = derivar do papel: admin = todas; user = padrão).
-- Só as contas master (MASTER_ADMINS no .env) alteram permissões.
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT[];
-- Cadastro feito pela tela de login: fica pendente até uma conta master aprovar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT FALSE;

-- Conexão de cada cliente com a Sellbot (CRM de vendas). Token CRIPTOGRAFADO com INTEGRATIONS_KEY.
-- global_pipelines: funis somados na visão Global (NULL = todos).
CREATE TABLE IF NOT EXISTS sellbot_connections (
  client_id         INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  token_encrypted   TEXT NOT NULL,
  global_pipelines  TEXT[],
  connected_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orcamento mensal definido para cada cliente (por plataforma ou total geral).
-- month = primeiro dia do mes. platform: meta | google | total.
CREATE TABLE IF NOT EXISTS client_budgets (
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month      DATE NOT NULL,
  platform   TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'total')),
  amount     NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, month, platform)
);
