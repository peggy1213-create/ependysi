/**
 * TWSE (Taiwan Stock Exchange) open data — no key.
 *
 *  - misQuotes()       real-time-ish quotes (mis.twse.com.tw)
 *  - codeQuery()       ticker/name search + name resolution
 *  - etfNav()          ETF NAV + premium/discount (all_etf.txt)
 *  - institutionalT86() daily 三大法人 net flows for all listed stocks
 *  - listedSecurities() daily security master (STOCK_DAY_ALL)
 */
import { fetchJson } from '../lib/http.js';
import { rocToIso, isoToTwseDate } from '../lib/roc.js';
import type { TwSecurity } from '../repos/securities.repo.js';

const MIS = 'https://mis.twse.com.tw/stock/api';
const RWD = 'https://www.twse.com.tw/rwd/zh';
const OPENAPI = 'https://openapi.twse.com.tw/v1';
const MIS_HEADERS = { Referer: 'https://mis.twse.com.tw/stock/index.jsp' };

export interface MisQuote {
  ticker: string;
  name: string | null;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  volume: number | null; // shares
}

/** `channels`: { ticker, market } — market decides the tse_/otc_ prefix. */
export async function misQuotes(
  channels: { ticker: string; market: 'TWSE' | 'TPEx' }[],
): Promise<Map<string, MisQuote>> {
  const out = new Map<string, MisQuote>();
  if (channels.length === 0) return out;

  for (let i = 0; i < channels.length; i += 50) {
    const batch = channels.slice(i, i + 50);
    const exCh = batch
      .map((c) => `${c.market === 'TPEx' ? 'otc' : 'tse'}_${c.ticker}.tw`)
      .join('|');
    const url = `${MIS}/getStockInfo.jsp?ex_ch=${exCh}&json=1&delay=0&_=${Date.now()}`;
    let data: { msgArray?: MisRaw[] };
    try {
      data = await fetchJson(url, { headers: MIS_HEADERS });
    } catch {
      continue;
    }
    for (const m of data.msgArray ?? []) {
      const price = num(m.z) ?? num(m.pz) ?? null;
      const prevClose = num(m.y);
      const changePct =
        price != null && prevClose ? round(((price - prevClose) / prevClose) * 100, 2) : null;
      out.set(m.c, {
        ticker: m.c,
        name: m.n ?? null,
        price,
        prevClose,
        changePct,
        volume: num(m.v) != null ? (num(m.v) as number) * 1000 : (num(m.tv) ?? null),
      });
    }
  }
  return out;
}

interface MisRaw {
  c: string; // ticker
  n?: string; // name
  z?: string; // last price
  pz?: string; // last price (fallback)
  y?: string; // prev close
  v?: string; // cumulative volume (lots)
  tv?: string; // this-tick volume
}

/** codeQuery — returns [{ ticker, name }] for stocks and ETFs (listed + OTC). */
export async function codeQuery(query: string): Promise<{ ticker: string; name: string }[]> {
  const url = `${RWD}/api/codeQuery?query=${encodeURIComponent(query)}&_=${Date.now()}`;
  try {
    const data = await fetchJson<{ suggestions?: string[] }>(url);
    return (data.suggestions ?? [])
      .map((s) => {
        const [ticker, name] = s.split('\t');
        return ticker && name ? { ticker: ticker.trim(), name: name.trim() } : null;
      })
      .filter((x): x is { ticker: string; name: string } => x !== null);
  } catch {
    return [];
  }
}

export async function resolveName(ticker: string): Promise<string | null> {
  const hits = await codeQuery(ticker);
  return hits.find((h) => h.ticker === ticker)?.name ?? hits[0]?.name ?? null;
}

// ── ETF NAV / premium-discount ──────────────────────────────────────────────
export interface EtfNav {
  ticker: string;
  name: string | null;
  price: number | null;
  nav: number | null;
  premiumDiscountPct: number | null;
}

export async function etfNav(): Promise<Map<string, EtfNav>> {
  const out = new Map<string, EtfNav>();
  try {
    const data = await fetchJson<{ a1?: { msgArray?: EtfRaw[] }[] }>(
      `https://mis.twse.com.tw/stock/data/all_etf.txt?_=${Date.now()}`,
      { headers: MIS_HEADERS },
    );
    for (const group of data.a1 ?? []) {
      for (const e of group.msgArray ?? []) {
        // a=code b=name e=market price f=NAV g=premium/discount %
        out.set(e.a, {
          ticker: e.a,
          name: e.b ?? null,
          price: numAny(e.e),
          nav: numAny(e.f),
          premiumDiscountPct: numAny(e.g),
        });
      }
    }
  } catch {
    /* degrade to empty */
  }
  return out;
}

interface EtfRaw {
  a: string;
  b?: string;
  e?: number | string;
  f?: number | string;
  g?: number | string;
}

// ── Institutional (三大法人) T86 ────────────────────────────────────────────
export interface InstFlow {
  ticker: string;
  date: string;
  foreign_net: number | null;
  trust_net: number | null;
  dealer_net: number | null;
}

export async function institutionalT86(iso: string): Promise<InstFlow[]> {
  const url = `${RWD}/fund/T86?date=${isoToTwseDate(iso)}&selectType=ALL&response=json`;
  const data = await fetchJson<TwseTable>(url);
  if (data.stat !== 'OK' || !data.data) return [];
  const idx = headerIndex(data.fields);
  return data.data
    .map((row) => {
      const ticker = String(row[0] ?? '').trim();
      if (!/^\d{4,6}[A-Z]?$/.test(ticker)) return null;
      return {
        ticker,
        date: iso,
        foreign_net: idx.foreign >= 0 ? parseIntLoose(row[idx.foreign]) : null,
        trust_net: idx.trust >= 0 ? parseIntLoose(row[idx.trust]) : null,
        dealer_net: idx.dealer >= 0 ? parseIntLoose(row[idx.dealer]) : null,
      };
    })
    .filter((x): x is InstFlow => x !== null);
}

function headerIndex(fields: string[]): { foreign: number; trust: number; dealer: number } {
  return {
    foreign: fields.findIndex((f) => f.includes('外陸資買賣超') && f.includes('不含')),
    trust: fields.findIndex((f) => f === '投信買賣超股數' || f.includes('投信買賣超')),
    dealer: fields.findIndex((f) => f === '自營商買賣超股數' || f === '自營商買賣超股數(自行買賣)'),
  };
}

// ── Security master (STOCK_DAY_ALL) ─────────────────────────────────────────
const TW_ETF_RE = /^00\d{2,4}[A-Z]?$/;

export async function listedSecurities(): Promise<TwSecurity[]> {
  const rows = await fetchJson<{ Code: string; Name: string }[]>(
    `${OPENAPI}/exchangeReport/STOCK_DAY_ALL`,
  );
  return rows
    .filter((r) => /^\d{4,6}[A-Z]?$/.test(String(r.Code).trim()))
    .map((r) => ({
      ticker: String(r.Code).trim(),
      name: String(r.Name).trim(),
      market: 'TWSE' as const,
      type: TW_ETF_RE.test(String(r.Code).trim()) ? ('tw_etf' as const) : ('stock' as const),
    }));
}

// ── shared parsing ─────────────────────────────────────────────────────────
interface TwseTable {
  stat: string;
  date?: string;
  fields: string[];
  data?: string[][];
}

function num(v: string | undefined): number | null {
  if (v == null || v === '-' || v === '') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function numAny(v: number | string | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parseIntLoose(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : null;
}
const round = (n: number, dp: number): number => Math.round(n * 10 ** dp) / 10 ** dp;

export const roc = { rocToIso };
