/**
 * TWSE market closures. APPROXIMATE — the official calendar is published yearly
 * by TWSE; verify before relying on these. Makeup trading days omitted.
 */
export interface Holiday {
  date: string; // ISO
  name: string;
}

export const TW_HOLIDAYS: Holiday[] = [
  { date: '2026-01-01', name: '元旦 New Year' },
  { date: '2026-02-16', name: '農曆春節 Lunar New Year' },
  { date: '2026-02-17', name: '農曆春節 Lunar New Year' },
  { date: '2026-02-18', name: '農曆春節 Lunar New Year' },
  { date: '2026-02-19', name: '農曆春節 Lunar New Year' },
  { date: '2026-02-20', name: '農曆春節 Lunar New Year' },
  { date: '2026-02-27', name: '和平紀念日 228 (adjusted)' },
  { date: '2026-04-03', name: '兒童節 / 清明節 (adjusted)' },
  { date: '2026-04-06', name: '清明節 Tomb Sweeping' },
  { date: '2026-05-01', name: '勞動節 Labour Day' },
  { date: '2026-06-19', name: '端午節 Dragon Boat' },
  { date: '2026-09-25', name: '中秋節 Mid-Autumn' },
  { date: '2026-10-09', name: '國慶日 National Day (adjusted)' },
];
