import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, FileText, HelpCircle, ShieldCheck, Stamp } from 'lucide-react'

type LandingPageConfig = {
  slug: string
  eyebrow: string
  title: string
  description: string
  primaryCta: string
  toolPath: string
  secondaryCta: string
  secondaryPath: string
  icon: 'file' | 'shield' | 'stamp'
  metaTitle: string
  metaDescription: string
  keywords: string[]
  useCases: string[]
  steps: string[]
  faq: Array<{ q: string; a: string }>
  related: Array<{ label: string; to: string }>
}

const pageConfigs: Record<string, LandingPageConfig> = {
  'hwp-to-pdf': {
    slug: 'hwp-to-pdf',
    eyebrow: '한글 문서 변환',
    title: '한글 HWP PDF 변환 무료',
    description:
      '설치 없이 HWP/HWPX 파일을 PDF로 변환하세요. 공공기관 제출, 이메일 첨부, 출력용 문서처럼 한글 파일을 PDF로 바꿔야 할 때 바로 사용할 수 있습니다.',
    primaryCta: 'HWP PDF 변환 시작',
    toolPath: '/tool/hwp-to-pdf',
    secondaryCta: '주민번호 마스킹도 하기',
    secondaryPath: '/pdf-rrn-mask',
    icon: 'file',
    metaTitle: '한글 HWP PDF 변환 무료 — 설치 없이 HWP/HWPX를 PDF로 | PDF마스터',
    metaDescription:
      '한글 HWP/HWPX 파일을 PDF로 변환하는 한국형 PDF 도구입니다. 무료 사용자는 하루 3회까지 이용할 수 있으며 서버 임시 처리 후 파일을 정리합니다.',
    keywords: ['hwp pdf 변환', '한글 pdf 변환', 'hwpx pdf 변환', 'hwp 파일 pdf로', '한글파일 pdf 저장'],
    useCases: [
      '공공기관·회사 제출용 HWP 문서를 PDF로 바꿀 때',
      '한글 프로그램이 없는 PC나 맥에서 HWP 파일을 확인해야 할 때',
      '문서 레이아웃을 유지한 채 이메일로 공유해야 할 때',
      '출력소·거래처에 수정이 어려운 PDF 형태로 전달해야 할 때',
    ],
    steps: ['HWP 또는 HWPX 파일을 업로드합니다.', '변환 요청을 보내고 처리 완료를 기다립니다.', '완성된 PDF를 내려받아 제출하거나 공유합니다.'],
    faq: [
      {
        q: 'HWP와 HWPX 파일을 모두 PDF로 변환할 수 있나요?',
        a: '네. PDF마스터는 한글 HWP/HWPX 문서를 PDF로 변환하는 기능을 제공합니다. 문서 구조나 글꼴에 따라 결과 품질이 달라질 수 있어 한국 문서 기준으로 계속 개선하고 있습니다.',
      },
      {
        q: '무료로 몇 번까지 사용할 수 있나요?',
        a: '무료 사용자는 HWP PDF 변환을 하루 3회까지 이용할 수 있습니다. 운영 정책은 서비스 상태에 따라 조정될 수 있습니다.',
      },
      {
        q: '업로드한 한글 파일은 계속 보관되나요?',
        a: '아니요. HWP 변환처럼 서버 처리가 필요한 파일은 임시로 처리하고 현재 기준 10분 이내 자동 삭제되도록 운영합니다.',
      },
    ],
    related: [
      { label: 'PDF 주민번호 마스킹', to: '/pdf-rrn-mask' },
      { label: 'PDF 도장 삽입', to: '/pdf-stamp' },
      { label: 'PDF를 Word로 변환', to: '/tool/pdf-to-docx' },
    ],
  },
  'pdf-rrn-mask': {
    slug: 'pdf-rrn-mask',
    eyebrow: '개인정보 보호',
    title: 'PDF 주민번호 마스킹',
    description:
      'PDF 문서에서 주민등록번호, 전화번호, 이메일 같은 개인정보 패턴을 찾아 가릴 수 있습니다. 제출 전 민감정보 노출을 줄이고 개인정보보호 업무를 빠르게 처리하세요.',
    primaryCta: '주민번호 마스킹 시작',
    toolPath: '/tool/pdf-mask-rrn',
    secondaryCta: 'HWP를 PDF로 변환하기',
    secondaryPath: '/hwp-to-pdf',
    icon: 'shield',
    metaTitle: 'PDF 주민번호 마스킹 — 개인정보보호 문서 처리 | PDF마스터',
    metaDescription:
      'PDF에서 주민등록번호, 전화번호, 이메일 등 개인정보를 감지해 마스킹하는 한국형 PDF 보안 도구입니다. 가능한 처리는 브라우저에서 수행합니다.',
    keywords: ['pdf 주민번호 마스킹', 'pdf 개인정보 마스킹', 'pdf 개인정보 지우기', '주민등록번호 가리기', 'PDF 보안'],
    useCases: [
      '계약서·신청서 제출 전 주민등록번호 뒷자리를 가려야 할 때',
      '스캔 PDF에 포함된 전화번호나 이메일 노출을 줄여야 할 때',
      '개인정보보호법 대응을 위한 문서 공유본을 만들 때',
      '고객·직원 정보가 포함된 PDF를 외부에 전달해야 할 때',
    ],
    steps: ['마스킹할 PDF 파일을 선택합니다.', '감지된 주민번호·전화번호·이메일 후보를 확인합니다.', '필요한 항목을 적용한 뒤 마스킹된 PDF를 저장합니다.'],
    faq: [
      {
        q: 'PDF에서 주민등록번호를 자동으로 찾을 수 있나요?',
        a: '네. 주민등록번호 형식과 전화번호, 이메일 같은 개인정보 패턴을 감지해 마스킹 후보로 보여줍니다. 문서 상태에 따라 사람이 최종 확인하는 것을 권장합니다.',
      },
      {
        q: '마스킹 처리는 서버로 파일을 보내나요?',
        a: 'PDF마스터의 마스킹 기능은 가능한 한 브라우저에서 처리하도록 설계되어 문서 노출을 줄입니다. 기능별 처리 방식은 화면과 개인정보처리방침에서 안내합니다.',
      },
      {
        q: '스캔 이미지 PDF도 마스킹할 수 있나요?',
        a: '문자 정보가 있는 PDF는 감지가 쉽고, 이미지 기반 스캔 PDF는 인식 품질에 따라 결과가 달라질 수 있습니다. 중요한 문서는 적용 후 눈으로 다시 확인하세요.',
      },
    ],
    related: [
      { label: '한글 HWP PDF 변환', to: '/hwp-to-pdf' },
      { label: 'PDF 도장 삽입', to: '/pdf-stamp' },
      { label: 'PDF 암호 설정', to: '/tool/pdf-encrypt' },
    ],
  },
  'pdf-stamp': {
    slug: 'pdf-stamp',
    eyebrow: '도장·서명 업무',
    title: 'PDF 도장 삽입',
    description:
      'PDF 원하는 위치에 도장, 인감, 직인, 서명 이미지를 넣으세요. 계약서, 견적서, 신청서처럼 도장이 필요한 한국 문서 업무를 브라우저에서 빠르게 처리할 수 있습니다.',
    primaryCta: 'PDF에 도장 넣기',
    toolPath: '/tool/pdf-stamp',
    secondaryCta: '서명 이미지 삽입 보기',
    secondaryPath: '/tool/pdf-sign',
    icon: 'stamp',
    metaTitle: 'PDF 도장 삽입 — 인감·직인·서명 이미지 넣기 | PDF마스터',
    metaDescription:
      'PDF에 한국식 도장, 인감, 직인, 손글씨 서명 이미지를 넣는 도구입니다. 여러 페이지 일괄 적용과 위치 조정을 지원합니다.',
    keywords: ['pdf 도장 넣기', 'pdf 인감 삽입', 'pdf 직인 넣기', 'pdf 서명 넣기', 'PDF 도장 삽입'],
    useCases: [
      '계약서나 견적서 PDF에 회사 직인을 넣어야 할 때',
      '신청서·확인서에 개인 도장 또는 인감 이미지를 삽입할 때',
      '여러 페이지에 같은 도장 이미지를 반복 적용해야 할 때',
      '출력 후 스캔하지 않고 PDF 상태 그대로 서명본을 만들 때',
    ],
    steps: ['PDF 파일과 도장·서명 이미지를 준비합니다.', '페이지에서 원하는 위치와 크기를 조정합니다.', '적용 결과를 확인하고 도장이 들어간 PDF를 내려받습니다.'],
    faq: [
      {
        q: 'PDF에 도장이나 인감 이미지를 넣을 수 있나요?',
        a: '네. PNG/JPG 형태의 도장, 인감, 직인, 서명 이미지를 PDF 위에 배치할 수 있습니다. 위치와 크기를 조정한 뒤 결과 파일을 저장합니다.',
      },
      {
        q: '여러 페이지에 같은 도장을 넣을 수 있나요?',
        a: '도구 화면에서 여러 페이지 일괄 적용이 가능하도록 지원합니다. 반복 날인 문서나 양식 PDF 작업에 유용합니다.',
      },
      {
        q: '이 기능이 법적 전자서명인가요?',
        a: '아니요. 도장·서명 이미지를 PDF에 삽입하는 기능이며 인증서 기반 전자서명은 아닙니다. 법적 효력이 필요한 문서는 제출처 요구사항을 확인하세요.',
      },
    ],
    related: [
      { label: 'PDF 주민번호 마스킹', to: '/pdf-rrn-mask' },
      { label: '한글 HWP PDF 변환', to: '/hwp-to-pdf' },
      { label: 'PDF 워터마크 삽입', to: '/tool/pdf-watermark' },
    ],
  },
}

const iconMap = {
  file: FileText,
  shield: ShieldCheck,
  stamp: Stamp,
}

function upsertMeta(name: string, content: string) {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', name)
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

export function SeoLandingPage() {
  const { slug } = useParams()
  const page = slug ? pageConfigs[slug] : undefined

  useEffect(() => {
    if (!page) return
    document.title = page.metaTitle
    upsertMeta('description', page.metaDescription)
    upsertMeta('keywords', page.keywords.join(', '))
    upsertCanonical(`https://pdfm.ponslink.com/${page.slug}`)
  }, [page])

  if (!page) return <Navigate to="/" replace />

  const Icon = iconMap[page.icon]

  return (
    <article className="bg-white">
      <section className="border-b bg-gradient-to-br from-red-50 via-white to-stone-50 py-16 md:py-20">
        <div className="container mx-auto grid gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-1.5 text-sm font-semibold text-red-700">
              <Icon className="h-4 w-4" />
              {page.eyebrow}
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">{page.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{page.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to={page.toolPath}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700"
              >
                {page.primaryCta}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to={page.secondaryPath}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 px-6 py-3 font-semibold text-red-700 hover:bg-red-50"
              >
                {page.secondaryCta}
              </Link>
            </div>
          </div>

          <aside className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">이런 검색으로 찾는 페이지입니다</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {page.keywords.map((keyword) => (
                <span key={keyword} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
                  {keyword}
                </span>
              ))}
            </div>
            <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-900">
              PDF마스터는 한국 문서 업무에 맞춘 PDF 도구입니다. 브라우저 처리와 서버 임시 처리를 기능별로 구분해 안내합니다.
            </div>
          </aside>
        </div>
      </section>

      <section className="py-14">
        <div className="container mx-auto grid gap-8 px-4 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">언제 쓰면 좋나요?</h2>
            <ul className="mt-6 space-y-3">
              {page.useCases.map((item) => (
                <li key={item} className="flex gap-3 rounded-lg border bg-white p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <span className="text-sm leading-6 text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold">사용 방법</h2>
            <ol className="mt-6 space-y-3">
              {page.steps.map((step, index) => (
                <li key={step} className="flex gap-4 rounded-lg bg-stone-50 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-6 text-stone-700">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-14">
        <div className="container mx-auto max-w-3xl px-4">
          <div className="text-center">
            <HelpCircle className="mx-auto h-9 w-9 text-red-600" />
            <h2 className="mt-3 text-2xl font-bold">자주 묻는 질문</h2>
          </div>
          <div className="mt-8 space-y-3">
            {page.faq.map((item) => (
              <details key={item.q} className="rounded-lg border bg-white p-4">
                <summary className="cursor-pointer font-semibold">{item.q}</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold">관련 PDF 도구</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {page.related.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </article>
  )
}

export { pageConfigs as seoLandingPages }
