# HwpForge Upgrade — 2026-07-17

## Summary
- Production `hwpforge` binary upgraded from **0.5.1** → **0.11.1** (`ai-screams/HwpForge`).
- CLI contract used by PDF Master remains compatible:
  - `hwpforge convert-hwp5 <input.hwp> -o <output.hwpx>`
- Binary is still mounted via Docker volume `ponslink_hwpforge_bin` → `/app/bin/hwpforge`.

## Build
```bash
git clone --depth 1 https://github.com/ai-screams/HwpForge.git
cd HwpForge
cargo build -p hwpforge-bindings-cli --release
# artifact: target/release/hwpforge
```

## Deploy
1. Copy release binary into volume mount (`/var/lib/docker/volumes/ponslink_hwpforge_bin/_data/hwpforge`).
2. Restart `docker-pdf-master-api-1` (or recreate) so process picks up binary if already open-mapped.
3. Verify:
   - `/readyz` → `dependencies.hwpforge=true`
   - `hwpforge --version` → `hwpforge 0.11.1`
