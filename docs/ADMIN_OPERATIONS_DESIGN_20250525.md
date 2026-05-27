# PDF마스터 관리자/운영 설계서

**문서 번호:** AOD-20250525-001  
**작성일:** 2026-05-25  
**범위:** Google 로그인 이후 사용자/결제/프리미엄 권한을 운영자가 확인·조정·감사할 수 있는 관리자 운영 설계  
**대상 코드:** `server/index.ts`, `src/components/tools/PaymentPage.tsx`, `docs/WORK_CHECKLIST_20250525.md`

---

## 1. 현재 구현 기준선

현재 로컬 코드에는 다음 사용자/결제 기반 기능이 있다.

| 영역 | 현재 구현 | 확인 기준 |
|---|---|---|
| Google 로그인 | `GET /api/auth/google`, `GET /api/auth/callback`, `GET /api/auth/me`, `POST /api/auth/logout` | 서버 라우트 존재, 미설정 시 `GOOGLE_OAUTH_NOT_CONFIGURED` 503 |
| 세션 | `HttpOnly`, `SameSite=Lax`, 서명 쿠키 + file-backed auth store | `AUTH_STORE_PATH` JSON 저장소 |
| 결제 생성 | `POST /api/polar/checkout` | 로그인 세션 필요, Polar checkout URL 반환 |
| Webhook | `POST /api/polar/webhook` | `POLAR_WEBHOOK_SECRET` 기반 HMAC 검증, 구매 email/product 기록 |
| 프리미엄 권한 | `premiumByEmail` 저장, `/api/auth/me`에서 premium 반환 | 월 구독 만료/건당 이용권 수량 계산 |
| 서버 권한 게이트 | `requirePremium` | `/api/encrypt`, `/api/decrypt`, `/api/convert/pdf-to-hwp` 보호 |

현재 없는 것: 관리자 인증/권한, 관리자 화면, 사용자/결제 조회 API, 수동 권한 조정, 운영 감사 로그, 고객지원용 결제 재처리 도구.

---

## 2. 운영 목표

1. 사용자가 Google 로그인 후 결제를 완료했는지 운영자가 확인할 수 있어야 한다.
2. Polar webhook 누락/실패 시 운영자가 구매 이메일 기준으로 권한을 수동 부여하거나 재처리할 수 있어야 한다.
3. 고객지원 문의 시 사용자의 세션/프리미엄 상태/최근 결제 이벤트를 조회할 수 있어야 한다.
4. 모든 관리자 조작은 감사 로그로 남아야 한다.
5. 관리자 권한은 일반 사용자 세션과 분리되어야 하며, 서버에서 강제 검증되어야 한다.

---

## 3. 관리자 권한 모델

### 3.1 MVP 권한 방식

초기 버전은 별도 RBAC 테이블 없이 환경변수 allowlist로 시작한다.

```env
ADMIN_EMAILS=owner@example.com,ops@example.com
ADMIN_AUDIT_LOG_PATH=./data/admin-audit.log
```

관리자 판정:

1. 기존 Google 세션을 `getSessionFromRequest(req)`로 읽는다.
2. 세션이 없으면 401 `LOGIN_REQUIRED`.
3. `session.user.email`이 `ADMIN_EMAILS` 목록에 없으면 403 `ADMIN_REQUIRED`.
4. 관리자 API는 `requireAdmin` 미들웨어를 통과해야 한다.

### 3.2 금지사항

- 클라이언트 localStorage, query parameter, 임의 header만으로 관리자 판정 금지.
- 관리자 API에서 email/productId/plan을 신뢰하기 전에 서버 검증과 감사 로그 기록 필수.
- 운영 편의를 위해 webhook signature 검증을 우회하는 endpoint를 공개하면 안 된다.

---

## 4. 관리자 API 설계

모든 API prefix는 `/api/admin`이다.

| Endpoint | Method | 목적 | 요청 | 응답 | 권한 |
|---|---:|---|---|---|---|
| `/api/admin/summary` | GET | 운영 대시보드 요약 | 없음 | 사용자 수, 프리미엄 수, 활성 구독 수, 일회권 잔량 합계 | admin |
| `/api/admin/users` | GET | 사용자/권한 목록 조회 | `q`, `premium`, `limit`, `offset` | user email/name, premium, updatedAt | admin |
| `/api/admin/users/:email` | GET | 특정 사용자 상세 | path email | 세션 목록, premium record, eventIds | admin |
| `/api/admin/users/:email/premium` | POST | 수동 권한 부여/조정 | `{ plan, oneTimePasses?, subscriptionExpiresAt?, reason }` | 갱신된 premium | admin |
| `/api/admin/users/:email/premium` | DELETE | 권한 회수 | `{ reason }` | 갱신된 premium | admin |
| `/api/admin/webhooks/replay` | POST | Polar 이벤트 수동 재처리 | `{ payload, reason }` | 처리 결과 | admin |
| `/api/admin/audit-log` | GET | 감사 로그 조회 | `limit`, `cursor` | timestamp, actor, action, target, reason | admin |

MVP에서는 `AUTH_STORE_PATH` JSON 구조를 확장해 구현할 수 있다. 단, 운영 트래픽 증가 시 SQLite로 이전한다.

---

## 5. 데이터 저장 설계

### 5.1 기존 store

```ts
interface AuthStore {
  sessions: Record<string, SessionRecord>;
  premiumByEmail: Record<string, PremiumRecord>;
}
```

### 5.2 관리자 운영 확장

```ts
interface AdminAuditRecord {
  id: string;
  createdAt: string;
  actorEmail: string;
  action: 'premium.grant' | 'premium.revoke' | 'premium.adjust' | 'webhook.replay';
  targetEmail?: string;
  before?: unknown;
  after?: unknown;
  reason: string;
}
```

MVP 저장 방식:

- `premiumByEmail`: 기존 `AUTH_STORE_PATH` JSON에 유지
- 감사 로그: append-only JSONL 파일 `ADMIN_AUDIT_LOG_PATH`
- 운영상 변경 전/후 값을 함께 기록

추후 권장 이전:

- `users`, `sessions`, `payments`, `entitlements`, `admin_audit_logs` SQLite 테이블
- webhook event id unique index로 idempotency 보장

---

## 6. 관리자 UI 설계

### 6.1 라우트

| URL | 컴포넌트 | 목적 |
|---|---|---|
| `/admin` | `AdminDashboardPage` | 요약 카드 + 최근 결제/권한 변경 |
| `/admin/users` | `AdminUsersPage` | 이메일 검색, 프리미엄 필터, 사용자 목록 |
| `/admin/users/:email` | `AdminUserDetailPage` | 사용자 상세, 권한 조정, 감사 로그 |

### 6.2 화면 기능

- 요약 카드: 총 세션 수, premium 사용자 수, 월 구독 사용자 수, 일회권 보유 사용자 수
- 사용자 검색: email/name 부분검색
- 권한 상태 badge: 무료 / 건당 / 월구독 / 만료
- 수동 권한 부여 모달:
  - plan: `one_time` 또는 `monthly`
  - oneTimePasses 또는 subscriptionExpiresAt
  - reason 필수
- 권한 회수 버튼:
  - reason 필수
  - 확인 모달 필수
- 감사 로그 패널:
  - actor, action, target, reason, createdAt 표시

---

## 7. 보안/운영 체크리스트

| # | 항목 | 상태 | 검증 방법 |
|---|---|---|---|
| AOD-01 | `ADMIN_EMAILS` env 추가 | [ ] | `.env.example`, `docker-compose.yml` 확인 |
| AOD-02 | `requireAdmin` 서버 미들웨어 구현 | [ ] | 미로그인 401, 비관리자 403 테스트 |
| AOD-03 | `/api/admin/summary` 구현 | [ ] | 로그인 관리자 smoke |
| AOD-04 | `/api/admin/users` 구현 | [ ] | 검색/필터 static + runtime 테스트 |
| AOD-05 | `/api/admin/users/:email` 구현 | [ ] | premium/session 상세 조회 |
| AOD-06 | 수동 premium grant/revoke 구현 | [ ] | before/after 권한 상태 검증 |
| AOD-07 | 감사 로그 append-only 기록 | [ ] | 조작 후 JSONL 증가 확인 |
| AOD-08 | 관리자 UI `/admin` 구현 | [ ] | 비관리자 접근 차단, 관리자 접근 표시 |
| AOD-09 | README 운영 env/API 문서 갱신 | [x] | Polar/admin env 문서 반영 |
| AOD-10 | 실제 Google OAuth E2E | [ ] | 실 credential로 login → `/api/auth/me` |
| AOD-11 | 실제 Polar webhook E2E | [ ] | 실 webhook signature로 premium 활성화 |
| AOD-12 | 배포 smoke | [ ] | `pdfm.ponslink.com/api/health`, auth, admin, premium gate |

---

## 8. 작업지시서

### WORK-14: 관리자/운영 MVP 구현 [CRITICAL]

**담당:** developer  
**의존:** WORK-01 Google OAuth, WORK-02 Polar premium store  
**목표:** 결제 이후 운영자가 사용자/권한을 확인하고 수동 조정할 수 있는 최소 관리자 시스템 구현

#### 작업 내용

1. 환경변수 추가
   - `.env.example`: `ADMIN_EMAILS`, `ADMIN_AUDIT_LOG_PATH`
   - `docker-compose.yml`: 운영 env pass-through
2. 서버 구현
   - `requireAdmin` 미들웨어
   - `GET /api/admin/summary`
   - `GET /api/admin/users`
   - `GET /api/admin/users/:email`
   - `POST /api/admin/users/:email/premium`
   - `DELETE /api/admin/users/:email/premium`
   - 감사 로그 JSONL append 함수
3. 프론트엔드 구현
   - `/admin` 라우트
   - 관리자 대시보드/사용자 목록/상세/권한 조정 UI
   - 비관리자/미로그인 안내 화면
4. 테스트
   - static marker test: admin route/API/env/audit markers
   - runtime smoke: 미로그인 401, 비관리자 403, 관리자 summary 200
   - premium grant → `/api/auth/me` premium 상태 변경 확인 가능한 단위 또는 API 테스트

#### 완료 기준

- `npm run build`, `npm run build:server`, `npm run lint` 통과
- 관리자 API가 서버 세션과 `ADMIN_EMAILS`로만 권한 판단
- 수동 권한 변경은 reason 없이는 실패
- 모든 권한 변경은 감사 로그에 actor/action/target/reason/before/after 기록
- README와 체크리스트가 구현 상태와 일치

---

## 9. QA 재검증 지시

developer 구현 후 QA는 다음을 재실행한다.

```bash
npm run build
npm run build:server
npm run lint
node tests/backend-auth-premium-static.test.mjs
node tests/pdf-to-hwp-static.test.mjs
node tests/work-order-integration-static.test.mjs
```

추가 smoke:

1. `PORT=3101 npm run start` 서버 기동
2. `/api/admin/summary` 미로그인 요청 → 401 또는 403
3. 테스트용 관리자 세션/fixture가 있다면 admin summary/list/detail/grant/revoke 확인
4. `/api/auth/me` loggedIn=false baseline 확인
5. 실제 credential이 없는 환경에서는 Google/Polar 실 E2E는 blocker가 아니라 external credential pending risk로 분리하되, 운영 배포 전에는 반드시 통과해야 한다.

---

## 10. 남은 외부 의존 리스크

- 실제 Google OAuth client id/secret이 없으면 로그인 리다이렉트 이후 end-to-end 검증 불가
- 실제 Polar webhook secret/event가 없으면 결제 후 premium 활성화 end-to-end 검증 불가
- `AUTH_STORE_PATH` JSON 파일은 MVP용이다. 동시 쓰기/운영 감사/검색 요구가 커지면 SQLite 전환 필요
- 운영 서버 배포 전 `COOKIE_SECURE=true`, `PUBLIC_BASE_URL=https://pdfm.ponslink.com`, `CORS_ORIGIN=https://pdfm.ponslink.com` 확인 필요
