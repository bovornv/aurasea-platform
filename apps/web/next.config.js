/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure no basePath or assetPrefix that could break static assets
  // Ensure output is not set to 'export' (which would disable server features)
  // App Router is default in Next.js 14, no need for experimental.appDir
};

module.exports = nextConfig;
