import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  Shield,
  FileText,
  Stamp,
  Crown,
  ShieldCheck,
  LogIn,
  LogOut,
  Loader2,
  Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge as UiBadge } from '@/components/ui/badge'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-red-50 text-red-700'
      : 'text-stone-600 hover:bg-stone-50 hover:text-red-700',
  )

export function Header() {
  const { loading, loggedIn, user, premium, isAdmin, login, logout } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/85 shadow-sm backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center gap-3 px-4">
        <Link to="/" className="group flex shrink-0 items-center gap-2 font-bold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm shadow-red-600/20 transition-transform group-hover:scale-[1.03]">
            <FileText className="h-5 w-5" />
          </span>
          <span className="text-base sm:text-lg">
            PDF마스터
            <span className="ml-1.5 align-middle">
              <BrandBadge>KOREA</BrandBadge>
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-1.5">
          <NavLink to="/hwp-to-pdf" className={({ isActive }) => cn(navLinkClass({ isActive }), 'hidden lg:inline-flex')}>
            <FileText className="h-4 w-4" />
            HWP PDF 변환
          </NavLink>
          <NavLink to="/pdf-rrn-mask" className={({ isActive }) => cn(navLinkClass({ isActive }), 'hidden md:inline-flex')}>
            <Shield className="h-4 w-4" />
            주민번호 마스킹
          </NavLink>
          <NavLink to="/pdf-stamp" className={({ isActive }) => cn(navLinkClass({ isActive }), 'hidden md:inline-flex')}>
            <Stamp className="h-4 w-4" />
            도장 삽입
          </NavLink>
          <NavLink
            to="/pricing"
            className={({ isActive }) =>
              cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-amber-700 hover:bg-amber-50',
              )
            }
          >
            <Crown className="h-4 w-4" />
            프리미엄
          </NavLink>
          <NavLink to="/contact" className={({ isActive }) => cn(navLinkClass({ isActive }), 'hidden sm:inline-flex')}>
            <Mail className="h-4 w-4" />
            문의
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={navLinkClass}>
              <ShieldCheck className="h-4 w-4" />
              관리자
            </NavLink>
          )}

          <div className="ml-1 h-6 w-px bg-stone-200" />

          {loading ? (
            <span className="flex items-center gap-1.5 px-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">확인중</span>
            </span>
          ) : loggedIn ? (
            <div className="flex items-center gap-2">
              <UiBadge variant={isAdmin || premium.isPremium ? 'default' : 'secondary'}>
                {isAdmin ? '관리자' : premium.isPremium ? '프리미엄' : '무료'}
              </UiBadge>
              <span
                className="hidden max-w-[160px] truncate text-xs text-muted-foreground lg:inline"
                title={user?.email}
              >
                {user?.name || user?.email}
              </span>
              <Button variant="outline" size="sm" onClick={() => void logout()}>
                <LogOut className="h-4 w-4 md:mr-1" />
                <span className="hidden md:inline">로그아웃</span>
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => login()} className="bg-red-600 text-white hover:bg-red-700">
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

function BrandBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-red-600 sm:text-xs">
      {children}
    </span>
  )
}
