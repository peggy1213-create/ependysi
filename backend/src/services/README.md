# services/

Data-source adapters and refresh orchestration. Route handlers and scheduled
jobs call these; nothing here writes HTTP responses.

| file               | source                          | covers                                                        |
| ------------------ | ------------------------------- | ------------------------------------------------------------- |
| `yahoo.ts`         | Yahoo Finance (unofficial)      | US / index / FX / commodity / crypto quotes; ticker search; ETF fundamentals (crumb-gated) |
| `twse.ts`          | TWSE open data (mis / rwd / openapi) | TW real-time quotes, code search, ETF NAV + premium/discount, T86 三大法人 flows, listed master |
| `tpex.ts`          | TPEx open data (openapi)        | TPEx security master, 3-institution daily flows              |
| `twSecurities.ts`  | TWSE + TPEx                     | rebuilds the `tw_securities` master (daily cron / `npm run refresh:tw-list`) |
| `resolve.ts`       | —                               | raw ticker → `{ ticker, name, market, type }` for adding to the watchlist |
| `search.ts`        | local master + TWSE + Yahoo     | `/api/watchlist/search`                                       |
| `normalize.ts`     | —                               | watchlist rows + cached quotes → the one normalized item shape |
| `marketData.ts`    | —                               | refresh orchestration: fetch → upsert into SQLite            |

No API keys are required for any of the above. `FRED_API_KEY` is only for the
still-stubbed `/api/macro` routes.

**Crumb note:** Yahoo's `quoteSummary` (ETF yield / expense ratio / ex-dividend /
AUM) needs a cookie+crumb handshake. `yahoo.ts` does it best-effort and returns
`null` fields if Yahoo blocks it — never throws.
