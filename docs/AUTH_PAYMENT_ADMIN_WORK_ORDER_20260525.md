# PDF마스터 로그인·결제·관리자 운영 작업지시서

작성일: 2026-05-25
잡: JOB-260525222553670746

## WORK-01 전역 인증 상태 구현

담당: developer
우선순위: Critical
파일:
- 생성: `src/auth/AuthProvider.tsx`
- 수정: `src/main.tsx`
- 수정: `src/store/appStore.ts` 필요 시 최소 변경

요구사항:
- `/api/auth/me`를 앱 시작 시 호출
- `login`, `logout`, `refreshAuth` 제공
- `isAdmin` 제공
- premium 상태를 `useAppStore.setPremiumUnlocked`와 동기화
- fetch는 `credentials: 'include'` 사용

완료조건:
- `useAuth()`를 Header/ToolPage/PaymentPage/AdminPage에서 사용 가능

## WORK-02 Header 로그인 UI

담당: developer
우선순위: Critical
파일:
- 수정: `src/components/layout/Header.tsx`

요구사항:
- 비로그인: Google 로그인 버튼
- 로그인: 이메일/프리미엄 배지/로그아웃 버튼
- 관리자: 관리자 링크 표시
- 모바일 폭에서도 nav가 깨지지 않도록 간결한 UI

완료조건:
- `/`와 `/pricing`에서 Header 로그인 상태가 동일하게 보임

## WORK-03 프리미엄 도구 가드

담당: developer
우선순위: Critical
파일:
- 수정: `src/components/tools/ToolPage.tsx`

요구사항:
- `tool.isPremium`이면 렌더링 전 auth/premium 확인
- 비로그인 CTA: Google 로그인, 요금제 보기
- 로그인+미결제 CTA: 요금제 보기
- 프리미엄이면 도구 렌더링

완료조건:
- `/tool/pdf-to-hwp` 비로그인 접속 시 업로드 UI가 먼저 뜨지 않음

## WORK-04 PaymentPage 리턴 UX 및 전역 auth 연동

담당: developer
우선순위: High
파일:
- 수정: `src/components/tools/PaymentPage.tsx`

요구사항:
- 내부 auth state 제거 또는 최소화하고 `useAuth` 사용
- `success=true|1`, `canceled=true`, `cancel=1`, `error` 처리
- success 후 `refreshAuth` 실행 및 상태 새로고침 버튼 제공

완료조건:
- 결제 리턴 후 사용자가 현재 상태를 이해할 수 있음

## WORK-05 관리자 서버 API

담당: developer + CTO 검토
우선순위: Critical
파일:
- 수정: `server/index.ts`
- 수정: `docker-compose.yml`

요구사항:
- `ADMIN_EMAILS` env
- `auditLogs` 저장소 확장
- `requireAdmin`
- `/api/admin/summary`
- `/api/admin/users`
- `/api/admin/grant-premium`
- `/api/admin/revoke-premium`
- `/api/admin/audit-logs`

완료조건:
- 비로그인 admin API는 401
- 관리자 아닌 로그인은 403
- 관리자 이메일이면 조회/수동부여/회수 가능

## WORK-06 관리자 화면

담당: developer
우선순위: High
파일:
- 생성: `src/components/admin/AdminPage.tsx`
- 수정: `src/App.tsx`
- 수정: `src/components/layout/Header.tsx` 관리자 링크 조건부 표시

요구사항:
- `/admin` route
- 비로그인 CTA
- 비관리자 접근 거부
- 요약/사용자/권한부여/감사로그 UI

완료조건:
- 운영자가 사용자 권한을 확인하고 수동 보정 가능

## WORK-07 문서/체크리스트 업데이트

담당: tech-writer
우선순위: High
파일:
- `docs/AUTH_PAYMENT_ADMIN_DESIGN_20260525.md`
- `docs/AUTH_PAYMENT_ADMIN_WORK_ORDER_20260525.md`
- `docs/AUTH_PAYMENT_ADMIN_CHECKLIST_20260525.md`
- 필요 시 `README.md`

요구사항:
- 실제 구현 파일과 API 계약이 문서와 일치하는지 확인
- README의 Toss Payments 잔존 문구를 Polar.sh 기준으로 정리
- 체크리스트 완료 항목 표시

## WORK-08 QA 게이트

담당: qa
우선순위: Critical
검증:
- `npm run build`
- `npm run build:server`
- `npm run lint`
- admin/auth API smoke
- 브라우저 `/pricing`, `/tool/pdf-to-hwp`, `/admin` smoke

완료조건:
- QA report는 정확히 `QA: passed; tests=...; risks=...` 형식
