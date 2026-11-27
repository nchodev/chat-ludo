import type { Metadata, Viewport } from 'next';
import { Fredoka } from 'next/font/google';
import { AppLock } from '@/components/AppLock';
import { ChatNotifier } from '@/components/chat/ChatNotifier';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ReferralCapture } from '@/components/ReferralCapture';
import { ServiceWorker } from '@/components/ServiceWorker';
import { EARLY_LOCK_SCRIPT } from '@/lib/appLockScript';
import { NavigationTracker } from '@/lib/navigation';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka' });

export const metadata: Metadata = {
  title: 'LuChat',
  description: 'Discute avec tes amis et joue au Ludo ou aux dames, en ligne ou sur le même écran.',
  applicationName: 'LuChat',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'LuChat', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-content',
  themeColor: '#1f2c33',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The lock script may mark <html> before React hydrates it.
    <html lang="fr" className={fredoka.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: EARLY_LOCK_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ConnectionBanner />
        <ServiceWorker />
        <InstallPrompt />
        <ChatNotifier />
        <NavigationTracker />
        <ReferralCapture />
        <AppLock />
      </body>
    </html>
  );
}
