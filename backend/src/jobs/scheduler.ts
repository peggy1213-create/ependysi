/**
 * Scheduled data fetching. Cron expressions come from config/config.json
 * (`refresh`). Watchlist jobs touch only the user's tracked tickers; the
 * always-on job refreshes the fixed market backdrop.
 */
import cron from 'node-cron';
import { appConfig } from '../config.js';
import {
  refreshWatchlistQuotes,
  refreshEtfDetails,
  refreshTwInstitutional,
  refreshTwFundamentals,
  refreshAlwaysOn,
} from '../services/marketData.js';
import { refreshTwSecurities } from '../services/twSecurities.js';
import { refreshInstrumentMeta } from '../services/instrumentMeta.js';
import { refreshEtfHoldings } from '../services/etfHoldings.js';

interface Job {
  name: string;
  cron: string;
  run: () => Promise<unknown>;
  runOnBoot?: boolean;
}

const jobs: Job[] = [
  {
    name: 'watchlist-quotes',
    cron: appConfig.refresh.watchlistQuotesCron ?? '*/10 * * * *',
    run: refreshWatchlistQuotes,
    runOnBoot: true,
  },
  {
    name: 'always-on',
    cron: appConfig.refresh.alwaysOnCron ?? '*/15 * * * *',
    run: refreshAlwaysOn,
    runOnBoot: true,
  },
  {
    name: 'tw-institutional',
    cron: appConfig.refresh.twInstitutionalCron ?? '30 15 * * 1-5',
    run: refreshTwInstitutional,
  },
  {
    name: 'tw-etf-nav',
    cron: appConfig.refresh.twEtfNavCron ?? '5 18 * * 1-5',
    run: refreshEtfDetails,
  },
  {
    name: 'tw-fundamentals',
    cron: appConfig.refresh.twFundamentalsCron ?? '12 18 * * 1-5',
    run: refreshTwFundamentals,
  },
  {
    name: 'tw-securities-list',
    cron: appConfig.refresh.twSecuritiesListCron ?? '0 7 * * *',
    run: refreshTwSecurities,
  },
  {
    name: 'instrument-meta',
    cron: appConfig.refresh.instrumentMetaCron ?? '15 7 * * *',
    run: refreshInstrumentMeta,
  },
  {
    name: 'etf-holdings',
    cron: appConfig.refresh.etfHoldingsCron ?? '30 7 * * 1',
    run: () => refreshEtfHoldings(false),
  },
];

export function startScheduler(): void {
  const timezone = appConfig.timezone ?? 'Asia/Taipei';
  for (const job of jobs) {
    if (!cron.validate(job.cron)) {
      console.warn(`[scheduler] invalid cron for "${job.name}": ${job.cron} — skipped`);
      continue;
    }
    cron.schedule(job.cron, () => void safeRun(job), { timezone });
    console.log(`[scheduler] registered "${job.name}" (${job.cron}, ${timezone})`);
  }

  // Warm the cache shortly after boot so the first page load has data.
  setTimeout(() => {
    for (const job of jobs) if (job.runOnBoot) void safeRun(job);
  }, 2000);
}

async function safeRun(job: Job): Promise<void> {
  const started = Date.now();
  try {
    const result = await job.run();
    console.log(`[scheduler] ${job.name} ok (${Date.now() - started}ms)`, result ?? '');
  } catch (err) {
    console.error(`[scheduler] ${job.name} failed:`, (err as Error).message);
  }
}
