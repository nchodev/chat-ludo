'use client';

import { useEffect, useState } from 'react';
import { isMuted, onMutedChange, setMuted } from '@/lib/sound';

export function SoundToggle() {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
    return onMutedChange(setMutedState);
  }, []);

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? 'Activer le son' : 'Couper le son'}
      aria-pressed={!muted}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
