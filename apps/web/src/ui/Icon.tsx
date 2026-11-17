import type { ReactNode } from "react";

/** The icons drawn in the mockups (design/*.dc.html), same paths, so the app matches them stroke for stroke. */
const PATHS = {
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  watch: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="3.5" />
      <path d="M9 6V3h6v3M9 18v3h6v-3" />
    </>
  ),
  reggie: <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.6A7.5 7.5 0 1 1 20 11.5z" />,
  move: <path d="M7 4L3 8l4 4M3 8h12M17 20l4-4-4-4M21 16H9" />,
  change: <path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  run: <path d="M13 4.5a1.5 1.5 0 1 0 0-.01M10 9l3-1 3 3 3 1M13 8l-2 5 3 3-1 5M11 13l-4 1-2 4" />,
  class: <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h12" />,
  revision: <path d="M15 4l5 5-11 11H4v-5L15 4z" />,
  strength: <path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" />,
  busy: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  week: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  check: <path d="M5 12l5 5L20 7" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  clock: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />,
  sick: <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z" />,
  pain: (
    <path d="M22 12h-2.5a2 2 0 0 0-1.9 1.5l-2.4 8.3a.3.3 0 0 1-.5 0L9.2 2.2a.3.3 0 0 0-.5 0l-2.3 8.3A2 2 0 0 1 4.5 12H2" />
  ),
  arc: <path d="M4 18c4-8 12-8 16 0" />,
  // Lucide's scan-face: the passkey prompt (Face ID, Touch ID, fingerprint).
  faceId: (
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

type Props = { name: IconName; size?: number; stroke?: number; className?: string };

export function Icon({ name, size = 24, stroke = 2, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

export function Grip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <circle cx="9" cy={y} r="1.5" />
          <circle cx="15" cy={y} r="1.5" />
        </g>
      ))}
    </svg>
  );
}
