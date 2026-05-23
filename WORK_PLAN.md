# PDF마스터 작업 설계서 — 완료

## 최종 결과: 13/13 E2E 테스트 PASS

| 기능 | 상태 | 비고 |
|------|------|------|
| PDF 병합 | PASS | |
| PDF 분할 | PASS | |
| 워터마크 | PASS | |
| 페이지 번호 | PASS | |
| PDF 압축 | PASS | |
| PDF→이미지 | PASS | |
| PDF 암호 설정 | PASS | qpdf 서버 API |
| PDF 암호 해제 | PASS | qpdf 서버 API |
| 주민번호 마스킹 | PASS | RRN+Phone+Email+Account |
| 도장 삽입 | PASS | SVG→Canvas→PNG 변환 |
| 한글→PDF | PASS | HwpForge+LibreOffice |
| PDF→한글(ODT) | PASS | LibreOffice+writer_pdf_import |
| 전자서명 | PASS | Canvas→PNG→PDF 삽입 |

## 1. 버그 수정

### BUG-1: 주민번호 감지 누락 (체크섬 검증 선택화)
- **현상**: `800101-3000000` 같은 테스트/서식상 주민번호가 체크섬 검증에서 탈락하여 감지 안 됨
- **원인**: maskingServiceV2.ts에서 isValidRRN()이 13자리 체크섬 검증을 필수로 수행
- **해결**: 체크섬 검증을 기본 ON + 사용자 토글로 제공. 패턴 매칭만으로도 감지하되 "검증됨/미검증" 표시
- **수정 파일**: `src/services/maskingServiceV2.ts`
  - detectPersonalInfo(): 패턴 매칭 결과에 `verified` 필드 추가
  - 체크섬 통과 시 `verified: true`, 패턴만 매치 시 `verified: false`
  - UI에서 검증 여부 뱃지 표시 (선택)

### BUG-2: 전화번호→계좌번호 중복 감지
- **현상**: `010-1234-5678`이 전화번호와 계좌번호 모두로 감지됨
- **원인**: 각 패턴이 독립적으로 매칭되어 중복 발생
- **해결**: 감지 결과에서 텍스트 위치가 겹치면 우선순위 적용
  - 우선순위: 주민번호 > 전화번호 > 계좌번호 > 이메일 > 신용카드
  - 같은 텍스트 영역이 이미 상위 패턴으로 감지된 경우 하위 패턴에서 제외
- **수정 파일**: `src/services/maskingServiceV2.ts`
  - detectPersonalInfo() 끝에 dedup 로직 추가

### BUG-3: 마스킹 실행 버튼 클릭 후 결과 화면 미전환
- **현상**: "마스킹 실행" 클릭 시 done 단계로 안 넘어감
- **원인 추정**: 
  - (a) MaskingTool.tsx의 handleMask에서 예외 발생 후 catch에서 step 복귀
  - (b) applyMasking() 반환값이 Uint8Array가 아님
  - (c) pdfjs 텍스트 위치 좌표 변환 오류로 마스킹 위치 벗어남
- **해결**: MaskingTool.tsx + maskingServiceV2.ts 디버깅
  - console.log 추가하여 각 단계 추적
  - applyMasking 내부 try/catch에서 에러 로깅
  - PDF 좌표계 변환 로직 재검증 (pdfjs y좌표 → pdf-lib y좌표)

### BUG-4: SVG 도장 → PNG 변환 누락
- **현상**: stampService.ts에서 SVG Blob URL을 fetch→embedPng 시도하나 SVG 텍스트가 와서 실패
- **원인**: pdf-lib는 PNG/JPG만 embed 가능. SVG는 Canvas 렌더링 후 PNG 변환 필요
- **해결**: stampService.ts의 embedStampImage()를 수정
  - SVG URL 감지 시: Canvas에 렌더링 → toBlob('image/png') → embedPng
  - PNG/JPG URL 감지 시: 기존 로직 유지
- **수정 파일**: `src/services/stampService.ts`
  - embedStampImage() 함수 전면 수정
  - SVG→Canvas→PNG 변환 헬퍼 추가

---

## 2. 미구현 기능

### FEAT-1: PDF 암호 설정
- **스펙**: 사용자가 비밀번호 입력 → PDF에 owner+user password 설정
- **구현 방식**: 서버측 qpdf 사용
  - Dockerfile에 `qpdf` 설치 추가
  - server/index.ts에 `/api/encrypt` 엔드포인트 추가
  - 클라이언트에서 PDF + 비밀번호 POST → 서버에서 qpdf 실행 → 암호화 PDF 반환
- **보안**: 암호는 메모리에서만 유지, 결과 전송 후 즉시 삭제
- **수정 파일**:
  - `Dockerfile`: qpdf 설치 추가
  - `server/index.ts`: /api/encrypt 라우트 추가
  - `src/services/pdfUtils.ts`: encryptPdf() 함수 (서버 API 호출)
  - `src/components/tools/GenericPdfTool.tsx`: encrypt 설정 UI 연결

### FEAT-2: PDF 암호 해제
- **스펙**: 암호가 걸린 PDF에 비밀번호 입력 → 해제된 PDF 반환
- **구현 방식**: 서버측 qpdf 사용
  - `qpdf --password=XXX --decrypt input.pdf output.pdf`
- **수정 파일**:
  - `server/index.ts`: /api/decrypt 라우트 추가
  - `src/services/pdfUtils.ts`: decryptPdf() 함수
  - `src/components/tools/GenericPdfTool.tsx`: decrypt 설정 UI 연결

### FEAT-3: PDF → 한글(HWP) 변환
- **스펙**: PDF를 HWPX(한글 문서)로 변환
- **구현 방식**: 서버측 LibreOffice 사용
  - PDF → LibreOffice → ODT → HWPX(불가) 또는 PDF → LibreOffice → HTML(가능)
  - 실제로는 PDF→ODT 변환 후 ODT를 다운로드 (한글에서 ODT 열기 가능)
  - 또는 PDF→HTML 변환 후 hwpx 포맷으로 래핑
- **수정 파일**:
  - `server/index.ts`: /api/convert/pdf-to-hwp 라우트 추가
  - `src/components/tools/GenericPdfTool.tsx`: 변환 설정 UI

### FEAT-4: 전자서명
- **스펙**: PDF에 디지털 서명 추가
- **구현 방식**: 1차—서명 이미지(손그림) 삽입, 2차—공인인증서 서명 (PRO)
- **1차 구현 (14일 이내)**:
  - Canvas에 손글씨 서명 그리기 → PNG → PDF에 삽입
  - 서명 위치 드래그로 지정
  - 서명 날짜 자동 삽입
- **수정 파일**:
  - `src/services/signService.ts`: 신규
  - `src/components/tools/SignTool.tsx`: 기존 파일 수정
  - `src/services/pdfUtils.ts`: signPdf() 함수

---

## 3. 체크리스트

### Phase 1: 버그 수정 (우선순위 높음)
- [ ] BUG-1: 주민번호 체크섬 검증 선택화 (maskingServiceV2.ts)
- [ ] BUG-2: 전화번호/계좌번호 중복 감지 제거 (maskingServiceV2.ts)
- [ ] BUG-3: 마스킹 실행 결과 화면 전환 수정 (MaskingTool.tsx + maskingServiceV2.ts)
- [ ] BUG-4: SVG 도장 Canvas→PNG 변환 (stampService.ts)

### Phase 2: 미구현 기능
- [ ] FEAT-1: PDF 암호 설정 (qpdf 서버 + 클라이언트)
- [ ] FEAT-2: PDF 암호 해제 (qpdf 서버 + 클라이언트)
- [ ] FEAT-3: PDF→한글(HWP) 변환 (LibreOffice 서버)
- [ ] FEAT-4: 전자서명 (Canvas 손글씨 → PNG → PDF 삽입)

### Phase 3: 빌드 + 배포 + E2E 테스트
- [ ] 프론트엔드 빌드 (npm run build)
- [ ] Docker 이미지 빌드 (qpdf 추가)
- [ ] 서버 배포 (dist + docker restart)
- [ ] 전체 기능 E2E 재테스트
