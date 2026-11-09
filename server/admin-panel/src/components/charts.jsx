import { useEffect, useId, useRef, useState } from "react";
import { formatCompact } from "../format-number.jsx";

const formatDay = (key, long = false) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", long ? { weekday: "short", day: "2-digit", month: "short" } : { day: "2-digit", month: "2-digit" });
};

/** Teto "redondo" do eixo (ex.: 7 → 8, 43 → 50) para as linhas de grade caírem em números fáceis. */
function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value / 4) * power;
  return Math.ceil(value / step) * step;
}

/**
 * Gráfico de área por dia, responsivo (preenche a largura do cartão). Passar o mouse ou tocar mostra o valor do dia.
 * @param {{data: {day: string}[], valueKey: string, label: string, format?: (value: number) => string, height?: number}} props
 */
export function AreaChart({ data, valueKey, label, format = formatCompact, height = 240 }) {
  const gradientId = useId();
  const [hover, setHover] = useState(null);
  // Desenha na largura real do cartão (em pixels): o texto dos eixos fica legível também no celular.
  const frameRef = useRef(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    if (frame.clientWidth) setWidth(Math.max(frame.clientWidth, 280));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(Math.round(entry.contentRect.width), 280)));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const pad = { top: 16, right: 16, bottom: 28, left: 40 };
  const values = data.map((point) => point[valueKey] ?? 0);
  const max = niceMax(Math.max(...values, 0));
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
  const y = (value) => pad.top + innerHeight - (value / max) * innerHeight;
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${pad.top + innerHeight} L${x(0).toFixed(1)},${pad.top + innerHeight} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((fraction) => max * fraction);
  // Rótulos do eixo X: um a cada ~70 px, espaçados por igual.
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(Math.floor(innerWidth / 70), 2)));

  const pickIndex = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * width;
    const index = Math.round(((svgX - pad.left) / innerWidth) * (data.length - 1));
    setHover(Math.min(Math.max(index, 0), data.length - 1));
  };
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <figure className="chart" ref={frameRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart__svg"
        role="img"
        aria-label={`${label}: ${format(total)} no período`}
        onPointerMove={pickIndex}
        onPointerDown={pickIndex}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridLines.map((value) => (
          <g key={value}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="chart__grid" />
            <text x={pad.left - 8} y={y(value) + 4} textAnchor="end" className="chart__axis">{format(Math.round(value))}</text>
          </g>
        ))}
        {data.map((point, index) => (index % labelEvery === 0 || index === data.length - 1) && (
          <text key={point.day} x={x(index)} y={height - 8} textAnchor="middle" className="chart__axis">{formatDay(point.day)}</text>
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} className="chart__line" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerHeight} className="chart__cursor" />
            <circle cx={x(hover)} cy={y(values[hover])} r="5" className="chart__dot" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="chart__tooltip" style={{ left: `${(x(hover) / width) * 100}%` }} role="status">
          <span>{formatDay(data[hover].day, true)}</span>
          <strong>{format(values[hover])}</strong>
        </div>
      )}
    </figure>
  );
}

/** Mini gráfico de linha (tendência) para os cartões de indicador. */
export function Sparkline({ values, width = 96, height = 28 }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => `${((index / Math.max(values.length - 1, 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - (value / max) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

/**
 * Barra horizontal com duas medidas sobrepostas (ex.: começaram × concluíram), em relação a um total.
 * @param {{label: string, primary: number, secondary?: number, total: number, primaryLabel: string, secondaryLabel?: string}} props
 */
export function StackedBar({ label, primary, secondary, total, primaryLabel, secondaryLabel }) {
  const percent = (value) => (total ? Math.round((value / total) * 100) : 0);
  return (
    <div className="stacked-bar">
      <div className="stacked-bar__head">
        <span>{label}</span>
        <span className="muted">{primary} {primaryLabel}{secondaryLabel ? ` · ${secondary} ${secondaryLabel}` : ""}</span>
      </div>
      <div className="stacked-bar__track" role="img" aria-label={`${label}: ${percent(primary)}% ${primaryLabel}${secondaryLabel ? `, ${percent(secondary)}% ${secondaryLabel}` : ""}`}>
        <div className="stacked-bar__fill stacked-bar__fill--primary" style={{ width: `${percent(primary)}%` }} />
        {secondaryLabel && <div className="stacked-bar__fill stacked-bar__fill--secondary" style={{ width: `${percent(secondary)}%` }} />}
      </div>
    </div>
  );
}
