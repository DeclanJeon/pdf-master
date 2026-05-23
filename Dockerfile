FROM node:20-slim

# Install LibreOffice + JRE + Python3 + Korean/CJK fonts + Korean locale + qpdf
# Note: h2orestart needs libreoffice-core (full), which replaces -nogui
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice-writer-nogui \
    libreoffice-draw-nogui \
    default-jre-headless \
    python3 \
    fonts-noto-cjk \
    fonts-nanum \
    locales \
    qpdf \
    && sed -i '/ko_KR.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen ko_KR.UTF-8 && \
    rm -rf /var/lib/apt/lists/*

# Install HWP filter extension for LibreOffice (Ubuntu deb on Debian)
COPY libreoffice-h2orestart_0.6.1-1_all.deb /tmp/h2orestart.deb
RUN dpkg -i /tmp/h2orestart.deb 2>/dev/null || true && \
    apt-get update && \
    apt-get install -f -y --no-install-recommends 2>/dev/null || true && \
    rm -f /tmp/h2orestart.deb && \
    rm -rf /var/lib/apt/lists/*

# Verify HWP extension + Korean fonts
RUN ls /usr/lib/libreoffice/share/extensions/h2orestart/ 2>/dev/null && echo "h2orestart OK" || echo "h2orestart MISSING"
RUN fc-list :lang=ko | head -3 && echo "Korean fonts OK" || echo "Korean fonts MISSING"

WORKDIR /app

# Copy package files first for Docker cache
COPY package.json package-lock.json ./
RUN npm install --omit=dev && npm install -D tsx

# Copy pre-built HwpForge binary
COPY bin/hwpforge /app/bin/hwpforge
RUN chmod +x /app/bin/hwpforge

# Copy server and scripts
COPY server/ ./server/
COPY scripts/ ./scripts/

# Create temp dirs
RUN mkdir -p /app/uploads /app/outputs

# Environment
ENV PORT=3001
ENV NODE_ENV=production
ENV HWPFORGE_PATH=/app/bin/hwpforge
ENV SOFFICE_PATH=soffice
ENV HWPX2HTML_PATH=/app/server/hwpx2html.py

EXPOSE 3001

CMD ["npx", "tsx", "server/index.ts"]
