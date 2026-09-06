/**
 * AI news analysis (News tab). Sends recent headlines + the user's watchlist and
 * portfolio to Gemini and asks for an informational market digest.
 *
 * Two modes:
 *   - 'standard' — a tight ~400-word market briefing (the original).
 *   - 'deep'     — an in-depth research note: per-position bull/bear framing,
 *                  valuation context, and analyst-consensus figures retrieved
 *                  from Yahoo Finance and reported as attributed third-party data.
 *
 * Both modes are framed as educational market commentary, not personalised
 * financial advice — the prompts forbid the model giving its own buy/sell/hold
 * calls or its own price targets, and require a disclaimer. Needs GEMINI_API_KEY
 * (Google AI Studio).
 */
import { env } from '../config.js';
import { listNews, saveAnalysis, latestAnalysis } from '../repos/news.repo.js';
import type { NewsAnalysis, AnalysisMode } from '../repos/news.repo.js';
import { listItems } from '../repos/watchlist.repo.js';
import { toYahooSymbol } from '../lib/ticker.js';
import { fetchTickerFundamentals } from './yahoo.js';
import type { TickerFundamentals } from './yahoo.js';
import { computePortfolio } from './portfolio.js';
import { mapPool } from '../lib/http.js';

export class NoApiKeyError extends Error {
  constructor() {
    super('GEMINI_API_KEY is not set — add it to backend/.env to use AI analysis.');
    this.name = 'NoApiKeyError';
  }
}

/** Thrown when the Gemini REST API responds with a non-2xx status. */
export class GeminiApiError extends Error {
  status: number;
  /** Short, plain-language explanation — safe to show directly in the UI. */
  friendly: string;
  constructor(status: number, body: string) {
    super(`Gemini API error (${status}): ${body}`);
    this.name = 'GeminiApiError';
    this.status = status;
    this.friendly = friendlyGeminiMessage(status);
  }
}

function friendlyGeminiMessage(status: number): string {
  if (status === 429) {
    return "The AI service is over its usage quota right now (Gemini's free-tier limit). Wait a minute and try again. If it keeps failing, the daily limit is likely reached — that resets at midnight US Pacific time. Turning off Web search uses less quota.";
  }
  if (status === 401 || status === 403) {
    return 'The Gemini API key was rejected. Check GEMINI_API_KEY in your .env and that the key is still active.';
  }
  if (status === 503) {
    return 'The AI service is temporarily overloaded. Try again in a moment.';
  }
  if (status >= 500) {
    return 'The AI service had a server error. Try again in a moment.';
  }
  return `The AI service returned an error (${status}). Try again shortly.`;
}

const SYSTEM_STANDARD = `You are a markets news analyst writing a briefing for one retail investor based in Taiwan (base currency TWD). You are given recent headlines and the investor's watchlist and current holdings.

Write a concise briefing in Markdown with these sections:

## Top stories
3–6 bullets. For each: what happened, and why it matters for markets. Prefer items with the clearest market impact (rates, inflation, big earnings, policy, geopolitics, semiconductors, Taiwan-specific flows).

## Themes in focus
2–4 short bullets on sectors, regions, or macro themes running through today's news.

## Your watchlist & holdings
For the tickers in the watchlist/holdings that today's news actually touches, one line each: ticker — how the news is relevant. Skip tickers with no relevant news. If none, say so.

## Things to watch
2–4 bullets: upcoming events, data, or risks to keep an eye on.

Rules:
- This is general information and education, NOT personalised financial advice. Do not give specific buy / sell / hold recommendations or price targets. Frame everything as considerations and things to watch.
- Be balanced — note both upside and risk. Flag uncertainty; don't overstate.
- Keep it tight: aim for ~400 words. No preamble.
- End with exactly this line in italics: *Not financial advice. AI-generated from public news headlines — verify anything important yourself.*`;

const SYSTEM_DEEP = `You are a markets analyst writing an in-depth research note for one retail investor in Taiwan (base currency TWD). You are given recent headlines, the investor's watchlist and holdings, and a block of fundamental and analyst-consensus data that was retrieved from Yahoo Finance.

Write in Markdown:

## Market backdrop
3–5 bullets: the macro / news picture right now and the key cross-currents.

## Position-by-position
For EACH watchlist ticker and holding that today's news OR the data block gives you something real to say about, add a subsection:
### <ticker> — <name>
- **News read:** how current headlines touch this name (skip the line if none).
- **Where the data sits:** current price vs its 52-week range; trailing/forward P/E and P/B, with one line of plain-language context.
- **Analyst consensus (per Yahoo Finance):** the reported recommendation, the number of analysts, and the mean / low / high target. Quote these as retrieved figures, explicitly attributed to Yahoo Finance — they are third-party opinions, not your view. If the data block has no coverage for this ticker, write "No analyst-consensus data available."
- **Bull case / Bear case:** 1–2 bullets each, balanced.
- **Key uncertainties:** what would change the picture.
Skip any position with nothing substantive to say.

## Scenarios
2–3 short "if X, then the read for these names is Y" paragraphs tied to upcoming catalysts (data releases, earnings, policy meetings).

## Calendar & risks
Upcoming events, data, and risks over the next few weeks.

Rules:
- This is research and education, NOT personalised financial advice. Do NOT give buy / sell / hold recommendations of your own and do NOT invent your own price targets. You MAY report third-party analyst ratings and targets that appear in the supplied data block, clearly attributed to Yahoo Finance.
- Clearly distinguish reported facts (from the data block) from your own interpretation.
- Do not fabricate figures. If a number is not in the data block, do not state it.
- Be balanced — every name gets both a bull and a bear case. Flag uncertainty; don't overstate.
- Aim for ~150–200 words per position. No preamble.
- End with exactly this line in italics: *Not financial advice. AI-generated from public news and third-party data — verify anything important yourself. Analyst ratings and price targets shown are third-party opinions collected by Yahoo Finance, not recommendations from this app.*`;

interface TickerRef {
  ticker: string;
  name: string | null;
  yahoo: string;
}

/** Distinct watchlist + holding tickers, with their Yahoo symbols. */
function collectTickers(): { refs: TickerRef[]; watchLines: string; holdingsLines: string } {
  const seen = new Map<string, TickerRef>();

  const watch = listItems();
  const watchLines = watch
    .map((w) => {
      seen.set(w.ticker, { ticker: w.ticker, name: w.name, yahoo: toYahooSymbol(w.ticker, w.market) });
      return `${w.ticker}${w.name ? ` (${w.name})` : ''} · ${w.market}/${w.type}`;
    })
    .join('\n');

  let holdingsLines = '(none)';
  try {
    const pf = computePortfolio();
    if (pf.positions.length) {
      holdingsLines = pf.positions
        .map((p) => {
          if (!seen.has(p.ticker))
            seen.set(p.ticker, {
              ticker: p.ticker,
              name: p.name,
              yahoo: toYahooSymbol(p.ticker, p.market),
            });
          return `${p.ticker}${p.name ? ` (${p.name})` : ''} — ${p.weight_pct ?? 0}% of portfolio`;
        })
        .join('\n');
    }
  } catch {
    /* portfolio optional */
  }

  return { refs: [...seen.values()], watchLines, holdingsLines };
}

const n1 = (v: number | null, dp = 2): string => (v == null ? '—' : v.toFixed(dp));

/** Human-readable fundamentals block for the deep-dive prompt. */
function fmtFundamentals(ref: TickerRef, f: TickerFundamentals): string {
  const cur = f.currency ? ` ${f.currency}` : '';
  const range =
    f.fiftyTwoWeekLow != null && f.fiftyTwoWeekHigh != null
      ? `${n1(f.fiftyTwoWeekLow)}–${n1(f.fiftyTwoWeekHigh)}`
      : '—';
  const analyst =
    f.analystRecommendation || f.targetMean != null
      ? `recommendation=${f.analystRecommendation ?? '—'}` +
        `, analysts=${f.analystCount ?? '—'}` +
        `, target mean/low/high=${n1(f.targetMean)}/${n1(f.targetLow)}/${n1(f.targetHigh)}${cur}`
      : 'no analyst-consensus data';
  return [
    `- ${ref.ticker}${ref.name ? ` (${ref.name})` : ''} [${ref.yahoo}]`,
    `    price=${n1(f.currentPrice)}${cur}, 52w range=${range}`,
    `    trailing P/E=${n1(f.trailingPE)}, forward P/E=${n1(f.forwardPE)}, P/B=${n1(f.priceToBook)}`,
    `    analyst (Yahoo Finance): ${analyst}`,
  ].join('\n');
}

async function buildFundamentalsBlock(refs: TickerRef[]): Promise<string> {
  const capped = refs.slice(0, 20);
  const settled = await mapPool(capped, 5, (r) => fetchTickerFundamentals(r.yahoo));
  const lines: string[] = [];
  settled.forEach((res, i) => {
    const ref = capped[i]!;
    if (res.status === 'fulfilled' && res.value) lines.push(fmtFundamentals(ref, res.value));
  });
  if (!lines.length) return '(no fundamental data could be retrieved)';
  return lines.join('\n');
}

async function buildUserMessage(mode: AnalysisMode): Promise<{ text: string; headlineCount: number }> {
  const global = listNews('global', 28);
  const taiwan = listNews('taiwan', 20);
  const headlineCount = global.length + taiwan.length;

  const fmt = (n: { source: string | null; published_at: string | null; title: string; summary: string | null }) =>
    `- [${n.source ?? '?'}${n.published_at ? ', ' + n.published_at.slice(0, 16).replace('T', ' ') : ''}] ${n.title}${n.summary ? ` — ${n.summary}` : ''}`;

  const { refs, watchLines, holdingsLines } = collectTickers();

  const parts = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    '',
    '## GLOBAL HEADLINES',
    global.map(fmt).join('\n') || '(none)',
    '',
    '## TAIWAN HEADLINES',
    taiwan.map(fmt).join('\n') || '(none)',
    '',
    '## WATCHLIST',
    watchLines || '(empty)',
    '',
    '## CURRENT HOLDINGS',
    holdingsLines,
  ];

  if (mode === 'deep') {
    parts.push(
      '',
      `## FUNDAMENTALS & ANALYST DATA (retrieved from Yahoo Finance, ${new Date()
        .toISOString()
        .slice(0, 10)})`,
      'Figures below are third-party data as reported by Yahoo Finance. Analyst recommendation and targets are consensus of external analysts, not advice from this app. Fields may be missing, especially for Taiwan-listed tickers.',
      '',
      await buildFundamentalsBlock(refs),
    );
  }

  return { text: parts.join('\n'), headlineCount };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export async function analyzeNews(mode: AnalysisMode = 'standard'): Promise<NewsAnalysis> {
  if (!env.keys.gemini) throw new NoApiKeyError();

  const { text, headlineCount } = await buildUserMessage(mode);
  const system = mode === 'deep' ? SYSTEM_DEEP : SYSTEM_STANDARD;
  const model = mode === 'deep' ? env.geminiDeepModel : env.geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.keys.gemini,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      // Headroom: newer models spend tokens on internal reasoning before the
      // visible answer. The deep note is also several times longer.
      generationConfig: {
        maxOutputTokens: mode === 'deep' ? 16384 : 8192,
        temperature: mode === 'deep' ? 0.5 : 0.7,
      },
    }),
  });

  if (!res.ok) throw new GeminiApiError(res.status, (await res.text()).slice(0, 500));

  const data = (await res.json()) as GeminiResponse;
  const content = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!content) throw new Error('Gemini returned no text content.');

  return saveAnalysis({ mode, model, headline_count: headlineCount, content });
}

export { latestAnalysis };
