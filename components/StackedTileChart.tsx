import React, { useState, useMemo, useCallback, useRef } from 'react';

interface TileData {
  label: string;
  jobs: number;
  interviews: number;
  responses: number;
}

interface StackedTileChartProps {
  data: TileData[];
  timeRange: 'weekly' | 'monthly' | 'yearly';
  onTimeRangeChange: (range: 'weekly' | 'monthly' | 'yearly') => void;
}

const TILE = 8;
const TILE_GAP = 2;
const COL_GAP = 2;
const GROUP_GAP = 14;
const CELL = TILE + TILE_GAP;

const COLORS = {
  jobs: '#7c9cff',
  interviews: '#71c38d',
  responses: '#f4b94f',
};

const SERIES_KEYS = ['jobs', 'interviews', 'responses'] as const;
const SERIES_LABELS: Record<string, string> = {
  jobs: 'Jobs',
  interviews: 'Interviews',
  responses: 'Responses',
};

const SVG_W = 1200;
const SVG_H = 280;
const PAD_L = 50;
const PAD_R = 16;
const PAD_T = 10;
const PAD_B = 30;
const CHART_W = SVG_W - PAD_L - PAD_R;
const CHART_H = SVG_H - PAD_T - PAD_B;

export const StackedTileChart: React.FC<StackedTileChartProps> = ({
  data,
  timeRange,
  onTimeRangeChange,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxVal = useMemo(() => {
    let m = 0;
    data.forEach((d) => {
      const t = d.jobs + d.interviews + d.responses;
      if (t > m) m = t;
    });
    return Math.max(m, 20);
  }, [data]);

  const gridRows = useMemo(() => {
    const rows: number[] = [];
    const step = Math.ceil(maxVal / 6 / 5) * 5;
    for (let v = 0; v <= maxVal; v += step) rows.push(v);
    if (rows[rows.length - 1] < maxVal) rows.push(Math.ceil(maxVal / step) * step);
    return rows;
  }, [maxVal]);

  const scaleY = useCallback(
    (v: number) => CHART_H - (v / maxVal) * CHART_H,
    [maxVal]
  );

  const groupW = useMemo(() => {
    return (CHART_W - data.length * GROUP_GAP) / data.length;
  }, [data.length]);

  const colW = useMemo(() => {
    return (groupW - 2 * COL_GAP) / 3;
  }, [groupW]);

  const handleMouseMove = useCallback(
    (idx: number, e: React.MouseEvent<SVGGElement>) => {
      setHoveredIdx(idx);
      const r = svgRef.current?.getBoundingClientRect();
      if (r) setTooltipPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    },
    []
  );

  const handleMouseLeave = useCallback(() => setHoveredIdx(null), []);

  const bottom = PAD_T + CHART_H;

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col">
      {/* Legend + Toggle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-5">
          {SERIES_KEYS.map((k) => (
            <span key={k} className="inline-flex items-center gap-2 text-xs text-[#8f8f8f]">
              <span
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: COLORS[k] }}
              />
              {SERIES_LABELS[k]}
            </span>
          ))}
        </div>
        <div className="flex rounded-full border border-white/[0.11] bg-white/[0.03] p-0.5">
          {(['weekly', 'monthly', 'yearly'] as const).map((r) => (
            <button
              key={r}
              onClick={() => onTimeRangeChange(r)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-all ${
                timeRange === r
                  ? 'bg-white text-black shadow-sm'
                  : 'text-[#8f8f8f] hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative min-h-0 flex-1 w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y-axis grid lines + labels + dots */}
          {gridRows.map((v, i) => {
            const y = PAD_T + scaleY(v);
            const label = v >= 1000 ? `${v / 1000}k` : `${v}`;
            return (
              <g key={`grid-${i}`}>
                <line
                  x1={PAD_L}
                  y1={y}
                  x2={SVG_W - PAD_R}
                  y2={y}
                  stroke="white"
                  strokeOpacity={0.06}
                  strokeDasharray="3 6"
                />
                <circle
                  cx={PAD_L - 6}
                  cy={y}
                  r={2.5}
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth={1}
                />
                <text
                  x={PAD_L - 14}
                  y={y + 4}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize={11}
                  fontFamily="var(--font-geist-mono, monospace)"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Data groups */}
          {data.map((item, idx) => {
            const groupX = PAD_L + idx * (groupW + GROUP_GAP);
            const isHovered = hoveredIdx === idx;

            return (
              <g
                key={idx}
                onMouseMove={(e) => handleMouseMove(idx, e)}
                onMouseLeave={handleMouseLeave}
                className="cursor-pointer"
              >
                {/* Hover highlight */}
                {isHovered && (
                  <rect
                    x={groupX - 3}
                    y={PAD_T}
                    width={groupW + 6}
                    height={CHART_H}
                    fill="white"
                    fillOpacity={0.03}
                    rx={4}
                  />
                )}

                {/* 3 columns side by side, tightly packed */}
                {SERIES_KEYS.map((seriesKey, seriesIdx) => {
                  const value = item[seriesKey];
                  const tileCount = Math.round((value / maxVal) * CHART_H / (TILE + TILE_GAP));
                  const colX = groupX + seriesIdx * (colW + COL_GAP);

                  const tiles: React.ReactNode[] = [];
                  for (let i = 0; i < tileCount; i++) {
                    const tileY = bottom - (i + 1) * (TILE + TILE_GAP);
                    if (tileY < PAD_T) break;
                    tiles.push(
                      <rect
                        key={`${seriesIdx}-${i}`}
                        x={colX}
                        y={tileY}
                        width={colW}
                        height={TILE}
                        rx={1.5}
                        fill={COLORS[seriesKey]}
                        opacity={isHovered ? 1 : 0.9}
                      />
                    );
                  }

                  return (
                    <g key={seriesKey}>
                      {tiles}
                    </g>
                  );
                })}

                {/* Hover dashed line */}
                {isHovered && (
                  <line
                    x1={groupX + groupW / 2}
                    y1={PAD_T}
                    x2={groupX + groupW / 2}
                    y2={bottom}
                    stroke="white"
                    strokeOpacity={0.35}
                    strokeDasharray="3 4"
                  />
                )}

                {/* Hover dot */}
                {isHovered && (
                  <circle
                    cx={groupX + groupW / 2}
                    cy={bottom}
                    r={4}
                    fill={COLORS.jobs}
                    stroke="white"
                    strokeWidth={2}
                  />
                )}

                {/* X-axis label */}
                <text
                  x={groupX + groupW / 2}
                  y={bottom + 20}
                  textAnchor="middle"
                  fill={isHovered ? 'white' : '#6b7280'}
                  fontSize={12}
                  fontWeight={isHovered ? 700 : 400}
                  fontFamily="var(--font-geist-mono, monospace)"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredIdx !== null && (
          <div
            className="pointer-events-none absolute z-50 rounded-xl border border-white/10 bg-[#1a1a1a] px-5 py-4 shadow-2xl"
            style={{
              left: Math.min(
                tooltipPos.x,
                (containerRef.current?.clientWidth || 800) - 200
              ),
              top: tooltipPos.y - 100,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="mb-2.5 text-sm font-bold text-white">
              {data[hoveredIdx].label}
            </p>
            <div className="space-y-2">
              {SERIES_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-2.5 text-xs">
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ backgroundColor: COLORS[k] }}
                  />
                  <span className="text-[#8f8f8f]">{SERIES_LABELS[k]}</span>
                  <span className="ml-auto font-semibold text-white">
                    {data[hoveredIdx][k]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StackedTileChart;
