interface DukollLogoProps {
  className?: string;
  /** Colour of the "KOLL" part. Defaults to currentColor so it adapts to the
   *  surrounding text colour (white in the dark sidebar, dark on light pages). */
  wordColor?: string;
}

// Brand red, matching the DUKOLL logo.
const DUKOLL_RED = '#E4002B';

/**
 * DUKOLL wordmark: red "DU" (with the signature dot inside the D) + "KOLL".
 * Scalable SVG so it stays crisp at any size. Set the height via `className`
 * (e.g. "h-7 w-auto"); the width follows the viewBox aspect ratio.
 */
export function DukollLogo({ className, wordColor = 'currentColor' }: DukollLogoProps) {
  return (
    <svg
      viewBox="0 0 232 48"
      className={className}
      role="img"
      aria-label="DUKOLL"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="38"
        fontFamily="Arial Black, Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="44"
        letterSpacing="-1.5"
      >
        <tspan fill={DUKOLL_RED}>DU</tspan>
        <tspan fill={wordColor}>KOLL</tspan>
      </text>
      {/* Signature dot inside the "D" opening */}
      <circle cx="17" cy="26" r="5.5" fill={DUKOLL_RED} />
    </svg>
  );
}
