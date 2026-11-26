/** Bottom-bar icons drawn as shapes, filled when the tab is selected. */
export function TabIcon({ name, filled }: { name: 'chats' | 'friends' | 'games' | 'profile'; filled: boolean }) {
  const common = {
    viewBox: '0 0 24 24',
    className: 'size-6',
    'aria-hidden': true as const,
  };
  if (name === 'chats') {
    return (
      <svg {...common}>
        <path
          d="M5.2 17.6 3.4 20.4c-.3.4.2.9.6.6l3.2-1.6A9.2 9.2 0 0 0 12 21c4.8 0 8.7-3.4 8.7-7.6S16.8 5.8 12 5.8 3.3 9.2 3.3 13.4c0 1.6.6 3.1 1.9 4.2Z"
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={filled ? 0 : 1.6}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === 'friends') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8.2" r="2.7" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.6} />
        <circle cx="16.2" cy="9" r="2.1" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.6} />
        <path
          d="M3.8 18.2c.6-2.6 2.7-4 5.2-4s4.6 1.4 5.2 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M14.2 14.4c1.8.1 3.4 1.1 4 3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === 'profile') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8.4" r="3.6" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.6} />
        <path
          d="M4.6 20c.8-3.6 3.8-5.8 7.4-5.8s6.6 2.2 7.4 5.8"
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3.5"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.6}
      />
      <circle cx="9" cy="9" r="1.15" fill={filled ? '#0b141a' : 'currentColor'} />
      <circle cx="15" cy="12" r="1.15" fill={filled ? '#0b141a' : 'currentColor'} />
      <circle cx="10" cy="15.2" r="1.15" fill={filled ? '#0b141a' : 'currentColor'} />
    </svg>
  );
}
