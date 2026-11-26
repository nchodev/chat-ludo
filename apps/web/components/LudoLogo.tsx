import { COLOR_DARK, COLOR_HEX } from '@/lib/board';

const LOGO_COLORS = ['red', 'green', 'blue', 'yellow'] as const;

export function LudoLogo({ size = 80, float = true }: { size?: number; float?: boolean }) {
  const dot = Math.round(size / 5);
  return (
    <div className={`relative mx-auto ${float ? 'float' : ''}`} style={{ width: size, height: size }}>
      <div
        className="grid size-full rotate-45 grid-cols-2 gap-1 overflow-hidden p-1 shadow-2xl shadow-black/50 ring-4 ring-white/20"
        style={{ borderRadius: size * 0.27 }}
      >
        {LOGO_COLORS.map((c) => (
          <span
            key={c}
            className="grid place-items-center"
            style={{ borderRadius: size * 0.14, background: `linear-gradient(145deg, ${COLOR_HEX[c]}, ${COLOR_DARK[c]})` }}
          >
            <span className="-rotate-45 rounded-full border-[3px] border-white/90 bg-white/30 shadow" style={{ width: dot, height: dot }} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function LudoWordmark({ className = 'text-4xl' }: { className?: string }) {
  return (
    <h2 className={`font-bold tracking-tight ${className}`}>
      {'LUDO'.split('').map((l, i) => (
        <span key={i} style={{ color: COLOR_HEX[LOGO_COLORS[i]] }} className="drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
          {l}
        </span>
      ))}
    </h2>
  );
}
