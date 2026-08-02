FROM node:20

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

# Download Puppeteer's own Chrome for Linux at image build time.
# Stored in /opt/puppeteer-cache (inside the image layer), not in the
# volume-mounted /app/node_modules which contains a Windows Chrome binary.
# Pin to the exact version installed in node_modules to guarantee the
# Chrome revision matches what puppeteer.launch() expects.
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer-cache
RUN mkdir /tmp/pp \
  && cd /tmp/pp \
  && npm init -y \
  && npm install puppeteer@22.15.0 \
  && rm -rf /tmp/pp
