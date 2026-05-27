FROM node:20-slim

# Install LibreOffice + JRE + Python3 + Korean/CJK fonts + Korean locale + qpdf + Ghostscript + rhwp build deps
# Note: h2orestart needs libreoffice-core (full), which replaces -nogui
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice-writer-nogui \
    libreoffice-draw-nogui \
    default-jre-headless \
    python3 \
    python3-pip \
    python3-pil \
    poppler-utils \
    git \
    curl \
    ca-certificates \
    build-essential \
    pkg-config \
    libssl-dev \
    fonts-noto-cjk \
    fonts-nanum \
    locales \
    qpdf \
    ghostscript \
    imagemagick \
    && sed -i '/ko_KR.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen ko_KR.UTF-8 && \
    python3 -m pip install --break-system-packages --no-cache-dir 'pdf2docx>=0.5.13' && \
    rm -rf /var/lib/apt/lists/*

# Build/install rhwp CLI and HWP ingest exporter for PDF→HWP conversion.
ENV PATH="/root/.cargo/bin:${PATH}"
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal && \
    cargo install --git https://github.com/DeclanJeon/rhwp --bin rhwp --locked
RUN command -v rhwp && command -v pdftotext && command -v qpdf && command -v gs && python3 -c "import PIL, pdf2docx"

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

# Build the repo-local ingest exporter. Unlike `rhwp build-from-ingest`, this
# serializes the ingest document as real HWP5/OLE instead of HWPX.
COPY tools/rhwp-ingest-exporter/ ./tools/rhwp-ingest-exporter/
RUN cargo build --manifest-path ./tools/rhwp-ingest-exporter/Cargo.toml --release && \
    cp ./tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter /usr/local/bin/rhwp-ingest-exporter && \
    rhwp-ingest-exporter --version

# Copy package files first for Docker cache
COPY package.json package-lock.json ./
RUN npm install --omit=dev && npm install -D tsx

# HwpForge binary is mounted via Docker volume (hwpforge-bin → /app/bin)
RUN mkdir -p /app/bin

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
ENV RHWP_PATH=rhwp
ENV RHWP_INGEST_EXPORTER_PATH=rhwp-ingest-exporter
ENV PDFTOTEXT_PATH=pdftotext
ENV PDFTOPPM_PATH=pdftoppm
ENV PDF2DOCX_SCRIPT_PATH=/app/scripts/pdf_to_docx.py
ENV PDF2DOCX_LAYOUT_MODE=absolute
ENV PDF_HWP_PRIMARY_PIPELINE=pdf2docx-docx
ENV QPDF_PATH=qpdf
ENV GHOSTSCRIPT_PATH=gs

EXPOSE 3001

CMD ["npx", "tsx", "server/index.ts"]
