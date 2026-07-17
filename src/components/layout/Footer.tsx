import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-50/80 py-8 text-sm text-muted-foreground">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xl">
            <p className="font-semibold text-stone-800">PDF마스터 — 한국인을 위해 만든 PDF 도구</p>
            <p className="mt-1.5 leading-6">
              기능별로 브라우저 처리와 서버 변환을 명확히 구분합니다. 서버 처리 파일은 임시 보관 후 정리됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs md:justify-end">
            <Link to="/hwp-to-pdf" className="underline-offset-2 hover:text-red-600 hover:underline">HWP PDF 변환</Link>
            <Link to="/pdf-rrn-mask" className="underline-offset-2 hover:text-red-600 hover:underline">주민번호 마스킹</Link>
            <Link to="/pdf-stamp" className="underline-offset-2 hover:text-red-600 hover:underline">도장 삽입</Link>
            <Link to="/pricing" className="underline-offset-2 hover:text-red-600 hover:underline">요금제</Link>
            <Link to="/contact" className="underline-offset-2 hover:text-red-600 hover:underline">문의하기</Link>
            <Link to="/privacy" className="underline-offset-2 hover:text-red-600 hover:underline">개인정보처리방침</Link>
          </div>
        </div>
        <p className="mt-6 text-xs text-stone-400">© 2026 PDF마스터. HwpForge 기반 HWPX 변환 엔진을 사용합니다.</p>
      </div>
    </footer>
  )
}
