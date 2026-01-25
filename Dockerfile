FROM node:20-slim

# Install Chromium dependencies for whatsapp-web.js
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for Puppeteer (used by whatsapp-web.js)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the app
COPY . .

# Build the Next.js app
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

# Start the app
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
