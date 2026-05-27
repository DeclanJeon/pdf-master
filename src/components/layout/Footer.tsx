export function Footer() {
  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      <div className="container mx-auto px-4">
        <p>PDF마스터 — 한국인을 위해 만든 PDF 도구</p>
        <p className="mt-1">
          기능별로 브라우저 처리와 서버 변환을 명확히 구분합니다. 서버 처리 파일은 임시 보관 후 정리됩니다.
        </p>
        <p className="mt-2 text-xs">
          © 2026 PDF마스터. 개인정보 보호 지원 | 서명 이미지는 인증서 기반 전자서명이 아닙니다
        </p>
      </div>
    </footer>
  )
}
