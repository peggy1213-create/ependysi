/** Region + sector classification helpers for allocation views. */
import type { Market, InstrumentType } from '../config.js';

export function regionOf(market: Market): 'Taiwan' | 'US' | 'Other' {
  if (market === 'TWSE' || market === 'TPEx') return 'Taiwan';
  if (market === 'US') return 'US';
  return 'Other';
}

/** Coarse asset class for the "by type" view. */
export function assetClassOf(type: InstrumentType): string {
  switch (type) {
    case 'stock':
      return 'Stocks';
    case 'tw_etf':
    case 'us_etf':
      return 'ETFs';
    case 'commodity':
      return 'Commodities';
    case 'crypto':
      return 'Crypto';
    case 'index':
      return 'Indices';
    default:
      return 'Other';
  }
}

// Yahoo sector / industry → a display label, with 中文 for the common ones.
const SECTOR_ZH: Record<string, string> = {
  Technology: '科技',
  'Financial Services': '金融',
  Financial: '金融',
  Healthcare: '醫療保健',
  'Consumer Cyclical': '非必需消費',
  'Consumer Defensive': '必需消費',
  Industrials: '工業',
  Energy: '能源',
  'Basic Materials': '原物料',
  'Communication Services': '通訊服務',
  Utilities: '公用事業',
  'Real Estate': '房地產',
};

const INDUSTRY_ZH: Record<string, string> = {
  Semiconductors: '半導體',
  'Semiconductor Equipment & Materials': '半導體設備',
  'Banks—Regional': '銀行',
  'Banks - Regional': '銀行',
  'Insurance—Life': '保險',
  'Capital Markets': '證券',
  'Consumer Electronics': '消費性電子',
  'Electronic Components': '電子零組件',
  'Computer Hardware': '電腦硬體',
  Shipping: '航運',
  'Marine Shipping': '航運',
  Steel: '鋼鐵',
};

export interface SectorLabel {
  key: string; // stable grouping key
  label: string; // best display label (中文 when known)
  label_en: string | null;
}

/**
 * Pick the most useful sector label. For Taiwan stocks a specific industry
 * (半導體, 航運) is more meaningful than the broad sector; otherwise use sector.
 */
export function sectorLabel(
  sector: string | null,
  industry: string | null,
  region: string,
): SectorLabel {
  if (region === 'Taiwan' && industry && INDUSTRY_ZH[industry]) {
    return { key: INDUSTRY_ZH[industry], label: INDUSTRY_ZH[industry], label_en: industry };
  }
  if (sector) {
    const zh = SECTOR_ZH[sector];
    return { key: zh ?? sector, label: zh ?? sector, label_en: sector };
  }
  if (industry) {
    const zh = INDUSTRY_ZH[industry];
    return { key: zh ?? industry, label: zh ?? industry, label_en: industry };
  }
  return { key: '未分類', label: '未分類', label_en: null };
}
