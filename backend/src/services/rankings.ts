/**
 * Market-wide Taiwan rankings — 漲跌幅 / 熱門 / 外資・投信買超 / 產業選股.
 *
 * Every list is derived from the same keyless TWSE + TPEx open data the rest of
 * the backend already uses. Nothing is persisted: one market-wide pull (~1 MB)
 * feeds all five lists, held in a short in-memory cache so we don't repeat it
 * per request. Mirrors the "no background scheduler, fetch on demand" model.
 */
import { fetchJson } from '../lib/http.js';
import { institutionalT86 } from './twse.js';
import { institutional3Insti } from './tpex.js';
import { lastTradingDayIso } from '../lib/roc.js';

const TWSE_OPENAPI = 'https://openapi.twse.com.tw/v1';
const TPEX_OPENAPI = 'https://www.tpex.org.tw/openapi/v1';

const QUOTE_TTL = 5 * 60_000;
const INST_TTL = 10 * 60_000;
const INDUSTRY_TTL = 24 * 60 * 60_000;

export interface RankRow {
  ticker: string;
  name: string;
  market: 'TWSE' | 'TPEx';
  is_etf: boolean;
  price: number | null;
  change_pct: number | null;
  volume: number | null; // shares
  turnover: number | null; // TWD
}

export interface InstRankRow extends RankRow {
  net_lots: number; // net buy in 張 (1 張 = 1,000 shares); always > 0 in these lists
}

export interface IndustryRef {
  code: string;
  name: string;
  count: number; // traded names in this industry today
}

export interface RankingsPayload {
  as_of: string; // ISO date of the institutional trading day used
  fetched_at: string;
  gainers: RankRow[];
  losers: RankRow[];
  volume: RankRow[];
  foreign_buy: InstRankRow[];
  trust_buy: InstRankRow[];
  industries: IndustryRef[];
}

// ── industry code → 中文名 (fixed TWSE / TPEx 產業別 taxonomy) ────────────────
const INDUSTRY_NAMES: Record<string, string> = {
  '01': '水泥工業',
  '02': '食品工業',
  '03': '塑膠工業',
  '04': '紡織纖維',
  '05': '電機機械',
  '06': '電器電纜',
  '08': '玻璃陶瓷',
  '09': '造紙工業',
  '10': '鋼鐵工業',
  '11': '橡膠工業',
  '12': '汽車工業',
  '14': '建材營造',
  '15': '航運業',
  '16': '觀光餐旅',
  '17': '金融保險',
  '18': '貿易百貨',
  '19': '綜合企業',
  '20': '其他業',
  '21': '化學工業',
  '22': '生技醫療業',
  '23': '油電燃氣業',
  '24': '半導體業',
  '25': '電腦及週邊設備業',
  '26': '光電業',
  '27': '通信網路業',
  '28': '電子零組件業',
  '29': '電子通路業',
  '30': '資訊服務業',
  '31': '其他電子業',
  '32': '文化創意業',
  '33': '農業科技業',
  '34': '電子商務',
  '35': '綠能環保',
  '36': '數位雲端',
  '37': '運動休閒',
  '38': '居家生活',
  '80': '管理股票',
};

// keep ordinary / preferred shares (4-digit) and ETFs (00…); drop warrants,
// TDRs, ETNs and other 6-digit instruments.
const KEEP = (code: string): boolean =>
  /^\d{4}[A-Z]?$/.test(code) || /^00\d{2,4}[A-Z]?$/.test(code);
const IS_ETF = (code: string): boolean => /^00\d/.test(code);

const round = (x: number, dp: number): number => Math.round(x * 10 ** dp) / 10 ** dp;

function n(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '' || s === '--' || s === '-' || s === 'X0.00') return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

function pctFromChange(close: number | null, change: number | null): number | null {
  if (close == null || change == null) return null;
  const prev = close - change;
  if (!prev) return null;
  return round((change / prev) * 100, 2);
}

// ── market-wide quotes (TWSE STOCK_DAY_ALL + TPEx mainboard) ─────────────────
interface TwseDayRow {
  Code?: string;
  Name?: string;
  TradeVolume?: string;
  TradeValue?: string;
  ClosingPrice?: string;
  Change?: string;
}
interface TpexQuoteRow {
  SecuritiesCompanyCode?: string;
  CompanyName?: string;
  Close?: string;
  Change?: string;
  TradingShares?: string;
  TransactionAmount?: string;
}

let quoteCache: { at: number; rows: RankRow[] } | null = null;

async function marketQuotes(): Promise<RankRow[]> {
  if (quoteCache && Date.now() - quoteCache.at < QUOTE_TTL) return quoteCache.rows;
  const rows: RankRow[] = [];

  try {
    const twse = await fetchJson<TwseDayRow[]>(`${TWSE_OPENAPI}/exchangeReport/STOCK_DAY_ALL`);
    for (const r of twse) {
      const ticker = String(r.Code ?? '').trim();
      if (!KEEP(ticker)) continue;
      const close = n(r.ClosingPrice);
      rows.push({
        ticker,
        name: String(r.Name ?? '').trim(),
        market: 'TWSE',
        is_etf: IS_ETF(ticker),
        price: close,
        change_pct: pctFromChange(close, n(r.Change)),
        volume: n(r.TradeVolume),
        turnover: n(r.TradeValue),
      });
    }
  } catch {
    /* degrade to whatever we got */
  }

  try {
    const tpex = await fetchJson<TpexQuoteRow[]>(`${TPEX_OPENAPI}/tpex_mainboard_quotes`);
    for (const r of tpex) {
      const ticker = String(r.SecuritiesCompanyCode ?? '').trim();
      if (!KEEP(ticker)) continue;
      const close = n(r.Close);
      rows.push({
        ticker,
        name: String(r.CompanyName ?? '').trim(),
        market: 'TPEx',
        is_etf: IS_ETF(ticker),
        price: close,
        change_pct: pctFromChange(close, n(r.Change)),
        volume: n(r.TradingShares),
        turnover: n(r.TransactionAmount),
      });
    }
  } catch {
    /* TPEx optional */
  }

  quoteCache = { at: Date.now(), rows };
  return rows;
}

// ── institutional net (外資 / 投信) for the latest trading day ───────────────
let instCache: {
  at: number;
  iso: string;
  map: Map<string, { foreign: number | null; trust: number | null }>;
} | null = null;

async function institutionalNet(): Promise<{
  iso: string;
  map: Map<string, { foreign: number | null; trust: number | null }>;
}> {
  if (instCache && Date.now() - instCache.at < INST_TTL) {
    return { iso: instCache.iso, map: instCache.map };
  }
  const map = new Map<string, { foreign: number | null; trust: number | null }>();
  let iso = lastTradingDayIso();

  // TWSE T86 — walk back a few weekdays until a trading day returns rows.
  for (let i = 0; i < 6; i++) {
    let t86: Awaited<ReturnType<typeof institutionalT86>> = [];
    try {
      t86 = await institutionalT86(iso);
    } catch {
      t86 = [];
    }
    if (t86.length > 0) {
      for (const r of t86) map.set(r.ticker, { foreign: r.foreign_net, trust: r.trust_net });
      break;
    }
    const d = new Date(`${iso}T00:00:00Z`);
    do {
      d.setUTCDate(d.getUTCDate() - 1);
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    iso = d.toISOString().slice(0, 10);
  }

  // TPEx — latest snapshot (no date parameter).
  try {
    for (const r of await institutional3Insti()) {
      const cur = map.get(r.ticker) ?? { foreign: null, trust: null };
      map.set(r.ticker, {
        foreign: r.foreign_net ?? cur.foreign,
        trust: r.trust_net ?? cur.trust,
      });
    }
  } catch {
    /* TPEx optional */
  }

  instCache = { at: Date.now(), iso, map };
  return { iso, map };
}

// ── industry classification (上市 t187ap03_L + 上櫃 t187ap03_O) ──────────────
let industryCache: { at: number; map: Map<string, string> } | null = null;

async function industryByTicker(): Promise<Map<string, string>> {
  if (industryCache && Date.now() - industryCache.at < INDUSTRY_TTL) return industryCache.map;
  const map = new Map<string, string>();

  try {
    const rows = await fetchJson<Record<string, string>[]>(`${TWSE_OPENAPI}/opendata/t187ap03_L`);
    for (const r of rows) {
      const t = String(r['公司代號'] ?? '').trim();
      const code = String(r['產業別'] ?? '').trim().padStart(2, '0');
      if (t && INDUSTRY_NAMES[code]) map.set(t, code);
    }
  } catch {
    /* degrade */
  }

  try {
    const rows = await fetchJson<Record<string, string>[]>(
      `${TPEX_OPENAPI}/mopsfin_t187ap03_O`,
    );
    for (const r of rows) {
      const t = String(r.SecuritiesCompanyCode ?? '').trim();
      const code = String(r.SecuritiesIndustryCode ?? '').trim().padStart(2, '0');
      if (t && INDUSTRY_NAMES[code] && !map.has(t)) map.set(t, code);
    }
  } catch {
    /* degrade */
  }

  industryCache = { at: Date.now(), map };
  return map;
}

// ── public API ─────────────────────────────────────────────────────────────
const byChangeDesc = (a: RankRow, b: RankRow): number =>
  (b.change_pct ?? -Infinity) - (a.change_pct ?? -Infinity);

export async function getRankings(limit = 20): Promise<RankingsPayload> {
  const [quotes, inst, industry] = await Promise.all([
    marketQuotes(),
    institutionalNet(),
    industryByTicker(),
  ]);

  const priced = quotes.filter((r) => r.change_pct != null);
  const gainers = [...priced].sort(byChangeDesc).slice(0, limit);
  const losers = [...priced]
    .sort((a, b) => (a.change_pct as number) - (b.change_pct as number))
    .slice(0, limit);
  const volume = quotes
    .filter((r) => r.volume != null && r.volume > 0)
    .sort((a, b) => (b.volume as number) - (a.volume as number))
    .slice(0, limit);

  const qmap = new Map(quotes.map((r) => [r.ticker, r]));
  const instList = (pick: 'foreign' | 'trust'): InstRankRow[] =>
    [...inst.map.entries()]
      .map(([ticker, net]): InstRankRow | null => {
        const shares = net[pick];
        const q = qmap.get(ticker);
        if (shares == null || shares <= 0 || !q) return null;
        return { ...q, net_lots: Math.round(shares / 1000) };
      })
      .filter((x): x is InstRankRow => x !== null && x.net_lots > 0)
      .sort((a, b) => b.net_lots - a.net_lots)
      .slice(0, limit);

  const counts = new Map<string, number>();
  for (const r of quotes) {
    const code = industry.get(r.ticker);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const industries: IndustryRef[] = [...counts.entries()]
    .map(([code, count]) => ({ code, name: INDUSTRY_NAMES[code] as string, count }))
    .sort((a, b) => Number(a.code) - Number(b.code));

  return {
    as_of: inst.iso,
    fetched_at: new Date().toISOString(),
    gainers,
    losers,
    volume,
    foreign_buy: instList('foreign'),
    trust_buy: instList('trust'),
    industries,
  };
}

export type IndustrySort = 'change' | 'volume' | 'turnover';

export async function getIndustryStocks(
  code: string,
  opts: { limit?: number; sort?: IndustrySort } = {},
): Promise<{ code: string; name: string | null; stocks: RankRow[] }> {
  const norm = code.trim().padStart(2, '0');
  const [quotes, industry] = await Promise.all([marketQuotes(), industryByTicker()]);
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 300);
  const cmp =
    opts.sort === 'volume'
      ? (a: RankRow, b: RankRow) => (b.volume ?? -Infinity) - (a.volume ?? -Infinity)
      : opts.sort === 'turnover'
        ? (a: RankRow, b: RankRow) => (b.turnover ?? -Infinity) - (a.turnover ?? -Infinity)
        : byChangeDesc;

  const stocks = quotes
    .filter((r) => industry.get(r.ticker) === norm)
    .sort(cmp)
    .slice(0, limit);

  return { code: norm, name: INDUSTRY_NAMES[norm] ?? null, stocks };
}
