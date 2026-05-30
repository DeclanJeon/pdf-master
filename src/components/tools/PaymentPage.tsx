import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CreditCard, CheckCircle2, Loader2, Crown,
  Shield, Zap, Lock, ArrowRight, Sparkles, X as XIcon, LogIn, LogOut,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/appStore'

type PlanId = 'one_time' | 'monthly'

type PremiumStatus = {
  isPremium: boolean
  plan: PlanId | 'unknown' | 'admin' | null
  expiresAt: string | null
  oneTimePasses: number
}

type AuthState = {
  loading: boolean
  loggedIn: boolean
  user: { email: string; name: string; avatarUrl?: string } | null
  premium: PremiumStatus
  isAdmin: boolean
}

type CheckoutResponse = {
  checkoutUrl?: string
  error?: string
  code?: string
}

interface Feature {
  name: string
  free: boolean | string
  perUse: boolean | string
  monthly: boolean | string
}

const EMPTY_PREMIUM: PremiumStatus = {
  isPremium: false,
  plan: null,
  expiresAt: null,
  oneTimePasses: 0,
}

const FEATURES: Feature[] = [
  { name: '주민번호 마스킹',     free: true,  perUse: true,  monthly: true },
  { name: '도장/인감 삽입',      free: true,  perUse: true,  monthly: true },
  { name: 'PDF 병합/분할/압축',  free: true,  perUse: true,  monthly: true },
  { name: 'HWP → PDF 변환',      free: '3회', perUse: true,  monthly: true },
  { name: 'PDF → HWP 변환',      free: false, perUse: true,  monthly: true },
  { name: 'PDF 암호 설정/해제',   free: false, perUse: true,  monthly: true },
  { name: '하루 사용 제한',       free: '3건', perUse: '없음', monthly: '없음' },
  { name: '파일 보관',           free: '10분', perUse: '10분', monthly: '10분' },
  { name: '우선 처리',           free: false, perUse: false, monthly: true },
]

const CHECKOUT_ERROR_MESSAGES: Record<string, string> = {
  LOGIN_REQUIRED: '로그인이 필요합니다. Google 로그인 후 다시 결제를 시도해주세요.',
  POLAR_NOT_CONFIGURED: '결제 설정이 아직 완료되지 않았습니다. 관리자에게 문의해주세요.',
  POLAR_PRODUCT_NOT_CONFIGURED: '선택한 요금제의 결제 상품이 아직 준비되지 않았습니다. 다른 요금제를 선택하거나 잠시 후 다시 시도해주세요.',
  POLAR_PRODUCT_ID_INVALID: '선택한 요금제의 Polar 상품 ID 형식이 올바르지 않습니다. 관리자에게 결제 설정 확인을 요청해주세요.',
  POLAR_PRODUCT_ID_NOT_ALLOWED: '요금제 상품 정보가 유효하지 않습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.',
  POLAR_CHECKOUT_REJECTED: 'Polar가 checkout 요청을 거부했습니다. 상품의 KRW 가격 설정 또는 통화 지원 상태를 확인해주세요.',
}

const parseCheckoutResponse = async (response: Response): Promise<CheckoutResponse> => {
  const payload: unknown = await response.json().catch(() => ({}))

  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const data = payload as Record<string, unknown>
  return {
    checkoutUrl: typeof data.checkoutUrl === 'string' ? data.checkoutUrl : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
    code: typeof data.code === 'string' ? data.code : undefined,
  }
}

const getCheckoutErrorMessage = ({ error, code }: CheckoutResponse) => {
  if (code && CHECKOUT_ERROR_MESSAGES[code]) {
    return CHECKOUT_ERROR_MESSAGES[code]
  }

  return error || '결제 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
}

export default function PaymentPage() {
  const [searchParams] = useSearchParams()
  const [paymentLoading, setPaymentLoading] = useState<PlanId | null>(null)
  const [checkoutErrorText, setCheckoutErrorText] = useState<string | null>(null)
  const [auth, setAuth] = useState<AuthState>({ loading: true, loggedIn: false, user: null, premium: EMPTY_PREMIUM, isAdmin: false })
  const { dailyFreeUsed, dailyFreeLimit, setPremiumUnlocked } = useAppStore()
  const checkoutSuccess = searchParams.get('success') === 'true' || searchParams.get('success') === '1'
  const checkoutCanceled = searchParams.get('canceled') === 'true' || searchParams.get('cancel') === '1'
  const checkoutError = searchParams.get('error')

  const refreshAuth = useCallback(async () => {
    setAuth((current) => ({ ...current, loading: true }))
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      const data = await response.json()
      const premium = data.premium || EMPTY_PREMIUM
      const isAdmin = Boolean(data.isAdmin)
      setAuth({
        loading: false,
        loggedIn: Boolean(data.loggedIn),
        user: data.user || null,
        premium,
        isAdmin,
      })
      setPremiumUnlocked(isAdmin || Boolean(premium.isPremium))
    } catch (err) {
      console.error('Auth status failed:', err)
      setAuth({ loading: false, loggedIn: false, user: null, premium: EMPTY_PREMIUM, isAdmin: false })
      setPremiumUnlocked(false)
    }
  }, [setPremiumUnlocked])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  const premiumLabel = useMemo(() => {
    if (!auth.premium.isPremium) return ''
    if (auth.premium.plan === 'monthly') {
      return auth.premium.expiresAt
        ? `월 구독 · ${new Date(auth.premium.expiresAt).toLocaleDateString('ko-KR')}까지`
        : '월 구독 활성화'
    }
    return `건당 이용권 ${auth.premium.oneTimePasses}회 남음`
  }, [auth.premium])

  const handleLogin = () => {
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent('/pricing')}`
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => null)
    await refreshAuth()
  }

  const handlePayment = async (plan: PlanId) => {
    if (!auth.loggedIn) {
      handleLogin()
      return
    }

    setCheckoutErrorText(null)
    setPaymentLoading(plan)
    try {
      const response = await fetch('/api/polar/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await parseCheckoutResponse(response)
      if (!response.ok || !data.checkoutUrl) {
        setCheckoutErrorText(getCheckoutErrorMessage(data))
        return
      }
      window.location.href = data.checkoutUrl
    } catch (err) {
      console.error('Payment error:', err)
      setCheckoutErrorText('결제 요청 중 네트워크 오류가 발생했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.')
    } finally {
      setPaymentLoading(null)
    }
  }

  const renderCell = (value: boolean | string) => {
    if (typeof value === 'string') {
      return <span className="text-sm text-foreground">{value}</span>
    }
    return value
      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
      : <XIcon className="w-4 h-4 text-gray-300" />
  }

  if (auth.loading) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <Loader2 className="w-10 h-10 mx-auto animate-spin text-red-600 mb-4" />
        <p className="text-muted-foreground">계정 상태를 확인하는 중...</p>
      </div>
    )
  }

  if (auth.isAdmin || auth.premium.isPremium) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{auth.isAdmin ? '관리자 권한 활성화됨' : '프리미엄 활성화됨'}</h2>
        <p className="text-muted-foreground mb-2">
          {auth.isAdmin ? '관리자 계정은 모든 유료 기능을 사용할 수 있습니다.' : '프리미엄 권한이 활성화되어 있습니다.'}
        </p>
        <p className="text-xs text-muted-foreground mb-2">오늘 무료 사용: {dailyFreeUsed}/{dailyFreeLimit}</p>
        {!auth.isAdmin && <p className="text-sm text-muted-foreground mb-8">{premiumLabel}</p>}
        <div className="flex justify-center gap-3">
          <Button variant="outline" size="sm" onClick={refreshAuth}>상태 새로고침</Button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" /> 로그아웃
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 py-4">
      <div className="text-center space-y-3">
        {checkoutSuccess && (
          <div className="mx-auto max-w-xl rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            결제 완료 신호를 받았습니다. Webhook 반영까지 잠시 걸릴 수 있으니, 권한이 바로 보이지 않으면 상태 새로고침을 눌러주세요.
            <div className="mt-2"><Button variant="outline" size="sm" onClick={refreshAuth}>상태 새로고침</Button></div>
          </div>
        )}
        {checkoutCanceled && (
          <div className="mx-auto max-w-xl rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            결제가 취소되었습니다. 필요할 때 다시 결제할 수 있습니다.
          </div>
        )}
        {checkoutError && (
          <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            결제 처리 오류: {checkoutError}
          </div>
        )}
        {checkoutErrorText && (
          <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {checkoutErrorText}
          </div>
        )}
        <p className="text-xs text-muted-foreground">오늘 무료 사용: {dailyFreeUsed}/{dailyFreeLimit}</p>
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
          <Crown className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">요금제 선택</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Google 로그인 후 안전한 결제로 프리미엄 기능을 이용하세요.
        </p>
        <div className="flex justify-center gap-2 text-sm">
          {auth.loggedIn ? (
            <>
              <Badge variant="secondary">{auth.user?.email}</Badge>
              <Button variant="ghost" size="sm" onClick={handleLogout}>로그아웃</Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={handleLogin}>
              <LogIn className="w-4 h-4 mr-2" /> Google로 로그인
            </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 md:gap-6 items-start">
        <Card className="relative border-gray-200">
          <CardHeader className="text-center pb-2">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-gray-500" />
            </div>
            <CardTitle className="text-lg">무료</CardTitle>
            <div className="mt-3"><span className="text-4xl font-bold">₩0</span></div>
            <p className="text-sm text-muted-foreground mt-1">영구 무료</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2.5">
              {['주민번호 마스킹', '도장/인감 삽입', 'PDF 병합/분할/압축', '하루 3건까지', '워터마크 추가'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
              {['PDF → HWP 변환', 'PDF 암호 설정/해제'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <XIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full" disabled>현재 플랜</Button>
          </CardContent>
        </Card>

        <Card className="relative border-blue-200 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-blue-100 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <CardTitle className="text-lg">건당 결제</CardTitle>
            <div className="mt-3">
              <span className="text-4xl font-bold">₩1,000</span>
              <span className="text-muted-foreground text-sm">/건</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">원화(KRW) 기준 · 필요할 때만</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2.5">
              {['무료 플랜의 모든 기능', 'PDF → HWP 변환 1회', 'PDF 암호 설정/해제 1회', '구매 즉시 1회 이용권 지급'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={() => handlePayment('one_time')}
              disabled={paymentLoading !== null}
            >
              {paymentLoading === 'one_time' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
              {auth.loggedIn ? '1,000원 결제' : '로그인 후 결제'}
            </Button>
          </CardContent>
        </Card>

        <Card className="relative border-red-300 shadow-xl ring-2 ring-red-100">
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-600 to-orange-500 px-4 shadow-md">
            <Sparkles className="w-3 h-3 mr-1" /> 가장 인기
          </Badge>
          <CardHeader className="text-center pb-2">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-md">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <CardTitle className="text-lg">월 구독</CardTitle>
            <div className="mt-3">
              <span className="text-4xl font-bold">₩5,900</span>
              <span className="text-muted-foreground text-sm">/월</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">원화(KRW) 기준 · 무제한 프리미엄 기능</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2.5">
              {['건당 결제의 모든 기능', '무제한 변환/편집', '우선 처리 속도', '새 기능 우선 체험'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 shadow-md"
              onClick={() => handlePayment('monthly')}
              disabled={paymentLoading !== null}
            >
              {paymentLoading === 'monthly' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              {auth.loggedIn ? '5,900원 / 월 구독' : '로그인 후 구독'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-center">기능 비교</h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left py-3 px-4 font-medium w-[40%]">기능</th>
                <th className="text-center py-3 px-3 font-medium">무료</th>
                <th className="text-center py-3 px-3 font-medium text-blue-600">건당</th>
                <th className="text-center py-3 px-3 font-medium text-red-600">월 구독</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f, i) => (
                <tr key={f.name} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="py-2.5 px-4">{f.name}</td>
                  <td className="text-center py-2.5 px-3">{renderCell(f.free)}</td>
                  <td className="text-center py-2.5 px-3">{renderCell(f.perUse)}</td>
                  <td className="text-center py-2.5 px-3">{renderCell(f.monthly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 text-center">
        <div className="space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <h3 className="font-semibold text-sm">안전한 결제</h3>
          <p className="text-xs text-muted-foreground">Polar.sh 보안 체크아웃으로 처리하고 결제 완료 후 권한을 자동 반영합니다.</p>
        </div>
        <div className="space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="font-semibold text-sm">파일 보안</h3>
          <p className="text-xs text-muted-foreground">서버 처리 파일은 임시 보관 후 10분 이내 자동 삭제됩니다.</p>
        </div>
        <div className="space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-purple-100 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-purple-600" />
          </div>
          <h3 className="font-semibold text-sm">계정 기반 이용권 관리</h3>
          <p className="text-xs text-muted-foreground">결제한 이용권과 구독 상태는 로그인 계정에 안전하게 연결됩니다.</p>
        </div>
      </div>

      <div className="space-y-3 max-w-2xl mx-auto">
        <h2 className="text-xl font-bold text-center">자주 묻는 질문</h2>
        {[
          { q: '무료로 얼마나 쓸 수 있나요?', a: '하루 3건까지 무료입니다. 주민번호 마스킹, 도장 삽입, PDF 병합 등 기본 기능은 계속 사용할 수 있습니다.' },
          { q: '건당 결제는 어떻게 하나요?', a: 'Google 로그인 후 1,000원 이용권을 결제하면 유료 기능을 1회 사용할 수 있습니다. 남은 이용권은 계정에 자동 반영됩니다.' },
          { q: '서버 처리 파일은 얼마나 보관되나요?', a: '모든 서버 처리 파일은 임시 보관되며 10분 이내 자동 삭제됩니다.' },
          { q: '환불은 어떻게 하나요?', a: '결제 완료 후 7일 이내 환불 가능합니다. 이메일(refund@pdfm.ponslink.com)로 문의해주세요.' },
        ].map((item) => (
          <details key={item.q} className="group rounded-lg border bg-card">
            <summary className="flex items-center justify-between py-3 px-4 cursor-pointer font-medium text-sm">
              {item.q}
              <span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="px-4 pb-3 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
