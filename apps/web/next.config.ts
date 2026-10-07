import type { NextConfig } from 'next';

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
// Without a configured URL the game server is reached on the page's own host, port 4000.
const connectSrc = serverUrl
  ? `'self' ${serverUrl} ${serverUrl.replace(/^http/, 'ws')}`
  : "'self' http: https: ws: wss:";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // The dev server needs eval and its own websocket for hot reload.
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }] : []),
];

const nextConfig: NextConfig = {
  transpilePackages: ['@ludo/engine'],
  // Lets phones on the local network load the dev server's scripts.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
