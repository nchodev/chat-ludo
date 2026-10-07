import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ludo/engine'],
  // Lets phones on the local network load the dev server's scripts.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
};

export default nextConfig;
