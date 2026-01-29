import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['whatsapp-web.js', 'pino', 'pdfkit', 'pdf-lib'],
  turbopack: {},
  images: {
    unoptimized: true,
  },
  // Allow larger request bodies for image uploads (OCR)
  serverBodyParsingMaxSize: '50mb',
};

export default nextConfig;
