import type { Metadata, Viewport } from 'next';
import { Fredoka } from 'next/font/google';
import { ChatNotifier } from '@/components/chat/ChatNotifier';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ReferralCapture } from '@/components/ReferralCapture';
import { ServiceWorker } from '@/components/ServiceWorker';
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
    <html lang="fr" className={fredoka.variable}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ConnectionBanner />
        <ServiceWorker />
        <InstallPrompt />
        <ChatNotifier />
        <NavigationTracker />
        <ReferralCapture />
      </body>
    </html>
  );
}
