# PDF마스터 전체 기능 감사 보고서

**작성일:** 2025-05-25  
**대상:** pdfm.ponslink.com (vmi3261315) + 로컬 저장소  
**감사자:** CEO Orchestrator  

---

## 1. 감사 개요

PDF마스터 서비스의 전체 기능, 운영 인프라, 결제 시스템에 대한 종합 품질 감사를 수행했다.
로컬 개발 코드와 배포 서버 코드 간의 심각한 분기 상태가 확인되었으며, 결제 시스템은 사용자 도달 불가 상태다.

---

## 2. 기능별 완성률 상세

### 2.1 변환 (Convert) — 5개 도구

#### ① HWP → PDF 변환 | 완성률 85% | 판정: 가동

- **구현 방식:** 서버 hwpforge + LibreOffice(h2orestart) 이중 변환, 폴링 기반 진행률
- **정상 동작:** 업로드→비동기 작업→상태 폴링→다운로드 전체 흐름 동작
- **서버 상태:** hwpforge=true, soffice=true (health API 확인)
- **문제점:**
  - h2orestart 확장이 특정 HWP 파일에서 간헐적 인식 실패 리포트 존재
  - 오류 발생 시 사용자 안내 메시지 부족
- **개선 필요:** 변환 실패 시 원인(폰트/레이아웃/버전) 안내 강화

#### ② PDF → HWP 변환 | 완성률 35% | 판정: 미가동

- **로컬 코드:** rhwp 파이프라인 구현 완료
  - `pdftotext -layout -enc UTF-8` → 페이지 분할 → ingest.json → `rhwp build-from-ingest` → .hwpx
  - `/api/convert/pdf-to-hwp` 엔드포인트, 503 가드, healthcheck 항목 추가
- **서버 현황 (심각):**
  - 서버 코드에 **아직 `/api/convert/pdf-to-odt` 잔존** (구 LibreOffice 변환)
  - rhwp, pdftotext 바이너리 미설치
  - Dockerfile에 rustup/poppler-utils 미포함
- **문제점:**
  - 로컬 수정이 서버에 전혀 배포되지 않음
  - E2E 검증 불가
  - 스캔 PDF는 텍스트 추출 불가 (OCR 필요, 명시됨)
- **개선 필요:** 서버 배포 + Dockerfile 갱신 필수

#### ③ PDF 병합 | 완성률 90% | 판정: 가동

- **구현 방식:** pdf-lib 클라이언트 사이드 처리
- **정상 동작:** PDF+이미지 혼합 병합, 진행률 콜백, 순서 유지
- **문제점:**
  - 비표준 이미지 포맷(HEIC, BMP 등) 무시 (warn만)
- **개선 필요:** 비표준 이미지 Canvas 변환 후 임베딩

#### ④ PDF 분할 | 완성률 50% | 판정: 부분가동

- **구현 방식:** pdf-lib `copyPages`, count/range 2모드
- **치명적 결함:**
  - `splitPdf(acceptedFiles[0], 'count', 2)` — **항상 2등분으로 하드코딩**
  - 사용자가 분할 기준(페이지 범위, 분할 수)을 선택할 UI 없음
  - 결과를 `JSON.stringify`로 Blob 생성 → **다운로드 시 .pdf가 아닌 JSON 파일**
- **개선 필요:** 분할 설정 UI + ZIP 멀티파일 다운로드

#### ⑤ PDF → 이미지 변환 | 완성률 60% | 판정: 부분가동

- **구현 방식:** pdfjs-dist Canvas 렌더링, scale 2.0 고해상도
- **문제점:**
  - `images[0]`만 Blob으로 변환 → **1페이지만 다운로드**
  - 전체 페이지 ZIP 일괄 다운로드 미구현
  - 포맷 선택(PNG/JPEG) 불가
- **개선 필요:** 전체 페이지 ZIP 다운로드 + 포맷/해상도 옵션

---

### 2.2 편집 (Edit) — 4개 도구

#### ⑥ 도장/인감 삽입 | 완성률 88% | 판정: 가동

- **구현 방식:** StampTool 전용 컴포넌트, stampService.ts
- **정상 동작:**
  - 커스텀 이미지 업로드 (PNG/JPG/SVG)
  - SVG→Canvas→PNG 변환
  - 드래그 위치 조절, 투명도/크기 슬라이더
  - 전체 페이지 일괄 적용 / 특정 페이지 선택
  - 기본 도장 템플릿 제공
- **문제점:**
  - 기본 도장 템플릿 1종 (원형 붉은 인감)
  - 법인 인감, 사인 도장 등 변형 불가
- **개선 필요:** 템플릿 다양화, 도장 텍스트 커스텀 (이름 입력→자동 생성)

#### ⑦ 워터마크 삽입 | 완성률 85% | 판정: 가동

- **구현 방식:** Canvas 텍스트 렌더링 → PNG 임베딩, 한글 폰트 스택
- **정상 동작:**
  - 텍스트/이미지 워터마크
  - 타일 패턴 + 중앙 단일 모드
  - 미리보기 URL 생성
  - 폰트 로딩 실패 시 fallback 크기 추정
- **문제점:**
  - 이미지 워터마크는 GenericPdfTool에 설정 UI가 없음
  - 워터마크 "제거" 기능 없음 (요금표에는 있음)
- **개선 필요:** 워터마크 제거 기능 명확화 (기획 삭제 또는 구현)

#### ⑧ PDF 압축 | 완성률 40% | 판정: 부분가동

- **구현 방식:** 전체 페이지 래스터화 → JPEG 재압축 → 재조립
- **치명적 결함:**
  - **텍스트가 이미지로 변환됨** → 검색/복사/선택 불가
  - 대용량 PDF에서 메모리 과다 사용 가능
  - 압축률은 낮아지나 품질 열화가 현저
- **개선 필요:** qpdf/gs 기반 구조 재압축으로 전면 재작성 필요

#### ⑨ 페이지 번호 추가 | 완성률 80% | 판정: 가동

- **구현 방식:** pdf-lib Helvetica 폰드, `N/M` 형식, 하단 중앙
- **문제점:**
  - Helvetica만 사용 → 한글 폰트 불가
  - 위치(상단/하단/좌/우/중앙) 선택 불가
  - 시작 번호 커스텀 불가
- **개선 필요:** 위치/시작번호/한글폰트 옵션

---

### 2.3 보안 (Security) — 3개 도구

#### ⑩ 주민번호 자동 마스킹 | 완성률 82% | 판정: 가동

- **구현 방식:** maskingServiceV2.ts, pdfjs-dist 위치 추출 + pdf-lib 마스킹
- **정상 동작:**
  - 5종 감지: 주민번호/전화/이메일/계좌/카드
  - 주민번호 체크섬 검증 (verified 필드)
  - 카드번호 Luhn 검증
  - 우선순위 기반 중복 감지 제거
  - box(검은박스)/replace(마스킹문자) 2스타일
  - 미리보기: 감지 항목 리스트, 개별 on/off
- **한계 (명시됨):**
  - **텍스트 PDF만** 감지 가능
  - 스캔/이미지 PDF → OCR 전처리 없으면 감지 불가
  - 정규식 기반이므로 위양성 가능 (account 패턴 등)
- **개선 필요:** OCR 연동, 위양성 감소 로직

#### ⑪ PDF 암호 설정 | 완성률 75% | 판정: 가동

- **구현 방식:** 서버 qpdf --encrypt, AES-256
- **서버 상태:** qpdf v11.3.0 설치됨 (컨테이너 내)
- **문제점:**
  - 비밀번호 입력을 `window.prompt()`로 처리 → UX 낙후
  - 로컬 개발환경에 qpdf 없으면 503 (안내는 되나 경험 저하)
  - 비밀번호 확인(2회 입력) 없음
- **개선 필요:** 커스텀 모달 입력 + 확인 필드 + 강도 표시

#### ⑫ PDF 암호 해제 | 완성률 70% | 판정: 가동

- **구현 방식:** 서버 qpdf --decrypt
- **정상 동작:** 틀린 비밀번호 401 처리
- **문제점:** 암호 설정과 동일한 UX 문제
- **개선 필요:** 동일

---

### 2.4 서명 (Sign) — 1개 도구

#### ⑬ 전자서명 (이미지 삽입) | 완성률 75% | 판정: 가동

- **구현 방식:** SignTool 전용 컴포넌트, Canvas 손글씨
- **정상 동작:**
  - Canvas에 손글씨 서명 작성
  - 위치 드래그 조절
  - PDF 페이지 미리보기 위에 오버레이
  - pdf-lib로 이미지 임베딩
- **문제점:**
  - GenericPdfTool에서 `pdf-sign` 선택 시 SignTool로 리다이렉트만 (별도 진입 필요)
  - "인증서 기반 법적 전자서명이 아님" 명시됨
  - 서명 크기/색상 조절 미흡
- **개선 필요:** 서명 색상/두께 조절, GenericPdfTool 내 임베딩, 법적 효력 한계 명확 표시

---

## 3. 운영 인프라 분석

### 3.1 서버 구성

| 항목 | 값 |
|------|-----|
| 호스트 | vmi3261315 (ssh pons-link) |
| 도메인 | pdfm.ponslink.com |
| 컨테이너 | pdfm-web-1 (Up 17h+) |
| 포트 | 3001 (nginx → Docker) |
| SSL | Let's Encrypt (Certbot 자동갱신) |
| 재시작 | unless-stopped |

### 3.2 런타임 의존성

| 의존성 | 상태 | 비고 |
|--------|------|------|
| HWPForge | OK | /app/bin/hwpforge |
| LibreOffice | OK | soffice + h2orestart |
| hwpx2html.py | OK | /app/server/hwpx2html.py |
| qpdf | OK | v11.3.0 |
| rhwp | **MISSING** | 미설치 |
| pdftotext | **MISSING** | poppler-utils 미설치 |

### 3.3 로컬-서버 코드 분기 (심각)

| 항목 | 로컬 코드 | 서버 배포 코드 |
|------|-----------|----------------|
| server/index.ts | rhwp 파이프라인, `/api/convert/pdf-to-hwp`, Toss+Polar 잔존 | Polar 채크아웃, `/api/convert/pdf-to-odt` (구코드) |
| PaymentPage.tsx | `@tosspayments/payment-sdk` 기반 | Polar.sh `/api/polar/checkout` 기반 |
| 인증 | 없음 | AuthProvider + Google OAuth (서버 엔드포인트 없음) |
| Dockerfile | rustup + poppler 추가 | 구버전 (rhwp/poppler 없음) |

**원인:** 서버 배포 시점에 별도 브랜치/수동 빌드가 수행되었고, 이후 로컬 수정이 서버에 반영되지 않음.

### 3.4 파일 정리

- 업로드/출력 디렉토리: /app/uploads, /app/outputs
- 10분 후 자동 삭제 크론 동작 중
- /api/usage: IP 기반 일일 3회 제한 (인메모리)

---

## 4. 결제 시스템 분석 (Polar.sh)

### 4.1 서버 측 Polar.sh 연동

| 항목 | 상태 | 상세 |
|------|------|------|
| POLAR_ACCESS_TOKEN | 설정됨 | polar_oat_N5sz... (컨테이너 env) |
| POLAR_WEBHOOK_SECRET | 설정됨 | polar_whsec_... |
| 건당 결제 Product ID | 설정됨 | 1c257b69-9051-4850-ba48-d7c2ada46938 |
| 월 구독 Product ID | 설정됨 | d7cd5993-4d33-46d9-8ba6-994c70b527f9 |
| POST /api/polar/checkout | **동작** | Polar.sh v1/checkouts API 호출 → checkout URL 반환 확인 |
| POST /api/polar/webhook | **수신됨** | order.created 이벤트 수신 로그 존재 |
| Webhook 서명 검증 | **미검증** | "Webhook received without signature" 경고. signature 헤더 무시 |
| 프리미엄 활성화 | **미구현** | webhook 핸들러가 console.log만. DB/세션 저장 없음 |

### 4.2 프론트엔드 결제 흐름

| 항목 | 상태 | 상세 |
|------|------|------|
| AuthProvider | 배포됨 | `vt()` 훅: loggedIn/premium/login/logout |
| 결제 버튼 → 로그인 체크 | **차단** | `if (!loggedIn)` → "로그인이 필요합니다" |
| /api/auth/google | **404** | 서버에 Google OAuth 엔드포인트 없음 |
| /api/auth/me | **404** | 세션 조회 엔드포인트 없음 |
| /api/auth/logout | **404** | 로그아웃 엔드포인트 없음 |
| 결제 성공 콜백 | 부분 | `?success=true` 감지 + toast. refresh() 호출하나 /api/auth/me 404 |
| 프리미엄 저장 | localStorage | pdfmaster_premium_expiry (조작 가능) |

### 4.3 결제 시스템 종합 판정: 5% (사실상 동작 불가)

**결제 버튼 → "로그인이 필요합니다" → /api/auth/google 리다이렉트 → 404 → 결제 불가**

Polar.sh API 자체는 정상 동작하지만, 사용자가 도달할 수 없다. 인증 시스템이 서버에 구현되지 않았다.

---

## 5. 종합 완성률

| 카테고리 | 도구 수 | 가중평균 완성률 | 비고 |
|----------|---------|----------------|------|
| 변환 | 5 | 64% | HWP→PDF 양호, PDF→HWP 미배포, 분할/이미지 UX 결함 |
| 편집 | 4 | 73% | 도장/워터마크 실용, 압축 품질 낮음 |
| 보안 | 3 | 76% | 마스킹 V2 잘됨, 암호 UX 낙후 |
| 서명 | 1 | 75% | 이미지 서명 가능, 법적 효력 없음 |
| 인프라 | - | 70% | 서버 가동, 로컬-서버 분기 심각 |
| 결제 | - | 5% | 인증 미구현으로 사용자 도달 불가 |
| **전체** | **13** | **60%** | |

---

## 6. 위험 등급 분류

### Critical (즉시 조치)

1. Google OAuth 서버 엔드포인트 미구현 → 결제 전체 차단
2. 로컬-서버 코드 분기 → rhwp 파이프라인 미배포
3. Polar.sh webhook 서명 미검증 → 위조 가능

### High (1주 내 조치)

4. PDF 분할 UX 하드코딩 → 기능 불완전
5. PDF→이미지 1페이지만 다운로드 → 기능 불완전
6. PDF 압축 래스터화 방식 → 품질 미달

### Medium (2주 내 조치)

7. 암호 설정/해제 UX (prompt → 모달)
8. 결제 프리미엄 localStorage 저장 → 서버 사이드 세션 필요
9. 워터마크 "제거" 기능 요금표에 있으나 미구현

### Low (향후 개선)

10. 페이지 번호 위치/폰트 커스텀
11. 도장 템플릿 다양화
12. 마스킹 OCR 연동
13. 비표준 이미지 포맷 지원
