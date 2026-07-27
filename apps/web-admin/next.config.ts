import path from 'node:path';
import type { NextConfig } from 'next';

// web-admin is the desktop console — no PWA (ADR-009: only web-seller ships one).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ADR-013 — Docker runtime copies .next/standalone. outputFileTracingRoot
  // must point at the monorepo root or Next traces only this app's subtree and
  // omits the workspace packages (@arad-crm/*, foundation @arad/*).
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  transpilePackages: [
    '@arad-crm/ui',
    '@arad-crm/web-shared',
    '@arad-crm/api-contracts',
    '@arad-crm/vertical-mizro',
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
