// Shapes mirrored from the backend API.

export type Market = 'TWSE' | 'TPEx' | 'US' | 'INDEX';
export type InstrumentType =
  | 'stock'
  | 'tw_etf'
  | 'us_etf'
  | 'index'
  | 'commodity'
  | 'crypto';

export interface WatchItem {
  id: number;
  ticker: string;
  name: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  market: Market;
  type: InstrumentType;
  currency: 'TWD' | 'USD' | null;
  nav: number | null;
  premium_discount_pct: number | null;
  dividend_yield: number | null;
  expense_ratio: number | null;
  aum: number | null;
  next_ex_dividend_date: string | null;
  foreign_net: number | null;
  foreign_net_date: string | null;
  region: 'Taiwan' | 'US' | 'Other';
  sector: string | null;
  tags: string[];
  group_names: string[];
  in_portfolio: boolean;
  display_order: number;
  added_at: string;
  quote_age_seconds: number | null;
}

export interface Group {
  id: number;
  group_name: string;
  description: string | null;
  created_at: string;
  item_count: number;
}

export interface SearchHit {
  ticker: string;
  name: string | null;
  market: Market;
  type: InstrumentType;
  yahoo_symbol: string;
  source: 'tw' | 'us';
}

export interface MarketQuote {
  ticker: string;
  name: string;
  kind: string;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  currency: string | null;
  fetched_at: string | null;
}

export interface MarketFlowRow {
  date: string;
  foreign_net: number | null;
  trust_net: number | null;
  dealer_net: number | null;
  fetched_at: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string | null;
  region: 'global' | 'taiwan';
  published_at: string | null;
  fetched_at: string;
}
export interface NewsResponse {
  items: NewsItem[];
  ai_enabled: boolean;
}
export interface NewsAnalysis {
  id: number;
  created_at: string;
  model: string | null;
  headline_count: number | null;
  content: string;
}
export interface NewsAnalysisResponse {
  analysis: NewsAnalysis | null;
  ai_enabled: boolean;
}
export interface MarketsResponse {
  indices: MarketQuote[];
  fx: MarketQuote[];
  commodities: MarketQuote[];
  sentiment: MarketQuote[];
}

export interface InstFlowRow {
  ticker: string;
  date: string;
  foreign_net: number | null;
  trust_net: number | null;
  dealer_net: number | null;
  fetched_at: string;
}
export interface InstitutionalResponse {
  ticker: string;
  latest: InstFlowRow | null;
  history: InstFlowRow[];
}

export interface DcaScheduleEntry {
  day: number; // 1..28
  amount: number;
}

export interface DcaPlan {
  id: number;
  ticker: string;
  currency: string;
  start_date: string;
  end_date: string | null;
  schedule: DcaScheduleEntry[];
  active: boolean;
  notes: string | null;
  last_run_date: string | null;
  created_at: string;
  lots_generated: number;
  invested_orig: number;
  next_debit_date: string | null;
}

export interface Lot {
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
  avg_cost: number | null;
  price: number | null;
  cost_value_orig: number | null;
  cost_value_twd: number | null;
  market_value_orig: number | null;
  market_value_twd: number | null;
  unrealized_pnl_orig: number | null;
  unrealized_pnl_twd: number | null;
  unrealized_pnl_pct: number | null;
  change_pct: number | null;
  day_pnl_twd: number | null;
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
  lots: Lot[];
}

export interface PortfolioSnapshot {
  base_currency: string;
  generated_at: string;
  fx: { rates: Record<string, number>; asOf: string | null; missing: string[] };
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

export interface DividendRow {
  id: number;
  ticker: string;
  ex_date: string | null;
  pay_date: string | null;
  amount_per_share: number;
  currency: string;
  shares: number | null;
  total_amount: number | null;
  total_amount_twd: number | null;
  source: 'manual' | 'auto';
  note: string | null;
  created_at: string;
}
export interface DividendSummary {
  base_currency: string;
  generated_at: string;
  estimated_annual_income_twd: number;
  by_ticker: {
    ticker: string;
    name: string | null;
    dividend_yield: number | null;
    market_value_twd: number | null;
    est_annual_income_twd: number | null;
  }[];
  upcoming: {
    ticker: string;
    name: string | null;
    ex_date: string;
    shares: number;
    dividend_yield: number | null;
    currency: string | null;
    est_annual_income_twd: number | null;
  }[];
  history: DividendRow[];
  history_total_twd: number;
}
