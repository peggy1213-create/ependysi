/**
 * Investment Q&A assistant (Chat tab). A multi-turn chat over Gemini, grounded
 * in a CONTEXT block rebuilt from live dashboard data on every turn
 * (see chatContext.ts).
 *
 * Framed as general market education, NOT personalised financial advice: the
 * system prompt forbids the model issuing its own buy / sell / hold / trim
 * calls, its own price targets, or "this signal means you should act" claims.
 * It may relay third-party analyst data, attributed to Yahoo Finance. Needs
 * GEMINI_API_KEY. Reuses the News tab's error types.
 */
import { env } from '../config.js';
import { NoApiKeyError, GeminiApiError } from './newsAnalysis.js';
import { buildChatContext } from './chatContext.js';

export { NoApiKeyError, GeminiApiError };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_CHAT = `You are an investment research assistant built into a personal dashboard used by one retail investor in Taiwan (base currency TWD). You answer their questions about markets, their portfolio, and their watchlist.

Every turn you receive a CONTEXT block with the investor's live holdings (cost basis, weight, P&L), allocation, watchlist, the market backdrop, recent headlines, and — for any ticker the question names — deeper valuation / analyst / institutional-flow data. Ground your answers in it. Quote their actual numbers.

How to answer:
- Reply in the language the user writes in (中文 or English). Use Markdown: ## / ### headings, - bullets, **bold**.
- Explain mechanics and trade-offs neutrally. When they ask "should I sell / take profit / cut this?", do NOT answer yes or no. Lay out both sides — what taking profit locks in, what staying exposed keeps and risks, how it interacts with their weight and cost basis — then the concrete signals they could watch, then note the decision turns on their own original thesis and risk tolerance.
- You MAY report third-party analyst ratings and price targets that appear in the CONTEXT, always attributed to Yahoo Finance as external opinions — never restated as your own view.
- Be specific and quantitative about their data; be balanced and hedged on judgement. Flag uncertainty. Never invent numbers that aren't in the CONTEXT.

Hard rules — never break these:
- This is general information and education, NOT personalised financial advice.
- Do NOT tell the user to buy, sell, hold, add, trim, reduce, or rebalance. Do NOT recommend position sizes or staged-exit plans ("sell a third", "分批出場一半").
- Do NOT give your own price targets or predict where a price will go.
- Do NOT say a signal or indicator "means" they should act — describe what it generally indicates and let them decide.
- End every reply with the disclaimer on its own line, matching the user's language:
  中文: *以上為一般資訊與教育內容，非個人化投資建議。AI 依公開資料生成，重要決策請自行查證或諮詢合格顧問。*
  English: *General information and education, not personalised financial advice. AI-generated from public data — verify anything important or consult a licensed adviser.*`;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** One assistant turn. `history` is the prior conversation (no system turn). */
export async function runChat(
  history: ChatTurn[],
  userMessage: string,
): Promise<{ content: string; model: string }> {
  if (!env.keys.gemini) throw new NoApiKeyError();

  const context = await buildChatContext(userMessage);
  const model = env.geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Gemini turn roles are 'user' | 'model'. Keep the last dozen turns.
  const priorTurns = history.slice(-12).map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }));

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const contents = [
    ...priorTurns,
    {
      role: 'user',
      parts: [
        {
          text: `# CONTEXT (live dashboard data, ${stamp})\n\n${context}\n\n---\n\n# QUESTION\n\n${userMessage}`,
        },
      ],
    },
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.keys.gemini },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_CHAT }] },
      contents,
      generationConfig: { maxOutputTokens: 8192, temperature: 0.6 },
    }),
  });

  if (!res.ok) throw new GeminiApiError(res.status, (await res.text()).slice(0, 500));

  const data = (await res.json()) as GeminiResponse;
  const content = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!content) throw new Error('Gemini returned no text content.');
  return { content, model };
}
