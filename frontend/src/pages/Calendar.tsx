import { useMemo } from 'react';
import { useDividends, useWatchlist } from '../lib/hooks';
import { Async, Badge, Card } from '../components/ui';
import { daysUntil } from '../lib/format';
import { TW_HOLIDAYS } from '../data/twHolidays';

interface Ev {
  date: string;
  kind: 'exdiv' | 'holiday';
  title: string;
  detail?: string;
}

export default function Calendar() {
  const divs = useDividends();
  const wl = useWatchlist();

  const events = useMemo<Ev[]>(() => {
    const list: Ev[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const u of divs.data?.upcoming ?? []) {
      list.push({ date: u.ex_date, kind: 'exdiv', title: `${u.ticker} ex-dividend`, detail: u.name ?? undefined });
    }
    // watched ETFs with an ex-date not already covered by holdings
    for (const it of wl.data?.items ?? []) {
      if (it.next_ex_dividend_date && it.next_ex_dividend_date >= today) {
        if (!list.some((e) => e.kind === 'exdiv' && e.title.startsWith(it.ticker))) {
          list.push({
            date: it.next_ex_dividend_date,
            kind: 'exdiv',
            title: `${it.ticker} ex-dividend`,
            detail: it.name ?? undefined,
          });
        }
      }
    }
    for (const h of TW_HOLIDAYS) {
      if (h.date >= today) list.push({ date: h.date, kind: 'holiday', title: h.name, detail: 'TWSE closed' });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [divs.data, wl.data]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Upcoming events" className="lg:col-span-2">
          <Async q={divs}>
            {() =>
              events.length ? (
                <ul className="space-y-1.5">
                  {events.map((e, i) => {
                    const dl = daysUntil(e.date);
                    return (
                      <li key={i} className="flex items-center gap-3 border-b border-border/40 pb-1.5 text-sm last:border-0">
                        <span className="w-24 shrink-0 tnum text-fg-muted">{e.date}</span>
                        <Badge tone={e.kind === 'holiday' ? 'muted' : 'highlight'}>
                          {e.kind === 'holiday' ? 'HOLIDAY' : 'EX-DIV'}
                        </Badge>
                        <span className="text-fg-secondary">{e.title}</span>
                        {e.detail && <span className="truncate text-xs text-fg-muted">{e.detail}</span>}
                        {dl != null && <span className="ml-auto text-xs text-fg-muted">{dl}d</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-xs text-fg-muted">Nothing scheduled from available data.</div>
              )
            }
          </Async>
        </Card>

        <Card title="Not yet wired">
          <ul className="space-y-2 text-xs text-fg-muted">
            <li>• Economic releases (CPI, GDP, rate decisions)</li>
            <li>• FOMC / CBC / ECB meeting dates</li>
            <li>• Earnings dates for watched US stocks</li>
            <li className="pt-1 text-fg-secondary">
              Needs <code>/api/calendar</code> + an events provider.
            </li>
          </ul>
        </Card>
      </div>

      <Card title="TWSE holidays 2026 (approximate)">
        <div className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {TW_HOLIDAYS.map((h) => (
            <div key={h.date} className="flex justify-between border-b border-border/30 py-1">
              <span className="text-fg-secondary">{h.name}</span>
              <span className="tnum text-fg-muted">{h.date.slice(5)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-fg-muted">Verify against the official TWSE calendar.</p>
      </Card>
    </div>
  );
}
