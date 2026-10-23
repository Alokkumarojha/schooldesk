import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  trailingSlash: true,
  allowedDevOrigins: ['192.168.29.15'],
  experimental: {
    workerThreads: true,
    webpackBuildWorker: false,
    cpus: 1,
    useTypeScriptCli: false,
  },
};

export default nextConfig;
