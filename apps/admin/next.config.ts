import type { NextConfig } from 'next';

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
// Without a configured URL the game server is reached on the page's own host, port 4000.
const connectSrc = serverUrl ? `'self' ${serverUrl}` : "'self' http: https:";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Photos and voice notes of support conversations are shown from blob: URLs.
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  // The microphone records voice replies to players (Assistance).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }] : []),
];

const nextConfig: NextConfig = {
  transpilePackages: ['@ludo/engine'],
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  poweredByHeader: false,
  experimental: {
    agentUpgrade: 'security',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
