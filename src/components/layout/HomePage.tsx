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
            서버 전송 없이 브라우저에서 처리
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            한국인을 위해 만든
            <br />
            <span className="text-red-600">PDF 도구</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            한글(HWP) 변환, 도장 삽입, 주민번호 마스킹 —
            글로벌 도구가 못 하는 한국 특화 기능을 한 곳에.
            <br />
            모든 처리는 브라우저에서. 파일은 서버로 전송되지 않습니다.
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
              description="Smallpdf, iLovePDF는 HWP를 지원하지 않습니다. 우리는 한국 문서 포맷을 완벽 지원합니다."
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

      {/* 보안 안내 */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-red-600 mb-4" />
          <h2 className="text-2xl font-bold">파일은 서버로 전송되지 않습니다</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            모든 PDF 처리는 여러분의 브라우저에서 수행됩니다.
            파일이 외부 서버로 업로드되지 않으므로,
            금융/법무 문서도 안전하게 처리할 수 있습니다.
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
