import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  experimental: { workerThreads: true, webpackBuildWorker: false, cpus: 1, useTypeScriptCli: false },
};

export default nextConfig;
