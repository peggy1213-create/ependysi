/**
 * Portfolio valuation engine: lots → positions → totals, plus allocation and
 * ETF/holding overlap. Everything is valued in TWD (base currency) using cached
 * quotes and FX; original-currency figures are kept where a position is
 * single-currency.
 */
import { appConfig } from '../config.js';
import type { Market, InstrumentType } from '../config.js';
import { listLots } from '../repos/holdings.repo.js';
import type { Lot } from '../repos/holdings.repo.js';
import { getQuotes } from '../repos/quotes.repo.js';
import { listItems } from '../repos/watchlist.repo.js';
import { getMetaMany } from '../repos/meta.repo.js';
import { holdingsOf } from '../repos/etfHoldings.repo.js';
import { ratesToTwd, toTwd } from './fx.js';
import type { FxTable } from './fx.js';
import { regionOf, assetClassOf, sectorLabel } from '../lib/classify.js';

const r2 = (n: number | null): number | null => (n == null ? null : Math.round(n * 100) / 100);
const isEtf = (t: InstrumentType): boolean => t === 'tw_etf' || t === 'us_etf';

export interface LotValuation {
  id: number;
  shares: number;
  cost_basis: number;
  currency: string;
  purchase_date: string | null;
  notes: string | null;
  target_price: number | null;
  stop_loss: number | null;
  plan_id: number | null;
  cost_value_orig: number;
  cost_value_twd: number | null;
  market_value_twd: number | null;
  unrealized_pnl_twd: number | null;
  unrealized_pnl_pct: number | null;
}

export interface Position {
  ticker: string;
  name: string | null;
  market: Market;
  type: InstrumentType;
  region: 'Taiwan' | 'US' | 'Other';
  sector: string;
  sector_en: string | null;
  currency: string;
  mixed_currency: boolean;
  shares: number;
  avg_cost: number | null; // per share, position currency
  price: number | null;
  cost_value_orig: number | null;
  cost_value_twd: number | null;
  market_value_orig: number | null;
  market_value_twd: number | null;
  unrealized_pnl_orig: number | null;
  unrealized_pnl_twd: number | null;
  unrealized_pnl_pct: number | null;
  change_pct: number | null; // today's price move
  day_pnl_twd: number | null; // today's P&L contribution
  weight_pct: number | null;
  target_price: number | null;
  stop_loss: number | null;
  target_upside_pct: number | null;
  stop_downside_pct: number | null;
  dividend_yield: number | null;
  est_annual_income_twd: number | null;
  next_ex_dividend_date: string | null;
  tags: string[];
  priced: boolean;
  lots: LotValuation[];
}

export interface PortfolioSnapshot {
  base_currency: string;
  generated_at: string;
  fx: FxTable;
  totals: {
    market_value_twd: number;
    cost_twd: number;
    unrealized_pnl_twd: number;
    unrealized_pnl_pct: number | null;
    day_pnl_twd: number;
    est_annual_income_twd: number;
    positions: number;
    lots: number;
    unpriced_tickers: string[];
  };
  positions: Position[];
}

export function computePortfolio(): PortfolioSnapshot {
  const lots = listLots();
  const fx = ratesToTwd();
  const tickers = [...new Set(lots.map((l) => l.ticker))];
  const quotes = getQuotes(tickers);
  const watch = new Map(listItems().map((i) => [i.ticker, i]));
  const meta = getMetaMany(tickers);

  const byTicker = new Map<string, Lot[]>();
  for (const lot of lots) {
    const arr = byTicker.get(lot.ticker) ?? [];
    arr.push(lot);
    byTicker.set(lot.ticker, arr);
  }

  const positions: Position[] = [];
  const unpriced: string[] = [];

  for (const [ticker, group] of byTicker) {
    const q = quotes.get(ticker);
    const w = watch.get(ticker);
    const m = meta.get(ticker);
    const market: Market = (q?.market as Market) ?? w?.market ?? 'US';
    const type: InstrumentType = (q?.type as InstrumentType) ?? w?.type ?? 'stock';
    const region = regionOf(market);
    const currencies = new Set(group.map((l) => l.currency.toUpperCase()));
    const posCurrency =
      (q?.currency as string | undefined) ?? group[0]!.currency.toUpperCase();
    const mixedCurrency = currencies.size > 1 || (q?.currency != null && !currencies.has(q.currency));

    const price = q?.price ?? null;
    const shares = sum(group.map((l) => l.shares));

    const lotVals: LotValuation[] = group.map((l) => {
      const costOrig = l.cost_basis * l.shares;
      const costTwd = toTwd(costOrig, l.currency, fx);
      const mvTwd = price != null ? toTwd(price * l.shares, posCurrency, fx) : null;
      return {
        id: l.id,
        shares: l.shares,
        cost_basis: l.cost_basis,
        currency: l.currency,
        purchase_date: l.purchase_date,
        notes: l.notes,
        target_price: l.target_price,
        stop_loss: l.stop_loss,
        plan_id: l.plan_id,
        cost_value_orig: r2(costOrig)!,
        cost_value_twd: r2(costTwd),
        market_value_twd: r2(mvTwd),
        unrealized_pnl_twd: mvTwd != null && costTwd != null ? r2(mvTwd - costTwd) : null,
        unrealized_pnl_pct:
          mvTwd != null && costTwd ? r2(((mvTwd - costTwd) / costTwd) * 100) : null,
      };
    });

    const costTwd = sumOrNull(lotVals.map((l) => l.cost_value_twd));
    const mvOrig = price != null ? price * shares : null;
    const mvTwd = mvOrig != null ? toTwd(mvOrig, posCurrency, fx) : null;
    const sameCcyCost = !mixedCurrency ? sum(group.map((l) => l.cost_basis * l.shares)) : null;

    // target / stop: the most recently-dated lot that sets each (independently)
    const byRecency = [...group].sort(sortLot).reverse();
    const target = byRecency.find((l) => l.target_price != null)?.target_price ?? null;
    const stop = byRecency.find((l) => l.stop_loss != null)?.stop_loss ?? null;
    const sec = sectorLabel(m?.sector ?? null, m?.industry ?? null, region);

    const dividendYield = isEtf(type) || type === 'stock' ? (q?.dividend_yield ?? null) : null;
    const estIncomeTwd =
      dividendYield != null && mvTwd != null ? (mvTwd * dividendYield) / 100 : null;

    const changePct = q?.change_pct ?? null;
    const dayPnlTwd =
      changePct != null && mvTwd != null ? mvTwd - mvTwd / (1 + changePct / 100) : null;

    positions.push({
      ticker,
      name: q?.name ?? w?.name ?? null,
      market,
      type,
      region,
      sector: sec.label,
      sector_en: sec.label_en,
      currency: posCurrency,
      mixed_currency: mixedCurrency,
      shares: r2(shares)!,
      avg_cost: sameCcyCost != null && shares ? r2(sameCcyCost / shares) : null,
      price,
      cost_value_orig: r2(sameCcyCost),
      cost_value_twd: r2(costTwd),
      market_value_orig: r2(mvOrig),
      market_value_twd: r2(mvTwd),
      unrealized_pnl_orig:
        sameCcyCost != null && mvOrig != null ? r2(mvOrig - sameCcyCost) : null,
      unrealized_pnl_twd: mvTwd != null && costTwd != null ? r2(mvTwd - costTwd) : null,
      unrealized_pnl_pct:
        mvTwd != null && costTwd ? r2(((mvTwd - costTwd) / costTwd) * 100) : null,
      change_pct: changePct,
      day_pnl_twd: r2(dayPnlTwd),
      weight_pct: null, // filled after total is known
      target_price: target,
      stop_loss: stop,
      target_upside_pct: target != null && price ? r2((target / price - 1) * 100) : null,
      stop_downside_pct: stop != null && price ? r2((stop / price - 1) * 100) : null,
      dividend_yield: dividendYield,
      est_annual_income_twd: r2(estIncomeTwd),
      next_ex_dividend_date: q?.next_ex_dividend_date ?? null,
      tags: w?.tags ?? [],
      priced: price != null,
      lots: lotVals,
    });

    if (price == null) unpriced.push(ticker);
  }

  const totalMv = sum(positions.map((p) => p.market_value_twd ?? 0));
  const totalCost = sum(positions.map((p) => p.cost_value_twd ?? 0));
  const totalIncome = sum(positions.map((p) => p.est_annual_income_twd ?? 0));
  const totalDayPnl = sum(positions.map((p) => p.day_pnl_twd ?? 0));

  for (const p of positions) {
    p.weight_pct =
      totalMv > 0 && p.market_value_twd != null ? r2((p.market_value_twd / totalMv) * 100) : null;
  }
  positions.sort((a, b) => (b.market_value_twd ?? 0) - (a.market_value_twd ?? 0));

  return {
    base_currency: appConfig.baseCurrency,
    generated_at: new Date().toISOString(),
    fx,
    totals: {
      market_value_twd: r2(totalMv)!,
      cost_twd: r2(totalCost)!,
      unrealized_pnl_twd: r2(totalMv - totalCost)!,
      unrealized_pnl_pct: totalCost > 0 ? r2(((totalMv - totalCost) / totalCost) * 100) : null,
      day_pnl_twd: r2(totalDayPnl)!,
      est_annual_income_twd: r2(totalIncome)!,
      positions: positions.length,
      lots: lots.length,
      unpriced_tickers: unpriced,
    },
    positions,
  };
}

// ── Allocation ─────────────────────────────────────────────────────────────
export interface AllocationBucket {
  key: string;
  label: string;
  value_twd: number;
  weight_pct: number;
  positions: number;
}

export interface AllocationView {
  base_currency: string;
  generated_at: string;
  total_twd: number;
  by_type: AllocationBucket[];
  by_region: AllocationBucket[];
  by_currency: AllocationBucket[];
  by_sector: AllocationBucket[];
  by_tag: AllocationBucket[];
  notes: string[];
}

export function computeAllocation(snapshot = computePortfolio()): AllocationView {
  const total = snapshot.totals.market_value_twd;
  const priced = snapshot.positions.filter((p) => p.market_value_twd != null);

  const group = (
    keyOf: (p: Position) => { key: string; label: string }[],
  ): AllocationBucket[] => {
    const acc = new Map<string, { label: string; value: number; count: number }>();
    for (const p of priced) {
      for (const { key, label } of keyOf(p)) {
        const cur = acc.get(key) ?? { label, value: 0, count: 0 };
        cur.value += p.market_value_twd!;
        cur.count += 1;
        acc.set(key, cur);
      }
    }
    return [...acc.entries()]
      .map(([key, v]) => ({
        key,
        label: v.label,
        value_twd: r2(v.value)!,
        weight_pct: total > 0 ? r2((v.value / total) * 100)! : 0,
        positions: v.count,
      }))
      .sort((a, b) => b.value_twd - a.value_twd);
  };

  return {
    base_currency: snapshot.base_currency,
    generated_at: snapshot.generated_at,
    total_twd: total,
    by_type: group((p) => [{ key: assetClassOf(p.type), label: assetClassOf(p.type) }]),
    by_region: group((p) => [{ key: p.region, label: p.region }]),
    by_currency: group((p) => [{ key: p.currency, label: p.currency }]),
    by_sector: group((p) =>
      p.type === 'stock'
        ? [{ key: p.sector, label: p.sector }]
        : [{ key: assetClassOf(p.type), label: assetClassOf(p.type) }],
    ),
    by_tag: group((p) =>
      p.tags.length > 0
        ? p.tags.map((t) => ({ key: t, label: t }))
        : [{ key: 'untagged', label: 'untagged' }],
    ),
    notes: [
      'by_sector groups non-stocks (ETFs, commodities) under their asset class — use /overlap for ETF look-through.',
      'by_tag weights can exceed 100%: a position in multiple tags is counted in each.',
      ...(snapshot.totals.unpriced_tickers.length
        ? [`${snapshot.totals.unpriced_tickers.length} unpriced position(s) excluded: ${snapshot.totals.unpriced_tickers.join(', ')}`]
        : []),
    ],
  };
}

// ── Overlap / look-through ─────────────────────────────────────────────────
export interface OverlapFlag {
  component_ticker: string;
  component_name: string | null;
  direct_value_twd: number;
  direct_weight_pct: number;
  via: {
    etf_ticker: string;
    etf_name: string | null;
    weight_in_etf_pct: number;
    etf_position_value_twd: number;
    indirect_value_twd: number;
  }[];
  indirect_value_twd: number;
  effective_value_twd: number;
  effective_weight_pct: number;
}

export interface EffectiveExposure {
  ticker: string;
  name: string | null;
  held_directly: boolean;
  direct_value_twd: number;
  indirect_value_twd: number;
  effective_value_twd: number;
  effective_weight_pct: number;
  sources: string[];
}

export interface OverlapView {
  base_currency: string;
  generated_at: string;
  overlaps: OverlapFlag[];
  effective_exposure: EffectiveExposure[];
  coverage: { etfs_with_holdings: string[]; etfs_missing_holdings: string[] };
}

export function computeOverlap(snapshot = computePortfolio()): OverlapView {
  const total = snapshot.totals.market_value_twd;
  const direct = new Map<string, { value: number; name: string | null }>();
  for (const p of snapshot.positions) {
    if (!isEtf(p.type) && p.market_value_twd != null) {
      direct.set(p.ticker, { value: p.market_value_twd, name: p.name });
    }
  }

  // underlying ticker -> { direct, indirect, name, sources }
  const exposure = new Map<
    string,
    { name: string | null; direct: number; indirect: number; sources: Set<string> }
  >();
  const bump = (t: string, name: string | null) => {
    if (!exposure.has(t)) exposure.set(t, { name, direct: 0, indirect: 0, sources: new Set() });
    const e = exposure.get(t)!;
    if (name && !e.name) e.name = name;
    return e;
  };

  for (const [t, d] of direct) bump(t, d.name).direct += d.value;

  const withHoldings: string[] = [];
  const missing: string[] = [];
  const flags: OverlapFlag[] = [];

  for (const p of snapshot.positions) {
    if (!isEtf(p.type) || p.market_value_twd == null) continue;
    const comps = holdingsOf(p.ticker);
    if (comps.length === 0) {
      missing.push(p.ticker);
      continue;
    }
    withHoldings.push(p.ticker);

    for (const c of comps) {
      if (!c.component_ticker) continue;
      const indirectValue = (p.market_value_twd * c.weight_pct) / 100;
      const e = bump(c.component_ticker, c.component_name);
      e.indirect += indirectValue;
      e.sources.add(p.ticker);
    }
  }

  // both-case flags
  for (const [t, e] of exposure) {
    const directHit = direct.get(t);
    if (!directHit || e.indirect <= 0) continue;
    const via = snapshot.positions
      .filter((p) => isEtf(p.type) && p.market_value_twd != null)
      .flatMap((p) => {
        const c = holdingsOf(p.ticker).find((h) => h.component_ticker === t);
        if (!c) return [];
        return [
          {
            etf_ticker: p.ticker,
            etf_name: p.name,
            weight_in_etf_pct: c.weight_pct,
            etf_position_value_twd: p.market_value_twd!,
            indirect_value_twd: r2((p.market_value_twd! * c.weight_pct) / 100)!,
          },
        ];
      });
    const effective = directHit.value + e.indirect;
    flags.push({
      component_ticker: t,
      component_name: e.name,
      direct_value_twd: r2(directHit.value)!,
      direct_weight_pct: total > 0 ? r2((directHit.value / total) * 100)! : 0,
      via,
      indirect_value_twd: r2(e.indirect)!,
      effective_value_twd: r2(effective)!,
      effective_weight_pct: total > 0 ? r2((effective / total) * 100)! : 0,
    });
  }
  flags.sort((a, b) => b.effective_value_twd - a.effective_value_twd);

  const effective_exposure: EffectiveExposure[] = [...exposure.entries()]
    .map(([ticker, e]) => ({
      ticker,
      name: e.name,
      held_directly: direct.has(ticker),
      direct_value_twd: r2(e.direct)!,
      indirect_value_twd: r2(e.indirect)!,
      effective_value_twd: r2(e.direct + e.indirect)!,
      effective_weight_pct: total > 0 ? r2(((e.direct + e.indirect) / total) * 100)! : 0,
      sources: [...e.sources],
    }))
    .filter((e) => e.effective_value_twd > 0)
    .sort((a, b) => b.effective_value_twd - a.effective_value_twd)
    .slice(0, 25);

  return {
    base_currency: snapshot.base_currency,
    generated_at: snapshot.generated_at,
    overlaps: flags,
    effective_exposure,
    coverage: { etfs_with_holdings: withHoldings, etfs_missing_holdings: missing },
  };
}

// ── helpers ────────────────────────────────────────────────────────────────
function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
function sumOrNull(xs: (number | null)[]): number | null {
  if (xs.some((x) => x == null)) return xs.some((x) => x != null) ? sum(xs.filter((x): x is number => x != null)) : null;
  return sum(xs as number[]);
}
function sortLot(a: Lot, b: Lot): number {
  const da = a.purchase_date ?? '';
  const db = b.purchase_date ?? '';
  return da === db ? a.id - b.id : da < db ? -1 : 1;
}
