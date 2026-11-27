'use client';

import { useEffect, useState } from 'react';
import { isMuted, onMutedChange, setMuted } from '@/lib/sound';
import { tr } from '@/lib/i18n';

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
      aria-label={muted ? tr('Activer le son', 'Turn sound on') : tr('Couper le son', 'Mute')}
      aria-pressed={!muted}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
