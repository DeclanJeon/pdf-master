# Infra/deploy implementation notes — 2025-05-25 work order

**Updated:** 2026-05-25  
**Scope:** Dockerfile, docker-compose.yml, .env.example, WORK_CHECKLIST only. Server/frontend code was intentionally not edited in this slice.

## Implemented locally

- Docker image now provisions the WORK-03/WORK-06 binary toolchain:
  - `poppler-utils` (`pdftotext`) for PDF → HWP text extraction.
  - Rust toolchain + `cargo install --git https://github.com/DeclanJeon/rhwp --bin rhwp --locked` for `rhwp`.
  - `qpdf` for encrypt/decrypt flows.
  - `ghostscript` (`gs`) for the future server-side PDF compression endpoint.
- Docker runtime env now exposes:
  - `RHWP_PATH`, `PDFTOTEXT_PATH`, `QPDF_PATH`, `GHOSTSCRIPT_PATH`.
  - existing HWP conversion paths: `HWPFORGE_PATH`, `SOFFICE_PATH`, `HWPX2HTML_PATH`, `MD2HTML_PATH`.
- Payment/auth deployment env placeholders were added for the WORK-01/WORK-02 server implementation:
  - Google/session: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_TTL_MS`, `COOKIE_SECURE`, `AUTH_STORE_PATH`, `PUBLIC_BASE_URL`, `APP_URL`, `FRONTEND_URL`, `CORS_ORIGIN`.
  - Polar: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_ONE_TIME_PRODUCT_ID`, `POLAR_MONTHLY_PRODUCT_ID`, `POLAR_CHECKOUT_SUCCESS_URL`, `POLAR_CHECKOUT_CANCEL_URL`.
- `docker-compose.yml` adds a `pdfmaster-data` named volume at `/app/data` for the auth/premium store path used by the current server implementation.

## Not implemented in this slice

- Google OAuth routes, Polar checkout/webhook behavior, premium persistence, and Ghostscript `/api/compress` are server/frontend work and were not edited in this infra slice; checklist rows outside env/deploy remain unchecked unless separately implemented by another slice.
- Legacy Toss env passthrough remains in compose and `.env.example` because current local server/frontend code still references Toss variables; removing it belongs with the payment-code migration.

## Deployment validation targets

After server/payment slices land, validate with:

```bash
docker compose config
docker compose build
docker compose up -d
curl -fsS http://localhost:3001/api/health
```

Expected WORK-03 health fields after a successful image rebuild include `rhwp: true`, `pdftotext: true`, and `qpdf: true`. Ghostscript is installed for WORK-06 but requires the server compression endpoint before an API-level check exists.
