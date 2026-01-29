import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['whatsapp-web.js', 'pino', 'pdfkit', 'pdf-lib'],
  turbopack: {},
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
