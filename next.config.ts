import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['whatsapp-web.js', 'pino', 'pdfkit', 'pdf-lib', 'bwip-js'],
  turbopack: {},
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
