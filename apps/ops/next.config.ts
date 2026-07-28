import path from 'node:path';
import type { NextConfig } from 'next';

// apps/ops — the Arad control plane (ADR-014 §2). Desktop, internal, low
// volume: no PWA, no design pass, built straight on @arad-crm/ui primitives.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ADR-013 — the Docker runtime copies .next/standalone. outputFileTracingRoot
  // must point at the monorepo root or Next traces only this app's subtree and
  // omits the workspace packages (@arad-crm/*, foundation @arad/*).
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  transpilePackages: [
    '@arad-crm/ui',
    '@arad-crm/web-shared',
    '@arad-crm/api-contracts',
    '@arad/ops-kit',
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
