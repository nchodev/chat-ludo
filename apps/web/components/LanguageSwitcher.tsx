'use client';

import { LANGS, useLang } from '@/lib/i18n';
import { Icon } from './Icons';

/** FR / EN choice, remembered on this device. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useLang();
  const choice = (
    <div role="radiogroup" aria-label={t('Langue', 'Language')} className="grid grid-cols-2 gap-1 rounded-full bg-black/25 p-1">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={lang === l.id}
          lang={l.id}
          onClick={() => setLang(l.id)}
          className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${lang === l.id ? 'bg-[#00a884] text-[#0b141a]' : 'text-[#8696a0]'}`}
        >
          {compact ? l.label : l.name}
        </button>
      ))}
    </div>
  );
  if (compact) return choice;
  return (
    <section className="flex items-center gap-4 rounded-[28px] bg-[#1f2c33] p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
        <Icon.Globe size={24} />
      </span>
      <span className="min-w-0 flex-1 text-[16px] font-medium">{t('Langue', 'Language')}</span>
      {choice}
    </section>
  );
}
