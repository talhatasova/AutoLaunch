/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package ships raw TypeScript from src/, so Next must compile it.
  transpilePackages: ["@directorylaunch/shared"],
  experimental: { optimizePackageImports: ["lucide-react"] },
};

export default nextConfig;
