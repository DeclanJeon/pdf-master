import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Stamp, Upload, Download, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { insertStamp, getDefaultStampSize } from '@/services/stampService'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { toast } from 'sonner'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`

type Step = 'upload' | 'config' | 'processing' | 'done'

export function StampTool() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })
  const [pageImage, setPageImage] = useState<string>('')

  // 도장 설정
  const [customStampUrl, setCustomStampUrl] = useState<string>('')
  const [stampOpacity, setStampOpacity] = useState(0.9)
  const [stampScale, setStampScale] = useState(1)
  const [applyAllPages, setApplyAllPages] = useState(true)
  const [targetPage, setTargetPage] = useState(1)

  // 드래그 상태
  const [stampPos, setStampPos] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const customFileRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const stampImgRef = useRef<HTMLImageElement>(null)

  // PDF 페이지를 이미지로 렌더링
  const renderPageImage = useCallback(async (bytes: Uint8Array, pageNum: number) => {
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    setPageImage(canvas.toDataURL())
  }, [])

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
      await renderPageImage(bytes, 1)
      setStampPos(null)
      setStep('config')
    } catch {
      toast.error('PDF 파일을 읽을 수 없습니다.')
    }
  }, [renderPageImage])

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

  // 드래그 시작
  const handleStampPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)

    const stampEl = stampImgRef.current
    if (!stampEl) return

    const stampRect = stampEl.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - stampRect.left,
      y: e.clientY - stampRect.top,
    })

    stampEl.setPointerCapture(e.pointerId)
  }

  // 드래그 이동
  const handleStampPointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !previewRef.current) return

    const container = previewRef.current
    const rect = container.getBoundingClientRect()

    let newX = e.clientX - rect.left - dragOffset.x
    let newY = e.clientY - rect.top - dragOffset.y

    const stampW = 56.7 * stampScale * (rect.width / pageSize.width)
    const stampH = 56.7 * stampScale * (rect.height / pageSize.height)
    newX = Math.max(0, Math.min(newX, rect.width - stampW))
    newY = Math.max(0, Math.min(newY, rect.height - stampH))

    setStampPos({ x: newX, y: newY })
  }

  // 드래그 종료
  const handleStampPointerUp = () => {
    setIsDragging(false)
  }

  // 프리뷰 영역 클릭 시 도장 위치 이동
  const handlePreviewClick = (e: React.MouseEvent) => {
    if (isDragging) return
    if (!previewRef.current) return

    const rect = previewRef.current.getBoundingClientRect()
    const stampW = 56.7 * stampScale * (rect.width / pageSize.width)
    const stampH = 56.7 * stampScale * (rect.height / pageSize.height)

    setStampPos({
      x: e.clientX - rect.left - stampW / 2,
      y: e.clientY - rect.top - stampH / 2,
    })
  }

  // 기본 위치 설정 (우측 하단)
  useEffect(() => {
    if (step === 'config' && stampPos === null) {
      const rafId = requestAnimationFrame(() => {
        if (!previewRef.current) return
        const rect = previewRef.current.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        const stampW = 56.7 * stampScale * (rect.width / pageSize.width)
        const stampH = 56.7 * stampScale * (rect.height / pageSize.height)
        setStampPos({
          x: Math.max(0, rect.width - stampW - 30),
          y: Math.max(0, rect.height - stampH - 30),
        })
      })
      return () => cancelAnimationFrame(rafId)
    }
  }, [step, pageSize, stampScale])

  const handleInsertStamp = async () => {
    if (!pdfBytes || stampPos === null || !customStampUrl) return
    setStep('processing')

    try {
      const defaultSize = getDefaultStampSize(pageSize.width)
      const scaledWidth = defaultSize.width * stampScale
      const scaledHeight = defaultSize.height * stampScale

      if (!previewRef.current) {
        toast.error('미리보기를 찾을 수 없습니다.')
        setStep('config')
        return
      }
      const rect = previewRef.current.getBoundingClientRect()
      const pdfX = (stampPos.x / rect.width) * pageSize.width
      const pdfY = (stampPos.y / rect.height) * pageSize.height

      const result = await insertStamp(pdfBytes, {
        imageUrl: customStampUrl,
        x: pdfX,
        y: pdfY,
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
    setPageImage('')
    setStampPos(null)
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
                도장/인감 이미지를 PDF에 삽입합니다.
                PDF 위에서 드래그하여 원하는 위치에 배치할 수 있습니다.
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

        {/* 도장 이미지 업로드 */}
        <div>
          <Label className="text-base font-semibold">도장 이미지</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            PNG 투명배경 이미지를 권장합니다. 실제 인감, 사인, 도장 이미지를 업로드하세요.
          </p>
          <input
            ref={customFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleCustomStampUpload}
            className="block w-full text-sm text-muted-foreground
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
              <span className="text-sm text-green-700">업로드 완료</span>
            </div>
          )}
        </div>

        {/* PDF + 도장 드래그 프리뷰 */}
        {customStampUrl && (
          <div>
            <Label className="text-base font-semibold mb-2 block">
              도장 위치 지정 — PDF 위에서 드래그하세요
            </Label>
            <div
              ref={previewRef}
              onClick={handlePreviewClick}
              className="relative border-2 border-gray-200 rounded-lg overflow-hidden cursor-crosshair select-none"
              style={{ maxHeight: '70vh' }}
            >
              {pageImage && (
                <img
                  src={pageImage}
                  alt="PDF 페이지 미리보기"
                  className="w-full h-auto block"
                  draggable={false}
                />
              )}

              {stampPos !== null && (
                <img
                  ref={stampImgRef}
                  src={customStampUrl}
                  alt="도장"
                  draggable={false}
                  onPointerDown={handleStampPointerDown}
                  onPointerMove={handleStampPointerMove}
                  onPointerUp={handleStampPointerUp}
                  onPointerCancel={handleStampPointerUp}
                  className="absolute touch-none"
                  style={{
                    left: stampPos.x,
                    top: stampPos.y,
                    width: 56.7 * stampScale * (previewRef.current ? previewRef.current.getBoundingClientRect().width / pageSize.width : 1),
                    height: 56.7 * stampScale * (previewRef.current ? previewRef.current.getBoundingClientRect().height / pageSize.height : 1),
                    opacity: stampOpacity,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    filter: 'drop-shadow(1px 1px 2px rgba(0,0,0,0.2))',
                    zIndex: 10,
                    transition: isDragging ? 'none' : 'left 0.05s, top 0.05s',
                  }}
                />
              )}

              {stampPos === null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                  <p className="text-sm text-gray-500 bg-white/80 px-3 py-1 rounded">
                    PDF 위 아무 곳이나 클릭하면 도장이 나타납니다
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              클릭: 도장 이동 | 드래그: 세밀한 위치 조정 | 아래에서 크기/투명도 조절
            </p>
          </div>
        )}

        {/* 크기 & 투명도 */}
        <div className="space-y-4">
          <div>
            <Label>도장 크기: {stampScale}x</Label>
            <Slider
              value={[stampScale]}
              onValueChange={(v) => {
                setStampScale(Array.isArray(v) ? v[0] : v)
                setStampPos(null)
              }}
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
              onValueChange={(v) => setStampOpacity(Array.isArray(v) ? v[0] : v)}
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

        {/* 실행 */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>
            다시 선택
          </Button>
          <Button
            onClick={handleInsertStamp}
            disabled={!customStampUrl}
            className="bg-red-600 hover:bg-red-700 flex-1"
          >
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
