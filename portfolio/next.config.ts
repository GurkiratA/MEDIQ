import type { NextConfig } from 'next'

// Static export: `npm run build` writes a self-contained site to ./out that any
// static host (Vercel, Netlify, GitHub Pages, S3) can serve without a server.
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // This folder sits inside another project (MEDIQ) with its own lockfile;
  // pin the root so Next doesn't guess the parent.
  turbopack: { root: __dirname },
  reactStrictMode: true,
}

export default nextConfig
