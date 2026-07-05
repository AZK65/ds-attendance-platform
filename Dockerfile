FROM node:20-slim

# Install git, build tools, fonts, and the shared libraries Chrome needs.
# We do NOT install the apt "chromium" binary anymore (it's a rolling build that
# crashes on launch) — but Chrome-for-Testing / chrome-headless-shell still need
# these system libraries present. Listing them explicitly instead of relying on
# the chromium metapackage to pull them in, so a launch never fails on a missing
# .so (symptom: "Target.setAutoAttach: Target closed" — Chrome dies immediately).
RUN apt-get update && apt-get install -y \
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
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configure git to use HTTPS instead of SSH for GitHub
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git@github.com:"

# Use puppeteer's own version-matched Chrome instead of the apt "chromium"
# package. That package is a rolling build that jumped to v150 and now crashes
# on launch (SIGTRAP), silently breaking every rebuild. The apt chromium above
# is kept ONLY for the shared libraries + fonts puppeteer's Chrome depends on;
# puppeteer downloads and runs its own binary (installed below into the cache).
# PUPPETEER_EXECUTABLE_PATH is intentionally unset so the client uses it.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (ci for clean, reproducible installs)
RUN npm ci

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the app
COPY . .

# Ensure node_modules matches current package.json (removes stale packages from cache)
RUN npm prune

# Download puppeteer's matched browser binaries into the image cache. Runtime
# uses these (executablePath is unset), so a broken/updated system Chromium
# can't affect us. We install chrome-headless-shell because the client launches
# in `headless: 'shell'` mode: full Chrome's new-headless spawns a separate
# child target that fails to attach in this locked-down container
# ("Target.setAutoAttach: Target closed"); chrome-headless-shell is a single
# purpose-built headless binary that avoids that failure mode. Chrome is still
# installed as a fallback.
RUN npx puppeteer browsers install chrome-headless-shell && \
    npx puppeteer browsers install chrome

# Build args for NEXT_PUBLIC_ env vars (inlined at build time)
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY

# Build the Next.js app
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

# Increase Node.js heap limit (default ~1.5GB is too small for WhatsApp + analytics)
ENV NODE_OPTIONS="--max-old-space-size=3072"

# Start the app
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && npm start"]
