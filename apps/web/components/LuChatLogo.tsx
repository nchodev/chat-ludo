/** The LuChat mark: a chat bubble whose "typing" dots are game pieces. */
export function LuChatLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="luchat-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#25d366" />
          <stop offset="1" stopColor="#008069" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="url(#luchat-bg)" />
      <path
        d="M184 120h144c55 0 96 41 96 96v40c0 55-41 96-96 96H232l-70 58c-9 7-21 0-19-11l8-50c-38-12-63-47-63-93v-40c0-55 41-96 96-96z"
        fill="#fff"
      />
      <circle cx="186" cy="236" r="30" fill="#e53935" />
      <circle cx="256" cy="236" r="30" fill="#fbc02d" />
      <circle cx="326" cy="236" r="30" fill="#1e88e5" />
    </svg>
  );
}

export function LuChatWordmark({ className = 'text-[1.35rem]' }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      <span className="text-[#e9edef]">Lu</span>
      <span className="text-[#25d366]">Chat</span>
    </span>
  );
}
