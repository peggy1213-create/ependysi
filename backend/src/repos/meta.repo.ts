/** instrument_meta — sector / industry / region per ticker. */
import { all, get, run } from '../db/index.js';

export interface InstrumentMeta {
  ticker: string;
  sector: string | null;
  industry: string | null;
  region: string | null;
  updated_at: string;
}

export function getMeta(ticker: string): InstrumentMeta | undefined {
  return get<InstrumentMeta>('SELECT * FROM instrument_meta WHERE ticker = ?', ticker);
}

export function getMetaMany(tickers: string[]): Map<string, InstrumentMeta> {
  const out = new Map<string, InstrumentMeta>();
  if (tickers.length === 0) return out;
  const ph = tickers.map(() => '?').join(',');
  for (const m of all<InstrumentMeta>(
    `SELECT * FROM instrument_meta WHERE ticker IN (${ph})`,
    ...tickers,
  )) {
    out.set(m.ticker, m);
  }
  return out;
}

export function upsertMeta(
  ticker: string,
  patch: Partial<Pick<InstrumentMeta, 'sector' | 'industry' | 'region'>>,
): void {
  const prev = getMeta(ticker);
  run(
    `INSERT INTO instrument_meta (ticker, sector, industry, region, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ticker) DO UPDATE SET
       sector = excluded.sector, industry = excluded.industry,
       region = excluded.region, updated_at = excluded.updated_at`,
    ticker,
    patch.sector ?? prev?.sector ?? null,
    patch.industry ?? prev?.industry ?? null,
    patch.region ?? prev?.region ?? null,
    new Date().toISOString(),
  );
}
