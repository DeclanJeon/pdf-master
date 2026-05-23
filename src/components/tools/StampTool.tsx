import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Stamp, Upload, Download, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { insertStamp, getDefaultStampSize, getDefaultStampPosition, stampTemplates, generateStampSVG, svgToBlobUrl } from '@/services/stampService'
import { PDFDocument } from 'pdf-lib'
import { toast } from 'sonner'

type Step = 'upload' | 'config' | 'processing' | 'done'

export function StampTool() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })

  // 도장 설정
  const [stampText, setStampText] = useState('전형동')
  const [stampSource, setStampSource] = useState<'template' | 'upload'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState(stampTemplates[0])
  const [customStampUrl, setCustomStampUrl] = useState<string>('')
  const [stampPosition, setStampPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center'>('bottom-right')
  const [stampOpacity, setStampOpacity] = useState(0.9)
  const [stampScale, setStampScale] = useState(1)
  const [applyAllPages, setApplyAllPages] = useState(true)
  const [targetPage, setTargetPage] = useState(1)

  const customFileRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0]
    if (!f) return

    setFile(f)
    const buffer = await f.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    setPdfBytes(bytes)

    try {
      const pdfDoc = await PDFDocument.load(bytes)
      const firstPage = pdfDoc.getPages()[0]
      const { width, height } = firstPage.getSize()
      setPageCount(pdfDoc.getPageCount())
      setPageSize({ width, height })
      setStep('config')
    } catch {
      toast.error('PDF 파일을 읽을 수 없습니다.')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  })

  const handleCustomStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    setCustomStampUrl(url)
  }

  const getStampImageUrl = (): string => {
    if (stampSource === 'upload' && customStampUrl) return customStampUrl
    const svg = generateStampSVG(selectedTemplate, stampText)
    return svgToBlobUrl(svg)
  }

  const handleInsertStamp = async () => {
    if (!pdfBytes) return
    setStep('processing')

    try {
      const defaultSize = getDefaultStampSize(pageSize.width)
      const scaledWidth = defaultSize.width * stampScale
      const scaledHeight = defaultSize.height * stampScale
      const pos = getDefaultStampPosition(pageSize.width, pageSize.height, scaledWidth, scaledHeight, stampPosition)

      const stampUrl = getStampImageUrl()

      const result = await insertStamp(pdfBytes, {
        imageUrl: stampUrl,
        x: pos.x,
        y: pos.y,
        width: scaledWidth,
        height: scaledHeight,
        opacity: stampOpacity,
        pageNumbers: applyAllPages ? [] : [targetPage],
      })

      setResultBytes(result)
      setStep('done')
      toast.success('도장이 삽입되었습니다.')
    } catch (e) {
      console.error(e)
      toast.error('도장 삽입 중 오류가 발생했습니다.')
      setStep('config')
    }
  }

  const handleDownload = () => {
    if (!resultBytes || !file) return
    const blob = new Blob([resultBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name.replace('.pdf', '_stamped.pdf')
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleReset = () => {
    setStep('upload')
    setFile(null)
    setPdfBytes(null)
    setResultBytes(null)
  }

  if (step === 'upload') {
    return (
      <div>
        <div className="mb-4 rounded-lg bg-red-50 border border-red-100 p-4">
          <div className="flex items-start gap-2">
            <Stamp className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-900">도장/인감 삽입</p>
              <p className="text-sm text-red-700 mt-1">
                한국식 원형 도장, 직인, 사인 이미지를 PDF에 삽입합니다.
                여러 페이지에 일괄 적용할 수 있습니다.
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
          <p className="font-medium">PDF 파일을 드래그하거나 클릭하세요</p>
          <p className="text-sm text-muted-foreground mt-1">최대 50MB</p>
        </div>
      </div>
    )
  }

  if (step === 'config') {
    return (
      <div className="space-y-6">
        {/* 파일 정보 */}
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{file?.name}</span>
          <Badge variant="secondary">{pageCount}페이지</Badge>
        </div>

        {/* 도장 소스 선택 */}
        <div>
          <Label className="text-base font-semibold">도장 선택</Label>
          <div className="flex gap-2 mt-2">
            <Button
              variant={stampSource === 'template' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStampSource('template')}
            >
              템플릿 도장
            </Button>
            <Button
              variant={stampSource === 'upload' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStampSource('upload')}
            >
              내 도장 이미지
            </Button>
          </div>
        </div>

        {stampSource === 'template' ? (
          <div>
            {/* 템플릿 선택 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {stampTemplates.map(t => {
                const previewSvg = generateStampSVG(t, stampText)
                const previewUrl = svgToBlobUrl(previewSvg)
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={`flex flex-col items-center rounded-lg border-2 p-4 transition-colors ${
                      selectedTemplate.id === t.id
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={previewUrl}
                      alt={t.name}
                      className="w-16 h-16 object-contain"
                    />
                    <span className="mt-2 text-xs font-medium">{t.name}</span>
                  </button>
                )
              })}
            </div>

            {/* 도장 텍스트 입력 */}
            <div>
              <Label htmlFor="stamp-text">도장에 들어갈 이름</Label>
              <Input
                id="stamp-text"
                value={stampText}
                onChange={(e) => setStampText(e.target.value)}
                placeholder="예: 홍길동"
                className="mt-1"
              />
            </div>
          </div>
        ) : (
          <div>
            <Label>도장 이미지 업로드 (PNG 투명배경 권장)</Label>
            <input
              ref={customFileRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleCustomStampUpload}
              className="mt-2 block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-red-50 file:text-red-700
                hover:file:bg-red-100"
            />
            {customStampUrl && (
              <div className="mt-2 flex items-center gap-2">
                <img src={customStampUrl} alt="도장 미리보기" className="h-16 w-16 object-contain border rounded" />
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            )}
          </div>
        )}

        {/* 위치 선택 */}
        <div>
          <Label className="text-base font-semibold">도장 위치</Label>
          <div className="grid grid-cols-5 gap-2 mt-2">
            {(['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'] as const).map(pos => (
              <Button
                key={pos}
                variant={stampPosition === pos ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStampPosition(pos)}
                className="text-xs"
              >
                {pos === 'top-left' && '좌상'}
                {pos === 'top-right' && '우상'}
                {pos === 'center' && '중앙'}
                {pos === 'bottom-left' && '좌하'}
                {pos === 'bottom-right' && '우하'}
              </Button>
            ))}
          </div>
        </div>

        {/* 크기 & 투명도 */}
        <div className="space-y-4">
          <div>
            <Label>도장 크기: {stampScale}x</Label>
            <Slider
              value={[stampScale]}
              onValueChange={([v]) => setStampScale(v)}
              min={0.5}
              max={3}
              step={0.1}
              className="mt-2"
            />
          </div>
          <div>
            <Label>투명도: {Math.round(stampOpacity * 100)}%</Label>
            <Slider
              value={[stampOpacity]}
              onValueChange={([v]) => setStampOpacity(v)}
              min={0.1}
              max={1}
              step={0.05}
              className="mt-2"
            />
          </div>
        </div>

        {/* 적용 범위 */}
        <div>
          <div className="flex items-center justify-between">
            <Label>모든 페이지에 적용</Label>
            <Switch
              checked={applyAllPages}
              onCheckedChange={setApplyAllPages}
            />
          </div>
          {!applyAllPages && (
            <div className="mt-2">
              <Label>적용할 페이지 번호</Label>
              <Input
                type="number"
                min={1}
                max={pageCount}
                value={targetPage}
                onChange={(e) => setTargetPage(Number(e.target.value))}
                className="mt-1 w-24"
              />
            </div>
          )}
        </div>

        {/* 미리보기 */}
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <img
              src={getStampImageUrl()}
              alt="도장 미리보기"
              className="mx-auto mb-2 object-contain"
              style={{
                width: 56.7 * stampScale,
                height: 56.7 * stampScale,
                opacity: stampOpacity,
              }}
            />
            <p className="text-xs text-muted-foreground">미리보기</p>
          </div>
        </div>

        {/* 실행 */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>
            다시 선택
          </Button>
          <Button onClick={handleInsertStamp} className="bg-red-600 hover:bg-red-700 flex-1">
            <Stamp className="mr-2 h-4 w-4" />
            도장 삽입
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-red-600 mb-4" />
        <p className="font-medium">도장 삽입 중...</p>
      </div>
    )
  }

  // done
  return (
    <div className="text-center py-8">
      <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
      <h2 className="text-xl font-bold mb-2">도장 삽입 완료!</h2>
      <p className="text-muted-foreground mb-6">
        {applyAllPages ? `${pageCount}페이지에` : `${targetPage}페이지에`} 도장이 삽입되었습니다.
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
