export function Footer() {
  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      <div className="container mx-auto px-4">
        <p>PDF마스터 — 한국인을 위해 만든 PDF 도구</p>
        <p className="mt-1">
          모든 파일 처리는 브라우저에서 이루어집니다. 서버로 파일이 전송되지 않습니다.
        </p>
        <p className="mt-2 text-xs">
          © 2026 PDF마스터. 개인정보보호법 준수 | 전자서명법 제3조에 따른 전자서명 효력
        </p>
      </div>
    </footer>
  )
}
