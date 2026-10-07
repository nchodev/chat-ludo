import type { Metadata, Viewport } from 'next';
import { Fredoka } from 'next/font/google';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka' });

export const metadata: Metadata = {
  title: 'Ludo',
  description: 'Jouez au Ludo entre amis, contre l’ordinateur ou en ligne.',
  applicationName: 'Ludo',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Ludo', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f1029',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={fredoka.variable}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
