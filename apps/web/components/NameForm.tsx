'use client';

import { useState } from 'react';

interface NameFormProps {
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
}

export function NameForm({ initial = '', submitLabel, onSubmit }: NameFormProps) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <label className="text-sm font-semibold" htmlFor="player-name">
        Ton pseudo
      </label>
      <input
        id="player-name"
        value={name}
        maxLength={20}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex : Awa"
        className="rounded-2xl bg-black/25 px-4 py-3 text-lg font-medium outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
      />
      <button type="submit" disabled={!name.trim()} className="btn btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}
