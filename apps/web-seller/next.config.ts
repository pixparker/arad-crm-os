import type { NextConfig } from 'next';

// PWA (@serwist/next) lands with the real «امروز من» flow epic (ADR-009) —
// kept out of the scaffold so the build stays minimal.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@arad-crm/ui', '@arad-crm/web-shared', '@arad-crm/api-contracts'],
};

export default nextConfig;
