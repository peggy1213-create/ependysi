import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config.js';
import * as repo from '../repos/chat.repo.js';
import { runChat, NoApiKeyError, GeminiApiError } from '../services/chat.js';
import type { ChatTurn } from '../services/chat.js';

export const chatRouter = Router();

const MAX_MESSAGE = 4000;

/** Short thread title from the first user message. */
function titleFrom(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

// GET /api/chat  — thread list for the sidebar
chatRouter.get('/', (_req, res) => {
  res.json({ threads: repo.listThreads(), ai_enabled: Boolean(env.keys.gemini) });
});

// GET /api/chat/threads/:id  — one conversation with its messages
chatRouter.get('/threads/:id', (req, res) => {
  const id = Number(req.params.id);
  const thread = repo.getThread(id);
  if (!thread) return res.status(404).json({ error: 'not_found' });
  res.json({ thread, messages: repo.listMessages(id), ai_enabled: Boolean(env.keys.gemini) });
});

// DELETE /api/chat/threads/:id
chatRouter.delete('/threads/:id', (req, res) => {
  res.json({ deleted: repo.deleteThread(Number(req.params.id)) });
});

const sendBody = z.object({
  thread_id: z.number().int().positive().nullish(),
  content: z.string().trim().min(1).max(MAX_MESSAGE),
  web_search: z.boolean().optional(),
});

// POST /api/chat  — body { thread_id?, content }
//   Sends a message (creating a thread if none), returns the user + assistant
//   messages. The thread is only persisted once the model replies successfully.
chatRouter.post('/', async (req, res, next) => {
  const parsed = sendBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
  }
  const { thread_id, content, web_search } = parsed.data;

  try {
    let thread = thread_id ? repo.getThread(thread_id) : undefined;
    if (thread_id && !thread) return res.status(404).json({ error: 'not_found' });

    const history: ChatTurn[] = thread
      ? repo.listMessages(thread.id).map((m) => ({ role: m.role, content: m.content }))
      : [];

    const { content: reply, model } = await runChat(history, content, {
      webSearch: web_search ?? false,
    });

    if (!thread) thread = repo.createThread(titleFrom(content));
    const userMsg = repo.addMessage({ thread_id: thread.id, role: 'user', content });
    const assistantMsg = repo.addMessage({
      thread_id: thread.id,
      role: 'assistant',
      content: reply,
      model,
    });

    res.json({ thread_id: thread.id, messages: [userMsg, assistantMsg] });
  } catch (err) {
    if (err instanceof NoApiKeyError) {
      return res.status(400).json({ error: 'no_api_key', message: err.message });
    }
    if (err instanceof GeminiApiError) {
      return res.status(502).json({
        error: 'gemini_error',
        status: err.status,
        message: err.friendly,
        detail: err.message,
      });
    }
    next(err);
  }
});
