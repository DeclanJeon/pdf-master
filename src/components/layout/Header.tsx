import { Link } from 'react-router-dom'
import { Shield, FileText, Zap, Crown } from 'lucide-react'

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <FileText className="h-6 w-6 text-red-600" />
          <span>PDF마스터</span>
          <Badge>KOREA</Badge>
        </Link>

        <nav className="ml-auto flex items-center gap-4 text-sm">
          <Link to="/tool/pdf-mask-rrn" className="flex items-center gap-1 hover:text-red-600">
            <Shield className="h-4 w-4" />
            주민번호 마스킹
          </Link>
          <Link to="/tool/pdf-stamp" className="flex items-center gap-1 hover:text-red-600">
            <Zap className="h-4 w-4" />
            도장 삽입
          </Link>
          <Link to="/pricing" className="flex items-center gap-1 text-yellow-600 hover:text-yellow-700 font-medium">
            <Crown className="h-4 w-4" />
            프리미엄
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
      {children}
    </span>
  )
}
