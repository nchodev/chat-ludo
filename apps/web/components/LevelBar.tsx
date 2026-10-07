import { levelInfo } from '@ludo/engine';

/** Progress toward the next level. */
export function LevelBar({ xp, className = '' }: { xp: number; className?: string }) {
  const { current, needed } = levelInfo(xp);
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-white/10 ${className}`} title={`${current} / ${needed} XP`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-[width] duration-700"
        style={{ width: `${Math.max(3, (current / needed) * 100)}%` }}
      />
    </div>
  );
}
