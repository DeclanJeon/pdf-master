import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Shield, FileText, Zap, Crown, ShieldCheck, LogIn, LogOut, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge as UiBadge } from '@/components/ui/badge'
import { useAuth } from '@/auth/AuthProvider'

export function Header() {
  const { loading, loggedIn, user, premium, isAdmin, login, logout } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <FileText className="h-6 w-6 text-red-600" />
          <span>PDF마스터</span>
          <Badge>KOREA</Badge>
        </Link>

        <nav className="ml-auto flex items-center gap-4 text-sm">
          <Link to="/hwp-to-pdf" className="hidden items-center gap-1 hover:text-red-600 lg:flex">
            <FileText className="h-4 w-4" />
            HWP PDF 변환
          </Link>
          <Link to="/pdf-rrn-mask" className="hidden items-center gap-1 hover:text-red-600 md:flex">
            <Shield className="h-4 w-4" />
            주민번호 마스킹
          </Link>
          <Link to="/pdf-stamp" className="hidden items-center gap-1 hover:text-red-600 md:flex">
            <Zap className="h-4 w-4" />
            도장 삽입
          </Link>
          <Link to="/pricing" className="flex items-center gap-1 text-yellow-600 hover:text-yellow-700 font-medium">
            <Crown className="h-4 w-4" />
            프리미엄
          </Link>
          <Link to="/contact" className="flex items-center gap-1 hover:text-red-600">
            <Mail className="h-4 w-4" />
            문의하기
          </Link>
          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-1 hover:text-red-600">
              <ShieldCheck className="h-4 w-4" />
              관리자
            </Link>
          )}

          {loading ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              확인중
            </span>
          ) : loggedIn ? (
            <div className="flex items-center gap-2">
              <UiBadge variant={isAdmin || premium.isPremium ? 'default' : 'secondary'}>
                {isAdmin ? '관리자' : premium.isPremium ? '프리미엄' : '무료'}
              </UiBadge>
              <span className="hidden max-w-[180px] truncate text-muted-foreground md:inline" title={user?.email}>
                {user?.name || user?.email}
              </span>
              <Button variant="outline" size="sm" onClick={() => void logout()}>
                <LogOut className="h-4 w-4 md:mr-1" />
                <span className="hidden md:inline">로그아웃</span>
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => login()}>
              <LogIn className="h-4 w-4 md:mr-1" />
              <span className="hidden md:inline">Google 로그인</span>
              <span className="md:hidden">로그인</span>
            </Button>
          )}
        </nav>
      </div>
    </header>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
      {children}
    </span>
  )
}
