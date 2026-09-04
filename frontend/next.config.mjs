/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        // Proxies every /api/* call the frontend makes to the Express
        // backend on port 3000. This keeps the browser talking to a
        // single same-origin host, so there are no CORS preflight
        // requests to configure on the backend at all.
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
};

export default nextConfig;