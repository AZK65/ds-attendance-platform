import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['whatsapp-web.js', 'pino', 'pdfkit'],
  turbopack: {},
  images: {
    unoptimized: true,
  }
};

export default nextConfig;
