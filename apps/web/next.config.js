/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // CSP: avoid eval — use source-map devtool only (no eval/Function)
  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      const devtool = dev ? 'cheap-module-source-map' : 'source-map';
      Object.defineProperty(config, 'devtool', {
        get() {
          return devtool;
        },
        set() {},
        configurable: true
      });
    }
    return config;
  },
  // Ensure no basePath or assetPrefix that could break static assets
  // Ensure output is not set to 'export' (which would disable server features)
  // App Router is default in Next.js 14, no need for experimental.appDir
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'header',
            key: 'x-forwarded-proto',
            value: 'http'
          }
        ],
        destination: 'https://auraseaos.com/:path*',
        permanent: true
      }
    ];
  }
};

module.exports = nextConfig;
