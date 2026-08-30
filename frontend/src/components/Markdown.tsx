import type { ReactNode } from 'react';

/** Minimal Markdown → JSX for AI output: ##/### headings, - bullets, **bold**, *italic*, paragraphs. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul${blocks.length}`} className="my-2 space-y-1 pl-4">
        {list.map((li, i) => (
          <li key={i} className="list-disc text-sm leading-relaxed text-fg-secondary marker:text-fg-muted">
            {inline(li)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushPara = () => {
    if (!para.join(' ').trim()) {
      para = [];
      return;
    }
    blocks.push(
      <p key={`p${blocks.length}`} className="my-2 text-sm leading-relaxed text-fg-secondary">
        {inline(para.join(' '))}
      </p>,
    );
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      flushPara();
      const level = h[1]?.length ?? 3;
      blocks.push(
        <h3
          key={`h${blocks.length}`}
          className={
            level <= 2
              ? 'mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-accent first:mt-0'
              : 'mb-1 mt-3 text-sm font-semibold text-fg'
          }
        >
          {inline(h[2] ?? '')}
        </h3>,
      );
    } else if (bullet) {
      flushPara();
      list.push(bullet[1] ?? '');
    } else if (line.trim() === '') {
      flushList();
      flushPara();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();

  return <div className="max-w-prose">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  // split on **bold** and *italic*
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return (
        <strong key={i} className="font-semibold text-fg">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith('*') && p.endsWith('*'))
      return (
        <em key={i} className="text-fg-muted">
          {p.slice(1, -1)}
        </em>
      );
    return <span key={i}>{p}</span>;
  });
}
