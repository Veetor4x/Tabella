/** The wax seal. `stamp` plays the stamping motion once (skipped for people who prefer less motion). */
export function WaxSeal({ stamp = false, className = "" }: { stamp?: boolean; className?: string }) {
  return (
    <svg className={`wax ${stamp ? "stamp" : ""} ${className}`} viewBox="0 0 100 100" role="img" aria-label="Wax seal">
      <defs>
        <radialGradient id="wax-g" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#c0414c" />
          <stop offset="0.55" stopColor="#8c1d28" />
          <stop offset="1" stopColor="#5e111a" />
        </radialGradient>
      </defs>
      {/* an uneven pool of wax */}
      <path
        d="M50 4c9 0 14 6 22 8 9 2 17 7 19 17 2 8-3 13-1 21 2 9 5 14 2 22-3 9-12 12-19 17-8 5-14 9-23 7-9-2-13-9-22-11C19 83 9 78 7 68c-2-9 4-14 3-23-1-9-6-15-2-24 4-9 14-11 22-14C38 4 43 4 50 4z"
        fill="url(#wax-g)"
      />
      <circle cx="50" cy="50" r="30" fill="none" stroke="#d98a92" strokeOpacity="0.55" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="24" fill="#7a1822" fillOpacity="0.5" />
      <text x="50" y="62" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="34" fontWeight="700" fill="#e9b6bb" fillOpacity="0.95">
        T
      </text>
    </svg>
  );
}
