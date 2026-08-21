/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',

  productionBrowserSourceMaps: false, // Ensure source maps are disabled so original TSX files are not visible in DevTools
  compiler: {
    removeConsole: true, // Automatically strips all console.log/console.warn/etc. in production builds for security
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // Resolve webpack warning for fs module in browser builds
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;
