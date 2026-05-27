import type { NextConfig } from 'next';
import path from 'node:path';

const isVercel = process.env.VERCEL === '1';
const requestedDistDir = (process.env.PROMPIX_NEXT_DIST_DIR || '').trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  ...(requestedDistDir ? { distDir: requestedDistDir } : {}),
  ...(isVercel ? {} : { outputFileTracingRoot: path.join(process.cwd(), '..') }),
};

export default nextConfig;
