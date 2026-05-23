FROM node:24-slim

# Install LibreOffice and Python3
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice-writer \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install deps
RUN npm install --omit=dev

# Install tsx for running TS directly
RUN npm install -D tsx

# Copy source
COPY server/ ./server/
COPY scripts/ ./scripts/

# Create temp dirs
RUN mkdir -p uploads outputs

# Environment defaults
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["npx", "tsx", "server/index.ts"]
