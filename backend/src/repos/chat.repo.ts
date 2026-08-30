/** AI investment-chat threads + messages. */
import { all, get, run } from '../db/index.js';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: number;
  thread_id: number;
  role: ChatRole;
  content: string;
  model: string | null;
  created_at: string;
}

export interface ChatThread {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
}

/** List row: thread + a couple of cheap aggregates for the sidebar. */
export interface ChatThreadMeta extends ChatThread {
  message_count: number;
  last_message_at: string | null;
}

export function listThreads(limit = 60): ChatThreadMeta[] {
  return all<ChatThreadMeta>(
    `SELECT t.id, t.title, t.created_at, t.updated_at,
            COUNT(m.id)       AS message_count,
            MAX(m.created_at) AS last_message_at
       FROM chat_threads t
       LEFT JOIN chat_messages m ON m.thread_id = t.id
      GROUP BY t.id
      ORDER BY t.updated_at DESC
      LIMIT ?`,
    limit,
  );
}

export function getThread(id: number): ChatThread | undefined {
  return get<ChatThread>('SELECT * FROM chat_threads WHERE id = ?', id);
}

export function createThread(title: string | null = null): ChatThread {
  const now = new Date().toISOString();
  const info = run(
    'INSERT INTO chat_threads (title, created_at, updated_at) VALUES (?, ?, ?)',
    title,
    now,
    now,
  );
  return getThread(Number(info.lastInsertRowid))!;
}

export function deleteThread(id: number): boolean {
  return run('DELETE FROM chat_threads WHERE id = ?', id).changes > 0;
}

function touchThread(id: number): void {
  run('UPDATE chat_threads SET updated_at = ? WHERE id = ?', new Date().toISOString(), id);
}

export function listMessages(threadId: number): ChatMessage[] {
  return all<ChatMessage>('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY id', threadId);
}

export function addMessage(m: {
  thread_id: number;
  role: ChatRole;
  content: string;
  model?: string | null;
}): ChatMessage {
  const info = run(
    'INSERT INTO chat_messages (thread_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?)',
    m.thread_id,
    m.role,
    m.content,
    m.model ?? null,
    new Date().toISOString(),
  );
  touchThread(m.thread_id);
  return get<ChatMessage>('SELECT * FROM chat_messages WHERE id = ?', Number(info.lastInsertRowid))!;
}

/** Drop conversations untouched for `days` (keeps the table small). */
export function pruneThreads(days = 120): void {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  run('DELETE FROM chat_threads WHERE updated_at < ?', cutoff);
}
