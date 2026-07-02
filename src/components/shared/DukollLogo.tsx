'use client';

import { useState } from 'react';

interface DukollLogoProps {
  className?: string;
  /** Colour of the "KOLL" part in the SVG fallback. Defaults to currentColor. */
  wordColor?: string;
}

// Brand red, matching the DUKOLL logo.
const DUKOLL_RED = '#E4002B';

/**
 * DUKOLL logo. Renders the uploaded image at /dukoll-logo.png (place a PNG/SVG
 * there in the public/ folder). If that file is missing, it automatically falls
 * back to a built-in SVG wordmark so the UI never shows a broken image.
 * Set the height via `className` (e.g. "h-7 w-auto").
 */
export function DukollLogo({ className, wordColor = 'currentColor' }: DukollLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src="/dukoll-logo.png"
        alt="DUKOLL"
        className={className}
        onError={() => setImgFailed(true)}
      />
    );
  }

  // Fallback wordmark
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
      <circle cx="17" cy="26" r="5.5" fill={DUKOLL_RED} />
    </svg>
  );
}
