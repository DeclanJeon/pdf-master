import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText, ShieldCheck, Stamp, Merge, Split, Image,
  Droplets, FileDown, Hash, Lock, Unlock, PenTool,
  FileUp, ArrowRight, Sparkles, Clock3, MonitorSmartphone,
  ArrowDownRight, EyeOff
} from 'lucide-react'
import { tools, categoryLabels, categoryDescriptions } from '@/lib/tools'
import type { ToolCategory } from '@/types'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, ShieldCheck, Stamp, Merge, Split, Image,
  Droplets, FileDown, Hash, Lock, Unlock, PenTool, FileUp,
}

const categories: ToolCategory[] = ['convert', 'edit', 'security', 'sign']

export function HomePage() {
  return (
    <div>
      {/* 히어로 */}
      <section className="hero-stage relative overflow-hidden border-b border-red-100/70 py-16 md:py-24">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-red-300/25 blur-3xl hero-orb" aria-hidden />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl hero-orb-delay" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-10 h-40 w-40 -translate-x-1/2 rounded-full bg-rose-200/30 blur-3xl" aria-hidden />

        <div className="container relative mx-auto px-4">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="hero-copy max-w-2xl text-center lg:text-left">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/85 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-red-700 shadow-sm backdrop-blur sm:text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                </span>
                한국 문서 업무를 위한 PDF 워크스페이스
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl md:text-[3.4rem] md:leading-[1.08]">
                한국 문서를
                <br className="hidden sm:block" />
                <span className="bg-gradient-to-r from-red-600 via-rose-500 to-orange-500 bg-clip-text text-transparent">
                  바로 제출 가능한 PDF
                </span>
                로
              </h1>

              <p className="mt-5 text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
                한글 파일 변환, 주민번호 가리기, 도장 찍기.
                <span className="font-semibold text-stone-800"> 해외 도구가 빠뜨린 일을 한 화면에서.</span>
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start" aria-live="polite">
                <span className="text-sm font-medium text-stone-500">지금 바로</span>
                <HeroRotator />
              </div>

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  to="/hwp-to-pdf"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-red-600/25 transition hover:-translate-y-0.5 hover:bg-red-700 sm:w-auto"
                >
                  <FileText className="h-5 w-5" />
                  HWP → PDF 변환
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/pdf-rrn-mask"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white/90 px-6 py-3.5 text-sm font-semibold text-red-700 backdrop-blur transition hover:bg-red-50 sm:w-auto"
                >
                  <ShieldCheck className="h-5 w-5" />
                  주민번호 마스킹
                </Link>
                <Link
                  to="/pdf-stamp"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white/80 px-6 py-3.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                >
                  <Stamp className="h-5 w-5" />
                  도장 삽입
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-xs text-stone-500 sm:text-sm lg:justify-start">
                <TrustChip icon={<Sparkles className="h-3.5 w-3.5" />} label="한국 문서 특화" />
                <TrustChip icon={<Clock3 className="h-3.5 w-3.5" />} label="무료 하루 3회" />
                <TrustChip icon={<MonitorSmartphone className="h-3.5 w-3.5" />} label="설치 없이 사용" />
              </div>

              <p className="mt-5 text-xs leading-5 text-stone-500 sm:text-sm">
                마스킹·도장은 브라우저에서, HWP 변환·암호 처리는 서버에서 임시 처리 후 정리합니다.
              </p>
            </div>

            <HeroMotionGraphic />
          </div>
        </div>
      </section>

      {/* 왜 PDF마스터인가 */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              글로벌 도구가 못 하는 것, 우리가 합니다
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              검색 유입이 많은 한글 변환·개인정보 마스킹·도장 업무를 중심으로 설계했습니다.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <FeatureCard
              icon={<FileText className="h-7 w-7 text-red-600" />}
              title="한글(HWP/HWPX) PDF 변환"
              description="Smallpdf, iLovePDF는 HWP를 지원하지 않습니다. HwpForge 기반 변환 경로로 한국 문서 품질을 계속 올립니다."
              to="/hwp-to-pdf"
            />
            <FeatureCard
              icon={<Stamp className="h-7 w-7 text-red-600" />}
              title="도장/인감 삽입"
              description="한국식 원형 도장, 직인을 PDF에 삽입합니다. 여러 페이지에 일괄 적용 가능합니다."
              to="/pdf-stamp"
            />
            <FeatureCard
              icon={<ShieldCheck className="h-7 w-7 text-red-600" />}
              title="주민번호 자동 마스킹"
              description="주민등록번호, 전화번호를 자동 감지하여 마스킹합니다. 개인정보보호 업무에 바로 씁니다."
              to="/pdf-rrn-mask"
            />
          </div>
        </div>
      </section>

      {/* 도구 목록 */}
      <section className="bg-stone-50 py-16">
        <div className="container mx-auto px-4">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">모든 도구</h2>
            <p className="mt-2 text-sm text-muted-foreground">변환 · 편집 · 보안 · 서명 도구를 한 화면에서</p>
          </div>

          {categories.map(category => {
            const categoryTools = tools.filter(t => t.category === category)
            return (
              <div key={category} className="mb-12 last:mb-0">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <h3 className="text-lg font-semibold text-stone-900">
                    {categoryLabels[category]}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {categoryDescriptions[category]}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {categoryTools.map(tool => {
                    const Icon = iconMap[tool.icon] || FileText
                    return (
                      <Link
                        key={tool.id}
                        to={`/tool/${tool.id}`}
                        className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="rounded-xl bg-red-50 p-2.5 ring-1 ring-red-100">
                            <Icon className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="flex flex-wrap justify-end gap-1">
                            {tool.isKoreaSpecific && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                한국특화
                              </span>
                            )}
                            {tool.isPremium && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                PRO
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="mt-3 font-semibold text-stone-900 transition-colors group-hover:text-red-600">
                          {tool.name}
                        </h4>
                        <p className="mt-1.5 flex-1 text-sm leading-6 text-muted-foreground">
                          {tool.description}
                        </p>

                        <div className="mt-4 inline-flex items-center text-xs font-semibold text-red-600 opacity-80 transition group-hover:opacity-100">
                          시작하기 <ArrowRight className="ml-1 h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 검색 유입 랜딩 */}
      <section className="bg-white py-14">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight">자주 찾는 PDF 작업 바로가기</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              검색에서 많이 찾는 한글 변환, 개인정보 마스킹, 도장 삽입 안내 페이지입니다.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { title: '한글 HWP PDF 변환', text: 'HWP/HWPX 파일을 설치 없이 PDF로 변환합니다.', to: '/hwp-to-pdf' },
              { title: 'PDF 주민번호 마스킹', text: '주민등록번호·전화번호·이메일 노출을 줄입니다.', to: '/pdf-rrn-mask' },
              { title: 'PDF 도장 삽입', text: '도장·인감·직인 이미지를 PDF에 넣습니다.', to: '/pdf-stamp' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-2xl border border-stone-200 bg-gradient-to-b from-white to-stone-50 p-5 transition hover:border-red-200 hover:shadow-sm"
              >
                <h3 className="font-semibold text-stone-900 hover:text-red-600">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
                <span className="mt-4 inline-flex items-center text-sm font-semibold text-red-600">
                  자세히 보기 <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 검색/답변 엔진용 FAQ */}
      <section className="bg-stone-50 py-16">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold tracking-tight">PDF마스터 자주 묻는 질문</h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            한글 PDF 변환, 주민번호 마스킹, 도장 삽입을 찾는 사용자를 위한 핵심 답변입니다.
          </p>
          <div className="mt-8 space-y-3">
            {[
              {
                q: '한글 HWP 파일을 PDF로 변환할 수 있나요?',
                a: '네. PDF마스터는 HWP/HWPX 문서를 PDF로 변환합니다. 무료 사용자는 하루 3회까지 이용할 수 있고, 한국 문서의 글꼴과 레이아웃 보존을 계속 개선합니다.',
              },
              {
                q: 'PDF에서 주민등록번호를 자동으로 마스킹할 수 있나요?',
                a: '네. PDF 문서 안의 주민등록번호, 전화번호, 이메일 등 개인정보 패턴을 감지하고 마스킹할 수 있습니다. 가능한 기능은 브라우저에서 처리해 문서 노출을 줄입니다.',
              },
              {
                q: 'PDF에 도장이나 인감을 넣을 수 있나요?',
                a: '네. 한국식 원형 도장, 직인, 손글씨 서명 이미지를 PDF 원하는 위치에 삽입할 수 있고 여러 페이지 일괄 적용도 지원합니다.',
              },
              {
                q: '업로드한 문서 파일은 서버에 계속 저장되나요?',
                a: '아니요. 서버 처리가 필요한 기능의 업로드 파일과 결과 파일은 임시 보관 후 현재 기준 10분 이내 자동 삭제되도록 운영합니다.',
              },
            ].map((item) => (
              <details key={item.q} className="group rounded-xl border border-stone-200 bg-white p-4 open:shadow-sm">
                <summary className="cursor-pointer list-none font-semibold text-stone-900 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {item.q}
                    <ArrowRight className="h-4 w-4 shrink-0 text-stone-400 transition group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 보안 안내 */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100">
            <ShieldCheck className="h-7 w-7 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">처리 방식은 기능별로 명확히 안내합니다</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            마스킹·도장·서명 이미지 삽입 등은 브라우저에서 처리합니다.
            HWP 변환, 암호 설정/해제 등 서버가 필요한 기능은 업로드 후 임시 처리하며,
            결과 제공 후 짧은 보관 시간 내 정리됩니다.
          </p>
        </div>
      </section>
    </div>
  )
}


const heroPhrases = [
  { label: '한글 HWP/HWPX 변환', icon: FileText, tone: 'text-red-700 bg-red-50 ring-red-100' },
  { label: '주민번호 자동 마스킹', icon: EyeOff, tone: 'text-emerald-700 bg-emerald-50 ring-emerald-100' },
  { label: '도장·인감 한 번에 삽입', icon: Stamp, tone: 'text-amber-700 bg-amber-50 ring-amber-100' },
] as const

function HeroRotator() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = window.setInterval(() => {
      setVisible(false)
      window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % heroPhrases.length)
        setVisible(true)
      }, 220)
    }, 2400)
    return () => window.clearInterval(id)
  }, [])

  const active = heroPhrases[index]
  const Icon = active.icon

  return (
    <span
      className={`inline-flex min-w-[15.5rem] items-center justify-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition-all duration-300 sm:min-w-[17rem] ${active.tone} ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      }`}
    >
      <Icon className="h-4 w-4" />
      {active.label}
    </span>
  )
}

function HeroMotionGraphic() {
  return (
    <div className="hero-graphic relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-red-100/70 via-white to-amber-50/80 blur-sm" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/80 p-5 shadow-[0_30px_80px_-40px_rgba(185,28,28,0.55)] backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-stone-500">
            LIVE PREVIEW
          </span>
        </div>

        <div className="relative h-[300px] sm:h-[320px]">
          {/* HWP card */}
          <div className="doc-card doc-card-hwp absolute left-2 top-4 w-[46%] rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-50 to-white p-3 shadow-md">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-[10px] font-bold text-white">
                HWP
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-800">보고서.hwp</p>
                <p className="text-[10px] text-stone-400">한글 원본</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-full rounded bg-stone-200/90" />
              <div className="h-2 w-[80%] rounded bg-stone-200/80" />
              <div className="h-2 w-[75%] rounded bg-stone-200/70" />
              <div className="mt-3 grid grid-cols-3 gap-1">
                <div className="h-8 rounded bg-stone-100" />
                <div className="h-8 rounded bg-stone-100" />
                <div className="h-8 rounded bg-stone-100" />
              </div>
            </div>
          </div>

          {/* flow arrow */}
          <div className="flow-chip absolute left-1/2 top-[42%] z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-red-600/30">
            변환
            <ArrowDownRight className="h-3.5 w-3.5" />
          </div>

          {/* PDF card */}
          <div className="doc-card doc-card-pdf absolute bottom-3 right-1 w-[52%] rounded-2xl border border-red-100 bg-gradient-to-br from-white to-red-50 p-3 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-[10px] font-bold text-white">
                PDF
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-800">보고서.pdf</p>
                <p className="text-[10px] text-red-500">제출 준비 완료</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full rounded bg-red-100" />
              <div className="relative h-2 w-[83%] overflow-hidden rounded bg-red-100">
                <span className="mask-bar absolute inset-y-0 left-1/4 w-1/3 rounded bg-stone-800/80" />
              </div>
              <div className="h-2 w-[66%] rounded bg-red-100" />
              <div className="mt-3 flex items-end justify-between">
                <div className="space-y-1">
                  <div className="h-1.5 w-16 rounded bg-red-100" />
                  <div className="h-1.5 w-12 rounded bg-red-100" />
                </div>
                <div className="stamp-seal relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-500/80 text-[9px] font-black tracking-tighter text-red-600">
                  직인
                  <span className="absolute inset-1 rounded-full border border-red-400/50" />
                </div>
              </div>
            </div>
          </div>

          {/* floating chips */}
          <div className="float-chip absolute right-2 top-2 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 shadow-sm">
            마스킹 적용
          </div>
          <div className="float-chip-delay absolute bottom-24 left-1 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 shadow-sm">
            도장 완료
          </div>
        </div>
      </div>
    </div>
  )
}

function TrustChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 font-medium text-stone-600 shadow-sm">
      {icon}
      {label}
    </span>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  to,
}: {
  icon: ReactNode
  title: string
  description: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-stone-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100 transition group-hover:bg-red-100">
        {icon}
      </div>
      <h3 className="font-semibold text-stone-900 group-hover:text-red-700">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <span className="mt-4 inline-flex items-center text-sm font-semibold text-red-600">
        바로 시작 <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
