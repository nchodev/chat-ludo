/** Mark of the awalé game: a wooden board with two rows of pits and a few seeds. */
export function AwaleLogo({ size = 64, className = '' }: { size?: number; className?: string }) {
  const pits = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      pits.push(<circle key={`${row}${col}`} cx={14 + col * 18} cy={22 + row * 20} r="7.5" fill="url(#al-pit)" />);
    }
  }
  const seeds: [number, number][] = [
    [12, 21], [16, 23.5], [30, 40], [34, 43], [31.5, 44.5], [48, 20], [52, 22.5], [50, 25], [46.5, 24],
  ];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id="al-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a8754a" />
          <stop offset=".55" stopColor="#7a4f2c" />
          <stop offset="1" stopColor="#56341a" />
        </linearGradient>
        <radialGradient id="al-pit" cx="50%" cy="38%">
          <stop offset="0" stopColor="#3b2414" />
          <stop offset=".7" stopColor="#4c2f1a" />
          <stop offset="1" stopColor="#24140a" />
        </radialGradient>
      </defs>
      <rect x="2" y="9" width="60" height="46" rx="14" fill="url(#al-wood)" />
      <rect x="2" y="9" width="60" height="46" rx="14" fill="none" stroke="#f3e6cf" strokeOpacity=".15" />
      {pits}
      {seeds.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill={i % 2 ? '#e9d8b4' : '#cdb07a'} stroke="#3b2414" strokeOpacity=".4" strokeWidth=".5" />
      ))}
    </svg>
  );
}

export function AwaleWordmark({ className = '' }: { className?: string }) {
  return <span className={`font-semibold tracking-tight text-[#f3e6cf] ${className}`}>Awalé</span>;
}
