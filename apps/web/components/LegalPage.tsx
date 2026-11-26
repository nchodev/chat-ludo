import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppBar } from './AppBar';
import { LEGAL } from '@/lib/legal';

/** Layout shared by the terms of use and the privacy policy. */
export function LegalPage({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title={title} subtitle={subtitle} backHref="/?tab=profile" backText="Profil" backLabel="Retour au profil" />
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-5 pt-5 pb-16 text-[14.5px] leading-relaxed text-[#d1d7db]">
        <p className="text-[13px] text-[#8696a0]">Dernière mise à jour : {LEGAL.updatedAt}</p>
        {children}
        <nav className="mt-2 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#222d34] pt-4 text-[13.5px] font-semibold">
          <Link href="/conditions" className="text-[#00a884]">
            Conditions d’utilisation
          </Link>
          <Link href="/confidentialite" className="text-[#00a884]">
            Politique de confidentialité
          </Link>
        </nav>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[16px] font-semibold text-[#e9edef]">{title}</h2>
      {children}
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-[#00a884]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
