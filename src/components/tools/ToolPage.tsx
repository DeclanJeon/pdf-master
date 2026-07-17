import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getToolById } from '@/lib/tools'
import { MaskingTool } from '@/components/tools/MaskingTool'
import { StampTool } from '@/components/tools/StampTool'
import { SignTool } from '@/components/tools/SignTool'
import { GenericPdfTool } from '@/components/tools/GenericPdfTool'
import HwpToPdfTool from '@/components/tools/HwpToPdfTool'
import { ArrowLeft, Crown, Loader2, Lock, LogIn } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'

interface UsageSummary {
  dailyLimit: number
  remaining: number
  used: number
  unlimited?: boolean
}

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>()
  const tool = toolId ? getToolById(toolId) : undefined
  const { loading, loggedIn, premium, isAdmin, login } = useAuth()
  const [usage, setUsage] = useState<UsageSummary | null>(null)

  useEffect(() => {
    if (!tool?.isPremium) {
      setUsage(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/usage', { credentials: 'include' })
        const data = await res.json()
        if (!cancelled && data && typeof data === 'object') {
          setUsage({
            dailyLimit: Number(data.dailyLimit) || 3,
            remaining: Number(data.remaining) || 0,
            used: Number(data.used) || 0,
            unlimited: Boolean(data.unlimited),
          })
        }
      } catch {
        if (!cancelled) {
          setUsage(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tool?.isPremium])

  if (!tool) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">도구를 찾을 수 없습니다</h1>
        <Link to="/" className="mt-4 inline-flex items-center gap-2 text-red-600">
          <ArrowLeft className="h-4 w-4" /> 홈으로 돌아가기
        </Link>
      </div>
    )
  }

  const renderTool = () => {
    switch (tool.id) {
      case 'pdf-mask-rrn':
        return <MaskingTool />
      case 'pdf-stamp':
        return <StampTool />
      case 'pdf-sign':
        return <SignTool />
      case 'hwp-to-pdf':
        return <HwpToPdfTool />
      default:
        return <GenericPdfTool toolId={tool.id} toolName={tool.name} />
    }
  }

  const trialUnlimited = usage?.unlimited === true
  const trialRemaining = usage ? usage.remaining : 3
  const premiumFreeEnabled = isAdmin || premium.isPremium || trialUnlimited || trialRemaining > 0
  const isBlockedPremiumTool = tool.isPremium && !premiumFreeEnabled

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-red-600">
        <ArrowLeft className="h-3.5 w-3.5" /> 모든 도구
      </Link>

      <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">{tool.name}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{tool.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tool.isKoreaSpecific && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
              한국 특화
            </span>
          )}
          {tool.isPremium ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              프리미엄
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              무료
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        {loading && tool.isPremium ? (
          <div className="py-14 text-center">
            <Loader2 className="mx-auto mb-3 h-9 w-9 animate-spin text-red-600" />
            <p className="text-muted-foreground">프리미엄 권한을 확인하는 중...</p>
          </div>
        ) : isBlockedPremiumTool ? (
          <div className="mx-auto max-w-lg py-12 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
              <Lock className="h-8 w-8 text-amber-700" />
            </div>
            <h2 className="mb-2 text-2xl font-bold">프리미엄 기능입니다</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {trialRemaining <= 0 && !trialUnlimited
                ? '오늘 무료 이용 횟수를 모두 사용했습니다. 결제 후 계속 이용하거나 로그인해 구독/결제 혜택을 받아 이용해주세요.'
                : '현재 계정은 프리미엄이 아니며 무료 체험 횟수 제한이 적용됩니다.'}
              <br />
              {trialUnlimited
                ? '관리자/프리미엄 계정은 이용 제한 없이 사용 가능합니다.'
                : `현재 남은 무료 횟수: ${Math.max(trialRemaining, 0)} / ${usage?.dailyLimit ?? 3}`}
            </p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              {!loggedIn && (
                <Button onClick={() => login(`/tool/${tool.id}`)}>
                  <LogIn className="mr-2 h-4 w-4" /> Google 로그인
                </Button>
              )}
              <Link to="/pricing" className={buttonVariants({ variant: loggedIn ? 'default' : 'outline' })}>
                <Crown className="mr-2 h-4 w-4" /> 요금제 보기
              </Link>
            </div>
          </div>
        ) : renderTool()}
      </div>
    </div>
  )
}
