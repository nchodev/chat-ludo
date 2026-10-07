import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ludo',
    short_name: 'Ludo',
    description: 'Jouez au Ludo entre amis, contre l’ordinateur ou en ligne.',
    lang: 'fr',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1029',
    theme_color: '#0f1029',
    categories: ['games'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
