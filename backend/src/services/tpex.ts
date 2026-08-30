/**
 * TPEx (Taipei Exchange / 櫃買中心) open data — no key.
 * Real-time TPEx quotes come through TWSE MIS with the `otc_` prefix
 * (see twse.misQuotes); this module covers the security master and
 * institutional flows that MIS does not provide.
 */
import { fetchJson } from '../lib/http.js';
import { rocToIso } from '../lib/roc.js';
import type { TwSecurity } from '../repos/securities.repo.js';
import type { InstFlow } from './twse.js';

const OPENAPI = 'https://www.tpex.org.tw/openapi/v1';
const TW_ETF_RE = /^00\d{2,4}[A-Z]?$/;

interface MainboardRow {
  SecuritiesCompanyCode: string;
  CompanyName: string;
}

export async function listedSecurities(): Promise<TwSecurity[]> {
  const out = new Map<string, TwSecurity>();
  const sources: [string, 'stock' | 'tw_etf' | 'auto'][] = [
    ['tpex_mainboard_quotes', 'auto'],
    ['tpex_etf_quotes', 'tw_etf'],
  ];
  for (const [path, forced] of sources) {
    try {
      const rows = await fetchJson<MainboardRow[]>(`${OPENAPI}/${path}`);
      for (const r of rows) {
        const ticker = String(r.SecuritiesCompanyCode ?? '').trim();
        const name = String(r.CompanyName ?? '').trim();
        if (!/^\d{4,6}[A-Z]?$/.test(ticker) || !name || out.has(ticker)) continue;
        const type =
          forced === 'auto' ? (TW_ETF_RE.test(ticker) ? 'tw_etf' : 'stock') : forced;
        out.set(ticker, { ticker, name, market: 'TPEx', type });
      }
    } catch {
      /* skip this source */
    }
  }
  return [...out.values()];
}

/** 3-institution daily net trading for all TPEx stocks. */
export async function institutional3Insti(): Promise<InstFlow[]> {
  let rows: Record<string, string>[];
  try {
    rows = await fetchJson<Record<string, string>[]>(`${OPENAPI}/tpex_3insti_daily_trading`);
  } catch {
    return [];
  }
  if (rows.length === 0) return [];
  const sample = rows[0] as Record<string, string>;
  const keys = Object.keys(sample);
  const foreignKey = keys.find(
    (k) => k.includes('Foreign') && k.includes('Total') && /net|Difference|超/i.test(k),
  );
  const trustKey = keys.find((k) => /Investment Trust/i.test(k) && /net|Difference/i.test(k));
  const dealerKey = keys.find((k) => /Dealer/i.test(k) && /net|Difference/i.test(k) && /Total|self/i.test(k));
  const dateKey = keys.find((k) => /date/i.test(k));

  return rows
    .map((r) => {
      const ticker = String(r.SecuritiesCompanyCode ?? r.Code ?? '').trim();
      if (!/^\d{4,6}[A-Z]?$/.test(ticker)) return null;
      return {
        ticker,
        date: dateKey ? rocToIso(r[dateKey] as string) : new Date().toISOString().slice(0, 10),
        foreign_net: foreignKey ? intLoose(r[foreignKey]) : null,
        trust_net: trustKey ? intLoose(r[trustKey]) : null,
        dealer_net: dealerKey ? intLoose(r[dealerKey]) : null,
      };
    })
    .filter((x): x is InstFlow => x !== null && x.date !== '');
}

function intLoose(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : null;
}
