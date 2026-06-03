import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      <div className="container mx-auto px-4">
        <p>PDF마스터 — 한국인을 위해 만든 PDF 도구</p>
        <p className="mt-1">
          기능별로 브라우저 처리와 서버 변환을 명확히 구분합니다. 서버 처리 파일은 임시 보관 후 정리됩니다.
        </p>
        <p className="mt-2 text-xs">
          © 2026 PDF마스터. <Link to="/privacy" className="underline underline-offset-2 hover:text-red-600">개인정보처리방침</Link> | <Link to="/hwp-to-pdf" className="underline underline-offset-2 hover:text-red-600">HWP PDF 변환</Link> | <Link to="/pdf-rrn-mask" className="underline underline-offset-2 hover:text-red-600">주민번호 마스킹</Link> | <Link to="/pdf-stamp" className="underline underline-offset-2 hover:text-red-600">도장 삽입</Link>
           | <Link to="/contact" className="underline underline-offset-2 hover:text-red-600">문의하기</Link>
        </p>
      </div>
    </footer>
  )
}
