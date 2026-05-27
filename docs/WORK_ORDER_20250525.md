# PDF마스터 작업지시서

**문서 번호:** WO-20250525-001  
**발행일:** 2025-05-25  
**발행자:** CEO Orchestrator  
**우선순위:** Critical → High → Medium → Low  

---

## WORK-01: Google OAuth 서버 엔드포인트 구현 [CRITICAL]

**담당:** 백엔드  
**기한:** 3일  
**의존:** WORK-02, WORK-03  

### 배경
배포된 프론트엔드(AuthProvider)가 `/api/auth/google`, `/api/auth/me`, `/api/auth/logout`을 호출하나 서버에 해당 엔드포인트가 없다. 결제 버튼 클릭 시 "로그인이 필요합니다" 에러 후 404 발생.

### 작업 내용
1. `server/index.ts`에 Google OAuth 2.0 로그인 플로우 구현
   - `GET /api/auth/google` → Google OAuth 2.0 인증 페이지 리다이렉트
   - `GET /api/auth/callback` → Google 콜백 수신 → 세션 쿠키 발급
   - `GET /api/auth/me` → 세션 쿠키 확인 → `{ loggedIn, user, premium }` 반환
   - `POST /api/auth/logout` → 세션 쿠키 삭제
2. 세션 저장소: 서버 재시작 시 유지되는 방식 필요
   - 옵션 A: express-session + 메모리 저장소 (MVP)
   - 옵션 B: JWT + httpOnly 쿠키
3. 환경변수 추가:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `SESSION_SECRET`
4. docker-compose.yml에 환경변수 추가
5. .env.example 갱신

### 완료 기준
- [ ] `/api/auth/google` → Google 로그인 페이지 리다이렉트
- [ ] 콜백 후 `/api/auth/me`가 `{ loggedIn: true, user: { name, email, avatarUrl }, premium: { isPremium } }` 반환
- [ ] `/api/auth/logout` 호출 후 세션 삭제
- [ ] 프론트엔드에서 로그인/로그아웃 정상 동작

---

## WORK-02: Polar.sh 결제 ↔ 프리미엄 상태 연동 [CRITICAL]

**담당:** 백엔드  
**기한:** 3일 (WORK-01 완료 후 착수)  
**의존:** WORK-01  

### 배경
Polar.sh checkout API는 동작하나 webhook 수신 시 서버가 프리미엄 상태를 저장하지 않는다. 현재 localStorage 기반이라 조작 가능.

### 작업 내용
1. `/api/polar/webhook` 핸들러 수정:
   - `order.created` 이벤트 수신 시 구매자 email + productId 기록
   - 프리미엄 상태를 세션/DB에 저장
2. `/api/auth/me` 응답에 `premium` 필드 추가:
   - 건당 결제: 1회 사용권 (productId 매칭)
   - 월 구독: 30일 유효 (만료 체크)
3. Webhook 서명 검증 구현:
   - `polar-webhook-signature` 헤더 검증
   - `POLAR_WEBHOOK_SECRET`으로 HMAC 검증
   - 서명 불일치 시 401 반환
4. `/api/auth/me`의 `premium.isPremium`을 프론트엔드 AuthProvider가 사용

### 완료 기준
- [ ] Webhook 서명 검증 통과 (위조 요청 401 차단)
- [ ] 결제 완료 후 `/api/auth/me`에서 `premium.isPremium === true` 반환
- [ ] 월 구독 30일 만료 후 자동 `isPremium === false`
- [ ] 건당 결제 1회 사용 후 소모 처리

---

## WORK-03: 로컬-서버 코드 통합 + rhwp 배포 [CRITICAL]

**담당:** 백엔드/인프라  
**기한:** 2일  

### 배경
로컬 server/index.ts는 rhwp 파이프라인 + pdf-to-hwp 엔드포인트가 있으나 서버는 구코드(pdf-to-odt)를 실행 중. Dockerfile에 rhwp/poppler 미포함.

### 작업 내용
1. 서버 server/index.ts를 로컬 기준으로 통합:
   - `/api/convert/pdf-to-odt` 제거
   - `/api/convert/pdf-to-hwp` (+ rhwp 파이프라인) 배포
   - Toss Payments 코드 제거 (Polar.sh만 사용)
   - RHWP_PATH, PDFTOTEXT_PATH 환경변수 추가
   - Health check에 rhwp/pdftotext 항목 추가
2. Dockerfile 갱신:
   - `poppler-utils` apt 설치 추가
   - rustup + `cargo install rhwp` 빌드 스텝 추가
   - RHWP_PATH=rhwp, PDFTOTEXT_PATH=pdftotext ENV 설정
3. docker-compose.yml 갱신:
   - RHWP_PATH, PDFTOTEXT_PATH 환경변수 추가
4. 로컬 PaymentPage.tsx를 Polar.sh 기반으로 재작성 (또는 서버 빌드 소스 동기화)
5. 배포: `docker compose build && docker compose up -d`

### 완료 기준
- [ ] 서버 `/api/health`에 `rhwp: true, pdftotext: true` 표시
- [ ] `/api/convert/pdf-to-hwp` 엔드포인트 동작
- [ ] `/api/convert/pdf-to-odt` 엔드포인트 제거 (404)
- [ ] 서버 로컬 코드가 단일 소스로 통합 (분기 해소)

---

## WORK-04: PDF 분할 UX 수정 [HIGH]

**담당:** 프론트엔드  
**기한:** 3일  

### 배경
`splitPdf(acceptedFiles[0], 'count', 2)` 하드코딩으로 항상 2등분. 결과도 JSON Blob이라 다운로드 불가.

### 작업 내용
1. GenericPdfTool.tsx pdf-split 케이스 수정:
   - 분할 모드 선택 UI: "N등분" vs "페이지 범위"
   - N등분: 숫자 입력 (2~50)
   - 페이지 범위: "1-3, 5, 8-10" 형식 파싱
2. 결과 처리 수정:
   - 다중 PDF → JSZip으로 ZIP 묶기
   - ZIP Blob 다운로드 (`split-result.zip`)
3. splitPdf 함수의 range 모드 파서 강화:
   - 콤마 구분 복수 범위 지원
   - 범위 검증 (1~totalPages)

### 완료 기준
- [ ] 사용자가 분할 수/범위를 입력 가능
- [ ] 결과가 ZIP 파일로 다운로드
- [ ] 범위 입력 검증 (오류 시 안내)

---

## WORK-05: PDF→이미지 전체 페이지 다운로드 [HIGH]

**담당:** 프론트엔드  
**기한:** 2일  

### 배경
`images[0]`만 다운로드. 전체 페이지 ZIP 필요.

### 작업 내용
1. GenericPdfTool.tsx pdf-to-image 케이스 수정:
   - pdfToImages() 전체 결과를 JSZip으로 ZIP 묶기
   - 페이지별 `page-1.png`, `page-2.png` ... 명명
   - ZIP 다운로드 (`{filename}-images.zip`)
2. 옵션 UI 추가:
   - 포맷 선택: PNG / JPEG
   - 해상도 선택: 1x / 1.5x / 2x
3. pdfToImages 함수 수정:
   - 포맷/해상도 매개변수 추가

### 완료 기준
- [ ] 전체 페이지 ZIP 다운로드 동작
- [ ] 포맷(PNG/JPEG) 선택 가능
- [ ] 해상도 조절 가능

---

## WORK-06: PDF 압축 알고리즘 재작성 [HIGH]

**담당:** 백엔드  
**기한:** 5일  

### 배경
현재 래스터화 방식은 텍스트 검색을 파괴하고 품질이 현저히 저하됨.

### 작업 내용
1. 서버 사이드 압축 엔드포인트 구현:
   - `POST /api/compress` (multer 업로드)
   - Ghostscript 기반 구조 재압축:
     ```
     gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 \
        -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH \
        -sOutputFile=output.pdf input.pdf
     ```
   - 품질 프리셋: screen/ebook/printer/prepress
2. 클라이언트 수정:
   - `compressPdf()` → 서버 API 호출로 변경
   - 품질 프리셋 선택 UI
3. Dockerfile에 ghostscript 설치 추가

### 완료 기준
- [ ] 텍스트 보존된 채 파일 크기 축소
- [ ] 품질 프리셋 4단계 선택 가능
- [ ] 대용량 PDF(50MB) 처리 안정

---

## WORK-07: 암호 설정/해제 UX 개선 [MEDIUM]

**담당:** 프론트엔드  
**기한:** 2일  

### 배경
`window.prompt()`로 비밀번호 입력. 확인 필드 없음.

### 작업 내용
1. GenericPdfTool.tsx pdf-encrypt/pdf-unlock 케이스 수정:
   - 커스텀 모달 다이얼로그로 교체
   - 비밀번호 입력 + 확인(2회) 필드
   - 비밀번호 강도 표시 (약/중/강)
   - 표시/숨기기 토글
2. 오류 메시지 개선:
   - 503 → "서버에 암호 처리 모듈이 설치되어 있지 않습니다"
   - 401 → "비밀번호가 틀렸습니다"

### 완료 기준
- [ ] prompt() 제거, 모달 사용
- [ ] 비밀번호 확인 필드 일치 검증
- [ ] 강도 표시 동작

---

## WORK-08: 프리미엄 상태 서버 사이드 관리 [MEDIUM]

**담당:** 백엔드  
**기한:** 3일  
**의존:** WORK-01, WORK-02  

### 배경
현재 프리미엄 상태가 localStorage에 저장되어 조작 가능.

### 작업 내용
1. `/api/auth/me`에서 서버 사이드 프리미엄 상태 반환
2. 프리미엄 기능 사용 시 서버 검증:
   - `/api/encrypt`, `/api/decrypt` 미들웨어에서 세션 프리미엄 체크
   - `/api/convert/pdf-to-hwp` 미들웨어에서 체크
3. 프론트엔드 AuthProvider의 `premium`을 서버 응답 기반으로 사용
4. localStorage fallback은 개발 모드만 허용

### 완료 기준
- [ ] 프리미엄 기능 사용 시 서버 검증
- [ ] 미결제 사용자에게 403 + 결제 유도
- [ ] localStorage 조작으로 프리미엄 우회 불가

---

## WORK-09: 워터마크 제거 기능 정리 [MEDIUM]

**담당:** 기획+프론트엔드  
**기한:** 1일  

### 배경
요금표 FEATURES에 "워터마크 제거"가 유료 기능으로 표시되나 구현되지 않음.

### 작업 내용
1. 기획 결정:
   - 옵션 A: 워터마크 제거 기능 구현 (pdf-lib에서 워터마크 레이어 제거)
   - 옵션 B: 요금표에서 "워터마크 제거" 항목 제거
2. 선택한 옵션에 따라 PaymentPage.tsx FEATURES 갱신

### 완료 기준
- [ ] 기획 결정 문서화
- [ ] 요금표와 실제 기능 일치

---

## WORK-10: 페이지 번호 커스텀 [LOW]

**담당:** 프론트엔드  
**기한:** 2일  

### 작업 내용
1. 위치 옵션: 하단중앙(현재) + 하단좌/하단우/상단중앙/상단좌/상단우
2. 시작 번호 입력 (기본 1)
3. 형식 선택: `1/N`, `- 1 -`, `1`, `Page 1 of N`
4. 한글 폰트 옵션 (pdf-lib 커스텀 폰트 임베딩)

---

## WORK-11: 도장 템플릿 다양화 [LOW]

**담당:** 프론트엔드  
**기한:** 3일  

### 작업 내용
1. 기본 템플릿 추가: 원형 인감, 사각 관인, 타원 사인도장
2. 텍스트 입력 → 자동 도장 생성 (Canvas 렌더링)
3. 도장 색상 선택 (적/흑/청)

---

## WORK-12: 마스킹 OCR 연동 검토 [LOW]

**담당:** 기획+백엔드  
**기한:** 5일  

### 작업 내용
1. OCR 엔진 선정: Tesseract.js (클라이언트) vs 서버 Tesseract/PaddleOCR
2. 스캔 PDF → OCR 텍스트 → 마스킹 감지 파이프라인 설계
3. POC 구현 및 정확도 측정

---

## WORK-13: 비표준 이미지 포맷 지원 [LOW]

**담당:** 프론트엔드  
**기한:** 1일  

### 작업 내용
1. HEIC, BMP, TIFF, WebP → Canvas → PNG 변환 로직 추가
2. mergePdfs, imagesToPdf에서 비표준 포맷 처리

---

## WORK-14: 관리자/운영 MVP 구현 [CRITICAL]

**담당:** 백엔드/프론트엔드  
**기한:** 2일  
**의존:** WORK-01, WORK-02  
**설계:** `docs/ADMIN_OPERATIONS_DESIGN_20250525.md`

### 배경

Google 로그인과 Polar 결제 후 운영자가 사용자 premium 상태를 확인하거나 webhook 실패를 수동 조정할 방법이 없다. 결제 이후 고객지원/운영을 위해 관리자 API, 관리자 화면, 감사 로그가 필요하다.

### 작업 내용

1. 관리자 권한 환경변수 추가
   - `ADMIN_EMAILS`
   - `ADMIN_AUDIT_LOG_PATH`
2. 서버 관리자 미들웨어 구현
   - Google 세션 확인
   - `ADMIN_EMAILS` allowlist 확인
   - 미로그인 401, 비관리자 403
3. 관리자 API 구현
   - `GET /api/admin/summary`
   - `GET /api/admin/users`
   - `GET /api/admin/users/:email`
   - `POST /api/admin/users/:email/premium`
   - `DELETE /api/admin/users/:email/premium`
4. 감사 로그 구현
   - append-only JSONL
   - actorEmail, action, targetEmail, before, after, reason 필수
5. 관리자 UI 구현
   - `/admin` 대시보드
   - 사용자 검색/상세
   - premium grant/revoke 모달
6. 테스트 추가
   - admin marker/static test
   - runtime smoke: 미로그인/비관리자/관리자 접근
   - premium grant/revoke 후 상태 검증

### 완료 기준

- [ ] 관리자 API가 클라이언트 localStorage/header/query가 아니라 서버 세션으로만 권한을 판단
- [ ] `ADMIN_EMAILS`에 없는 사용자는 403
- [ ] 수동 권한 부여/회수는 reason 없이는 실패
- [ ] 권한 변경마다 감사 로그가 남음
- [ ] `/admin` 화면에서 사용자/premium 상태 조회 가능
- [ ] `npm run build`, `npm run build:server`, `npm run lint` 통과
- [ ] QA가 admin marker/runtime smoke를 통과
