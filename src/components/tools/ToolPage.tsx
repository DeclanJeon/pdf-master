import { useParams, Link } from 'react-router-dom'
import { getToolById } from '@/lib/tools'
import { MaskingTool } from '@/components/tools/MaskingTool'
import { StampTool } from '@/components/tools/StampTool'
import { SignTool } from '@/components/tools/SignTool'
import { GenericPdfTool } from '@/components/tools/GenericPdfTool'
import HwpToPdfTool from '@/components/tools/HwpToPdfTool'
import { ArrowLeft, Crown, Loader2, Lock, LogIn } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>()
  const tool = toolId ? getToolById(toolId) : undefined
  const { loading, loggedIn, premium, isAdmin, login } = useAuth()

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

  const isBlockedPremiumTool = tool.isPremium && !isAdmin && !premium.isPremium

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-red-600 mb-4">
        <ArrowLeft className="h-3 w-3" /> 모든 도구
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{tool.name}</h1>
        <p className="text-muted-foreground mt-1">{tool.description}</p>
        <div className="flex gap-2 mt-2">
          {tool.isKoreaSpecific && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
              한국 특화
            </span>
          )}
          {tool.isPremium ? (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
              프리미엄
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
              무료
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        {loading && tool.isPremium ? (
          <div className="py-14 text-center">
            <Loader2 className="mx-auto mb-3 h-9 w-9 animate-spin text-red-600" />
            <p className="text-muted-foreground">프리미엄 권한을 확인하는 중...</p>
          </div>
        ) : isBlockedPremiumTool ? (
          <div className="mx-auto max-w-lg py-12 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-100">
              <Lock className="h-8 w-8 text-yellow-700" />
            </div>
            <h2 className="mb-2 text-2xl font-bold">프리미엄 기능입니다</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {loggedIn
                ? '현재 계정에는 프리미엄 권한이 없습니다. 결제 후 서버 검증이 완료되면 바로 사용할 수 있습니다.'
                : 'Google 로그인 후 건당 결제 또는 월 구독으로 이용할 수 있습니다.'}
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
