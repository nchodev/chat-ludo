'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { adminApi, getToken, onLogout, setToken } from '@/lib/api';
import { Icon } from './Icons';

export interface AdminAccount {
  id: number;
  email: string;
}

const AdminContext = createContext<AdminAccount | null>(null);
export const useAdmin = () => useContext(AdminContext);

const NAV = [
  { href: '/', label: 'Tableau de bord', icon: Icon.Dashboard },
  { href: '/joueurs', label: 'Joueurs', icon: Icon.People },
  { href: '/salons', label: 'Salons en direct', icon: Icon.Casino },
  { href: '/cagnottes', label: 'Cagnottes', icon: Icon.Wallet },
  { href: '/paiements', label: 'Paiements Wave', icon: Icon.Coin },
  { href: '/parrainage', label: 'Parrainage', icon: Icon.Gift },
  { href: '/annonces', label: 'Annonces', icon: Icon.Bell },
  { href: '/signalements', label: 'Signalements', icon: Icon.Flag },
  { href: '/jeux', label: 'Jeux', icon: Icon.Casino },
  { href: '/reglages', label: 'Réglages des mises', icon: Icon.Tune },
  { href: '/admins', label: 'Administrateurs', icon: Icon.Shield },
  { href: '/journal', label: 'Journal', icon: Icon.History },
];

function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminAccount | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openReports, setOpenReports] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const onLogin = path === '/login';

  useEffect(() => {
    if (onLogin) return;
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    adminApi<{ admin: AdminAccount }>('/admin/me')
      .then((res) => setAdmin(res.admin))
      .catch(() => {});
  }, [onLogin, router]);

  useEffect(() => onLogout(() => router.replace('/login')), [router]);
  useEffect(() => setMenuOpen(false), [path]);

  useEffect(() => {
    if (!admin) return;
    const load = () =>
      adminApi<{ openReports: number; pendingWithdrawals: number }>('/admin/stats')
        .then((s) => {
          setOpenReports(s.openReports);
          setPendingWithdrawals(s.pendingWithdrawals);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [admin, path]);

  if (onLogin) return <>{children}</>;
  if (!admin) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <span className="size-8 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" />
      </div>
    );
  }

  const logout = async () => {
    await adminApi('/admin/logout', {}).catch(() => {});
    setToken(null);
    router.replace('/login');
  };

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pt-5 pb-6">
        <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent">
          <Icon.Shield size={24} />
        </span>
        <div>
          <p className="text-[16px] leading-tight font-medium">LuChat Admin</p>
          <p className="text-[12px] text-muted">Plateforme</p>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, icon: NavIcon }) => {
          const active = isActive(path, href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex h-12 items-center gap-3.5 rounded-full px-4 text-[14.5px] font-medium transition ${
                  active ? 'bg-accent/15 text-accent' : 'text-text/85 hover:bg-white/5'
                }`}
              >
                <NavIcon size={22} />
                <span className="flex-1">{label}</span>
                {href === '/signalements' && openReports > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11.5px] font-semibold text-white">{openReports}</span>
                )}
                {href === '/paiements' && pendingWithdrawals > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-warn px-1.5 text-[11.5px] font-semibold text-[#0b141a]">{pendingWithdrawals}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line/60 p-3">
        <p className="truncate px-4 pb-2 text-[12.5px] text-muted" title={admin.email}>
          {admin.email}
        </p>
        <button type="button" onClick={logout} className="flex h-11 w-full items-center gap-3.5 rounded-full px-4 text-[14.5px] text-text/85 hover:bg-white/5">
          <Icon.Logout size={22} />
          Se déconnecter
        </button>
      </div>
    </nav>
  );

  return (
    <AdminContext.Provider value={admin}>
      <div className="min-h-dvh lg:pl-72">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-line/60 bg-surface lg:block">{nav}</aside>

        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line/60 bg-surface/95 px-2 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu" className="grid size-11 place-items-center rounded-full hover:bg-white/5">
            <Icon.Menu size={24} />
          </button>
          <span className="text-[17px] font-medium">{NAV.find((n) => isActive(path, n.href))?.label ?? 'LuChat Admin'}</span>
        </header>

        {menuOpen && (
          <div className="fade-in fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMenuOpen(false)}>
            <aside className="h-full w-72 max-w-[85vw] bg-surface" onClick={(e) => e.stopPropagation()}>
              {nav}
            </aside>
          </div>
        )}

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}
