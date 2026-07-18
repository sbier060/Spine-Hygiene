/**
 * Today's percent-good-posture as a progress ring. Pure SVG — no chart deps.
 * Shows an em-dash when the day has no classified time yet.
 */

const SIZE = 132;
const STROKE = 11;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export function PostureRing({ pct }: { pct: number | null }): JSX.Element {
  const clamped = pct === null ? 0 : Math.max(0, Math.min(1, pct));
  const dashOffset = CIRC * (1 - clamped);
  const label = pct === null ? "—" : `${String(Math.round(clamped * 100))}%`;

  return (
    <div
      className="ring-wrap"
      role="img"
      aria-label={
        pct === null
          ? "No posture data yet today"
          : `${String(Math.round(clamped * 100))} percent good posture today`
      }
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}>
        <defs>
          <linearGradient id="ring-vital" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#54E6C0" />
            <stop offset="1" stopColor="#1F9D5F" />
          </linearGradient>
        </defs>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={STROKE}
        />
        {pct !== null && (
          <circle
            className="ring-arc"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="url(#ring-vital)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${String(SIZE / 2)} ${String(SIZE / 2)})`}
          />
        )}
      </svg>
      <div className="ring-center">
        <span className="ring-value">{label}</span>
        <span className="ring-label">good posture</span>
      </div>
    </div>
  );
}
