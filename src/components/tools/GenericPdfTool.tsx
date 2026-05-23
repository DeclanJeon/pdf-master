import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Download, CheckCircle, Loader2, FileText, Droplets, Grid3X3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

import {
  mergePdfs,
  splitPdf,
  pdfToImages,
  addWatermark,
  addPageNumbers,
  compressPdf,
  encryptPdf,
  unlockPdf,
  renderWatermarkPreviewUrl,
} from '@/services/pdfUtils'

type Step = 'upload' | 'config' | 'processing' | 'done'

interface ToolConfig {
  acceptMultiple: boolean
  additionalOptions?: string[]
}

const toolConfigs: Record<string, ToolConfig> = {
  'pdf-merge': { acceptMultiple: true },
  'pdf-split': { acceptMultiple: false, additionalOptions: ['splitRange'] },
  'pdf-to-image': { acceptMultiple: false },
  'pdf-watermark': { acceptMultiple: false, additionalOptions: ['watermarkText'] },
  'pdf-compress': { acceptMultiple: false },
  'pdf-pagenumber': { acceptMultiple: false },
  'pdf-encrypt': { acceptMultiple: false, additionalOptions: ['password'] },
  'pdf-unlock': { acceptMultiple: false, additionalOptions: ['password'] },
  'hwp-to-pdf': { acceptMultiple: false, additionalOptions: [] },
  'pdf-to-hwp': { acceptMultiple: false },
  'pdf-sign': { acceptMultiple: false },
}

export function GenericPdfTool({ toolId, toolName }: { toolId: string; toolName: string }) {
  const [step, setStep] = useState<Step>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultName, setResultName] = useState('')

  // 워터마크 설정
  const [watermarkText, setWatermarkText] = useState('')
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.15)
  const [watermarkSize, setWatermarkSize] = useState(48)
  const [isTile, setIsTile] = useState(false)

  const config = toolConfigs[toolId] || { acceptMultiple: false }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    setFiles(acceptedFiles)

    // 워터마크는 config 단계로, 나머지는 바로 처리
    if (toolId === 'pdf-watermark') {
      setWatermarkText('')  // 초기화
      setStep('config')
      return
    }
    processFiles(acceptedFiles)
  }, [toolId])

  const processFiles = async (acceptedFiles: File[], watermarkOpts?: { text: string; opacity: number; size: number; isTile: boolean }) => {
    setStep('processing')

    try {
      const pdfBytes = new Uint8Array(await acceptedFiles[0].arrayBuffer())
      let result: Uint8Array | Blob

      switch (toolId) {
        case 'pdf-merge': {
          result = await mergePdfs(acceptedFiles)
          setResultName('merged.pdf')
          break
        }
        case 'pdf-split': {
          const splitResults = await splitPdf(acceptedFiles[0], 'count', 2)
          result = new Blob([JSON.stringify(splitResults)], { type: 'application/zip' })
          setResultName('split-result.pdf')
          break
        }
        case 'pdf-to-image': {
          const images = await pdfToImages(acceptedFiles[0])
          result = images[0] || new Blob()
          setResultName('page-1.png')
          break
        }
        case 'pdf-watermark': {
          const opts = watermarkOpts || { text: 'PDF마스터', opacity: 0.15, size: 48, isTile: false }
          result = await addWatermark(acceptedFiles[0], opts.text, {
            opacity: opts.opacity,
            size: opts.size,
            isTile: opts.isTile,
          })
          setResultName(acceptedFiles[0].name.replace('.pdf', '_watermarked.pdf'))
          break
        }
        case 'pdf-pagenumber': {
          result = await addPageNumbers(acceptedFiles[0])
          setResultName(acceptedFiles[0].name.replace('.pdf', '_numbered.pdf'))
          break
        }
        case 'pdf-compress': {
          result = await compressPdf(acceptedFiles[0])
          setResultName(acceptedFiles[0].name.replace('.pdf', '_compressed.pdf'))
          break
        }
        case 'pdf-encrypt': {
          const password = prompt('PDF 비밀번호를 입력하세요:')
          if (!password) { setStep('upload'); return }
          result = await encryptPdf(acceptedFiles[0], password)
          setResultName(acceptedFiles[0].name.replace('.pdf', '_encrypted.pdf'))
          break
        }
        case 'pdf-unlock': {
          const password = prompt('PDF 비밀번호를 입력하세요:')
          if (!password) { setStep('upload'); return }
          result = await unlockPdf(acceptedFiles[0], password)
          setResultName(acceptedFiles[0].name.replace('.pdf', '_unlocked.pdf'))
          break
        }
        case 'pdf-to-hwp': {
          const formData = new FormData()
          formData.append('file', acceptedFiles[0])
          const res = await fetch('/api/convert/pdf-to-odt', { method: 'POST', body: formData })
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: '변환 실패' }))
            throw new Error(err.error || 'ODT 변환 실패')
          }
          const { jobId } = await res.json()
          const dlRes = await fetch(`/api/download/${jobId}`)
          if (!dlRes.ok) throw new Error('ODT 다운로드 실패')
          result = await dlRes.blob()
          setResultName(acceptedFiles[0].name.replace('.pdf', '.odt'))
          break
        }
        case 'pdf-sign': {
          toast.info('서명 기능은 전자서명 페이지에서 진행해주세요.')
          setStep('upload')
          return
        }
        default:
          toast.info('이 도구는 곧 추가될 예정입니다.')
          setStep('upload')
          return
      }

      const blob = result instanceof Blob ? result : new Blob([result], { type: 'application/pdf' })
      setResultBlob(blob)
      setStep('done')
      toast.success('처리가 완료되었습니다.')
    } catch (e) {
      console.error(e)
      toast.error('처리 중 오류가 발생했습니다.')
      setStep('upload')
    }
  }

  const handleStartWatermark = () => {
    if (!watermarkText.trim()) {
      toast.error('워터마크 텍스트를 입력해주세요.')
      return
    }
    processFiles(files, {
      text: watermarkText.trim(),
      opacity: watermarkOpacity,
      size: watermarkSize,
      isTile,
    })
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: toolId === 'hwp-to-pdf'
      ? { 'application/hwp': ['.hwp', '.hwpx'], 'application/octet-stream': ['.hwp', '.hwpx'] }
      : { 'application/pdf': ['.pdf'] },
    maxFiles: config.acceptMultiple ? 20 : 1,
    maxSize: 50 * 1024 * 1024,
  })

  const handleDownload = () => {
    if (!resultBlob) return
    const url = URL.createObjectURL(resultBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = resultName
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleReset = () => {
    setStep('upload')
    setFiles([])
    setResultBlob(null)
    setResultName('')
    setWatermarkText('')
  }

  // ============================================================
  // 워터마크 설정 UI
  // ============================================================
  if (step === 'config' && toolId === 'pdf-watermark') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{files[0]?.name}</span>
        </div>

        <div>
          <Label htmlFor="wm-text" className="text-base font-semibold">워터마크 텍스트</Label>
          <Input
            id="wm-text"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="예: 기밀, DRAFT, 회사명 ..."
            className="mt-2"
            autoFocus
          />
        </div>

        {/* 워터마크 미리보기 */}
        {watermarkText.trim() && (
          <div>
            <Label className="text-base font-semibold mb-2 block">미리보기</Label>
            <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-6 flex items-center justify-center min-h-[120px] relative overflow-hidden">
              {/* 모의 페이지 배경에 패턴 표시 */}
              <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotate(-30deg)' }}>
                {isTile ? (
                  <div className="grid grid-cols-3 gap-x-16 gap-y-12 opacity-20">
                    {Array.from({ length: 9 }, (_, i) => (
                      <img
                        key={i}
                        src={renderWatermarkPreviewUrl(watermarkText, watermarkSize, '#666', 1)}
                        alt="워터마크 미리보기"
                        className="h-auto max-w-[120px]"
                      />
                    ))}
                  </div>
                ) : (
                  <img
                    src={renderWatermarkPreviewUrl(watermarkText, watermarkSize, '#666', watermarkOpacity * 3)}
                    alt="워터마크 미리보기"
                    className="max-w-[70%] h-auto"
                  />
                )}
              </div>
              {/* 페이지 중앙 표시선 */}
              <div className="absolute inset-4 border border-dashed border-gray-300 rounded pointer-events-none" />
              <span className="text-xs text-gray-400 relative z-10">A4 페이지</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isTile ? '페이지 전체 반복 패턴' : '페이지 중앙 단일 배치'} · {watermarkSize}pt · 투명도 {Math.round(watermarkOpacity * 100)}%
            </p>
          </div>
        )}

        <div>
          <Label>투명도: {Math.round(watermarkOpacity * 100)}%</Label>
          <Slider
            value={[watermarkOpacity]}
            onValueChange={(v) => setWatermarkOpacity(Array.isArray(v) ? v[0] : v)}
            min={0.05}
            max={0.5}
            step={0.01}
            className="mt-2"
          />
        </div>

        <div>
          <Label>글자 크기: {watermarkSize}pt</Label>
          <Slider
            value={[watermarkSize]}
            onValueChange={(v) => setWatermarkSize(Array.isArray(v) ? v[0] : v)}
            min={12}
            max={120}
            step={1}
            className="mt-2"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <div>
              <Label>바둑판 패턴</Label>
              <p className="text-xs text-muted-foreground">
                {isTile ? '페이지 전체에 반복 배치' : '페이지 중앙에 한 번만'}
              </p>
            </div>
            <Switch checked={isTile} onCheckedChange={setIsTile} />
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>다시 선택</Button>
          <Button onClick={handleStartWatermark} className="bg-red-600 hover:bg-red-700 flex-1">
            <Droplets className="mr-2 h-4 w-4" />
            워터마크 추가
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'upload' || step === 'processing') {
    const isProcessing = step === 'processing'

    return (
      <div>
        {isProcessing ? (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-red-600 mb-4" />
            <p className="font-medium">처리 중...</p>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-lg bg-red-50 border border-red-100 p-4">
              <div className="flex items-start gap-2">
                <FileText className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-red-900">{toolName}</p>
                  <p className="text-sm text-red-700 mt-1">
                    {config.acceptMultiple
                      ? '여러 파일을 선택할 수 있습니다.'
                      : '파일을 드래그하거나 클릭하세요.'}
                  </p>
                </div>
              </div>
            </div>

            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 cursor-pointer transition-colors ${
                isDragActive ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-red-300'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 text-gray-400 mb-4" />
              <p className="font-medium">
                {toolId === 'hwp-to-pdf'
                  ? 'HWP/HWPX 파일을 드래그하거나 클릭하세요'
                  : 'PDF 파일을 드래그하거나 클릭하세요'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">최대 50MB</p>
            </div>

            <p className="mt-4 text-xs text-center text-muted-foreground">
              🔒 파일은 브라우저에서만 처리됩니다. 서버로 전송되지 않습니다.
            </p>
          </>
        )}
      </div>
    )
  }

  // done
  return (
    <div className="text-center py-8">
      <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
      <h2 className="text-xl font-bold mb-2">처리 완료!</h2>
      <p className="text-muted-foreground mb-6">
        {files.length}개 파일의 {toolName} 처리가 완료되었습니다.
      </p>
      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={handleReset}>다른 파일 처리</Button>
        <Button onClick={handleDownload} className="bg-red-600 hover:bg-red-700">
          <Download className="mr-2 h-4 w-4" /> 다운로드
        </Button>
      </div>
    </div>
  )
}
