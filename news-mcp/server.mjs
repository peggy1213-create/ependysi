#!/usr/bin/env node
/**
 * Investment Dashboard — MCP connector for Claude Desktop.
 *
 * A zero-dependency stdio MCP server that exposes this app's cached news
 * headlines and portfolio holdings as tools Claude can call. It reads the
 * app's SQLite database directly (read-only), so it works whether or not the
 * backend/desktop app is currently running.
 *
 * Configure the DB path with INVESTMENT_DB (defaults to the desktop app's
 * %APPDATA% location). Protocol: JSON-RPC 2.0 over newline-delimited stdio.
 */
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// ── locate the database ──────────────────────────────────────────────────────
const CANDIDATES = [
  process.env.INVESTMENT_DB,
  resolve(homedir(), 'AppData', 'Roaming', 'Investment Dashboard', 'data', 'investment.sqlite'),
  resolve(homedir(), 'Documents', 'Investment', 'backend', 'data', 'investment.sqlite'),
].filter(Boolean);

const DB_PATH = CANDIDATES.find((p) => existsSync(p));

function openDb() {
  if (!DB_PATH) throw new Error(`No investment.sqlite found. Set INVESTMENT_DB. Tried:\n${CANDIDATES.join('\n')}`);
  // readonly so we never interfere with the app's own writes.
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

// ── the tools ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_headlines',
    description:
      "Latest market news headlines cached by the user's Investment Dashboard app " +
      '(Taiwan + global financial RSS feeds). Use these to write a market briefing.',
    inputSchema: {
      type: 'object',
      properties: {
        region: { type: 'string', enum: ['global', 'taiwan'], description: 'Filter by region; omit for both.' },
        limit: { type: 'integer', description: 'Max headlines (default 40, max 80).' },
      },
    },
  },
  {
    name: 'get_holdings',
    description:
      "The user's current portfolio holdings (ticker + total shares) from the " +
      'Investment Dashboard app. Use to tailor a briefing to what they actually own. ' +
      'For richer data (prices, weights, sector/region allocation) use get_portfolio instead.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_portfolio',
    description:
      "The user's full portfolio: each position with shares, average cost, latest price, " +
      "day change %, dividend yield, analyst target, sector/region, TWD market value and " +
      "portfolio weight — plus computed allocation by asset type, region, sector and currency. " +
      'Use for portfolio reviews, concentration/allocation questions, and richer briefings.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_watchlist',
    description:
      "The user's watchlist from the Investment Dashboard: tickers they track (with name, " +
      'market, type, their own tags and group names). These are instruments of interest, ' +
      'not necessarily owned.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_market_flow',
    description:
      'Market-wide Taiwan institutional net buy/sell (三大法人：外資/投信/自營商) in 億 TWD ' +
      'for recent trading days, most recent first. Positive = net buy. Key market-breadth signal.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'Trading days to return (default 5, max 30).' } },
    },
  },
  {
    name: 'get_institutional_flow',
    description:
      'Per-ticker Taiwan institutional net flows (外資/投信/自營商 買賣超) in 萬股 for recent ' +
      'trading days. Use to see who is buying/selling a specific holding or watchlist name.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'TW ticker, e.g. "2330".' },
        days: { type: 'integer', description: 'Trading days to return (default 5, max 30).' },
      },
      required: ['ticker'],
    },
  },
];

// ── small helpers ────────────────────────────────────────────────────────────
const round4 = (v) => (v == null ? null : Math.round(v * 10000) / 10000);
const oku = (v) => (v == null ? null : Math.round((v / 1e8) * 10) / 10); // TWD → 億
const wan = (v) => (v == null ? null : Math.round(v / 10000)); // shares → 萬股
const safeJson = (s) => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** { TWD:1, USD:<rate>, JPY:<rate>, ... } from the cached FX quotes. */
function fxMap(db) {
  const rows = db.prepare("SELECT ticker, price FROM quote_cache WHERE ticker LIKE '%TWD=X'").all();
  const map = { TWD: 1 };
  for (const r of rows) {
    if (r.ticker === 'TWD=X') map.USD = r.price; // Yahoo names USD/TWD just "TWD=X"
    else {
      const m = r.ticker.match(/^([A-Z]+)TWD=X$/);
      if (m) map[m[1]] = r.price;
    }
  }
  return map;
}

function getHeadlines({ region, limit } = {}) {
  const db = openDb();
  try {
    const cap = Math.min(Math.max(Number(limit) || 40, 1), 80);
    const rows =
      region === 'global' || region === 'taiwan'
        ? db
            .prepare(
              'SELECT title, summary, source, region, published_at FROM news_items WHERE region = ? ORDER BY published_at DESC, fetched_at DESC LIMIT ?',
            )
            .all(region, cap)
        : db
            .prepare(
              'SELECT title, summary, source, region, published_at FROM news_items ORDER BY published_at DESC, fetched_at DESC LIMIT ?',
            )
            .all(cap);
    return rows;
  } finally {
    db.close();
  }
}

function getHoldings() {
  const db = openDb();
  try {
    return db
      .prepare(
        'SELECT ticker, SUM(shares) AS shares FROM holding_lots GROUP BY ticker ORDER BY ticker',
      )
      .all();
  } finally {
    db.close();
  }
}

// ── prompts (one-click templates in Claude Desktop) ──────────────────────────
const PROMPTS = [
  {
    name: 'market_briefing',
    title: '📊 Market Briefing',
    description: "Today's market briefing from your app's cached news, tailored to your holdings.",
    arguments: [
      {
        name: 'region',
        description: 'Focus region: taiwan, global, or both (default).',
        required: false,
      },
    ],
  },
  {
    name: 'investment_analysis',
    title: '💡 Buy/Sell Analysis',
    description:
      'Educational buy/sell/hold analysis for a ticker — valuation, institutional flows, ' +
      'news, and scenario-based entry/exit levels vs your cost basis. Not licensed advice.',
    arguments: [
      { name: 'ticker', description: 'Ticker to analyse, e.g. "2330" or "2303".', required: true },
      {
        name: 'question',
        description: 'Your specific question, e.g. "現在可以加碼嗎?" or "該停利嗎?" (optional).',
        required: false,
      },
    ],
  },
];

function buildPrompt(name, args = {}) {
  if (name === 'market_briefing') return marketBriefingPrompt(args);
  if (name === 'investment_analysis') return investmentAnalysisPrompt(args);
  throw new Error(`Unknown prompt: ${name}`);
}

function marketBriefingPrompt(args = {}) {
  const region = args.region && args.region !== 'both' ? args.region : null;
  const scope = region ? `（聚焦 ${region} 市場）` : '';
  const text =
    `請幫我做一份今日市場簡報${scope}。步驟：\n` +
    `1. 呼叫 get_portfolio 取得我的持股、權重與配置（allocation）。\n` +
    `2. 呼叫 get_headlines${region ? `（region="${region}"）` : ''} 取得最新新聞。\n` +
    `3. 呼叫 get_market_flow 取得三大法人全市場買賣超（判斷資金動向）。\n` +
    `4. 用繁體中文寫一份簡報，包含：\n` +
    `   - 「今日最重要的一件事」一句話總結大盤方向。\n` +
    `   - 新聞如何影響我「實際持有的個股」（逐檔對照，優先看權重高的，只列有相關新聞的）。\n` +
    `   - 三大法人資金流向透露的訊號。\n` +
    `   - 總經背景（美債殖利率、匯率、美中關係等）。\n` +
    `   - 配置提醒：若有單一持股或產業過度集中，指出來。\n` +
    `   - 值得觀察的重點。\n` +
    `5. 結尾加上一行免責聲明：以上為新聞整理與觀察，非投資建議。\n` +
    `語氣直接、重點清楚，不要每句都加免責。如需個股法人動向可另用 get_institutional_flow。`;
  return {
    description: PROMPTS[0].description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

function investmentAnalysisPrompt(args = {}) {
  const ticker = (args.ticker ?? '').trim();
  const question = (args.question ?? '').trim();
  const q = question
    ? `我的問題：「${question}」`
    : `我的問題：現在這檔的買賣點如何？該買進、加碼、續抱、還是停利/停損？`;

  const text =
    `請幫我分析 ${ticker || '(請先告訴我代號)'} 這檔標的（教育性分析，非投資建議）。\n` +
    `${q}\n\n` +
    `分析前請先取資料：\n` +
    `1. 呼叫 get_portfolio — 看我是否持有、持有成本(avg_cost)、目前權重、分析師目標價、殖利率。\n` +
    `2. 呼叫 get_institutional_flow（ticker="${ticker}"）— 近期外資/投信/自營商買賣超。\n` +
    `3. 呼叫 get_headlines — 是否有相關新聞或產業消息。\n` +
    `4. 若你有可用的網路搜尋，補上最新股價、均線(20/60/120MA)、近期營收/EPS；沒有就用上面資料並註明缺哪些。\n\n` +
    `然後用繁體中文，依這個結構回答：\n` +
    `- **現況速覽**：股價位置、今日/近期漲跌、相對成本的損益（若持有）。\n` +
    `- **估值**：目前價 vs 分析師目標價的上下空間、殖利率是否合理。\n` +
    `- **籌碼**：三大法人近期是買超還是賣超，訊號為何。\n` +
    `- **催化劑與風險**：新聞、產業、總經面的利多與利空。\n` +
    `- **操作情境（重點）**：依「我的持有成本」給分情境的價位建議——\n` +
    `    · 買進/加碼參考區間；· 停利目標（可分批）；· 停損位；· 建議部位佔投組比例（提醒單一持股別過度集中）。\n` +
    `- **結論**：明確傾向（買進/加碼/續抱/減碼/停利/觀望）＋信心程度（高/中/低）。\n\n` +
    `規則：不保證報酬、不逼我全押；數字缺就說缺、不要編造；` +
    `結尾一行免責：以上為教育性分析與個人觀點，非持牌投資建議，請自行評估風險。`;

  return {
    description: PROMPTS[1].description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

function getPortfolio() {
  const db = openDb();
  try {
    const fx = fxMap(db);
    const lots = db.prepare('SELECT ticker, shares, cost_basis, currency FROM holding_lots').all();

    // Aggregate lots → one row per ticker (share-weighted average cost).
    const byTicker = new Map();
    for (const l of lots) {
      let a = byTicker.get(l.ticker);
      if (!a) {
        a = { ticker: l.ticker, shares: 0, costTotal: 0, currency: l.currency };
        byTicker.set(l.ticker, a);
      }
      a.shares += l.shares;
      a.costTotal += l.shares * l.cost_basis;
    }

    const meta = db
      .prepare(
        `SELECT q.ticker, q.name, q.price, q.change_pct, q.currency AS qcur, q.type,
                q.target_mean_price, q.dividend_yield, m.sector, m.region
           FROM quote_cache q LEFT JOIN instrument_meta m ON m.ticker = q.ticker`,
      )
      .all();
    const mi = new Map(meta.map((r) => [r.ticker, r]));

    const positions = [];
    let totalTwd = 0;
    for (const a of byTicker.values()) {
      const m = mi.get(a.ticker) ?? {};
      const currency = m.qcur ?? a.currency;
      const price = m.price ?? null;
      const rate = fx[currency] ?? null;
      const mv = price != null ? price * a.shares : null;
      const mvTwd = mv != null && rate != null ? mv * rate : null;
      if (mvTwd != null) totalTwd += mvTwd;
      positions.push({
        ticker: a.ticker,
        name: m.name ?? null,
        type: m.type ?? null,
        region: m.region ?? null,
        sector: m.sector ?? null,
        shares: round4(a.shares),
        avg_cost: round4(a.costTotal / a.shares),
        currency,
        price,
        change_pct: m.change_pct ?? null,
        dividend_yield: m.dividend_yield ?? null,
        analyst_target: m.target_mean_price ?? null,
        market_value_twd: mvTwd != null ? Math.round(mvTwd) : null,
      });
    }
    for (const p of positions) {
      p.weight_pct =
        p.market_value_twd != null && totalTwd > 0
          ? Math.round((p.market_value_twd / totalTwd) * 1000) / 10
          : null;
    }
    positions.sort((a, b) => (b.weight_pct ?? 0) - (a.weight_pct ?? 0));

    const allocBy = (key) => {
      const g = {};
      for (const p of positions) {
        if (p.market_value_twd == null) continue;
        const k = p[key] ?? 'Unknown';
        g[k] = (g[k] ?? 0) + p.market_value_twd;
      }
      return Object.entries(g)
        .map(([label, v]) => ({ label, weight_pct: Math.round((v / totalTwd) * 1000) / 10 }))
        .sort((a, b) => b.weight_pct - a.weight_pct);
    };

    return {
      total_value_twd: Math.round(totalTwd),
      fx_rates: fx,
      positions,
      allocation: {
        by_type: allocBy('type'),
        by_region: allocBy('region'),
        by_sector: allocBy('sector'),
        by_currency: allocBy('currency'),
      },
    };
  } finally {
    db.close();
  }
}

function getWatchlist() {
  const db = openDb();
  try {
    const items = db
      .prepare('SELECT id, ticker, name, market, type, user_tags FROM watchlist_items ORDER BY display_order, ticker')
      .all();
    const links = db
      .prepare(
        `SELECT gi.watchlist_item_id AS id, g.group_name
           FROM watchlist_group_items gi JOIN watchlist_groups g ON g.id = gi.group_id`,
      )
      .all();
    const groups = new Map();
    for (const r of links) {
      if (!groups.has(r.id)) groups.set(r.id, []);
      groups.get(r.id).push(r.group_name);
    }
    return items.map((i) => ({
      ticker: i.ticker,
      name: i.name,
      market: i.market,
      type: i.type,
      tags: safeJson(i.user_tags),
      groups: groups.get(i.id) ?? [],
    }));
  } finally {
    db.close();
  }
}

function getMarketFlow({ days } = {}) {
  const db = openDb();
  try {
    const n = Math.min(Math.max(Number(days) || 5, 1), 30);
    const rows = db
      .prepare('SELECT date, foreign_net, trust_net, dealer_net FROM tw_market_flow ORDER BY date DESC LIMIT ?')
      .all(n);
    return rows.map((r) => ({
      date: r.date,
      unit: '億 TWD',
      foreign_net: oku(r.foreign_net),
      trust_net: oku(r.trust_net),
      dealer_net: oku(r.dealer_net),
    }));
  } finally {
    db.close();
  }
}

function getInstitutionalFlow({ ticker, days } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const db = openDb();
  try {
    const n = Math.min(Math.max(Number(days) || 5, 1), 30);
    const rows = db
      .prepare(
        'SELECT date, foreign_net, trust_net, dealer_net FROM tw_institutional WHERE ticker = ? ORDER BY date DESC LIMIT ?',
      )
      .all(String(ticker), n);
    return rows.map((r) => ({
      date: r.date,
      unit: '萬股',
      foreign_net: wan(r.foreign_net),
      trust_net: wan(r.trust_net),
      dealer_net: wan(r.dealer_net),
    }));
  } finally {
    db.close();
  }
}

function callTool(name, args) {
  switch (name) {
    case 'get_headlines':
      return getHeadlines(args ?? {});
    case 'get_holdings':
      return getHoldings();
    case 'get_portfolio':
      return getPortfolio();
    case 'get_watchlist':
      return getWatchlist();
    case 'get_market_flow':
      return getMarketFlow(args ?? {});
    case 'get_institutional_flow':
      return getInstitutionalFlow(args ?? {});
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── JSON-RPC / MCP plumbing ──────────────────────────────────────────────────
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handle(req) {
  const { id, method, params } = req;
  // Notifications (no id) get no response.
  if (id === undefined) return;

  try {
    if (method === 'initialize') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {}, prompts: {} },
          serverInfo: { name: 'investment-news', version: '1.0.0' },
        },
      });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const data = callTool(params?.name, params?.arguments);
      return send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] },
      });
    }
    if (method === 'prompts/list') return send({ jsonrpc: '2.0', id, result: { prompts: PROMPTS } });
    if (method === 'prompts/get') {
      return send({ jsonrpc: '2.0', id, result: buildPrompt(params?.name, params?.arguments) });
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (err) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(err?.message ?? err) } });
  }
}

// Read newline-delimited JSON from stdin.
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      continue;
    }
    handle(req);
  }
});
process.stdin.on('end', () => process.exit(0));
