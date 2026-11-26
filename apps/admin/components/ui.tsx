'use client';

import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icons';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-medium tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  detail,
  tone = 'accent',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'accent' | 'info' | 'warn' | 'danger';
}) {
  const tones = {
    accent: 'bg-accent/15 text-accent',
    info: 'bg-info/15 text-info',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
  };
  return (
    <div className="card flex items-start gap-3.5 p-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tones[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium tracking-wide text-muted uppercase">{label}</p>
        <p className="mt-0.5 text-[24px] leading-tight font-medium tabular-nums">{value}</p>
        {detail && <p className="mt-1 text-[13px] text-muted">{detail}</p>}
      </div>
    </div>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'accent' | 'info' | 'warn' | 'danger'; children: ReactNode }) {
  const tones = {
    muted: 'bg-white/[0.07] text-muted',
    accent: 'bg-accent/15 text-accent',
    info: 'bg-info/15 text-info',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  width = 'max-w-md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`rise w-full ${width} rounded-[28px] bg-raised p-6 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[20px] font-medium">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="-mt-1 -mr-2 grid size-10 place-items-center rounded-full text-muted hover:bg-white/10">
            <Icon.Close size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-[13.5px] text-danger">{children}</p>;
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-muted">
      <span className="grid size-14 place-items-center rounded-full bg-white/5">{icon}</span>
      <p className="text-[14px]">{children}</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-14">
      <span className="size-8 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" />
    </div>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-3 text-[13px] text-muted">
      <span>
        {total === 0 ? 'Aucun résultat' : `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} sur ${total.toLocaleString('fr-FR')}`}
      </span>
      <div className="flex gap-1">
        <button type="button" className="btn btn-tonal size-9 px-0" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Page précédente">
          <Icon.ChevronLeft size={20} />
        </button>
        <button type="button" className="btn btn-tonal size-9 px-0" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante">
          <Icon.ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex rounded-full border border-line p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition ${
            value === o.id ? 'bg-accent/20 text-accent' : 'text-muted hover:text-text'
          }`}
        >
          {value === o.id && <Icon.Check size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

const AVATAR_COLORS = ['#00a884', '#53bdeb', '#ffbc38', '#f15c6d', '#a78bfa', '#25d366', '#fb923c'];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-medium text-[#0b141a] uppercase"
      style={{ width: size, height: size, background: AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length], fontSize: size * 0.42 }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function Amount({ value, currency, signedValue }: { value: number; currency: 'free' | 'premium'; signedValue?: boolean }) {
  const CurrencyIcon = currency === 'premium' ? Icon.Gem : Icon.Coin;
  const text = (signedValue && value > 0 ? '+' : '') + value.toLocaleString('fr-FR');
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${signedValue ? (value > 0 ? 'text-accent' : value < 0 ? 'text-danger' : 'text-muted') : ''}`}>
      <CurrencyIcon size={15} className={currency === 'premium' ? 'text-info' : 'text-warn'} />
      {text}
    </span>
  );
}
