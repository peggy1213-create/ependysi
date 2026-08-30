import { useApi } from './useApi';
import type {
  AllocationView,
  AnalysisMode,
  DividendSummary,
  Group,
  MarketFlowRow,
  MarketsResponse,
  NewsAnalysesResponse,
  NewsAnalysisResponse,
  NewsResponse,
  OverlapView,
  PortfolioSnapshot,
  WatchItem,
} from './types';

const MIN = 60_000;

export const useWatchlist = () =>
  useApi<{ items: WatchItem[]; count: number }>('/watchlist', { refetchInterval: MIN });
export const useMarkets = () => useApi<MarketsResponse>('/markets', { refetchInterval: MIN });
export const usePortfolio = () =>
  useApi<PortfolioSnapshot>('/portfolio', { refetchInterval: MIN });
export const useAllocation = () => useApi<AllocationView>('/portfolio/allocation');
export const useOverlap = () => useApi<OverlapView>('/portfolio/overlap');
export const useDividends = () => useApi<DividendSummary>('/portfolio/dividends');
export const useGroups = () => useApi<{ groups: Group[] }>('/watchlist/groups');
export const useMarketFlow = (days = 5) =>
  useApi<{ days: MarketFlowRow[] }>(`/taiwan/market-flow?days=${days}`, { refetchInterval: 5 * MIN });
export const useNews = () => useApi<NewsResponse>('/news', { refetchInterval: 5 * MIN });
export const useNewsAnalysis = (mode: AnalysisMode = 'standard') =>
  useApi<NewsAnalysisResponse>(`/news/analysis?mode=${mode}`);
export const useNewsAnalyses = (mode: AnalysisMode = 'standard') =>
  useApi<NewsAnalysesResponse>(`/news/analyses?mode=${mode}`);
export const useNewsAnalysisById = (id: number | null) =>
  useApi<NewsAnalysisResponse>(id ? `/news/analysis/${id}` : null);
