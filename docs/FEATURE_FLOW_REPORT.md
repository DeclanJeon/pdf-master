# PDF마스터 기능 플로우 / 완성률 / 사용자 사용 가능 여부 보고

|작성 기준: rhwp 기반 PDF→HWP 전환 이후 실제 코드 기준

근거 파일:
- `src/lib/tools.ts`
- `src/components/layout/HomePage.tsx`
- `src/components/layout/Footer.tsx`
- `src/components/tools/ToolPage.tsx`
- `src/components/tools/GenericPdfTool.tsx`
- `src/components/tools/HwpToPdfTool.tsx`
- `src/components/tools/SignTool.tsx`
- `server/index.ts`

## 1. 최종 요약

P0 컴파일/명칭/문구 문제는 해소됐으며, PDF→HWP 변환은 rhwp 기반 파이프라인으로 전환 완료.

- `npm run build`: 통과
- `npm run build:server`: 통과
- `npm run lint`: 통과, warning 3개
- `pdf-to-hwp` 도구 ID 복구: rhwp 기반 HWP 직접 출력
- 변환 파이프라인: PDF → PDF2DOCX/DOCX → LibreOffice ODT → ingest.json → rhwp-ingest-exporter → HWP
- "모든 기능 브라우저 처리 / 서버 전송 없음" 식의 과장 문구는 기능별 브라우저 처리 + 필요한 서버 변환 안내로 정리됨
- "전자서명 법적 효력" 문구는 `서명 이미지 삽입`, `인증서 기반 법적 전자서명은 아님`으로 정리됨

qpdf 미설치 환경의 사용자 경험은 fallback patch 이후 "서버 500 실패"가 아니라 명시적 unavailable 상태.

- qpdf가 현재 실행 환경에 없으면 `/api/health`가 `qpdf:false`를 반환한다.
- `/api/encrypt`와 `/api/decrypt`는 503 `QPDF_UNAVAILABLE`과 사용자 안내 메시지를 반환한다.
- rhwp/pdftotext가 없으면 `/api/convert/pdf-to-hwp`는 503 `PDF_TO_HWP_UNAVAILABLE`을 반환한다.
- `/api/health`는 `rhwp`, `pdftotext` 상태도 표현한다.

## 2. 기능별 플로우 매트릭스

| 기능 | 라우트/ID | 처리 위치 | 현재 플로우 | 완성률 | 사용자 사용 가능 여부 | 남은 리스크/조치 |
|---|---|---|---|---:|---|---|
| HWP/HWPX → PDF | `/tool/hwp-to-pdf`, `hwp-to-pdf` | 서버 | 파일 업로드 → `/api/convert/hwp-to-pdf` job 생성 → status polling → `/api/download/:jobId` 다운로드 | 75% | 조건부 가능 | LibreOffice 직접 변환은 가능성이 있으나 `hwpforge=false`라 fallback 품질/구버전 HWP 처리 위험. 샘플 HWP/HWPX fixture QA 필요 |
| PDF → HWP | `/tool/pdf-to-hwp`, `pdf-to-hwp` | 서버 | PDF 업로드 → `/api/convert/pdf-to-hwp` → PDF2DOCX/DOCX → LibreOffice ODT → ingest.json → rhwp-ingest-exporter → `.hwp` 다운로드 | 80% | 조건부 가능 | rhwp/rhwp-ingest-exporter/LibreOffice/pdf2docx/poppler-utils 필요. 스캔 이미지 PDF는 OCR 단계가 없어 텍스트 추출 불가 |
| PDF 병합 | `/tool/pdf-merge` | 브라우저 | 여러 PDF 업로드 → `mergePdfs()` → `merged.pdf` 다운로드 | 85% | 가능 | 대용량/암호 PDF/손상 PDF 예외 UX 추가 권장 |
| PDF 분할 | `/tool/pdf-split` | 브라우저 | PDF 업로드 → `splitPdf(..., count=2)` → 결과 Blob 다운로드 | 55% | 제한적 가능 | 실제 zip UX가 아니라 개선 필요. 사용자가 원하는 페이지 범위/다중 파일 다운로드 UX 미완성 |
| PDF → 이미지 | `/tool/pdf-to-image` | 브라우저 | PDF 업로드 → `pdfToImages()` 전체 페이지 렌더링 → 현재 UI는 첫 페이지 중심 다운로드 | 60% | 제한적 가능 | 전체 페이지 zip 다운로드 UX 필요 |
| 워터마크 삽입 | `/tool/pdf-watermark` | 브라우저 | PDF 업로드 → 워터마크 텍스트/옵션 입력 → `addWatermark()` → PDF 다운로드 | 80% | 가능 | 샘플별 위치/투명도/한글 렌더 품질 QA 권장 |
| PDF 압축 | `/tool/pdf-compress` | 브라우저 | PDF 업로드 → `compressPdf()` → PDF 다운로드 | 70% | 가능 | 실제 압축률은 문서별 편차 큼. 결과 크기 감소/실패 고지 개선 권장 |
| 페이지 번호 추가 | `/tool/pdf-pagenumber` | 브라우저 | PDF 업로드 → `addPageNumbers()` → PDF 다운로드 | 85% | 가능 | 한글 문서/가로 페이지/여백 충돌 QA 권장 |
| 도장/인감 삽입 | `/tool/pdf-stamp` | 브라우저 | PDF 업로드 → 도장/이미지 위치 지정 → `embedImagesOnPdf()` 계열 처리 → PDF 다운로드 | 80% | 가능 | 좌표계/미리보기 배율 차이에 대한 추가 샘플 QA 필요 |
| 주민번호 자동 마스킹 | `/tool/pdf-mask-rrn` | 브라우저 | PDF 업로드 → 텍스트 기반 개인정보 패턴 감지/마스킹 → PDF 다운로드 | 75% | 가능 | 스캔 이미지 PDF는 OCR 없으면 제한. 텍스트 PDF 중심이라고 고지 필요 |
| PDF 암호 설정 | `/tool/pdf-encrypt`, `/api/encrypt` | 서버 | PDF + password 업로드 → qpdf encrypt → 다운로드. qpdf가 없으면 503 `QPDF_UNAVAILABLE`과 사용자 안내 메시지 반환 | 45% | 현재 환경에서 명확한 사용 불가 안내 | qpdf 설치/배포 패키징 후 실제 암호화 smoke 필요 |
| PDF 암호 해제 | `/tool/pdf-unlock`, `/api/decrypt` | 서버 | PDF + password 업로드 → qpdf decrypt → 다운로드. qpdf가 없으면 503 `QPDF_UNAVAILABLE`과 사용자 안내 메시지 반환 | 45% | 현재 환경에서 명확한 사용 불가 안내 | qpdf 설치 후 성공/실패 password smoke 필요 |
| 서명 이미지 삽입 | `/tool/pdf-sign`, `pdf-sign` | 브라우저 | PDF 업로드 → 손글씨 서명 그리기 → 미리보기 위치 지정 → 이미지 삽입 PDF 다운로드 | 80% | 가능 | 인증서 기반 전자서명 아님. 법적 효력/검증 보증 없음 고지를 계속 유지해야 함 |
| 결제/PRO | `/pricing`, payment endpoints | 서버 + 외부 API | Toss 결제 확인/웹훅 API, 클라이언트 결제 페이지 | 45% | 제한적/운영 검증 필요 | 실서비스 권한 저장/서버 entitlement/웹훅 멱등성/서명 검증 강화 필요 |

## 3. 사용자 노출 문구 검증

### PDF → HWP 변환

rhwp 기반 파이프라인으로 전환 완료.

- `src/lib/tools.ts`: `PDF → HWP 변환`
- 설명: `PDF를 rhwp 기반 파이프라인으로 한글에서 편집 가능한 HWP 문서로 변환합니다.`
- `GenericPdfTool.tsx`: `pdf-to-hwp` case에서 `/api/convert/pdf-to-hwp` 호출 및 `.hwp` 다운로드명 사용
- `server/index.ts`: `POST /api/convert/pdf-to-hwp`에서 PDF2DOCX/DOCX → ODT → rhwp-ingest-exporter 변환 수행

판정: 통과. HWP 직접 출력 구현됨.

### 브라우저/서버 처리 안내

현재 코드 기준:

- `HomePage.tsx`: `브라우저 처리 + 필요한 서버 변환 분리`
- hero 설명: PDF 편집은 가능한 한 브라우저 처리, HWP 변환/암호 처리는 서버 변환
- 보안 안내: 마스킹/도장/서명 이미지는 브라우저 처리, HWP 변환/암호 설정·해제는 서버 처리
- `Footer.tsx`: 기능별 브라우저 처리와 서버 변환 구분, 서버 처리 파일 임시 보관 후 정리 고지

판정: 통과. 기존 "서버 전송 없음" 일괄 주장은 제거됐다.

### 서명 이미지 고지

현재 코드 기준:

- `src/lib/tools.ts`: 도구명 `서명 이미지 삽입`
- 설명: `인증서 기반 법적 전자서명은 아닙니다.`
- `Footer.tsx`: `서명 이미지는 인증서 기반 전자서명이 아닙니다`

판정: 통과. 법적 효력 과장 문구는 제거됐다.

## 4. QA 결과 반영

- 통과: frontend build
- 통과: server build
- 통과: lint, warning 3개
- 통과: PDF→HWP static contract test
- 제한: qpdf 미설치로 PDF 암호 설정/해제 smoke는 503 `QPDF_UNAVAILABLE` unavailable guard를 반환해야 함
- 제한: rhwp/pdftotext 미설치 환경에서 `/api/convert/pdf-to-hwp`는 503 `PDF_TO_HWP_UNAVAILABLE` 반환

따라서 최종 사용자 사용 가능 판정은 "대부분 핵심 PDF 편집/HWP 변환은 사용 가능, 암호 설정/해제는 현재 환경에서 사용 불가이지만 unavailable 상태를 명확히 안내"가 정확하다.

## 5. 다음 액션

1. qpdf 설치/배포 패키징
   - 로컬/서버에 `qpdf` 설치
   - Docker 또는 서버 provision 문서에 qpdf 포함
   - 설치 후 `/api/health`의 `qpdf`가 `true`인지 확인

2. 암호 도구 unavailable guard 유지/검증
   - qpdf가 없으면 `/tool/pdf-encrypt`, `/tool/pdf-unlock`에서 서버의 사용자 친화적 메시지가 노출되어야 함
   - 서버는 `spawn qpdf ENOENT` 대신 503 `QPDF_UNAVAILABLE`을 반환해야 함

3. QA 재실행
   - `npm run build`
   - `npm run build:server`
   - `npm run lint`
   - `/api/convert/pdf-to-hwp` smoke (rhwp/pdftotext 설치 환경에서)

4. P1 UX 개선
   - PDF 분할 결과 다운로드 UX 개선
   - PDF → 이미지 전체 페이지 zip 다운로드
   - HWP/HWPX fixture 기반 변환 품질 점검
   - PDF→HWP 스캔 이미지 OCR 연동으로 텍스트 추출 범위 확장
