/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
