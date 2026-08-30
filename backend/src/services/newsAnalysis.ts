/**
 * AI news analysis (News tab). Sends recent headlines + the user's watchlist and
 * portfolio to Claude and asks for an informational market digest.
 *
 * Framed as educational market commentary, not personalised financial advice —
 * the prompt forbids specific buy/sell calls and price targets and requires a
 * disclaimer. Needs ANTHROPIC_API_KEY.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config.js';
import { listNews, saveAnalysis, latestAnalysis } from '../repos/news.repo.js';
import type { NewsAnalysis } from '../repos/news.repo.js';
import { listItems } from '../repos/watchlist.repo.js';
import { computePortfolio } from './portfolio.js';

export class NoApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set — add it to backend/.env to use AI analysis.');
    this.name = 'NoApiKeyError';
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

export async function analyzeNews(): Promise<NewsAnalysis> {
  if (!env.keys.anthropic) throw new NoApiKeyError();

  const client = new Anthropic({ apiKey: env.keys.anthropic });
  const { text, headlineCount } = buildUserMessage();

  const response = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 4000,
    // adaptive thinking is on by default for claude-opus-5 / sonnet-5
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
  });

  const content = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!content) throw new Error('Claude returned no text content.');

  return saveAnalysis({ model: response.model, headline_count: headlineCount, content });
}

export { latestAnalysis };
