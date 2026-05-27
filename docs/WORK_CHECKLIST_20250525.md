# PDF마스터 작업 체크리스트

**문서 번호:** CL-20250525-001  
**발행일:** 2025-05-25  
**사용법:** 각 항목 완료 후 [ ] → [x] 체크. 날짜와 서명 기록.  

---

## Phase 1: Critical (3일 내 완료)

### WORK-01: Google OAuth 서버 엔드포인트 구현

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 1-01 | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 환경변수 확보 | [ ] | | Google Cloud Console에서 생성 |
| 1-02 | SESSION_SECRET 생성 및 설정 | [ ] | | 32바이트 이상 랜덤 문자열 |
| 1-03 | `GET /api/auth/google` 엔드포인트 구현 | [x] | 2026-05-25 | Google OAuth redirect endpoint implemented |
| 1-04 | `GET /api/auth/callback` 콜백 핸들러 구현 | [x] | 2026-05-25 | Google callback/state/session cookie implemented |
| 1-05 | `GET /api/auth/me` 엔드포인트 구현 | [x] | 2026-05-25 | /api/auth/me returns loggedIn/user/premium |
| 1-06 | `POST /api/auth/logout` 엔드포인트 구현 | [x] | 2026-05-25 | logout clears session cookie/store entry |
| 1-07 | 환경변수 docker-compose.yml 추가 | [x] | 2026-05-25 | Google OAuth/session env placeholders added in infra slice |
| 1-08 | .env.example 갱신 | [x] | 2026-05-25 | Google OAuth/session env placeholders added in infra slice |
| 1-09 | 로컬 테스트: 로그인 → /api/auth/me → 로그아웃 | [ ] | | |
| 1-10 | 배포 서버 테스트: 동일 흐름 | [ ] | | |
| 1-11 | CORS 설정 확인 (credentials: include) | [x] | 2026-05-25 | CORS credentials enabled in server middleware |

### WORK-02: Polar.sh 결제 ↔ 프리미엄 연동

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 2-01 | Webhook 서명 검증 로직 구현 | [x] | 2026-05-25 | HMAC-SHA256 signature verification implemented |
| 2-01a | 서명 불일치 시 401 반환 | [x] | 2026-05-25 | invalid signatures return 401 POLAR_SIGNATURE_INVALID |
| 2-01b | 서명 없는 요청 차단 | [x] | 2026-05-25 | missing signatures are rejected by verifier |
| 2-02 | order.created 이벤트에서 구매자 email 추출 | [x] | 2026-05-25 | email extraction supports Polar order/checkout payload shapes |
| 2-03 | 프리미엄 상태 저장소 설계 | [x] | 2026-05-25 | file-backed JSON premium/session store added |
| 2-04 | 건당 결제: 1회 사용권 기록 | [x] | 2026-05-25 | one-time product records oneTimePasses |
| 2-05 | 월 구독: 30일 만료 타이머 | [x] | 2026-05-25 | monthly product records subscription expiry |
| 2-06 | /api/auth/me에 premium 필드 추가 | [x] | 2026-05-25 | auth/me includes premium status |
| 2-07 | 프론트엔드 AuthProvider premium 필드 매핑 | [x] | 2026-05-25 | PaymentPage maps server auth/premium response |
| 2-08 | E2E 테스트: 결제 → webhook → premium 활성화 | [ ] | | |
| 2-09 | E2E 테스트: 월 구독 만료 → premium 비활성화 | [ ] | | |

### WORK-03: 로컬-서버 코드 통합 + rhwp 배포

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 3-01 | 서버 server/index.ts를 로컬 기준으로 교체 | [x] | 2026-05-25 | server now uses rhwp + Polar paths; Toss endpoints removed |
| 3-02 | /api/convert/pdf-to-odt 제거 확인 | [x] | 2026-05-25 | static contract verifies no pdf-to-odt endpoint |
| 3-03 | /api/convert/pdf-to-hwp 엔드포인트 존재 확인 | [x] | 2026-05-25 | /api/convert/pdf-to-hwp exists and uses rhwp |
| 3-04 | RHWP_PATH, PDFTOTEXT_PATH 환경변수 추가 | [x] | 2026-05-25 | server already reads env; docker-compose/.env.example now expose values |
| 3-05 | Dockerfile에 poppler-utils 추가 | [x] | 2026-05-25 | apt-get install poppler-utils |
| 3-06 | Dockerfile에 rustup + cargo install rhwp 추가 | [x] | 2026-05-25 | rustup minimal + cargo install rhwp --locked |
| 3-07 | Dockerfile에 RHWP_PATH=rhwp, PDFTOTEXT_PATH=pdftotext ENV | [x] | 2026-05-25 | Dockerfile ENV set |
| 3-08 | 로컬 PaymentPage.tsx Polar.sh 기반으로 재작성 | [x] | 2026-05-25 | PaymentPage rewritten for Google OAuth + Polar checkout |
| 3-09 | 로컬에서 `npm run build && npm run build:server` 통과 | [x] | 2026-05-25 | npm run build and server tsc checks pass locally |
| 3-10 | 배포: `docker compose build` 성공 | [ ] | | rhwp 빌드 시간 5~15분 예상 |
| 3-11 | 배포: `docker compose up -d` | [ ] | | |
| 3-12 | 서버 /api/health에 rhwp: true, pdftotext: true 확인 | [ ] | | |
| 3-13 | 서버 /api/convert/pdf-to-hwp E2E 테스트 | [ ] | | 샘플 PDF 업로드 → .hwp 다운로드 |
| 3-14 | 서버 /api/convert/pdf-to-odt 404 확인 | [x] | 2026-05-25 | local smoke: POST /api/convert/pdf-to-odt returned 404 |

---

## Phase 2: High (1주 내 완료)

### WORK-04: PDF 분할 UX 수정

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 4-01 | 분할 모드 선택 UI: "N등분" 라디오 | [x] | 2026-05-25 | GenericPdfTool split mode selector added |
| 4-02 | 분할 모드 선택 UI: "페이지 범위" 라디오 | [x] | 2026-05-25 | range mode selector added |
| 4-03 | N등분: 숫자 입력 (2~50) + 검증 | [x] | 2026-05-25 | 2~50 count validation added |
| 4-04 | 페이지 범위: "1-3, 5, 8-10" 파싱 | [x] | 2026-05-25 | range parser supports comma/ranges |
| 4-05 | 범위 검증 (1~totalPages) | [x] | 2026-05-25 | splitPdf validates ranges against page count |
| 4-06 | JSZip 의존성 추가 | [x] | 2026-05-25 | jszip dependency installed |
| 4-07 | 다중 PDF 결과 → ZIP 묶기 | [x] | 2026-05-25 | split outputs bundled into ZIP |
| 4-08 | ZIP 다운로드 (`split-result.zip`) | [x] | 2026-05-25 | split-result.zip download configured |
| 4-09 | splitPdf 함수 range 모드 복수 범위 지원 | [x] | 2026-05-25 | splitPdf range mode returns multiple PDFs |
| 4-10 | UI 테스트: N등분 동작 | [x] | 2026-05-25 | worker smoke/static tests covered N split |
| 4-11 | UI 테스트: 범위 지정 동작 | [x] | 2026-05-25 | worker smoke/static tests covered range split |

### WORK-05: PDF→이미지 전체 페이지 다운로드

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 5-01 | pdfToImages 포맷 매개변수 추가 (png/jpeg) | [x] | 2026-05-25 | pdfToImages format option added |
| 5-02 | pdfToImages 해상도 매개변수 추가 (scale) | [x] | 2026-05-25 | pdfToImages scale option added |
| 5-03 | 포맷 선택 UI: PNG / JPEG 라디오 | [x] | 2026-05-25 | PNG/JPEG selector added |
| 5-04 | 해상도 선택 UI: 1x / 1.5x / 2x | [x] | 2026-05-25 | 1x/1.5x/2x selector added |
| 5-05 | JSZip으로 전체 페이지 ZIP 묶기 | [x] | 2026-05-25 | all rendered pages bundled with JSZip |
| 5-06 | ZIP 다운로드 (`{filename}-images.zip`) | [x] | 2026-05-25 | {filename}-images.zip download configured |
| 5-07 | 10페이지 PDF 전체 ZIP 다운로드 테스트 | [ ] | | |
| 5-08 | 대용량 PDF(50페이지) 메모리 안정성 테스트 | [ ] | | |

### WORK-06: PDF 압축 알고리즘 재작성

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 6-01 | Ghostscript Dockerfile 설치 추가 | [x] | 2026-05-25 | apt-get install ghostscript; GHOSTSCRIPT_PATH=gs exposed |
| 6-02 | `POST /api/compress` 엔드포인트 구현 | [x] | 2026-05-25 | /api/compress implemented with multer + gs |
| 6-03 | 품질 프리셋 매개변수: screen/ebook/printer/prepress | [x] | 2026-05-25 | screen/ebook/printer/prepress presets validated |
| 6-04 | 클라이언트 compressPdf() → 서버 API 호출로 변경 | [x] | 2026-05-25 | client compressPdf calls server API |
| 6-05 | 품질 프리셋 선택 UI | [x] | 2026-05-25 | compression preset UI added |
| 6-06 | 텍스트 보존 확인 (압축 후 텍스트 검색 가능) | [x] | 2026-05-25 | local Ghostscript smoke preserved pdftotext output after compression |
| 6-07 | 파일 크기 축소율 표시 | [ ] | | "43% 축소 (12MB → 6.8MB)" |
| 6-08 | 50MB PDF 처리 안정성 테스트 | [ ] | | |
| 6-09 | 기존 래스터화 방식 코드 제거 | [x] | 2026-05-25 | client-side raster compression removed |

---

## Phase 3: Medium (2주 내 완료)

### WORK-07: 암호 설정/해제 UX 개선

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 7-01 | PasswordModal 컴포넌트 생성 | [ ] | | |
| 7-02 | 비밀번호 입력 필드 + 표시/숨기기 토글 | [x] | 2026-05-25 | password input field added in tool config UI |
| 7-03 | 비밀번호 확인(2회) 필드 + 일치 검증 | [x] | 2026-05-25 | encrypt password confirmation added |
| 7-04 | 비밀번호 강도 표시 (약/중/강) | [x] | 2026-05-25 | password strength indicator added |
| 7-05 | GenericPdfTool pdf-encrypt: prompt → PasswordModal | [x] | 2026-05-25 | pdf-encrypt no longer uses prompt |
| 7-06 | GenericPdfTool pdf-unlock: prompt → PasswordModal | [x] | 2026-05-25 | pdf-unlock no longer uses prompt |
| 7-07 | 503 에러 메시지 개선 | [x] | 2026-05-25 | qpdf unavailable 503 message improved |
| 7-08 | 401 에러 메시지 개선 | [x] | 2026-05-25 | invalid password 401 message improved |

### WORK-08: 프리미엄 상태 서버 사이드 관리

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 8-01 | /api/encrypt 미들웨어: 세션 프리미엄 체크 | [x] | 2026-05-25 | requirePremium applied to /api/encrypt |
| 8-02 | /api/decrypt 미들웨어: 세션 프리미엄 체크 | [x] | 2026-05-25 | requirePremium applied to /api/decrypt |
| 8-03 | /api/convert/pdf-to-hwp 미들웨어: 프리미엄 체크 | [x] | 2026-05-25 | requirePremium applied to /api/convert/pdf-to-hwp |
| 8-04 | 403 응답에 결제 유도 메시지 포함 | [x] | 2026-05-25 | 403 PREMIUM_REQUIRED includes payment guidance |
| 8-05 | 프론트엔드: 403 수신 시 결제 페이지 안내 | [x] | 2026-05-25 | frontend redirects premium-required users to /pricing |
| 8-06 | localStorage 조작으로 프리미엄 우회 불가 확인 | [x] | 2026-05-25 | PaymentPage no longer grants premium from client storage |

### WORK-09: 워터마크 제거 기능 정리

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 9-01 | 기획 결정: 구현 vs 제거 | [x] | 2026-05-25 | decided to remove unsupported watermark-removal sales copy |
| 9-02 | (구현 시) 워터마크 제거 로직 설계 | [ ] | | |
| 9-03 | (제거 시) PaymentPage FEATURES에서 삭제 | [x] | 2026-05-25 | PaymentPage FEATURES/copy no longer advertises removal |
| 9-04 | 서버 배포 FEATURES와 일치 확인 | [x] | 2026-05-25 | pricing copy aligned to implemented watermark-add feature |

---

## Phase 4: Low (향후 개선)

### WORK-10: 페이지 번호 커스텀

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 10-01 | 위치 옵션 UI (6포지션) | [ ] | | |
| 10-02 | 시작 번호 입력 | [ ] | | |
| 10-03 | 형식 선택 UI | [ ] | | |
| 10-04 | 한글 폰트 임베딩 옵션 | [ ] | | |

### WORK-11: 도장 템플릿 다양화

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 11-01 | 원형 인감 템플릿 | [ ] | | |
| 11-02 | 사각 관인 템플릿 | [ ] | | |
| 11-03 | 텍스트 입력 → 자동 도장 생성 | [ ] | | Canvas 렌더링 |
| 11-04 | 도장 색상 선택 (적/흑/청) | [ ] | | |

### WORK-12: 마스킹 OCR 연동

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 12-01 | OCR 엔진 선정 (Tesseract.js vs 서버) | [ ] | | |
| 12-02 | 스캔 PDF 테스트셋 준비 | [ ] | | |
| 12-03 | POC 구현 | [ ] | | |
| 12-04 | 정확도 측정 및 임계치 결정 | [ ] | | |

### WORK-13: 비표준 이미지 포맷 지원

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 13-01 | HEIC → PNG 변환 로직 | [ ] | | |
| 13-02 | BMP → PNG 변환 로직 | [ ] | | |
| 13-03 | WebP → PNG 변환 로직 | [ ] | | |
| 13-04 | mergePdfs/imagesToPdf에서 처리 | [ ] | | |

---

## Phase 1B: 관리자/운영 MVP (결제 이후 운영)

### WORK-14: 관리자/운영 설계 및 MVP 구현

설계 기준 문서: `docs/ADMIN_OPERATIONS_DESIGN_20250525.md`

| # | 체크 항목 | 상태 | 완료일 | 비고 |
|---|-----------|------|--------|------|
| 14-01 | 관리자/운영 설계문서 작성 | [x] | 2026-05-25 | `docs/ADMIN_OPERATIONS_DESIGN_20250525.md` |
| 14-02 | `.env.example`에 `ADMIN_EMAILS`, `ADMIN_AUDIT_LOG_PATH` 추가 | [x] | 2026-05-25 | 관리자 env placeholders 추가 |
| 14-03 | `docker-compose.yml`에 관리자 env pass-through 추가 | [x] | 2026-05-25 | `ADMIN_EMAILS`, `ADMIN_AUDIT_LOG_PATH` pass-through |
| 14-04 | 서버 `requireAdmin` 미들웨어 구현 | [x] | 2026-05-25 | Google 세션 + ADMIN_EMAILS allowlist |
| 14-05 | `GET /api/admin/summary` 구현 | [x] | 2026-05-25 | 운영 대시보드 요약 |
| 14-06 | `GET /api/admin/users` 구현 | [x] | 2026-05-25 | email/name 검색, premium 필터 |
| 14-07 | `GET /api/admin/users/:email` 구현 | [x] | 2026-05-25 | 세션/premium/event 상세 |
| 14-08 | `POST /api/admin/grant-premium` 구현 | [x] | 2026-05-25 | reason 필수, grant/adjust |
| 14-09 | `POST /api/admin/revoke-premium` 구현 | [x] | 2026-05-25 | reason 필수, revoke |
| 14-10 | 관리자 조작 감사 로그 JSONL append 구현 | [x] | 2026-05-25 | actor/action/target/before/after/reason |
| 14-11 | 프론트 `/admin` 대시보드/사용자 목록/상세 UI 구현 | [x] | 2026-05-25 | 미로그인/비관리자 접근 차단 |
| 14-12 | 관리자 API static/runtime smoke 테스트 추가 | [x] | 2026-05-25 | 401/403/200 및 grant/revoke 검증 |
| 14-13 | 실제 Google OAuth 로그인 E2E | [ ] | | 실 credential 필요 |
| 14-14 | 실제 Polar webhook premium 활성화 E2E | [ ] | | 실 webhook secret/event 필요 |
| 14-15 | 배포 서버 admin/premium smoke | [ ] | | pdfm.ponslink.com 기준 |

---

## 진행 추적

| Phase | 기간 | WORK | 상태 |
|-------|------|------|------|
| 1 Critical | ~5/28 | WORK-01, 02, 03 | [ ] 진행 중 |
| 2 High | ~6/1 | WORK-04, 05, 06 | [ ] 대기 |
| 3 Medium | ~6/8 | WORK-07, 08, 09 | [ ] 대기 |
| 4 Low | ~6/22 | WORK-10~13 | [ ] 대기 |

---

## Infra/deploy slice note (2026-05-25)

- 이번 slice는 Dockerfile, docker-compose.yml, .env.example, docs 구현 노트만 수정했다.
- 체크된 항목은 로컬 infra 파일에서 구현/노출된 항목만 표시했다.
- 이후 통합 작업에서 Google OAuth, Polar webhook/premium 저장, `/api/compress`, 프론트 결제/도구 UI 항목을 구현했다. 배포 서버 검증 항목은 아직 미실행이다.
- 상세 내역: `docs/INFRA_DEPLOY_NOTES_20250525.md`.

---

## 서명

| 역할 | 이름 | 날짜 |
|------|------|------|
| 발행 | CEO Orchestrator | 2025-05-25 |
| 승인 | | |
| 확인 | | |
