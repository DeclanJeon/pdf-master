import { useParams, Link } from 'react-router-dom'
import { getToolById } from '@/lib/tools'
import { MaskingTool } from '@/components/tools/MaskingTool'
import { StampTool } from '@/components/tools/StampTool'
import { GenericPdfTool } from '@/components/tools/GenericPdfTool'
import HwpToPdfTool from '@/components/tools/HwpToPdfTool'
import { ArrowLeft } from 'lucide-react'

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>()
  const tool = toolId ? getToolById(toolId) : undefined

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
      case 'hwp-to-pdf':
        return <HwpToPdfTool />
      default:
        return <GenericPdfTool toolId={tool.id} toolName={tool.name} />
    }
  }

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
          {!tool.isPremium && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
              무료
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        {renderTool()}
      </div>
    </div>
  )
}
