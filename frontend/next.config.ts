import type { NextConfig } from "next";

const apiProxyTarget = (
    process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',

  async rewrites() {
    console.log(apiProxyTarget)
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`,
      }
    ]
  }
};

export default nextConfig;
