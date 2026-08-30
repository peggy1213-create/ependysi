import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import { useChatThreads, useChatThread } from '../lib/hooks';
import { Card, RemoveButton } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { ago } from '../lib/format';
import type { ChatMessage, ChatSendResponse } from '../lib/types';

const SUGGESTIONS = [
  '我的持股整體曝險是不是太集中？',
  '這週的新聞對我的觀察清單有什麼影響？',
  '幫我看 2330 目前的評價與分析師目標價',
  'How is my portfolio allocated across regions and sectors?',
];

export default function Chat() {
  const list = useChatThreads();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loaded = useChatThread(activeId);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const aiEnabled = list.data?.ai_enabled ?? loaded.data?.ai_enabled ?? true;
  const threads = list.data?.threads ?? [];

  // Load a thread's history when it's selected (server is the source of truth
  // whenever it isn't mid-send).
  useEffect(() => {
    if (activeId === null) {
      setMessages([]);
      return;
    }
    if (!sending && loaded.data?.thread?.id === activeId) {
      setMessages(loaded.data.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, loaded.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setErr(null);
    setDraft('');
    inputRef.current?.focus();
  };

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || sending) return;
    setSending(true);
    setErr(null);
    setDraft('');

    const temp: ChatMessage = {
      id: -Date.now(),
      thread_id: activeId ?? 0,
      role: 'user',
      content,
      model: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, temp]);

    try {
      const res = await api.post<ChatSendResponse>('/chat', {
        thread_id: activeId ?? undefined,
        content,
      });
      setActiveId(res.thread_id);
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), ...res.messages]);
      invalidate('/chat');
      invalidate(`/chat/threads/${res.thread_id}`);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setDraft(content);
      setErr(e instanceof Error ? e.message : 'Message failed');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const deleteThread = async (id: number) => {
    try {
      await api.del(`/chat/threads/${id}`);
      invalidate('/chat');
      if (activeId === id) newChat();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {/* Thread sidebar */}
      <div className="lg:col-span-1">
        <Card
          title="Conversations"
          pad={false}
          action={
            <button
              onClick={newChat}
              className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-bg"
            >
              + new
            </button>
          }
        >
          <ul className="max-h-[70vh] divide-y divide-border/50 overflow-y-auto">
            {threads.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-fg-muted">No conversations yet.</li>
            )}
            {threads.map((t) => (
              <li
                key={t.id}
                className={clsx(
                  'flex items-start gap-2 px-3 py-2 text-xs',
                  t.id === activeId && 'bg-surface',
                )}
              >
                <button
                  onClick={() => {
                    setActiveId(t.id);
                    setErr(null);
                  }}
                  className={clsx(
                    'flex-1 text-left leading-snug hover:text-fg',
                    t.id === activeId ? 'text-fg' : 'text-fg-secondary',
                  )}
                >
                  <div className="line-clamp-2">{t.title ?? 'Untitled'}</div>
                  <div className="mt-0.5 text-[10px] text-fg-muted">
                    {t.message_count} msg · {ago(t.last_message_at ?? t.updated_at)}
                  </div>
                </button>
                <RemoveButton onConfirm={() => deleteThread(t.id)} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Conversation */}
      <div className="lg:col-span-3">
        <Card title="Investment assistant" className="min-h-[75vh]">
          {!aiEnabled ? (
            <div className="text-xs text-fg-muted">
              Set <code className="text-fg-secondary">GEMINI_API_KEY</code> in{' '}
              <code className="text-fg-secondary">backend/.env</code> (or the data-folder{' '}
              <code className="text-fg-secondary">.env</code> in the desktop app) and restart to
              enable the assistant.
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {messages.length === 0 && !sending && (
                  <div className="pt-2">
                    <p className="text-sm text-fg-secondary">
                      Ask about your portfolio, watchlist, or the market. Answers are grounded in
                      your live holdings and cached data — educational context, not buy/sell advice.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded border border-border px-2.5 py-1 text-left text-xs text-fg-secondary hover:border-accent hover:text-fg"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={clsx(
                        'rounded-lg px-3 py-2',
                        m.role === 'user'
                          ? 'max-w-[85%] whitespace-pre-wrap bg-accent/15 text-sm text-fg'
                          : 'w-full bg-surface/60',
                      )}
                    >
                      {m.role === 'user' ? m.content : <Markdown text={m.content} />}
                    </div>
                  </div>
                ))}

                {sending && (
                  <div className="flex items-center gap-2 p-2 text-xs text-fg-muted">
                    <span className="h-3 w-3 animate-spin rounded-full border border-border border-t-accent" />
                    thinking…
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {err && (
                <div className="mt-2 rounded border border-bearish/30 bg-bearish/10 p-2 text-xs text-bearish">
                  {err}
                </div>
              )}

              <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder="Ask a question…  (Enter to send, Shift+Enter for a new line)"
                  className="max-h-40 flex-1 resize-y rounded border border-border bg-bg px-2.5 py-2 text-sm text-fg outline-none placeholder:text-fg-muted focus:border-accent"
                />
                <button
                  onClick={() => void send()}
                  disabled={sending || !draft.trim()}
                  className="rounded bg-accent px-3 py-2 text-xs font-medium text-bg disabled:opacity-40"
                >
                  send
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
