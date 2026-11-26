import type { Metadata, Viewport } from 'next';
import { AdminShell } from '@/components/AdminShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'LuChat Admin',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111b21',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh font-sans antialiased">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
