import { Link } from 'react-router-dom'
import {
  FileText, ShieldCheck, Stamp, Merge, Split, Image,
  Droplets, FileDown, Hash, Lock, Unlock, PenTool,
  FileUp, ArrowRight
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
      <section className="relative overflow-hidden bg-gradient-to-br from-red-50 via-white to-red-50 py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-1.5 text-sm font-medium text-red-700 mb-6">
            <ShieldCheck className="h-4 w-4" />
            브라우저 처리 + 필요한 서버 변환 분리
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            한국인을 위해 만든
            <br />
            <span className="text-red-600">PDF 도구</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            한글(HWP/HWPX) PDF 변환, PDF 주민번호 마스킹, 도장·인감 삽입 —
            글로벌 도구가 못 하는 한국 특화 기능을 한 곳에.
            <br />
            PDF 편집은 가능한 한 브라우저에서 처리하고, HWP 변환·암호 처리처럼 필요한 기능은 서버에서 안전하게 임시 변환합니다.
          </p>

          <div className="mt-8 flex justify-center gap-4">
            <Link
              to="/tool/pdf-mask-rrn"
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700"
            >
              <ShieldCheck className="h-5 w-5" />
              주민번호 마스킹 시작
            </Link>
            <Link
              to="/tool/pdf-stamp"
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-6 py-3 font-medium text-red-600 hover:bg-red-50"
            >
              <Stamp className="h-5 w-5" />
              도장 삽입
            </Link>
          </div>
        </div>
      </section>

      {/* 왜 PDF마스터인가 */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-2xl font-bold mb-12">
            글로벌 도구가 못 하는 것, 우리가 합니다
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard
              icon={<FileText className="h-8 w-8 text-red-600" />}
              title="한글(HWP) PDF 변환"
              description="Smallpdf, iLovePDF는 HWP를 지원하지 않습니다. 우리는 한국 문서 포맷 변환을 지원하고 품질을 계속 개선합니다."
            />
            <FeatureCard
              icon={<Stamp className="h-8 w-8 text-red-600" />}
              title="도장/인감 삽입"
              description="한국식 원형 도장, 직인을 PDF에 삽입합니다. 여러 페이지에 일괄 적용 가능합니다."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-8 w-8 text-red-600" />}
              title="주민번호 자동 마스킹"
              description="주민등록번호, 전화번호를 자동 감지하여 마스킹합니다. 개인정보보호법 준수에 필수입니다."
            />
          </div>
        </div>
      </section>

      {/* 도구 목록 */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-2xl font-bold mb-12">모든 도구</h2>

          {categories.map(category => {
            const categoryTools = tools.filter(t => t.category === category)
            return (
              <div key={category} className="mb-10">
                <h3 className="text-lg font-semibold mb-2">
                  {categoryLabels[category]}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {categoryDescriptions[category]}
                </p>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {categoryTools.map(tool => {
                    const Icon = iconMap[tool.icon] || FileText
                    return (
                      <Link
                        key={tool.id}
                        to={`/tool/${tool.id}`}
                        className="group flex flex-col rounded-lg border bg-white p-4 hover:border-red-200 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="rounded-md bg-red-50 p-2">
                            <Icon className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="flex gap-1">
                            {tool.isKoreaSpecific && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                                한국특화
                              </span>
                            )}
                            {tool.isPremium && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-600">
                                PRO
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="mt-3 font-medium group-hover:text-red-600 transition-colors">
                          {tool.name}
                        </h4>
                        <p className="mt-1 text-sm text-muted-foreground flex-1">
                          {tool.description}
                        </p>

                        <div className="mt-3 flex items-center text-xs text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          시작하기 <ArrowRight className="ml-1 h-3 w-3" />
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

      {/* 검색/답변 엔진용 FAQ */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold">PDF마스터 자주 묻는 질문</h2>
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
              <details key={item.q} className="group rounded-lg border bg-white p-4">
                <summary className="cursor-pointer font-semibold">{item.q}</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 보안 안내 */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-red-600 mb-4" />
          <h2 className="text-2xl font-bold">처리 방식은 기능별로 명확히 안내합니다</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            마스킹·도장·서명 이미지 삽입 등은 브라우저에서 처리합니다.
            HWP 변환, 암호 설정/해제 등 서버가 필요한 기능은 업로드 후 임시 처리하며,
            결과 제공 후 짧은 보관 시간 내 정리됩니다.
          </p>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border bg-white p-6 text-center hover:shadow-md transition-shadow">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
