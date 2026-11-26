import { Icon } from '../Icons';

const PALETTE = ['#00a884', '#53bdeb', '#ff8f6b', '#c792ea', '#ffbc38', '#ef5350', '#26c6da', '#9ccc65'];

/** A player's colour, also used for their name above their messages in groups. */
export function colorFor(name: string) {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({ name, size = 48, online = false, group = false }: { name: string; size?: number; online?: boolean; group?: boolean }) {
  const color = group ? '#8696a0' : colorFor(name);
  return (
    <span className="relative inline-grid shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid size-full place-items-center rounded-full font-semibold uppercase"
        style={{ background: group ? '#2a3942' : `${color}33`, color, fontSize: size * 0.36 }}
      >
        {group ? <Icon.Groups size={size * 0.55} /> : name.slice(0, 2)}
      </span>
      {online && (
        <span
          className="absolute right-0 bottom-0 rounded-full border-2 border-[#0b141a] bg-[#25d366]"
          style={{ width: size * 0.28, height: size * 0.28 }}
          aria-label="En ligne"
        />
      )}
    </span>
  );
}
