/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://smart-market-watchlist-8a2w.onrender.com/api/:path*',
      },
    ];
  },
};

export default nextConfig;