import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['whatsapp-web.js', 'pino', 'pdfkit', 'pdf-lib', 'bwip-js', 'ssh2', 'mysql2'],
  turbopack: {},
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
