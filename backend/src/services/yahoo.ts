/**
 * Yahoo Finance (unofficial, no key).
 *
 *  - chart()   v8  — price / change% / volume / currency / name. Always works.
 *  - search()  v1  — ticker lookup for the search endpoint.
 *  - summary() v10 — fundamentals (ETF yield, expense ratio, ex-dividend, AUM).
 *                    Needs a crumb+cookie; degrades to null if Yahoo blocks it.
 */
import { fetchJson, fetchText, mapPool } from '../lib/http.js';

const Q1 = 'https://query1.finance.yahoo.com';
const Q2 = 'https://query2.finance.yahoo.com';

export interface YahooQuote {
  symbol: string;
  name: string | null;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  currency: string | null;
  quoteType: string | null; // EQUITY | ETF | INDEX | CURRENCY | FUTURE | CRYPTOCURRENCY
}

interface ChartResp {
  chart: {
    result?: {
      meta: {
        symbol: string;
        currency?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketChangePercent?: number;
        regularMarketVolume?: number;
        longName?: string;
        shortName?: string;
        instrumentType?: string;
      };
    }[];
    error?: { code: string; description: string } | null;
  };
}

export async function chart(symbol: string): Promise<YahooQuote | null> {
  const url = `${Q1}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  let data: ChartResp;
  try {
    data = await fetchJson<ChartResp>(url);
  } catch {
    return null;
  }
  const meta = data.chart.result?.[0]?.meta;
  if (!meta) return null;

  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const price = meta.regularMarketPrice ?? null;
  const changePct =
    meta.regularMarketChangePercent ??
    (price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null);

  return {
    symbol: meta.symbol,
    name: meta.longName ?? meta.shortName ?? null,
    price,
    changePct,
    volume: meta.regularMarketVolume ?? null,
    currency: meta.currency ?? null,
    quoteType: meta.instrumentType ?? null,
  };
}

export async function charts(symbols: string[], concurrency = 6): Promise<Map<string, YahooQuote>> {
  const out = new Map<string, YahooQuote>();
  const settled = await mapPool(symbols, concurrency, (s) => chart(s));
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) out.set(symbols[i] as string, r.value);
  });
  return out;
}

export interface YahooSearchHit {
  symbol: string;
  name: string | null;
  quoteType: string | null;
  exchange: string | null;
}

export async function search(query: string): Promise<YahooSearchHit[]> {
  const url = `${Q2}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`;
  try {
    const data = await fetchJson<{
      quotes?: {
        symbol?: string;
        shortname?: string;
        longname?: string;
        quoteType?: string;
        exchDisp?: string;
      }[];
    }>(url);
    return (data.quotes ?? [])
      .filter((q) => q.symbol)
      .map((q) => ({
        symbol: q.symbol as string,
        name: q.longname ?? q.shortname ?? null,
        quoteType: q.quoteType ?? null,
        exchange: q.exchDisp ?? null,
      }));
  } catch {
    return [];
  }
}

// ── Crumb-gated fundamentals ────────────────────────────────────────────────
let crumbCache: { crumb: string; cookie: string; at: number } | null = null;
const CRUMB_TTL = 30 * 60 * 1000;

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache && Date.now() - crumbCache.at < CRUMB_TTL) return crumbCache;
  try {
    const res = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    const cookie = (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    if (!cookie) return null;
    const crumb = await fetchText(`${Q2}/v1/test/getcrumb`, { headers: { Cookie: cookie } });
    if (!crumb || crumb.includes('<')) return null;
    crumbCache = { crumb, cookie, at: Date.now() };
    return crumbCache;
  } catch {
    return null;
  }
}

export interface YahooFundamentals {
  dividendYield: number | null; // percent
  expenseRatio: number | null; // percent
  aum: number | null;
  nextExDividendDate: string | null; // ISO
}

export async function fundamentals(symbol: string): Promise<YahooFundamentals | null> {
  const cr = await getCrumb();
  if (!cr) return null;
  const modules = 'summaryDetail,defaultKeyStatistics,fundProfile,price';
  const url = `${Q2}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(cr.crumb)}`;
  try {
    const data = await fetchJson<QuoteSummaryResp>(url, { headers: { Cookie: cr.cookie } });
    const r = data.quoteSummary.result?.[0];
    if (!r) return null;
    const yieldRaw =
      r.summaryDetail?.dividendYield?.raw ?? r.summaryDetail?.trailingAnnualDividendYield?.raw ?? null;
    const exp = r.fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio?.raw ?? null;
    const exDivEpoch = r.summaryDetail?.exDividendDate?.raw ?? r.calendarEvents?.exDividendDate?.raw ?? null;
    const aum =
      r.defaultKeyStatistics?.totalAssets?.raw ?? r.price?.marketCap?.raw ?? null;
    return {
      dividendYield: yieldRaw != null ? round(yieldRaw * 100, 2) : null,
      expenseRatio: exp != null ? round(exp * 100, 3) : null,
      aum,
      nextExDividendDate: exDivEpoch ? new Date(exDivEpoch * 1000).toISOString().slice(0, 10) : null,
    };
  } catch {
    return null;
  }
}

interface RawNum {
  raw?: number;
}
interface QuoteSummaryResp {
  quoteSummary: {
    result?: {
      summaryDetail?: {
        dividendYield?: RawNum;
        trailingAnnualDividendYield?: RawNum;
        exDividendDate?: RawNum;
      };
      calendarEvents?: { exDividendDate?: RawNum };
      defaultKeyStatistics?: { totalAssets?: RawNum };
      fundProfile?: { feesExpensesInvestment?: { annualReportExpenseRatio?: RawNum } };
      price?: { marketCap?: RawNum };
    }[];
    error?: unknown;
  };
}

const round = (n: number, dp: number): number => Math.round(n * 10 ** dp) / 10 ** dp;
