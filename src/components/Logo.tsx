/**
 * Spine-IQ logo. The mark is five "vertebrae" dots tracing a gentle S-curve —
 * a spine seen from the side — in the brand's vital-green gradient, with the
 * head dot leading the curve. Pure inline SVG so it inherits crispness at any
 * size and needs no asset loading (the app runs fully offline).
 */

export function LogoMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Spine-IQ"
    >
      <defs>
        <linearGradient id="siq-vital" x1="32" y1="4" x2="32" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#54E6C0" />
          <stop offset="0.55" stopColor="#3ECF8E" />
          <stop offset="1" stopColor="#1F9D5F" />
        </linearGradient>
      </defs>
      {/* Head leads; vertebrae follow the S. */}
      <circle cx="27" cy="10" r="7" fill="url(#siq-vital)" />
      <circle cx="34" cy="23.5" r="5" fill="url(#siq-vital)" opacity="0.95" />
      <circle cx="37" cy="35.5" r="5.5" fill="url(#siq-vital)" opacity="0.9" />
      <circle cx="33" cy="46.5" r="6" fill="url(#siq-vital)" opacity="0.85" />
      <circle cx="26" cy="56" r="6.5" fill="url(#siq-vital)" opacity="0.8" />
    </svg>
  );
}

/** Mark + wordmark lockup for screen headers. */
export function Logo({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} />
      <span className="logo-word">
        Spine<span className="logo-word-accent">IQ</span>
      </span>
    </span>
  );
}
