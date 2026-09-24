# Investment News MCP connector

A zero-dependency [MCP](https://modelcontextprotocol.io) server that lets **regular Claude
Desktop chat** read this app's cached data and write market briefings — without the in-app
Gemini chat. It reads the app's SQLite database directly (read-only), so it works whether or
not the backend/desktop app is running.

## Tools

| Tool | Returns |
|------|---------|
| `get_headlines(region?, limit?)` | Latest cached news headlines (Taiwan + global). |
| `get_holdings()` | Holdings as ticker + total shares (lightweight). |
| `get_portfolio()` | Full positions (price, weight, yield, analyst target, sector/region, TWD value) + computed allocation by type/region/sector/currency. |
| `get_watchlist()` | Watchlist items with tags and group names. |
| `get_market_flow(days?)` | Market-wide 三大法人 net buy/sell in 億 TWD. |
| `get_institutional_flow(ticker, days?)` | Per-ticker 外資/投信/自營商 flows in 萬股. |

## Prompt

`market_briefing(region?)` — a one-click "📊 Market Briefing" template that calls the tools
and writes a 繁體中文 briefing tailored to the user's holdings.

## Setup (Claude Desktop)

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "investment-news": {
      "command": "node",
      "args": ["C:\\Users\\Peich\\Documents\\Investment\\news-mcp\\server.mjs"]
    }
  }
}
```

Then fully quit and reopen Claude Desktop. Requires Node 22+ (`node:sqlite`).

## Database location

Resolved in this order:

1. `INVESTMENT_DB` environment variable (set via an `"env"` block in the config), else
2. `%APPDATA%\Investment Dashboard\data\investment.sqlite` (packaged desktop app), else
3. `backend/data/investment.sqlite` (dev).
