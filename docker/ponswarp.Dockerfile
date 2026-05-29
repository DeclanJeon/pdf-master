# ── PonsWarp Signaling Server Dockerfile ────────────────────────────────
# Wraps the pre-compiled Rust binary with its runtime dependencies.
# Build context: /home/declan/ponswarp

FROM ubuntu:noble

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the pre-compiled binary
COPY bin/ponswarp-signaling-rs /app/ponswarp-signaling-rs

RUN chmod +x /app/ponswarp-signaling-rs

EXPOSE 5502

# Run with environment from env_file in docker-compose
CMD ["/app/ponswarp-signaling-rs"]
