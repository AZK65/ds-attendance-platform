import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['whatsapp-web.js', 'pino', 'pdfkit'],
  turbopack: {},
  images: {
    remotePatterns: []
  }
};

export default nextConfig;
