FROM node:20-slim

# Install Chromium, git, build tools, and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    git \
    openssh-client \
    ca-certificates \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    build-essential \
    python3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configure git to use HTTPS instead of SSH for GitHub
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git@github.com:"

# Find and set the actual Chromium binary path
RUN which chromium || which chromium-browser || echo "Chromium not found!"
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
