import clsx from 'clsx';
import { compact, num } from '../lib/format';

const C = {
  bull: '#f5a623',
  bear: '#b07ae6',
  neutral: '#7a7068',
  border: '#2e2824',
  info: '#6bbfc9',
  accent: '#e8845a',
  highlight: '#ffd97a',
};

/** Directional bar series, e.g. 5-day foreign net flow. Values in any unit. */
export function FlowBars({
  values,
  labels,
  height = 90,
  unit = '',
}: {
  values: (number | null)[];
  labels?: string[];
  height?: number;
  unit?: string;
}) {
  const nums = values.map((v) => v ?? 0);
  const max = Math.max(1, ...nums.map((v) => Math.abs(v)));
  const w = 100 / Math.max(1, values.length);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <line x1="0" y1={height / 2} x2="100" y2={height / 2} stroke={C.border} strokeWidth="0.5" />
        {nums.map((v, i) => {
          const h = (Math.abs(v) / max) * (height / 2 - 4);
          const x = i * w + w * 0.2;
          const bw = w * 0.6;
          const y = v >= 0 ? height / 2 - h : height / 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={bw}
              height={Math.max(0.5, h)}
              fill={v >= 0 ? C.bull : C.bear}
              opacity={0.85}
            />
          );
        })}
      </svg>
      {labels && (
        <div className="mt-1 flex text-[9px] text-fg-muted">
          {labels.map((l, i) => (
            <span key={i} className="flex-1 text-center">
              {l}
            </span>
          ))}
        </div>
      )}
      {unit && <div className="mt-0.5 text-[9px] text-fg-muted">{unit}</div>}
    </div>
  );
}

export function Sparkline({ values, color = C.accent, height = 32 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${height - ((v - min) / span) * height}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Semicircular gauge. `value` in [min,max]; zones optional colour stops.
 */
export function Gauge({
  value,
  min = 0,
  max = 100,
  label,
  zones,
  invert = false,
}: {
  value: number | null;
  min?: number;
  max?: number;
  label?: string;
  zones?: { upTo: number; color: string }[];
  invert?: boolean;
}) {
  const v = value == null ? null : Math.max(min, Math.min(max, value));
  const frac = v == null ? 0 : (v - min) / (max - min);
  const angle = Math.PI * (1 - frac);
  const cx = 50;
  const cy = 46;
  const r = 38;
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);

  const stops = zones ?? [
    { upTo: max * 0.33, color: invert ? C.bear : C.bull },
    { upTo: max * 0.66, color: C.highlight },
    { upTo: max, color: invert ? C.bull : C.bear },
  ];
  const color =
    v == null
      ? C.neutral
      : (stops.find((z) => v <= z.upTo)?.color ?? stops.at(-1)?.color ?? C.neutral);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 54" className="w-full max-w-[180px]">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={C.border} strokeWidth="7" strokeLinecap="round" />
        {v != null && (
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
          />
        )}
        <circle cx={x} cy={y} r="2.5" fill={color} />
      </svg>
      <div className="-mt-2 text-center">
        <div className="text-lg font-semibold tnum" style={{ color }}>
          {value == null ? '—' : num(value, value < 10 ? 2 : 1)}
        </div>
        {label && <div className="u-label">{label}</div>}
      </div>
    </div>
  );
}

const PALETTE = [C.bull, C.info, C.accent, C.bear, C.highlight, '#8fae6b', '#c98b6b', C.neutral];

export function Donut({
  data,
  size = 150,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = 42;
  const cx = 50;
  const cy = 50;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += d.value;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return { d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`, color: PALETTE[i % PALETTE.length] };
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="shrink-0">
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill="none" stroke={a.color} strokeWidth="12" />
        ))}
        {centerValue && (
          <text x="50" y="49" textAnchor="middle" className="fill-fg" style={{ fontSize: 11, fontWeight: 600 }}>
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text x="50" y="60" textAnchor="middle" className="fill-fg-muted" style={{ fontSize: 6 }}>
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="truncate text-fg-secondary">{d.label}</span>
            <span className="ml-auto tnum text-fg-muted">{num((d.value / total) * 100, 1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({
  data,
  valueFmt = (v: number) => num(v, 1) + '%',
}: {
  data: { label: string; value: number; sub?: string }[];
  valueFmt?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={d.label}>
          <div className="flex justify-between text-xs">
            <span className="text-fg-secondary">{d.label}</span>
            <span className="tnum text-fg-muted">
              {d.sub ? `${d.sub} · ` : ''}
              {valueFmt(d.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-bg">
            <div
              className="h-full rounded"
              style={{ width: `${(d.value / max) * 100}%`, background: PALETTE[i % PALETTE.length] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Sector heatmap — tiles sized by weight, coloured by change%. */
export function Heatmap({
  tiles,
}: {
  tiles: { label: string; weight: number; change: number | null }[];
}) {
  const total = tiles.reduce((a, t) => a + t.weight, 0) || 1;
  const shade = (c: number | null) => {
    if (c == null) return C.neutral;
    const t = Math.max(-1, Math.min(1, c / 3));
    return t >= 0 ? C.bull : C.bear;
  };
  return (
    <div className="flex flex-wrap gap-1">
      {tiles.map((t) => {
        const pctW = (t.weight / total) * 100;
        return (
          <div
            key={t.label}
            className="flex min-w-[64px] flex-col justify-between rounded p-2"
            style={{
              flexGrow: pctW,
              flexBasis: `${Math.max(64, pctW * 3)}px`,
              minHeight: 54,
              background: shade(t.change),
              opacity: t.change == null ? 0.25 : Math.min(1, 0.22 + Math.abs((t.change ?? 0) / 4)),
            }}
          >
            <span className="text-[11px] font-medium text-bg">{t.label}</span>
            <span className={clsx('text-[10px] tnum text-bg/90')}>
              {t.change == null ? '—' : `${t.change > 0 ? '+' : ''}${num(t.change, 2)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MiniStatRow({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {items.map((it) => (
        <div key={it.label}>
          <span className="text-fg-muted">{it.label} </span>
          <span className="tnum text-fg">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export { compact };
