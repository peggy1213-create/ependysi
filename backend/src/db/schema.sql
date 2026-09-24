-- Investment dashboard schema. Applied idempotently on startup by db/index.ts.

-- ── Watchlist (fully user-managed) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker        TEXT    NOT NULL UNIQUE,       -- canonical ticker, e.g. "2330", "AAPL", "^GSPC"
  name          TEXT,                          -- resolved display name (中文 for TW, English for US)
  market        TEXT    NOT NULL,              -- TWSE | TPEx | US | INDEX
  type          TEXT    NOT NULL,              -- stock | tw_etf | us_etf | index | commodity | crypto
  user_tags     TEXT    NOT NULL DEFAULT '[]', -- JSON array, e.g. ["AI","core"]
  display_order INTEGER NOT NULL DEFAULT 0,
  added_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name  TEXT    NOT NULL UNIQUE,         -- e.g. "半導體供應鏈", "月配息ETF", "US Tech"
  description TEXT,
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist_group_items (
  watchlist_item_id INTEGER NOT NULL REFERENCES watchlist_items(id) ON DELETE CASCADE,
  group_id          INTEGER NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (watchlist_item_id, group_id)
);

-- ── Quote cache (normalized, one row per ticker) ─────────────────────────────
CREATE TABLE IF NOT EXISTS quote_cache (
  ticker               TEXT PRIMARY KEY,
  name                 TEXT,
  price                REAL,
  change_pct           REAL,
  volume               REAL,
  market               TEXT,
  type                 TEXT,
  currency             TEXT,
  -- ETF-specific (NULL for stocks/indices)
  nav                  REAL,
  premium_discount_pct REAL,
  dividend_yield       REAL,
  expense_ratio        REAL,
  aum                  REAL,
  next_ex_dividend_date TEXT,
  last_dividend        REAL,   -- most recent cash dividend per share (Yahoo events)
  last_dividend_date   TEXT,   -- ex-date of that payout, ISO
  target_mean_price    REAL,   -- analyst/broker consensus target price (外資目標價, Yahoo financialData)
  target_high_price    REAL,
  target_low_price     REAL,
  analyst_count        INTEGER,-- number of analyst opinions behind the consensus
  target_price_at      TEXT,   -- when the target was last fetched, ISO
  ma5                  REAL,   -- 週線  (5-day simple moving average of close)
  ma20                 REAL,   -- 月線  (20-day)
  ma60                 REAL,   -- 季線  (60-day)
  ma240                REAL,   -- 年線  (240-day)
  ma_at                TEXT,   -- when the moving averages were last computed, ISO
  extra                TEXT,   -- JSON blob for source-specific extras
  source               TEXT,
  fetched_at           TEXT NOT NULL
);

-- ── Taiwan institutional flows (外資/投信/自營商 買賣超) ─────────────────────
CREATE TABLE IF NOT EXISTS tw_institutional (
  ticker      TEXT    NOT NULL,
  date        TEXT    NOT NULL,   -- ISO yyyy-mm-dd (trading day)
  foreign_net INTEGER,            -- shares, +buy / -sell (外陸資, dealer excluded)
  trust_net   INTEGER,            -- 投信
  dealer_net  INTEGER,            -- 自營商 (net)
  fetched_at  TEXT    NOT NULL,
  PRIMARY KEY (ticker, date)
);

-- ── Market-wide institutional flows (三大法人買賣金額，全市場) ──────────────
CREATE TABLE IF NOT EXISTS tw_market_flow (
  date        TEXT PRIMARY KEY,   -- ISO trading day
  foreign_net INTEGER,            -- TWD, 外資及陸資(不含外資自營商) 買賣差額
  trust_net   INTEGER,            -- TWD, 投信
  dealer_net  INTEGER,            -- TWD, 自營商 (self + hedge)
  fetched_at  TEXT NOT NULL
);

-- ── Taiwan securities master (for search + auto-detect) ──────────────────────
CREATE TABLE IF NOT EXISTS tw_securities (
  ticker      TEXT PRIMARY KEY,
  name        TEXT NOT NULL,       -- 中文名稱
  market      TEXT NOT NULL,       -- TWSE | TPEx
  type        TEXT NOT NULL,       -- stock | tw_etf
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tw_securities_name ON tw_securities(name);

-- ── Portfolio ───────────────────────────────────────────────────────────────
-- One row per lot (same ticker can have many lots at different prices/dates).
CREATE TABLE IF NOT EXISTS holding_lots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker        TEXT    NOT NULL,
  shares        REAL    NOT NULL,
  cost_basis    REAL    NOT NULL,   -- per share, in `currency`
  currency      TEXT    NOT NULL,
  purchase_date TEXT,               -- ISO yyyy-mm-dd
  notes         TEXT,
  target_price  REAL,
  stop_loss     REAL,
  created_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holding_lots_ticker ON holding_lots(ticker);

-- Dividend log — manual entries and auto-detected estimates.
CREATE TABLE IF NOT EXISTS dividends (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker           TEXT    NOT NULL,
  ex_date          TEXT,             -- ISO
  pay_date         TEXT,
  amount_per_share REAL    NOT NULL,
  currency         TEXT    NOT NULL,
  shares           REAL,             -- shares held at record date
  total_amount     REAL,             -- amount_per_share * shares
  source           TEXT    NOT NULL DEFAULT 'manual',  -- manual | auto
  note             TEXT,
  created_at       TEXT    NOT NULL,
  UNIQUE(ticker, ex_date, source)
);
CREATE INDEX IF NOT EXISTS idx_dividends_ticker ON dividends(ticker);

-- Sector / industry / region per ticker (for allocation views).
CREATE TABLE IF NOT EXISTS instrument_meta (
  ticker     TEXT PRIMARY KEY,
  sector     TEXT,   -- Yahoo sector, e.g. "Technology"
  industry   TEXT,   -- Yahoo industry, e.g. "Semiconductors"
  region     TEXT,   -- Taiwan | US | Other
  updated_at TEXT NOT NULL
);

-- ETF constituents (top holdings) for overlap detection.
CREATE TABLE IF NOT EXISTS etf_holdings (
  etf_ticker       TEXT NOT NULL,
  component_ticker TEXT NOT NULL,    -- normalized bare ticker (2330, NVDA); '' if unknown
  component_name   TEXT,
  weight_pct       REAL NOT NULL,    -- 0..100
  as_of            TEXT,
  source           TEXT NOT NULL DEFAULT 'yahoo',
  PRIMARY KEY (etf_ticker, component_ticker, component_name)
);

-- ── Price alerts (target / stop-loss crossings on portfolio positions) ───────
-- One row per crossing event. Re-arms when the price moves back to the safe
-- side (cleared_at set), so a later re-cross records a fresh event. Detection
-- runs inside refreshAll() — there is no background scheduler.
CREATE TABLE IF NOT EXISTS price_alerts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker       TEXT    NOT NULL,
  kind         TEXT    NOT NULL,   -- 'target' | 'stop'
  threshold    REAL    NOT NULL,   -- target_price / stop_loss at trigger time
  price        REAL    NOT NULL,   -- position price when it triggered
  currency     TEXT,               -- position currency (display only)
  triggered_at TEXT    NOT NULL,
  cleared_at   TEXT,               -- set when price later moved back across → re-armed
  acked_at     TEXT                -- set when the user acknowledges it
);
CREATE INDEX IF NOT EXISTS idx_price_alerts_lookup ON price_alerts(ticker, kind, id);

-- ── Key/value settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── News (market-relevant headlines) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_items (
  id           TEXT PRIMARY KEY,   -- sha1(url)
  title        TEXT NOT NULL,
  summary      TEXT,               -- short description / excerpt, HTML stripped
  url          TEXT NOT NULL,
  source       TEXT,
  region       TEXT NOT NULL,      -- global | taiwan
  published_at TEXT,               -- ISO
  fetched_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC);

-- AI analysis runs (latest is shown on the News tab).
CREATE TABLE IF NOT EXISTS news_analysis (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'standard',  -- 'standard' | 'deep'
  model       TEXT,
  headline_count INTEGER,
  content     TEXT NOT NULL,       -- markdown from the AI briefing
  pinned      INTEGER NOT NULL DEFAULT 0  -- user-kept: survives history pruning
);

-- ── AI chat (investment Q&A assistant) ──────────────────────────────────────
-- One row per conversation; messages hang off it. Educational Q&A grounded in
-- the user's live portfolio / watchlist / market context (see services/chat.ts).
CREATE TABLE IF NOT EXISTS chat_threads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT,                 -- derived from the first user message
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL         -- bumped on every new message (list order)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL,     -- 'user' | 'assistant'
  content    TEXT    NOT NULL,
  model      TEXT,                 -- model that produced an assistant message
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, id);
