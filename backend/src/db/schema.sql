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
CREATE TABLE IF NOT EXISTS holdings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker     TEXT    NOT NULL,
  quantity   REAL    NOT NULL,
  cost_basis REAL    NOT NULL,     -- per share, in `currency`
  currency   TEXT    NOT NULL,
  note       TEXT,
  opened_at  TEXT
);

-- ── Key/value settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
