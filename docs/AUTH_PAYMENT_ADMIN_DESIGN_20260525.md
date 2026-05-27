# PDF마스터 로그인·결제·관리자 운영 설계서

작성일: 2026-05-25
잡: JOB-260525222553670746
상태: v1 구현 완료 및 검증 기준 설계

## 1. 목표

Google OAuth 로그인이 결제 페이지 안의 버튼 하나에 머물지 않고 제품 전체에서 동작하도록 만든다. 유저가 Polar.sh 결제를 완료한 뒤 서버가 프리미엄 권한을 부여하고, 관리자가 운영 콘솔에서 사용자/결제권한/감사로그를 확인·보정할 수 있게 한다.

## 2. 현재 상태

이미 구현/배포됨:
- `/api/auth/google`, `/api/auth/callback`, `/api/auth/me`, `/api/auth/logout`
- signed HttpOnly cookie 기반 세션
- `/api/polar/checkout` 로그인 필요
- `/api/polar/webhook` signature 검증 및 프리미엄 저장
- `AUTH_STORE_PATH` JSON 저장소
- 배포 health에서 `hwpforge`, `soffice`, `hwpx2html`, `qpdf`, `ghostscript`, `rhwp`, `pdftotext` OK

이번 점검에서 확인한 기존 구현:
- 서버 Google OAuth 라우트와 signed HttpOnly cookie 세션은 존재한다.
- `ADMIN_EMAILS` 기반 `requireAdmin` middleware와 `/api/admin/*` 운영 API는 존재한다.
- 관리자 화면 파일과 `/admin` route는 존재한다.

이번 점검에서 발견한 누락/보완 필요점:
- 전역 `AuthProvider`가 없어 Header에 Google 로그인 UI가 없었다.
- `/api/auth/me` 응답에 `isAdmin`이 없어 클라이언트가 관리자 계정을 표시용으로도 판별할 수 없었다.
- Header 로그인/로그아웃/프리미엄 상태 표시가 없었다.
- 프리미엄 도구 진입 전 UX 가드가 없었다.
- `/pricing?success=true|canceled=true` 처리 UX가 없었다.
- 개발 환경처럼 `/api/*`가 SPA HTML fallback을 반환하는 경우 AdminPage가 빈 화면으로 죽을 수 있었다.

## 3. 제품 UX 설계

### 3.1 Header 로그인 상태

비로그인:
- `Google 로그인` 버튼 표시
- `프리미엄` 링크 유지

로그인:
- 이메일 또는 이름 표시
- 프리미엄이면 `프리미엄` 배지 표시
- 아니면 `무료` 배지 표시
- `로그아웃` 버튼 표시
- 관리자이면 `관리자` 링크 표시

### 3.2 전역 인증 상태

신규 파일: `src/auth/AuthProvider.tsx`

제공값:
- `loading`
- `loggedIn`
- `user`
- `premium`
- `isAdmin`
- `login(redirect?)`
- `logout()`
- `refreshAuth()`

`src/main.tsx`에서 `<AuthProvider>`로 앱을 감싼다. `refreshAuth()`는 `/api/auth/me`를 `credentials: 'include'`로 호출하고, premium 상태를 Zustand `premiumUnlocked`와 동기화한다.

### 3.3 프리미엄 도구 가드

`ToolPage.tsx`에서 `tool.isPremium`이면 렌더링 전에 확인한다.

- auth loading: 계정 확인 중 표시
- 비로그인: Google 로그인 CTA + 요금제 보기 CTA
- 로그인했지만 프리미엄 아님: 요금제 CTA
- 프리미엄: 도구 렌더링

서버 `requirePremium`은 최종 방어선으로 유지한다.

### 3.4 결제 리턴 UX

`PaymentPage.tsx`는 query string을 처리한다.

- `success=true` 또는 `success=1`: 결제 완료/확인 중 안내, `refreshAuth()` 실행
- `canceled=true` 또는 `cancel=1`: 결제 취소 안내
- `error=...`: 오류 안내

Polar webhook 반영 지연 가능성을 고려해 “상태 새로고침” 버튼을 제공한다.

## 4. 관리자 운영 설계

### 4.1 저장소 확장

현행:

```ts
interface AuthStore {
  sessions: Record<string, SessionRecord>
  premiumByEmail: Record<string, PremiumRecord>
}
```

확장:

```ts
interface AuditLogRecord {
  id: string
  type: 'admin.grant' | 'admin.revoke' | 'admin.adjust' | 'polar.webhook' | 'premium.consume'
  actorEmail: string
  targetEmail?: string
  detail: Record<string, unknown>
  createdAt: string
}

interface AuthStore {
  sessions: Record<string, SessionRecord>
  premiumByEmail: Record<string, PremiumRecord>
  auditLogs: AuditLogRecord[]
}
```

### 4.2 관리자 인증

환경변수:
- `ADMIN_EMAILS=admin1@example.com,admin2@example.com`

서버 middleware:
- `requireAdmin(req,res,next)`
- Google 로그인된 세션 필요
- session.user.email이 `ADMIN_EMAILS`에 포함되어야 함

### 4.3 관리자 API

Base: `/api/admin/*`

1. `GET /api/admin/summary`
   - 전체 프리미엄 기록 수
   - 프리미엄 활성 사용자 수
   - 월구독 사용자 수
   - 건당권 보유 사용자 수
   - 활성 세션 수
   - 최근 감사로그 20개

2. `GET /api/admin/users`
   - `premiumByEmail` 기준 사용자 목록
   - email, plan, oneTimePasses, expiresAt, updatedAt, productIds

3. `POST /api/admin/grant-premium`
   - body: `{ email, plan: 'one_time'|'monthly', oneTimePasses?, days? }`
   - 수동 권한 부여
   - audit log 기록

4. `POST /api/admin/revoke-premium`
   - body: `{ email }`
   - 권한 회수
   - audit log 기록

5. `GET /api/admin/audit-logs`
   - 최근 100개 audit log

### 4.4 관리자 화면

경로: `/admin`
파일: `src/components/admin/AdminPage.tsx`

상태:
- 비로그인: 로그인 CTA
- 로그인했지만 관리자 아님: 접근 권한 없음
- 관리자: 운영 대시보드 표시

기능:
- 요약 카드
- 사용자/권한 테이블
- 이메일 입력 + 플랜 선택 + 수동 부여 버튼
- 권한 회수 버튼
- 감사로그 목록

## 5. 보안 기준

- 관리자 API는 서버 세션과 `ADMIN_EMAILS`로만 허용한다.
- 클라이언트 `isAdmin`은 표시용이며, 서버가 최종 판정한다.
- Polar webhook은 signature 없으면 401이다.
- checkout productId는 서버 허용 product만 선택해야 한다.
- 수동 권한 변경은 audit log 필수다.
- JSON 저장소는 MVP 운영용이다. 추후 SQLite 전환 권장.

## 6. 1차 구현 범위

이번 작업에서 완료:
- AuthProvider/useAuth
- Header 로그인 UI
- ToolPage 프리미엄 가드
- PaymentPage 리턴 UX 정리
- Admin server APIs
- AdminPage UI
- 체크리스트 업데이트
- build/lint/API/browser smoke

이번 작업에서 보류:
- SQLite 전환
- Polar webhook 이벤트 원문 영구 저장
- 결제 환불 자동 처리
- 관리자 role DB화
- 세션 관리 UI

## 7. 검증 기준

명령:
- `npm run build`
- `npm run build:server`
- `npm run lint`

API smoke:
- `/api/auth/me` 비로그인 200
- `/api/admin/summary` 비로그인 401
- `/api/health` 200

브라우저 smoke:
- `/pricing`에 Google 로그인 버튼 표시
- Header에 Google 로그인 버튼 표시
- `/tool/pdf-to-hwp` 비로그인 상태에서 업로드 UI 대신 로그인/결제 CTA 표시
- `/admin` 비로그인 상태에서 로그인 CTA 표시
