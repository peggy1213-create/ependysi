/**
 * AI news analysis (News tab). Sends recent headlines + the user's watchlist and
 * portfolio to Gemini and asks for an informational market digest.
 *
 * Framed as educational market commentary, not personalised financial advice —
 * the prompt forbids specific buy/sell calls and price targets and requires a
 * disclaimer. Needs GEMINI_API_KEY (Google AI Studio).
 */
import { env } from '../config.js';
import { listNews, saveAnalysis, latestAnalysis } from '../repos/news.repo.js';
import type { NewsAnalysis } from '../repos/news.repo.js';
import { listItems } from '../repos/watchlist.repo.js';
import { computePortfolio } from './portfolio.js';

export class NoApiKeyError extends Error {
  constructor() {
    super('GEMINI_API_KEY is not set — add it to backend/.env to use AI analysis.');
    this.name = 'NoApiKeyError';
  }
}

/** Thrown when the Gemini REST API responds with a non-2xx status. */
export class GeminiApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Gemini API error (${status}): ${body}`);
    this.name = 'GeminiApiError';
    this.status = status;
  }
}

const SYSTEM = `You are a markets news analyst writing a briefing for one retail investor based in Taiwan (base currency TWD). You are given recent headlines and the investor's watchlist and current holdings.

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

function buildUserMessage(): { text: string; headlineCount: number } {
  const global = listNews('global', 28);
  const taiwan = listNews('taiwan', 20);
  const headlineCount = global.length + taiwan.length;

  const fmt = (n: { source: string | null; published_at: string | null; title: string; summary: string | null }) =>
    `- [${n.source ?? '?'}${n.published_at ? ', ' + n.published_at.slice(0, 16).replace('T', ' ') : ''}] ${n.title}${n.summary ? ` — ${n.summary}` : ''}`;

  const watch = listItems();
  const watchLines = watch
    .map((w) => `${w.ticker}${w.name ? ` (${w.name})` : ''} · ${w.market}/${w.type}`)
    .join('\n');

  let holdingsLines = '(none)';
  try {
    const pf = computePortfolio();
    if (pf.positions.length) {
      holdingsLines = pf.positions
        .map((p) => `${p.ticker}${p.name ? ` (${p.name})` : ''} — ${p.weight_pct ?? 0}% of portfolio`)
        .join('\n');
    }
  } catch {
    /* portfolio optional */
  }

  const text = [
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
  ].join('\n');

  return { text, headlineCount };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export async function analyzeNews(): Promise<NewsAnalysis> {
  if (!env.keys.gemini) throw new NoApiKeyError();

  const { text, headlineCount } = buildUserMessage();
  const model = env.geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.keys.gemini,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      // Headroom: the briefing is ~400 words but newer models spend tokens on
      // internal reasoning before the visible answer.
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
    }),
  });

  if (!res.ok) throw new GeminiApiError(res.status, (await res.text()).slice(0, 500));

  const data = (await res.json()) as GeminiResponse;
  const content = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!content) throw new Error('Gemini returned no text content.');

  return saveAnalysis({ model, headline_count: headlineCount, content });
}

export { latestAnalysis };
