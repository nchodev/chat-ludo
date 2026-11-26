/** Mark of the draughts game: a corner of the board with a white and a black king. */
export function DraughtsLogo({ size = 64, className = '' }: { size?: number; className?: string }) {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      cells.push(<rect key={`${r}${c}`} x={c * 16} y={r * 16} width="16" height="16" fill={(r + c) % 2 ? '#76502f' : '#e8d5b3'} />);
    }
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <clipPath id="dl-clip">
          <rect width="64" height="64" rx="14" />
        </clipPath>
        <radialGradient id="dl-white" cx="35%" cy="30%">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".6" stopColor="#efe7d8" />
          <stop offset="1" stopColor="#cfc3ad" />
        </radialGradient>
        <radialGradient id="dl-black" cx="35%" cy="30%">
          <stop offset="0" stopColor="#5b524c" />
          <stop offset=".6" stopColor="#2b2623" />
          <stop offset="1" stopColor="#151210" />
        </radialGradient>
      </defs>
      <g clipPath="url(#dl-clip)">{cells}</g>
      <circle cx="24" cy="41" r="13" fill="url(#dl-black)" stroke="#050404" strokeWidth="1" />
      <path d="M17 44.5 15.6 36.6l4 3.6 4.4-5.4 4.4 5.4 4-3.6-1.4 7.9z" fill="#f5c542" />
      <circle cx="40" cy="25" r="13" fill="url(#dl-white)" stroke="#a99b83" strokeWidth="1" />
      <path d="M33 28.5 31.6 20.6l4 3.6 4.4-5.4 4.4 5.4 4-3.6-1.4 7.9z" fill="#b8860b" />
    </svg>
  );
}

export function DraughtsWordmark({ className = '' }: { className?: string }) {
  return <span className={`font-semibold tracking-tight text-[#f3e6cf] ${className}`}>Dames</span>;
}
