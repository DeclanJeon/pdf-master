# PDF마스터

한국 사용자를 위한 PDF/HWP 도구 모음입니다. HWP 변환, 도장/인감 삽입, 주민번호 마스킹, PDF 병합/분할/이미지 변환, 워터마크, 압축, 페이지 번호, 암호 설정/해제, 서명 이미지 삽입 기능을 제공합니다.

## 현재 처리 원칙

PDF마스터는 모든 기능을 무조건 브라우저에서 처리한다고 안내하지 않습니다.

- 브라우저 처리: PDF 병합, 분할, 이미지 추출, 워터마크, 압축, 페이지 번호, 도장/인감, 주민번호 마스킹, 서명 이미지 삽입 등 클라이언트에서 처리 가능한 PDF 편집 기능
- 서버 처리: HWP/HWPX → PDF, PDF → HWP 변환, qpdf 기반 PDF 암호 설정/해제, 결제/사용량 확인 등 서버 도구나 외부 API가 필요한 기능
- 서버 처리 파일: 업로드 후 임시 디렉터리에 저장되고, 결과 제공 후 짧은 보관 시간 내 정리됩니다.

## PDF → HWP 변환

rhwp 기반 파이프라인으로 PDF를 실제 HWP 문서로 변환합니다.

- 도구 ID: `pdf-to-hwp`
- 사용자 노출명: `PDF → HWP 변환`
- 서버 엔드포인트: `POST /api/convert/pdf-to-hwp`
- 결과 파일: `.hwp` (한글에서 열어 편집 가능)
- 변환 파이프라인: PDF → PDF2DOCX/DOCX → LibreOffice ODT → ingest.json 생성 → rhwp-ingest-exporter → HWP
- 제한: 스캔 이미지 PDF는 OCR 단계가 없어 텍스트 추출이 불가할 수 있음

## 서명 기능 고지

`pdf-sign`은 인증서 기반 전자서명이 아니라 PDF 위에 손글씨 서명 이미지를 삽입하는 기능입니다.

- 사용자 노출명: `서명 이미지 삽입`
- 제공 기능: 서명 그리기, PDF 미리보기 위 위치 지정, PDF에 이미지 삽입
- 제공하지 않는 기능: 공동인증서/전자서명 인증서 기반 서명, 서명 검증, 법적 전자서명 보증

## 빠른 시작

```bash
npm install
npm run dev:all
```

프론트엔드만 실행:

```bash
npm run dev
```

서버만 실행:

```bash
npm run dev:server
```

## 명령어

| Command | Description |
|---|---|
| `npm run dev` | Vite 개발 서버 실행 |
| `npm run dev:server` | Express API 서버 실행 |
| `npm run dev:all` | 프론트엔드와 API 서버 동시 실행 |
| `npm run build` | 프론트엔드 TypeScript/Vite 프로덕션 빌드 |
| `npm run build:server` | 서버 TypeScript 빌드 |
| `npm run lint` | ESLint 검사 |
| `npm run preview` | Vite preview 서버 실행 |
| `npm run start` | 프로덕션 모드 API 서버 실행 |

## 서버 의존성

서버 처리 기능에는 로컬/배포 환경의 외부 실행 파일이 필요할 수 있습니다.

| 기능 | 필요 도구 | 관련 설정 |
|---|---|---|
| HWP/HWPX → PDF | LibreOffice `soffice`, HwpForge CLI `0.11.1` (`convert-hwp5`), `python3` + `server/hwpx2html.py` | `SOFFICE_PATH`, `HWPFORGE_PATH`, `HWPX2HTML_PATH` |
| PDF → HWP | rhwp, rhwp-ingest-exporter, LibreOffice, `pdftotext`/`pdftohtml`(poppler-utils), `pdf2docx` | `RHWP_PATH`, `RHWP_INGEST_EXPORTER_PATH`, `SOFFICE_PATH`, `PDFTOTEXT_PATH`, `PDFTOHTML_PATH`, `PDF2DOCX_LAYOUT_MODE` |
| PDF 암호 설정/해제 | `qpdf` | `QPDF_PATH` 또는 시스템 PATH |
| 결제/프리미엄 확인 | Polar.sh API/Webhook 키 | `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_ONE_TIME_PRODUCT_ID`, `POLAR_MONTHLY_PRODUCT_ID` |
| Google 로그인/세션 | Google OAuth client, 세션 secret | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SESSION_SECRET`, `AUTH_STORE_PATH` |
| 관리자 운영 | 관리자 email allowlist, 감사 로그 | `ADMIN_EMAILS`, `ADMIN_AUDIT_LOG_PATH` |

상태 확인:

```bash
curl http://localhost:3001/healthz
curl http://localhost:3001/readyz
curl http://localhost:3001/api/health
```

`/healthz`는 프로세스 liveness, `/readyz`는 운영 필수 설정과 쓰기 가능한 runtime 디렉터리 확인, `/api/health`는 문서 처리 의존성 상태 확인용입니다.

## 주요 API

| Endpoint | Method | 설명 |
|---|---|---|
| `/healthz` | GET | liveness probe |
| `/readyz` | GET | 운영 설정/runtime readiness probe |
| `/api/health` | GET | 문서 처리 의존성 상태 조회 |
| `/api/convert/hwp-to-pdf` | POST | HWP/HWPX 업로드 후 PDF 변환 job 생성 |
| `/api/convert/status/:jobId` | GET | 변환 진행률/결과 상태 조회 |
| `/api/download/:jobId` | GET | 변환/암호 처리 결과 다운로드 |
| `/api/convert/pdf-to-hwp` | POST | PDF를 HWP(한글 편집 가능)로 변환 |
| `/api/encrypt` | POST | PDF 암호 설정 |
| `/api/decrypt` | POST | PDF 암호 해제 |
| `/api/auth/google` | GET | Google OAuth 로그인 시작 |
| `/api/auth/callback` | GET | Google OAuth 콜백 처리 후 세션 쿠키 발급 |
| `/api/auth/me` | GET | 현재 로그인 사용자와 premium 상태 조회 |
| `/api/auth/logout` | POST | 세션 쿠키/서버 세션 삭제 |
| `/api/polar/checkout` | POST | 로그인 사용자용 Polar checkout 생성 |
| `/api/polar/webhook` | POST | Polar webhook 서명 검증 후 premium 상태 반영 |
| `/api/admin/summary` | GET | 관리자 운영 대시보드 요약 |
| `/api/admin/users` | GET | 사용자/프리미엄 권한 목록 조회 |
| `/api/admin/grant-premium` | POST | reason 필수 수동 프리미엄 권한 부여/조정 |
| `/api/admin/revoke-premium` | POST | reason 필수 수동 프리미엄 권한 회수 |
| `/api/admin/audit-logs` | GET | 관리자 조작 감사 로그 조회 |


## 운영 출시 체크리스트

`NODE_ENV=production`에서는 다음 값이 없거나 placeholder이면 서버가 시작하지 않습니다.

- `SESSION_SECRET`: 32자 이상 랜덤 문자열, 예: `openssl rand -base64 32`
- `PUBLIC_BASE_URL` 또는 `APP_URL`: API 서버의 HTTPS 공개 origin
- `FRONTEND_URL`, `CORS_ORIGIN`: 실제 프론트엔드 origin allowlist
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: Google OAuth Web application 설정
- `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`: Polar API/Webhook credential
- `POLAR_ONE_TIME_PRODUCT_ID`: 건당 결제 Polar product ID `3c5002d7-b5aa-4c8d-8fe4-433e8d46c239`
- `POLAR_MONTHLY_PRODUCT_ID`: 월 구독 Polar product ID `d7cd5993-4d33-46d9-8ba6-994c70b527f9`
- `COOKIE_SECURE=true`: 운영 HTTPS cookie 필수


현재 연결된 Polar 상품:

| 요금제 | Product ID | 통화/표시 가격 |
|---|---|---|
| 건당 결제 | `3c5002d7-b5aa-4c8d-8fe4-433e8d46c239` | KRW ₩1,000 |
| 월 구독 | `d7cd5993-4d33-46d9-8ba6-994c70b527f9` | KRW ₩5,900/월 |

결제 버튼은 운영자가 제공한 Polar checkout link를 우선 사용합니다. 건당 결제는 `https://buy.polar.sh/polar_cl_aGzorRvqZUgPJEt53EUCH6VZcuSyjV1hOrjBQ473ZZp`, 월 구독은 `https://buy.polar.sh/polar_cl_FFPmuDyi5Tp6g3NXSZWDenTjVJT2HYSN2UQu90uqaio`로 이동합니다. checkout link가 비어 있을 때만 서버가 Polar Checkout Session API로 fallback 생성합니다.

Polar checkout은 서버에 설정된 product ID만 사용하며 클라이언트가 보낸 `productId`는 거부합니다. Webhook은 Standard Webhooks 서명 헤더를 검증하고 처리한 event/delivery ID를 저장해 중복 grant를 막습니다.

운영 배포 전에는 실제 credential로 Google OAuth 로그인, Polar checkout 성공/취소, Polar webhook delivery, `/readyz` 200, 프리미엄 기능 다운로드 권한을 smoke test해야 합니다.

## 관리자/운영 설계

결제 이후 운영자가 사용자 premium 상태를 확인·조정하고 감사 로그를 남기는 관리자 MVP는 `/admin` 화면과 `/api/admin/*` 서버 API로 제공됩니다. 설계 기준은 `docs/ADMIN_OPERATIONS_DESIGN_20250525.md`입니다.

핵심 원칙:

- Google 로그인 세션 기반으로 관리자 판정
- `ADMIN_EMAILS` allowlist로 서버에서 관리자 권한 강제
- 모든 수동 premium grant/revoke는 reason 필수와 append-only 감사 로그 기록
- 실제 Google OAuth/Polar checkout/webhook credential E2E와 배포 smoke는 운영 전 필수 검증

## 기능별 현재 사용 가능 상태

세부 기능 플로우와 완성률은 `docs/FEATURE_FLOW_REPORT.md`를 기준 문서로 봅니다.

요약:

| 기능 | 처리 위치 | 사용자 사용 가능 여부 | 비고 |
|---|---|---|---|
| HWP/HWPX → PDF | 서버 | 조건부 가능 | LibreOffice/HWPForge/hwpx2html 의존성 필요 |
| PDF → HWP | 서버 | 조건부 가능 | rhwp/rhwp-ingest-exporter/LibreOffice/pdf2docx/poppler-utils 필요, `.hwp` 다운로드. 스캔 PDF는 OCR 없이는 텍스트 추출 불가 |
| PDF 병합 | 브라우저 | 가능 | 여러 PDF를 단일 PDF로 저장 |
| PDF 분할 | 브라우저 | 제한적 | 내부 분할 로직은 있으나 다운로드 UX는 추가 개선 필요 |
| PDF → 이미지 | 브라우저 | 제한적 | 전체 페이지 렌더링 로직은 있으나 현재 UI는 첫 페이지 다운로드 중심 |
| 워터마크/압축/페이지 번호 | 브라우저 | 가능 | 샘플별 품질 확인 필요 |
| 도장/인감 삽입 | 브라우저 | 가능 | 좌표/미리보기 정확도 추가 QA 권장 |
| 주민번호 마스킹 | 브라우저 | 가능 | 텍스트 PDF 중심, 스캔/OCR 문서는 별도 고지 필요 |
| PDF 암호 설정/해제 | 서버 | 현재 환경에서 명확한 사용 불가 안내 | qpdf 미설치 시 `/api/health`가 `qpdf:false`를 반환하고 `/api/encrypt`/`/api/decrypt`는 `QPDF_UNAVAILABLE` 503과 사용자 안내 메시지를 반환함 |
| 서명 이미지 삽입 | 브라우저 | 가능 | 인증서 기반 전자서명이 아닙니다. 법적 전자서명 보증 없음 |

## 품질 게이트

이번 P0 정리 후 developer/CEO 기준으로 다음 명령이 통과한 상태입니다.

```bash
npm run build
npm run build:server
npm run lint
```

단, `npm run lint`는 동작 보존을 위해 일부 `react-hooks/exhaustive-deps` warning을 남길 수 있습니다.

## 남은 후속 개선

- HWP/HWPX → PDF 변환을 샘플 fixture 기반으로 품질 검증
- PDF → HWP 스캔 이미지 OCR 연동으로 텍스트 추출 범위 확장
- 실제 운영 credential로 Polar/Google OAuth E2E smoke test 자동화
- 샘플 fixture 기반 문서 변환 품질 회귀 테스트 확대
