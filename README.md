# Investment Dashboard

A self-hosted, single-user web dashboard for tracking global markets, the Taiwan
stock market, macro indicators, commodities & crypto, a personal portfolio with
P&L, an economic calendar, and market sentiment. Base currency: **TWD**.

> Status: **backend — watchlist, data layer, and portfolio tracker working.**
> SQLite-backed watchlist (items / groups / search / auto-detect), live data
> fetching for Taiwan (TWSE + TPEx) and global markets (Yahoo), normalized quote
> cache, scheduler, and a full portfolio tracker (lots, P&L in TWD, allocation
> views, dividend tracking, ETF/holding overlap). Frontend is still a placeholder
> shell. `/api/macro`, `/api/calendar`, `/api/sentiment` are stubbed.

## Tech stack

| Layer     | Choice                                             |
| --------- | -------------------------------------------------- |
| Frontend  | React 19 + Vite 6 + TypeScript + Tailwind CSS v4   |
| Backend   | Node + Express + TypeScript (ESM), `tsx` in dev    |
| Storage   | SQLite via `node:sqlite` (`backend/data/investment.sqlite`) |
| Scheduler | `node-cron` (`backend/src/jobs/scheduler.ts`)      |
| Monorepo  | npm workspaces + `concurrently`                    |

### Why Node/Express for the backend

Everything stays in one language, so the dev script, types, and tooling are
shared with the frontend. Financial data for this use case is plain REST + JSON
(Yahoo Finance, TWSE/TPEx open data, FRED), which Node handles fine — no need for
Python's data stack.

SQLite uses Node's **built-in `node:sqlite`** — no native build step, no
dependency. Repositories in `backend/src/repos/` isolate all SQL, so switching to
`better-sqlite3` later is contained.

**No API keys needed** for the watchlist or any market data — TWSE/TPEx open data
and Yahoo Finance are keyless. `FRED_API_KEY` is only for the stubbed
`/api/macro` routes.

## Project structure

```
Investment/
├── package.json            # workspaces + combined dev/build scripts
├── config/
│   └── config.example.json # refresh cron + always-on market backdrop (copy to config.json)
├── backend/
│   ├── .env.example        # server config + optional FRED key (copy to .env)
│   ├── src/
│   │   ├── index.ts        # Express app entry
│   │   ├── config.ts       # env + config.json (schedule, always-on lists, FRED series)
│   │   ├── db/             # node:sqlite connection, schema.sql, migrations, seed
│   │   ├── repos/          # all SQL — watchlist, groups, quotes, institutional, holdings (lots), dividends, meta, etf_holdings, securities
│   │   ├── services/       # data adapters + valuation / allocation / overlap / dividend engines (see services/README.md)
│   │   ├── lib/            # ticker auto-detect, region/sector classify, FX, http, ROC-date helpers
│   │   ├── routes/         # /api route modules
│   │   └── jobs/scheduler.ts  # cron jobs (quotes, institutional, ETF NAV/holdings, TW fundamentals, meta, always-on)
│   └── data/
│       ├── tw-securities.seed.json   # bundled TWSE/TPEx listing (committed)
│       ├── etf-holdings.seed.json    # fallback ETF constituents (committed)
│       └── investment.sqlite         # runtime DB (git-ignored)
├── docs/
│   └── palette-reference.html  # interactive swatch sheet for the theme
└── frontend/
    ├── vite.config.ts      # dev-server proxies /api -> backend
    └── src/
        ├── index.css       # Tailwind + @theme design tokens (see Theme below)
        ├── App.tsx         # placeholder shell
        ├── lib/api.ts      # fetch wrapper
        ├── components/  pages/  hooks/   # empty, ready to fill
```

## Theme — Dark Terminal (Warm Edition)

Design tokens live in [`frontend/src/index.css`](frontend/src/index.css) as a
Tailwind v4 `@theme` block, so every color is available as a utility
(`bg-bg`, `text-fg`, `border-border`, `text-accent`, …). Open
[`docs/palette-reference.html`](docs/palette-reference.html) in a browser for the
full swatch sheet and live preview.

| Token             | Hex       | Use                              |
| ----------------- | --------- | -------------------------------- |
| `bg`              | `#111015` | app background                   |
| `surface`         | `#1C1916` | cards / panels                   |
| `border`          | `#2E2824` | hairlines                        |
| `fg`              | `#E8E0D6` | primary text                     |
| `fg-secondary`    | `#A89B8C` | secondary text                   |
| `fg-muted`        | `#7A7068` | labels / captions                |
| `bullish`         | `#F5A623` | **gains** (amber, not green)     |
| `bearish`         | `#B07AE6` | **losses** (violet, not red)     |
| `accent`          | `#E8845A` | CTAs / primary actions           |
| `highlight`       | `#FFD97A` | emphasis                         |
| `info`            | `#6BBFC9` | informational                    |
| `neutral`         | `#7A7068` | flat / unchanged                 |
| `muted`           | `#5C4F42` | disabled / faint fills           |

> Note the non-traditional direction colors: **amber = up, violet = down.**
> Keep this convention across all charts and indicators.

UI font is a monospace stack (`--font-mono`).

## Setup

Prerequisites: Node.js >= 20 (tested on 24), npm 10+.

```bash
# 1. Install all workspace dependencies from the repo root
npm install

# 2. Create local config from the examples
cp config/config.example.json config/config.json
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env   # optional

# 3. (optional) Add API keys to backend/.env
#    - FRED_API_KEY for macro series (bond yields, rates)
#    - Yahoo Finance / TWSE open data need no key
```

On Windows PowerShell, use `Copy-Item` instead of `cp`:

```powershell
Copy-Item config/config.example.json config/config.json
Copy-Item backend/.env.example backend/.env
```

## Running

```bash
# Run backend + frontend together (from the repo root)
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api  (health check: `/api/health`)

Run individually if needed:

```bash
npm run dev -w backend
npm run dev -w frontend
```

## Other scripts

| Command                              | What it does                                        |
| ------------------------------------ | -------------------------------------------------- |
| `npm run build`                      | Type-check + build backend and frontend            |
| `npm run start`                      | Run the compiled backend (`backend/dist`)          |
| `npm run typecheck`                  | Type-check both workspaces without emitting         |
| `npm run refresh:tw-list -w backend` | Rebuild the Taiwan securities master from TWSE/TPEx |

## The watchlist is user-managed

Every instrument on the dashboard — stocks, ETFs, indices, FX pairs, commodities,
crypto — lives in SQLite (`watchlist_items` + `watchlist_groups` +
`watchlist_group_items`) and is managed at runtime through `/api/watchlist`.
**Nothing is hardcoded.** Config only carries the *always-on backdrop* (major
indices, key FX, headline commodities, VIX), which is fixed by design.

### Adding a ticker — auto-detection

`POST /api/watchlist { "ticker": "2330" }` figures out the rest:

| Input                       | Detected                                  |
| --------------------------- | ----------------------------------------- |
| 4-digit (`2330`, `2317`)    | TWSE/TPEx stock — market & 中文名 from the securities master |
| `00…` (`0050`, `00878`)     | Taiwan ETF                                |
| letters (`AAPL`, `VOO`)     | US stock / ETF — English name from Yahoo, ETF vs stock from `quoteType` |
| `^…` / `…=F` / `…-USD`      | index / commodity future / crypto         |

Names resolve automatically (中文 for TW via TWSE `codeQuery`, English for US via
Yahoo). `GET /api/watchlist/search?q=` searches the local TW master + TWSE +
Yahoo so you can find something by number or name before adding it.

### Watchlist API

| Method & path                       | Purpose                                        |
| ----------------------------------- | --------------------------------------------- |
| `GET /api/watchlist`                | all items + latest quote data (`?group=` / `?tag=` filters) |
| `POST /api/watchlist`               | add `{ ticker, tags?, group_names?, type? }`   |
| `PUT /api/watchlist/:id`            | update `display_order`, `user_tags`, `name`, `group_names` |
| `DELETE /api/watchlist/:id`         | stop tracking                                  |
| `GET /api/watchlist/search?q=`      | ticker search (number or name)                 |
| `GET /api/watchlist/groups`         | list custom groups with item counts            |
| `POST /api/watchlist/groups`        | create `{ group_name, description? }`           |
| `GET /api/markets`                  | always-on indices / FX / commodities / VIX     |
| `GET /api/taiwan/institutional/:t`  | 外資/投信/自營商 net-flow history for a ticker    |
| `POST /api/refresh`                 | force a watchlist quote refresh now            |

Every watchlist item is returned in one **normalized shape**: `ticker, name,
price, change_pct, volume, market, type, currency`, ETF fields (`nav,
premium_discount_pct, dividend_yield, expense_ratio, aum, next_ex_dividend_date`,
null for non-ETFs), `foreign_net` (TW), and user metadata (`tags, group_names,
in_portfolio`).

## Portfolio tracker

Holdings are stored as **lots** (`holding_lots`) — the same ticker can have
several buys at different prices/dates. Adding a lot for a ticker you don't track
yet **auto-adds it to the watchlist** (tagged `portfolio`).

| Method & path                          | Purpose                                              |
| -------------------------------------- | --------------------------------------------------- |
| `GET /api/portfolio`                   | positions (aggregated + per-lot), P&L, weights, totals — all in TWD |
| `GET /api/portfolio/lots`              | raw lots (`?ticker=`)                                |
| `POST /api/portfolio/lots`             | `{ ticker, shares, cost_basis, currency?, purchase_date?, notes?, target_price?, stop_loss? }` |
| `PUT/DELETE /api/portfolio/lots/:id`   | edit / remove a lot                                  |
| `GET /api/portfolio/allocation`        | breakdown by type / region / currency / sector / tag |
| `GET /api/portfolio/overlap`           | ETF ↔ holding overlap + effective look-through exposure |
| `GET /api/portfolio/dividends`         | upcoming ex-dates, estimated annual income (TWD), history log |
| `POST /api/portfolio/dividends`        | manual dividend entry                                |
| `POST /api/portfolio/dividends/detect` | auto-create yield-based estimates for passed ex-dates |
| `POST /api/portfolio/refresh`          | refresh quotes + FX + sector + ETF holdings now      |

**Valuation** — current price from the quote cache; market value and P&L computed
in original currency *and* TWD (FX derived from the always-on `TWD=X` / `JPY=X` /
`CNY=X` / `EURUSD=X` quotes). Each position carries weight %, target/stop upside/
downside, dividend yield, and estimated annual income.

**Allocation** — `by_type` (Stocks / ETFs / Commodities / …), `by_region`
(Taiwan / US / Other), `by_currency`, `by_sector` (半導體 / 金融 / … for stocks;
ETFs bucketed by class — use `/overlap` for look-through), `by_tag` (from
watchlist tags; a position in several tags counts in each).

**Overlap** — flags every underlying you hold **both directly and inside an ETF**
(e.g. 2330 directly + via 0050), with the effective exposure %. Also returns the
top-25 look-through exposures across all holdings. ETF constituents come from
Yahoo `topHoldings`, with `etf-holdings.seed.json` as a fallback for common TW
ETFs.

**Dividends** — `dividend_yield` from Yahoo (US) and TWSE `BWIBBU_ALL` (TW
stocks); estimated annual income = market value × yield. The history log takes
manual entries and auto-detected estimates (flagged for you to correct).

## Data sources (all keyless)

| Data                                   | Source                                             |
| -------------------------------------- | ------------------------------------------------- |
| TW real-time quotes                    | TWSE MIS `getStockInfo` (`tse_` / `otc_`)          |
| TW ticker search / 中文名               | TWSE `codeQuery` + bundled `tw-securities.seed.json` |
| TW ETF NAV + 折溢價                     | TWSE `all_etf.txt`                                 |
| 外資買賣超 (三大法人)                    | TWSE T86 + TPEx 3-insti daily                      |
| US / index / FX / commodity / crypto   | Yahoo Finance v8 chart                             |
| ETF yield / expense / ex-div / holdings | Yahoo `quoteSummary` (cookie+crumb, best-effort)  |
| TW stock yield / P/E / P/B              | TWSE `BWIBBU_ALL` + TPEx `peratio_analysis`        |
| Sector / industry                      | Yahoo `assetProfile` (English; mapped to 中文)      |

## Scheduled fetching

`backend/src/jobs/scheduler.ts` — cron schedules from `config.json` → `refresh`:

| Job                  | Default cron        | What                                    |
| -------------------- | ------------------- | -------------------------------------- |
| `watchlist-quotes`   | `*/10 * * * *`      | price / change% / volume for watched   |
| `always-on`          | `*/15 * * * *`      | indices / FX / commodities / VIX        |
| `tw-institutional`   | `30 15 * * 1-5`     | 外資/投信/自營商 net flows (watched TW)  |
| `tw-etf-nav`         | `5 18 * * 1-5`      | ETF NAV + premium/discount + yield/expense |
| `tw-fundamentals`    | `12 18 * * 1-5`     | TW stock yield / P/E / P/B               |
| `tw-securities-list` | `0 7 * * *`         | refresh the TW securities master        |
| `instrument-meta`    | `15 7 * * *`        | sector / industry / region              |
| `etf-holdings`       | `30 7 * * 1`        | ETF constituents (overlap detection)    |

`watchlist-quotes` and `always-on` also run ~2 s after boot to warm the cache.

## Next steps

1. TW ETF dividend yields (`BWIBBU_ALL` is stocks only) — use a TWSE/issuer ETF
   dividend feed so 0050 / 00878 estimated income is populated.
2. Wire `/api/macro` (FRED) — FX detail, bond yields, central-bank rates.
3. `/api/calendar` (economic events) and `/api/sentiment` (Fear & Greed).
4. Build the frontend: layout, routing, dashboard widgets, watchlist + portfolio UI.
