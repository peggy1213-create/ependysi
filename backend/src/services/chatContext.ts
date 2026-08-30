/**
 * Builds the CONTEXT block fed to the chat assistant (services/chat.ts).
 *
 * Everything here is the user's own data or public third-party data already
 * cached by the dashboard: portfolio valuation, allocation, watchlist, the
 * always-on market backdrop, recent headlines, and — for any ticker the
 * question actually names — a deeper pull of valuation, analyst consensus
 * (Yahoo Finance), and Taiwan institutional net flows.
 */
import { appConfig } from '../config.js';
import { listItems } from '../repos/watchlist.repo.js';
import { listNews } from '../repos/news.repo.js';
import { getQuotes } from '../repos/quotes.repo.js';
import { historyFor } from '../repos/institutional.repo.js';
import { recentFlow } from '../repos/marketFlow.repo.js';
import { findTwSecurity } from '../repos/securities.repo.js';
import { computePortfolio, computeAllocation } from './portfolio.js';
import type { PortfolioSnapshot } from './portfolio.js';
import { fetchTickerFundamentals } from './yahoo.js';
import { mapPool } from '../lib/http.js';

const n = (v: number | null | undefined, dp = 2): string =>
  v == null || Number.isNaN(v) ? '—' : v.toFixed(dp);

/** Institutional net-flow shares as 萬股 (readable scale for TW flows). */
function wanShares(v: number | null): string {
  if (v == null) return '—';
  const w = v / 10000;
  return `${w >= 0 ? '+' : ''}${w.toFixed(0)}萬`;
}

/** Tickers the question names — matched against the user's own instruments plus
 *  bare 4–6 digit TW codes. Capped so a vague question can't fan out forever. */
function detectTickers(message: string, snapshot: PortfolioSnapshot | null): string[] {
  const upper = message.toUpperCase();
  const found = new Set<string>();

  const known = [
    ...listItems().map((i) => ({ ticker: i.ticker, name: i.name })),
    ...(snapshot?.positions.map((p) => ({ ticker: p.ticker, name: p.name })) ?? []),
  ];
  for (const k of known) {
    if (new RegExp(`\\b${k.ticker.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&')}\\b`, 'i').test(upper)) {
      found.add(k.ticker);
    } else if (k.name && k.name.length >= 2 && message.includes(k.name)) {
      found.add(k.ticker);
    }
  }
  for (const m of message.matchAll(/\b(\d{4,6})\b/g)) {
    if (findTwSecurity(m[1]!)) found.add(m[1]!);
  }
  return [...found].slice(0, 6);
}

function portfolioBlock(snap: PortfolioSnapshot): string {
  const t = snap.totals;
  const lines = [
    `Total value NT$${Math.round(t.market_value_twd).toLocaleString()} · ` +
      `unrealised P&L NT$${Math.round(t.unrealized_pnl_twd).toLocaleString()} (${n(t.unrealized_pnl_pct)}%) · ` +
      `today NT$${Math.round(t.day_pnl_twd).toLocaleString()} · ` +
      `est. annual dividend income NT$${Math.round(t.est_annual_income_twd).toLocaleString()}`,
    `${t.positions} positions / ${t.lots} lots`,
    '',
    'Positions (weight · avg cost · last · unrealised %):',
  ];
  for (const p of snap.positions.slice(0, 40)) {
    lines.push(
      `- ${p.ticker}${p.name ? ` ${p.name}` : ''} [${p.region}/${p.sector}] — ` +
        `${n(p.weight_pct)}% · avg ${n(p.avg_cost)} ${p.currency} · last ${n(p.price)} · ` +
        `${n(p.unrealized_pnl_pct)}% · today ${n(p.change_pct)}%` +
        (p.target_price != null ? ` · user target ${n(p.target_price)}` : '') +
        (p.stop_loss != null ? ` · user stop ${n(p.stop_loss)}` : '') +
        (p.dividend_yield != null ? ` · yield ${n(p.dividend_yield)}%` : ''),
    );
  }
  return lines.join('\n');
}

function allocationBlock(): string {
  try {
    const a = computeAllocation();
    const fmt = (xs: { label: string; weight_pct: number }[]) =>
      xs
        .slice(0, 8)
        .map((b) => `${b.label} ${n(b.weight_pct, 1)}%`)
        .join(', ');
    return [
      `By asset class: ${fmt(a.by_type)}`,
      `By region: ${fmt(a.by_region)}`,
      `By sector: ${fmt(a.by_sector)}`,
      `By currency: ${fmt(a.by_currency)}`,
    ].join('\n');
  } catch {
    return '(allocation unavailable)';
  }
}

function marketBackdrop(): string {
  const cfg = [...appConfig.alwaysOn.indices, ...appConfig.alwaysOn.fx, ...appConfig.alwaysOn.sentiment];
  const quotes = getQuotes(cfg.map((c) => c.ticker));
  const lines = cfg.map((c) => {
    const q = quotes.get(c.ticker);
    return `- ${c.name}: ${n(q?.price)} (${n(q?.change_pct)}%)`;
  });

  const flow = recentFlow(5);
  if (flow.length) {
    lines.push(
      'Market-wide 三大法人 net buy/sell (NT$億, most recent first):',
      ...flow.map(
        (f) =>
          `  ${f.date}: 外資 ${n(f.foreign_net != null ? f.foreign_net / 1e8 : null, 1)}, ` +
          `投信 ${n(f.trust_net != null ? f.trust_net / 1e8 : null, 1)}, ` +
          `自營 ${n(f.dealer_net != null ? f.dealer_net / 1e8 : null, 1)}`,
      ),
    );
  }
  return lines.join('\n');
}

function headlinesBlock(): string {
  const items = [...listNews('global', 10), ...listNews('taiwan', 10)];
  if (!items.length) return '(no headlines cached)';
  return items
    .map(
      (i) =>
        `- [${i.source ?? '?'}${i.published_at ? ', ' + i.published_at.slice(0, 10) : ''}] ${i.title}` +
        (i.summary ? ` — ${i.summary.slice(0, 160)}` : ''),
    )
    .join('\n');
}

async function tickerDeepDive(tickers: string[]): Promise<string> {
  if (!tickers.length) return '';
  const settled = await mapPool(tickers, 4, async (ticker) => {
    const tw = findTwSecurity(ticker);
    const yahoo = tw ? `${ticker}.${tw.market === 'TPEx' ? 'TWO' : 'TW'}` : ticker;
    const f = await fetchTickerFundamentals(yahoo).catch(() => null);
    const inst = tw ? historyFor(ticker, 5) : [];

    const parts = [`### ${ticker}${tw ? ` ${tw.name}` : ''}`];
    if (f) {
      parts.push(
        `price ${n(f.currentPrice)} ${f.currency ?? ''} · 52-week range ${n(f.fiftyTwoWeekLow)}–${n(f.fiftyTwoWeekHigh)} · ` +
          `trailing P/E ${n(f.trailingPE)} · forward P/E ${n(f.forwardPE)} · P/B ${n(f.priceToBook)}`,
      );
      parts.push(
        f.targetMean != null
          ? `Analyst consensus (Yahoo Finance — third-party opinion, not app advice): ` +
              `rating ${f.analystRecommendation ?? '—'}, ${f.analystCount ?? '—'} analysts, ` +
              `target low/mean/high ${n(f.targetLow)}/${n(f.targetMean)}/${n(f.targetHigh)}`
          : 'Analyst consensus (Yahoo Finance): none available for this ticker.',
      );
    } else {
      parts.push('(no fundamental data could be retrieved)');
    }
    if (inst.length) {
      parts.push(
        'Recent net flows (shares): ' +
          inst
            .map((r) => `${r.date.slice(5)} 外資 ${wanShares(r.foreign_net)} / 投信 ${wanShares(r.trust_net)}`)
            .join(' · '),
      );
    }
    return parts.join('\n');
  });
  return settled
    .map((r) => (r.status === 'fulfilled' ? r.value : ''))
    .filter(Boolean)
    .join('\n\n');
}

export async function buildChatContext(message: string): Promise<string> {
  let snapshot: PortfolioSnapshot | null = null;
  try {
    snapshot = computePortfolio();
  } catch {
    /* portfolio optional */
  }

  const watch = listItems();
  const watchLines = watch.length
    ? watch
        .map(
          (w) =>
            `- ${w.ticker}${w.name ? ` ${w.name}` : ''} · ${w.market}/${w.type}` +
            (w.tags.length ? ` · tags: ${w.tags.join(', ')}` : '') +
            (w.group_names.length ? ` · groups: ${w.group_names.join(', ')}` : ''),
        )
        .join('\n')
    : '(watchlist empty)';

  const deep = await tickerDeepDive(detectTickers(message, snapshot));

  return [
    '## PORTFOLIO',
    snapshot && snapshot.positions.length ? portfolioBlock(snapshot) : '(no holdings recorded)',
    '',
    '## ALLOCATION',
    snapshot && snapshot.positions.length ? allocationBlock() : '(n/a)',
    '',
    '## WATCHLIST',
    watchLines,
    '',
    '## MARKET BACKDROP',
    marketBackdrop(),
    '',
    '## RECENT HEADLINES',
    headlinesBlock(),
    ...(deep ? ['', '## NAMED TICKERS — DEEPER DATA', deep] : []),
  ].join('\n');
}
