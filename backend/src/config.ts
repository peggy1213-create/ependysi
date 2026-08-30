/**
 * Central configuration loader.
 *
 * - Secrets (API keys, ports) come from environment variables (backend/.env).
 * - Non-secret settings come from config/config.json at the repo root, falling
 *   back to config/config.example.json.
 *
 * NOTE: the user's watchlist is NOT config — it lives in SQLite and is managed
 * at runtime via /api/watchlist. Config only carries the always-on market
 * context (indices / FX / commodities / VIX) and the refresh schedule.
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

function loadJsonConfig(): AppConfig {
  const primary = resolve(repoRoot, 'config', 'config.json');
  const example = resolve(repoRoot, 'config', 'config.example.json');
  const path = existsSync(primary) ? primary : example;
  return JSON.parse(readFileSync(path, 'utf-8')) as AppConfig;
}

/** Where a ticker trades. */
export type Market = 'TWSE' | 'TPEx' | 'US' | 'INDEX';

/** What kind of instrument it is. */
export type InstrumentType =
  | 'stock'
  | 'tw_etf'
  | 'us_etf'
  | 'index'
  | 'commodity'
  | 'crypto';

export interface AlwaysOnItem {
  ticker: string; // Yahoo symbol
  name: string;
  type: Extract<InstrumentType, 'index' | 'commodity' | 'crypto'> | 'fx';
}

export interface AppConfig {
  baseCurrency: string;
  timezone: string;
  macroSeries: { fred: string[] };
  /**
   * Market context shown regardless of the watchlist. Fixed by design — this is
   * the ambient backdrop (major indices, key FX pairs, headline commodities,
   * VIX), not the user's tracked instruments.
   */
  alwaysOn: {
    indices: AlwaysOnItem[];
    fx: AlwaysOnItem[];
    commodities: AlwaysOnItem[];
    sentiment: AlwaysOnItem[];
  };
}

export const appConfig = loadJsonConfig();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  keys: {
    fred: process.env.FRED_API_KEY ?? '',
    alphaVantage: process.env.ALPHA_VANTAGE_API_KEY ?? '',
    finnhub: process.env.FINNHUB_API_KEY ?? '',
    // Google AI Studio (Gemini) key for the News tab's AI briefing.
    gemini: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '',
  },
  // Gemini model for the News tab's AI analysis.
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
};

// Writable data dir. Defaults to backend/data (dev); the desktop app points
// INVESTMENT_DATA_DIR at %APPDATA%/… so the SQLite file survives app updates.
const dataDir = process.env.INVESTMENT_DATA_DIR
  ? resolve(process.env.INVESTMENT_DATA_DIR)
  : resolve(__dirname, '..', 'data');
// Bundled read-only seed files — always ship next to the compiled backend.
const seedDir = resolve(__dirname, '..', 'data');

export const paths = {
  repoRoot,
  dataDir,
  seedDir,
  dbFile: resolve(dataDir, 'investment.sqlite'),
  twSecuritiesSeed: resolve(seedDir, 'tw-securities.seed.json'),
  etfHoldingsSeed: resolve(seedDir, 'etf-holdings.seed.json'),
};
