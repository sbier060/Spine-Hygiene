/**
 * Daily percent-good-posture bar chart (trailing two weeks). Hand-rolled SVG:
 * bars carry the vital-green gradient at high consistency and desaturate toward
 * gray as consistency drops; days without data render as faint empty slots, not
 * zeros. Values are labeled directly; native <title> gives per-day details.
 */
import type { DailyStat } from "../storage/dashboardMetrics";
import { formatDuration } from "../tray/trayState";

const W = 560;
const H = 168;
const PLOT_TOP = 22;
const PLOT_BOTTOM = H - 26;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

/** Gray→green by consistency, so weak days read as faded rather than scolded. */
function barColor(consistency: number): string {
  const t = Math.max(0, Math.min(1, consistency));
  const from = [110, 124, 140];
  const to = [62, 207, 142];
  const mix = from.map((f, i) => Math.round(f + ((to[i] ?? f) - f) * t));
  return `rgb(${String(mix[0])}, ${String(mix[1])}, ${String(mix[2])})`;
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function DailyBars({ data }: { data: readonly DailyStat[] }): JSX.Element {
  const n = data.length;
  const slot = W / n;
  const barW = Math.min(26, slot * 0.55);

  return (
    <svg
      className="daily-chart"
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      role="img"
      aria-label="Percent good posture per day, last two weeks"
    >
      <defs>
        <linearGradient id="bar-vital" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#54E6C0" />
          <stop offset="1" stopColor="#1F9D5F" />
        </linearGradient>
      </defs>

      {/* Hairline guides at 0/50/100%. */}
      {[0, 0.5, 1].map((g) => (
        <line
          key={g}
          x1={0}
          x2={W}
          y1={PLOT_BOTTOM - g * PLOT_H}
          y2={PLOT_BOTTOM - g * PLOT_H}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray={g === 0 ? undefined : "3 5"}
        />
      ))}

      {data.map((d, i) => {
        const cx = slot * i + slot / 2;
        const x = cx - barW / 2;
        const date = new Date(d.dayStartMs);
        const isToday = i === n - 1;
        const dayLabel = isToday ? "Today" : DAY_LETTERS[date.getDay()] ?? "";

        return (
          <g key={d.dayStartMs}>
            <title>
              {`${date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}: ` +
                (d.consistency === null
                  ? "no data"
                  : `${String(Math.round(d.consistency * 100))}% good · ${formatDuration(d.activeSeconds * 1000)} tracked`)}
            </title>
            {d.consistency === null ? (
              // Empty slot — a faint stub, visibly "no data" rather than 0%.
              <rect
                x={x}
                y={PLOT_BOTTOM - 3}
                width={barW}
                height={3}
                rx={1.5}
                fill="var(--surface-2)"
              />
            ) : (
              <>
                <rect
                  x={x}
                  y={PLOT_BOTTOM - Math.max(4, d.consistency * PLOT_H)}
                  width={barW}
                  height={Math.max(4, d.consistency * PLOT_H)}
                  rx={4}
                  fill={
                    d.consistency >= 0.72 ? "url(#bar-vital)" : barColor(d.consistency)
                  }
                />
                <text
                  x={cx}
                  y={PLOT_BOTTOM - Math.max(4, d.consistency * PLOT_H) - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--muted)"
                >
                  {Math.round(d.consistency * 100)}
                </text>
              </>
            )}
            <text
              x={cx}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fontWeight={isToday ? 700 : 400}
              fill={isToday ? "var(--text)" : "var(--muted)"}
            >
              {dayLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
