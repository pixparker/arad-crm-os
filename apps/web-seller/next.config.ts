import type { NextConfig } from 'next';

// PWA (@serwist/next) lands with the real «امروز من» flow epic (ADR-009) —
// kept out of the scaffold so the build stays minimal.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@arad-crm/ui',
    '@arad-crm/web-shared',
    '@arad-crm/api-contracts',
    '@arad-crm/vertical-mizro',
  ],
  // Workspace packages import with explicit `.js` extensions (correct for
  // moduleResolution:Bundler / tsx / drizzle-kit). Teach webpack to resolve
  // those `.js` specifiers to the real `.ts` sources when transpiling them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
