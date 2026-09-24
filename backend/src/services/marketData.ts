/**
 * Refresh orchestration: fetch → normalize → upsert into SQLite.
 * Watchlist refreshers touch ONLY the tickers the user tracks.
 */
import { appConfig } from '../config.js';
import type { Market, InstrumentType } from '../config.js';
import { listItems } from '../repos/watchlist.repo.js';
import { upsertQuote } from '../repos/quotes.repo.js';
import { upsertInstitutional } from '../repos/institutional.repo.js';
import { recentFlow, upsertFlow } from '../repos/marketFlow.repo.js';
import { lastTradingDayIso } from '../lib/roc.js';
import { mapPool } from '../lib/http.js';
import { toYahooSymbol } from '../lib/ticker.js';
import * as yahoo from './yahoo.js';
import * as twse from './twse.js';
import * as tpex from './tpex.js';

const isTw = (m: Market): boolean => m === 'TWSE' || m === 'TPEx';

export interface RefreshResult {
  updated: number;
  failed: number;
  detail?: string;
}

/** Prices / change% / volume for every watchlist item. */
export async function refreshWatchlistQuotes(): Promise<RefreshResult> {
  const items = listItems();
  if (items.length === 0) return { updated: 0, failed: 0 };

  const tw = items.filter((i) => isTw(i.market));
  const rest = items.filter((i) => !isTw(i.market));
  let updated = 0;
  let failed = 0;

  // Taiwan via TWSE MIS
  if (tw.length > 0) {
    const mis = await twse.misQuotes(
      tw.map((i) => ({ ticker: i.ticker, market: i.market as 'TWSE' | 'TPEx' })),
    );
    for (const item of tw) {
      const q = mis.get(item.ticker);
      if (!q || q.price == null) {
        failed++;
        continue;
      }
      upsertQuote({
        ticker: item.ticker,
        name: q.name ?? item.name,
        price: q.price,
        change_pct: q.changePct,
        volume: q.volume,
        market: item.market,
        type: item.type,
        currency: 'TWD',
        source: 'twse:mis',
        fetched_at: new Date().toISOString(),
      });
      updated++;
    }
  }

  // US / indices / commodities / crypto via Yahoo
  if (rest.length > 0) {
    const symbols = rest.map((i) => toYahooSymbol(i.ticker, i.market));
    const quotes = await yahoo.charts(symbols);
    rest.forEach((item, idx) => {
      const q = quotes.get(symbols[idx] as string);
      if (!q || q.price == null) {
        failed++;
        return;
      }
      upsertQuote({
        ticker: item.ticker,
        name: q.name ?? item.name,
        price: q.price,
        change_pct: q.changePct,
        volume: q.volume,
        market: item.market,
        type: refineType(item.type, q.quoteType),
        currency: item.market === 'US' ? 'USD' : (q.currency as 'USD' | null),
        source: 'yahoo:chart',
        fetched_at: new Date().toISOString(),
      });
      updated++;
    });
  }

  return { updated, failed };
}

function refineType(current: InstrumentType, yahooType: string | null): InstrumentType {
  if (current === 'stock' && yahooType === 'ETF') return 'us_etf';
  return current;
}

/** ETF NAV + premium/discount (TW) and fundamentals (yield / expense / ex-div, TW+US). */
export async function refreshEtfDetails(): Promise<RefreshResult> {
  const etfs = listItems().filter((i) => i.type === 'tw_etf' || i.type === 'us_etf');
  if (etfs.length === 0) return { updated: 0, failed: 0 };
  let updated = 0;

  const twEtfs = etfs.filter((i) => i.type === 'tw_etf');
  if (twEtfs.length > 0) {
    const navs = await twse.etfNav();
    for (const item of twEtfs) {
      const n = navs.get(item.ticker);
      if (!n) continue;
      upsertQuote({
        ticker: item.ticker,
        nav: n.nav,
        premium_discount_pct: n.premiumDiscountPct,
        source: 'twse:etfnav',
      });
      updated++;
    }
  }

  for (const item of etfs) {
    const f = await yahoo.fundamentals(toYahooSymbol(item.ticker, item.market));
    if (!f) continue;
    upsertQuote({
      ticker: item.ticker,
      dividend_yield: f.dividendYield,
      expense_ratio: f.expenseRatio,
      aum: f.aum,
      next_ex_dividend_date: f.nextExDividendDate,
      source: 'yahoo:summary',
    });
    updated++;
  }
  return { updated, failed: 0 };
}

/** P/E, dividend yield, P/B for watched Taiwan stocks (TWSE + TPEx). */
export async function refreshTwFundamentals(): Promise<RefreshResult> {
  const tw = listItems().filter((i) => i.market === 'TWSE' || i.market === 'TPEx');
  if (tw.length === 0) return { updated: 0, failed: 0 };

  const [twseRatios, tpexRatios] = await Promise.all([twse.stockRatios(), tpex.stockRatios()]);
  let updated = 0;
  for (const item of tw) {
    const r = twseRatios.get(item.ticker) ?? tpexRatios.get(item.ticker);
    if (!r) continue;
    upsertQuote({
      ticker: item.ticker,
      dividend_yield: r.dividendYield ?? undefined,
      extra: { pe_ratio: r.peRatio, pb_ratio: r.pbRatio },
      source: 'twse:ratios',
    });
    updated++;
  }
  return { updated, failed: 0 };
}

/**
 * Most-recent cash dividend per share (Yahoo chart events) for watched stocks
 * and ETFs. Keyless; skips indices / FX / commodities / crypto.
 */
export async function refreshDividendHistory(): Promise<RefreshResult> {
  const items = listItems().filter(
    (i) => i.type === 'stock' || i.type === 'tw_etf' || i.type === 'us_etf',
  );
  if (items.length === 0) return { updated: 0, failed: 0 };

  const settled = await mapPool(items, 5, async (item) => {
    const hist = await yahoo.dividendHistory(toYahooSymbol(item.ticker, item.market));
    const last = hist.at(-1);
    if (!last) return false;
    upsertQuote({
      ticker: item.ticker,
      last_dividend: last.amount,
      last_dividend_date: last.date,
    });
    return true;
  });

  let updated = 0;
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'rejected') failed++;
    else if (r.value) updated++;
  }
  return { updated, failed };
}

/**
 * Analyst / broker consensus target price (外資目標價) for watched stocks and
 * ETFs. Yahoo `financialData`; crumb-gated, degrades to null per ticker. Rows
 * with no analyst coverage are simply left untouched.
 */
export async function refreshAnalystTargets(): Promise<RefreshResult> {
  const items = listItems().filter(
    (i) => i.type === 'stock' || i.type === 'tw_etf' || i.type === 'us_etf',
  );
  if (items.length === 0) return { updated: 0, failed: 0 };

  const settled = await mapPool(items, 5, async (item) => {
    const t = await yahoo.analystTarget(toYahooSymbol(item.ticker, item.market));
    if (!t) return false;
    upsertQuote({
      ticker: item.ticker,
      target_mean_price: t.mean,
      target_high_price: t.high,
      target_low_price: t.low,
      analyst_count: t.count,
      target_price_at: new Date().toISOString(),
      source: 'yahoo:financialData',
    });
    return true;
  });

  let updated = 0;
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'rejected') failed++;
    else if (r.value) updated++;
  }
  return { updated, failed };
}

/**
 * Moving averages — 週線 (MA5) / 月線 (MA20) / 季線 (MA60) / 年線 (MA240) — for
 * every watchlist item that has price history (stocks, ETFs, indices; skips FX /
 * commodities / crypto, which Yahoo history serves inconsistently). Each is a
 * simple moving average of the last N daily closes; an MA whose window exceeds
 * the available history is left null (e.g. a newly-listed stock has no 年線).
 */
export async function refreshMovingAverages(): Promise<RefreshResult> {
  const items = listItems().filter(
    (i) => i.type === 'stock' || i.type === 'tw_etf' || i.type === 'us_etf' || i.type === 'index',
  );
  if (items.length === 0) return { updated: 0, failed: 0 };

  // ~240 trading days need ~350 calendar days; pad for holidays/gaps.
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 420 * 86400_000).toISOString().slice(0, 10);

  const settled = await mapPool(items, 5, async (item) => {
    const closes = (await yahoo.history(toYahooSymbol(item.ticker, item.market), from, to)).map(
      (d) => d.close,
    );
    if (closes.length === 0) return false;
    upsertQuote({
      ticker: item.ticker,
      ma5: sma(closes, 5),
      ma20: sma(closes, 20),
      ma60: sma(closes, 60),
      ma240: sma(closes, 240),
      ma_at: new Date().toISOString(),
    });
    return true;
  });

  let updated = 0;
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'rejected') failed++;
    else if (r.value) updated++;
  }
  return { updated, failed };
}

/** Simple moving average of the last `n` values, or null if there are fewer than `n`. */
function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i] as number;
  return Math.round((sum / n) * 100) / 100;
}

/** 外資/投信/自營商 net flows for watched Taiwan tickers. */
export async function refreshTwInstitutional(): Promise<RefreshResult> {
  const watched = new Set(
    listItems()
      .filter((i) => i.market === 'TWSE' || i.market === 'TPEx')
      .map((i) => i.ticker),
  );
  if (watched.size === 0) return { updated: 0, failed: 0 };

  const iso = lastTradingDayIso();
  const rows: Awaited<ReturnType<typeof twse.institutionalT86>> = [];
  try {
    rows.push(...(await twse.institutionalT86(iso)).filter((r) => watched.has(r.ticker)));
  } catch (err) {
    return { updated: 0, failed: 1, detail: `T86: ${(err as Error).message}` };
  }
  try {
    rows.push(...(await tpex.institutional3Insti()).filter((r) => watched.has(r.ticker)));
  } catch {
    /* TPEx optional */
  }
  const n = rows.length > 0 ? upsertInstitutional(rows) : 0;
  return { updated: n, failed: 0, detail: `day ${iso}` };
}

/** Market-wide 三大法人 net flows for the last ~7 trading days (BFI82U). */
export async function refreshMarketFlow(): Promise<RefreshResult> {
  const have = new Set(recentFlow(15).map((r) => r.date));
  let updated = 0;
  let failed = 0;
  let covered = 0; // recent trading days confirmed present (fetched now or already stored)
  const d = new Date();
  for (let scanned = 0; scanned < 14 && covered < 7; scanned++) {
    const dow = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() - 1);
    if (dow === 0 || dow === 6) continue;
    if (have.has(iso)) {
      covered++;
      continue;
    }
    const flow = await twse.marketFlow(iso);
    if (flow && flow.foreign_net != null) {
      upsertFlow(flow);
      have.add(iso);
      covered++;
      updated++;
    } else {
      failed++;
    }
  }
  return { updated, failed };
}

/** Always-on backdrop — indices, FX, commodities, VIX (config-driven, not the watchlist). */
export async function refreshAlwaysOn(): Promise<RefreshResult> {
  const all = [
    ...appConfig.alwaysOn.indices,
    ...appConfig.alwaysOn.fx,
    ...appConfig.alwaysOn.commodities,
    ...appConfig.alwaysOn.sentiment,
  ];
  const quotes = await yahoo.charts(all.map((a) => a.ticker));
  let updated = 0;
  let failed = 0;
  for (const a of all) {
    const q = quotes.get(a.ticker);
    if (!q || q.price == null) {
      failed++;
      continue;
    }
    upsertQuote({
      ticker: a.ticker,
      name: a.name,
      price: q.price,
      change_pct: q.changePct,
      volume: q.volume,
      market: 'INDEX',
      type: a.type === 'fx' ? 'index' : a.type,
      currency: (q.currency as 'USD' | 'TWD' | null) ?? null,
      extra: { kind: a.type },
      source: 'yahoo:chart',
      fetched_at: new Date().toISOString(),
    });
    updated++;
  }
  return { updated, failed };
}
