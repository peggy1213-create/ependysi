# services/

Data-source adapters and refresh orchestration. Route handlers call these;
nothing here writes HTTP responses.

| file               | source                          | covers                                                        |
| ------------------ | ------------------------------- | ------------------------------------------------------------- |
| `yahoo.ts`         | Yahoo Finance (unofficial)      | US / index / FX / commodity / crypto quotes; ticker search; ETF fundamentals (crumb-gated) |
| `twse.ts`          | TWSE open data (mis / rwd / openapi) | TW real-time quotes, code search, ETF NAV + premium/discount, T86 三大法人 flows, listed master |
| `tpex.ts`          | TPEx open data (openapi)        | TPEx security master, 3-institution daily flows              |
| `twSecurities.ts`  | TWSE + TPEx                     | rebuilds the `tw_securities` master (`npm run refresh:tw-list`, or `/api/refresh?securities=1`) |
| `refreshAll.ts`    | —                               | `POST /api/refresh` — runs every fetch job once (no background scheduler) |
| `resolve.ts`       | —                               | raw ticker → classified instrument; `ensureWatched()` auto-adds to the watchlist |
| `search.ts`        | local master + TWSE + Yahoo     | `/api/watchlist/search`                                       |
| `normalize.ts`     | —                               | watchlist rows + cached quotes → the one normalized item shape |
| `marketData.ts`    | —                               | quote / ETF-NAV / TW-fundamentals / institutional / always-on refreshers |
| `instrumentMeta.ts`| Yahoo `assetProfile`            | sector / industry / region per ticker (`instrument_meta`)      |
| `etfHoldings.ts`   | Yahoo `topHoldings` + seed      | ETF constituents (`etf_holdings`) for overlap detection        |
| `fx.ts`            | cached always-on FX quotes      | currency → TWD conversion table                                |
| `portfolio.ts`     | —                               | valuation engine: lots → positions → totals, allocation, overlap |
| `dividends.ts`     | —                               | upcoming ex-dates, estimated income, auto-detect               |

No API keys are required for any of the above. `FRED_API_KEY` is only for the
still-stubbed `/api/macro` routes.

**Crumb note:** Yahoo's `quoteSummary` (ETF yield / expense ratio / ex-dividend /
AUM) needs a cookie+crumb handshake. `yahoo.ts` does it best-effort and returns
`null` fields if Yahoo blocks it — never throws.
