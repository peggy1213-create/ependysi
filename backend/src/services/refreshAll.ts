/**
 * One-shot "refresh everything" — the single mechanism now that there is no
 * background scheduler. Triggered by POST /api/refresh (the UI's ↻ button) and
 * once on the client's first load.
 */
import {
  refreshWatchlistQuotes,
  refreshAlwaysOn,
  refreshEtfDetails,
  refreshTwFundamentals,
  refreshMarketFlow,
  refreshTwInstitutional,
  refreshDividendHistory,
  refreshAnalystTargets,
  refreshMovingAverages,
} from './marketData.js';
import { refreshInstrumentMeta } from './instrumentMeta.js';
import { refreshEtfHoldings } from './etfHoldings.js';
import { refreshTwSecurities } from './twSecurities.js';
import { refreshNews } from './news.js';
import { autoDetectDividends } from './dividends.js';
import { detectAlerts } from './alerts.js';
import { countTwSecurities } from '../repos/securities.repo.js';

export type RefreshSummary = Record<string, unknown>;

export async function refreshAll(opts: { securities?: boolean } = {}): Promise<RefreshSummary> {
  const jobs: [string, () => Promise<unknown>][] = [
    ['watchlistQuotes', refreshWatchlistQuotes],
    ['alwaysOn', refreshAlwaysOn],
    ['etfDetails', refreshEtfDetails],
    ['twFundamentals', refreshTwFundamentals],
    ['dividendHistory', refreshDividendHistory],
    ['analystTargets', refreshAnalystTargets],
    ['movingAverages', refreshMovingAverages],
    ['instrumentMeta', refreshInstrumentMeta],
    ['etfHoldings', () => refreshEtfHoldings(false)],
    ['marketFlow', refreshMarketFlow],
    ['twInstitutional', refreshTwInstitutional],
    ['news', refreshNews],
  ];
  if (opts.securities || countTwSecurities() === 0) {
    jobs.push(['twSecurities', refreshTwSecurities]);
  }

  const started = Date.now();
  const settled = await Promise.allSettled(jobs.map(([, fn]) => fn()));

  const summary: RefreshSummary = { ms: Date.now() - started };
  settled.forEach((r, i) => {
    const name = jobs[i]![0];
    summary[name] =
      r.status === 'fulfilled' ? r.value : { error: (r.reason as Error)?.message ?? 'failed' };
  });

  // Now that quotes carry fresh ex-dividend dates, roll any that have passed
  // into estimated history rows for the user to verify/correct.
  try {
    summary.dividendsDetected = autoDetectDividends();
  } catch (err) {
    summary.dividendsDetected = { error: (err as Error)?.message ?? 'failed' };
  }

  // Fresh quotes are cached — check target / stop-loss crossings.
  try {
    summary.alerts = detectAlerts();
  } catch (err) {
    summary.alerts = { error: (err as Error)?.message ?? 'failed' };
  }

  return summary;
}
