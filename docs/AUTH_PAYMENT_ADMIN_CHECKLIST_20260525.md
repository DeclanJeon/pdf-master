# PDF마스터 로그인·결제·관리자 운영 체크리스트

작성일: 2026-05-25
잡: JOB-260525222553670746

## Phase 0 — 기준 확인

- [x] 서버 `/api/health`가 정상 응답한다.
- [x] 서버 `/api/auth/me`가 비로그인 상태에서 200을 반환한다.
- [x] Google OAuth 시작 URL이 Google로 302 redirect된다.
- [x] `/pricing`에 최소 Google 로그인 버튼이 존재한다.
- [ ] Header에 전역 로그인 UI가 있다.
- [ ] 전역 AuthProvider가 있다.
- [ ] 프리미엄 도구 진입 전 가드가 있다.
- [ ] 관리자 API/화면이 있다.

## Phase 1 — 전역 로그인 UX

- [ ] `src/auth/AuthProvider.tsx` 생성
- [ ] `useAuth()` hook 제공
- [ ] 앱 시작 시 `/api/auth/me` 호출
- [ ] `credentials: include` 적용
- [ ] premium 상태를 Zustand `premiumUnlocked`와 동기화
- [ ] `src/main.tsx`에서 AuthProvider 적용
- [ ] Header 비로그인 상태에서 Google 로그인 버튼 표시
- [ ] Header 로그인 상태에서 이메일 표시
- [ ] Header 로그인 상태에서 로그아웃 버튼 표시
- [ ] Header 프리미엄 상태에서 프리미엄 배지 표시

## Phase 2 — 프리미엄 도구 가드

- [ ] `ToolPage.tsx`에서 `tool.isPremium` 감지
- [ ] auth loading 상태 UI 표시
- [ ] 비로그인 프리미엄 도구 접근 시 로그인 CTA 표시
- [ ] 로그인+미결제 접근 시 요금제 CTA 표시
- [ ] 프리미엄 사용자만 실제 도구 UI 렌더링
- [ ] 서버 `requirePremium` 최종 방어선 유지

## Phase 3 — 결제 리턴 UX

- [ ] `PaymentPage.tsx`가 `useAuth`를 사용
- [ ] 결제 성공 쿼리 `success=true|1` 처리
- [ ] 결제 취소 쿼리 `canceled=true|cancel=1` 처리
- [ ] 결제 오류 쿼리 `error` 처리
- [ ] 성공 후 `refreshAuth()` 실행
- [ ] webhook 반영 지연을 고려한 수동 새로고침 버튼 제공

## Phase 4 — 관리자 운영 API

- [ ] `ADMIN_EMAILS` env 파싱
- [ ] `AuthStore.auditLogs` 추가
- [ ] 기존 auth store migration-safe default 처리
- [ ] `appendAuditLog()` 구현
- [ ] `requireAdmin()` 구현
- [ ] `GET /api/admin/summary` 구현
- [ ] `GET /api/admin/users` 구현
- [ ] `POST /api/admin/grant-premium` 구현
- [ ] `POST /api/admin/revoke-premium` 구현
- [ ] `GET /api/admin/audit-logs` 구현
- [ ] admin API 비로그인 401 확인
- [ ] admin API 비관리자 403 확인

## Phase 5 — 관리자 화면

- [ ] `src/components/admin/AdminPage.tsx` 생성
- [ ] `/admin` route 추가
- [ ] 비로그인 상태에서 로그인 CTA 표시
- [ ] 비관리자 상태에서 접근 거부 표시
- [ ] 관리자 요약 카드 표시
- [ ] 사용자/권한 테이블 표시
- [ ] 수동 권한 부여 폼 표시
- [ ] 권한 회수 액션 표시
- [ ] 감사로그 표시
- [ ] Header에 관리자 조건부 링크 표시

## Phase 6 — 검증

- [ ] `npm run build` 통과
- [ ] `npm run build:server` 통과
- [ ] `npm run lint` 통과 또는 기존 경고만 존재
- [ ] `/api/auth/me` smoke 통과
- [ ] `/api/admin/summary` 비로그인 401 smoke 통과
- [ ] `/pricing` 브라우저 smoke 통과
- [ ] `/tool/pdf-to-hwp` 브라우저 smoke 통과
- [ ] `/admin` 브라우저 smoke 통과

## Phase 7 — 배포/운영

- [ ] `ADMIN_EMAILS` 서버 `.env`에 설정
- [ ] `docker-compose.yml`에 `ADMIN_EMAILS` 전달
- [ ] 프론트/서버 빌드 후 rsync/scp 배포
- [ ] `docker compose build && up -d`
- [ ] 운영 도메인 smoke 통과
