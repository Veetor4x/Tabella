import { useId } from "react";

/** The wax seal: the one place (with the main button) that carries the wax-red. */
export function WaxSeal({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <svg className={`wax ${className}`} viewBox="0 0 100 100" role="img" aria-label="Wax seal">
      <defs>
        <radialGradient id={`${id}-g`} cx="36%" cy="30%" r="80%">
          <stop offset="0" stopColor="#b3333f" />
          <stop offset="0.6" stopColor="#8a1c27" />
          <stop offset="1" stopColor="#5d1019" />
        </radialGradient>
      </defs>
      <path
        d="M50 5c8 0 13 5 21 7 9 2 16 7 18 16 2 8-2 13-1 21 1 8 4 13 1 21-3 8-11 12-18 16-8 4-13 8-21 6-8-2-13-8-21-10C20 80 11 75 9 66c-2-8 3-13 2-21-1-8-5-14-1-22 4-8 13-10 20-13C37 5 43 5 50 5z"
        fill={`url(#${id}-g)`}
      />
      <circle cx="50" cy="50" r="28" fill="none" stroke="#e3a3aa" strokeOpacity="0.5" strokeWidth="1.5" />
      <text x="50" y="61" textAnchor="middle" fontFamily="'Instrument Serif', Georgia, serif" fontSize="34" fill="#f0c9cd" fillOpacity="0.95">
        T
      </text>
    </svg>
  );
}
