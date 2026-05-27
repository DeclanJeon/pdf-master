import { useState, useRef, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Download, CheckCircle, Loader2, Pen, Eraser, Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { embedImagesOnPdf } from '@/services/pdfUtils'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`

type Step = 'upload' | 'sign' | 'processing' | 'done'

const toBlobPart = (bytes: Uint8Array): BlobPart =>
  bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : new Uint8Array(bytes).buffer

export function SignTool() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })
  const [pageImage, setPageImage] = useState<string>('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)

  // 서명 위치 (화면 좌표, preview 컨테이너 기준)
  const [signPos, setSignPos] = useState<{ x: number; y: number } | null>(null)
  const [isDraggingSign, setIsDraggingSign] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [signPreviewUrl, setSignPreviewUrl] = useState<string>('')  // 서명 미리보기 이미지

  // PDF 페이지를 이미지로 렌더링
  const renderPageImage = useCallback(async (bytes: Uint8Array) => {
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1.2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    setPageImage(canvas.toDataURL())
  }, [])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0]
    if (!f) return
    setFile(f)
    const buffer = await f.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    try {
      const pdfDoc = await PDFDocument.load(bytes)
      const firstPage = pdfDoc.getPages()[0]
      const { width, height } = firstPage.getSize()
      setPageCount(pdfDoc.getPageCount())
      setPageSize({ width, height })
      await renderPageImage(bytes)
      setSignPos(null)
      setStep('sign')
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

  // ============================================================
  // 서명 캔버스 드로잉 (좌표 보정 적용)
  // ============================================================
  useEffect(() => {
    if (step !== 'sign') return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    /**
     * 마우스 좌표 → 캔버스 내부 좌표 변환
     * canvas CSS 크기와 내부 해상도(width/height)가 다를 수 있으므로 보정
     */
    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      // CSS 좌표를 캔버스 내부 좌표계로 변환
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      }
    }

    const startDraw = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      isDrawingRef.current = true
      lastPosRef.current = getPos(e)
      ctx.beginPath()
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    }

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawingRef.current) return
      e.preventDefault()
      const pos = getPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      lastPosRef.current = pos
    }

    const endDraw = () => {
      isDrawingRef.current = false
      lastPosRef.current = null
      // 서명 이미지 갱신 → PDF 미리보기에 반영
      try {
        setSignPreviewUrl(canvas.toDataURL('image/png'))
      } catch { /* ignore */ }
    }

    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', endDraw)
    canvas.addEventListener('mouseleave', endDraw)
    canvas.addEventListener('touchstart', startDraw, { passive: false })
    canvas.addEventListener('touchmove', draw, { passive: false })
    canvas.addEventListener('touchend', endDraw)

    return () => {
      canvas.removeEventListener('mousedown', startDraw)
      canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', endDraw)
      canvas.removeEventListener('mouseleave', endDraw)
      canvas.removeEventListener('touchstart', startDraw)
      canvas.removeEventListener('touchmove', draw)
      canvas.removeEventListener('touchend', endDraw)
    }
  }, [step])

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // ============================================================
  // 서명 위치 드래그
  // ============================================================
  const handleSignPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingSign(true)

    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
    el.setPointerCapture(e.pointerId)
  }

  const handleSignPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSign || !previewRef.current) return
    const container = previewRef.current
    const rect = container.getBoundingClientRect()

    let newX = e.clientX - rect.left - dragOffset.x
    let newY = e.clientY - rect.top - dragOffset.y

    // 뱃지 크기 (약 80x40px 영역)
    const badgeW = 80
    const badgeH = 40
    newX = Math.max(0, Math.min(newX, rect.width - badgeW))
    newY = Math.max(0, Math.min(newY, rect.height - badgeH))

    setSignPos({ x: newX, y: newY })
  }

  const handleSignPointerUp = () => {
    setIsDraggingSign(false)
  }

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (isDraggingSign) return
    if (!previewRef.current) return
    const rect = previewRef.current.getBoundingClientRect()
    setSignPos({
      x: e.clientX - rect.left - 40,
      y: e.clientY - rect.top - 20,
    })
  }

  // 기본 서명 위치 (우하단)
  useEffect(() => {
    if (step === 'sign' && signPos === null) {
      const rafId = requestAnimationFrame(() => {
        if (!previewRef.current) return
        const rect = previewRef.current.getBoundingClientRect()
        if (rect.width === 0) return
        setSignPos({
          x: rect.width - 80 - 30,
          y: rect.height - 40 - 30,
        })
      })
      return () => cancelAnimationFrame(rafId)
    }
  }, [step, signPos])

  // ============================================================
  // 서명 실행
  // ============================================================
  const handleSign = async () => {
    if (!file || !canvasRef.current || signPos === null) return

    const signCanvas = canvasRef.current
    setStep('processing')
    try {
      const signDataUrl = signCanvas.toDataURL('image/png')

      // 화면 좌표 → PDF 좌표 변환
      if (!previewRef.current) {
        toast.error('미리보기를 찾을 수 없습니다.')
        setStep('sign')
        return
      }
      const rect = previewRef.current.getBoundingClientRect()
      const pdfX = (signPos.x / rect.width) * pageSize.width + 40  // 뱃지 중심 보정
      const pdfY = (signPos.y / rect.height) * pageSize.height + 20

      const result = await embedImagesOnPdf(file, [
        {
          x: Math.round(pdfX),
          y: Math.round(pdfY),
          img: signDataUrl,
          pageIndex: 0,
        },
      ])

      const blob = new Blob([toBlobPart(result)], { type: 'application/pdf' })
      setResultBlob(blob)
      setStep('done')
      toast.success('서명이 완료되었습니다.')
    } catch (e) {
      console.error(e)
      toast.error('서명 처리 중 오류가 발생했습니다.')
      setStep('sign')
    }
  }

  const handleDownload = () => {
    if (!resultBlob || !file) return
    const url = URL.createObjectURL(resultBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name.replace('.pdf', '_signed.pdf')
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleReset = () => {
    setStep('upload')
    setFile(null)
    setResultBlob(null)
    setPageImage('')
    setSignPos(null)
  }

  if (step === 'upload') {
    return (
      <div>
        <div className="mb-4 rounded-lg bg-red-50 border border-red-100 p-4">
          <div className="flex items-start gap-2">
            <Pen className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-900">PDF 서명 이미지 삽입</p>
              <p className="text-sm text-red-700 mt-1">
                PDF에 손글씨 서명을 삽입합니다. PDF 위에서 서명 위치를 직접 지정할 수 있습니다.
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

        <p className="mt-4 text-xs text-center text-muted-foreground">
          손글씨 서명 이미지를 PDF에 삽입합니다. 인증서 기반 법적 전자서명은 아닙니다.
        </p>
      </div>
    )
  }

  if (step === 'sign') {
    return (
      <div className="space-y-6">
        {/* 파일 정보 */}
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{file?.name}</span>
          <Badge variant="secondary">{pageCount}페이지</Badge>
        </div>

        {/* PDF 미리보기 + 서명 위치 지정 */}
        <div>
          <Label className="text-base font-semibold mb-2 block">
            서명 위치 지정 — PDF 위에서 드래그하세요
          </Label>
          <div
            ref={previewRef}
            onClick={handlePreviewClick}
            className="relative border-2 border-gray-200 rounded-lg overflow-hidden cursor-crosshair select-none"
          >
            {/* PDF 페이지 배경 */}
            {pageImage && (
              <img
                src={pageImage}
                alt="PDF 페이지 미리보기"
                className="w-full h-auto block"
                draggable={false}
              />
            )}

            {/* 드래그 가능한 서명 이미지 (또는 뱃지) */}
            {signPos !== null && (
              signPreviewUrl ? (
                <img
                  src={signPreviewUrl}
                  alt="서명 미리보기"
                  onPointerDown={handleSignPointerDown}
                  onPointerMove={handleSignPointerMove}
                  onPointerUp={handleSignPointerUp}
                  onPointerCancel={handleSignPointerUp}
                  draggable={false}
                  className="absolute touch-none"
                  style={{
                    left: signPos.x,
                    top: signPos.y,
                    width: 120,
                    height: 36,
                    cursor: isDraggingSign ? 'grabbing' : 'grab',
                    zIndex: 20,
                    filter: 'drop-shadow(1px 1px 3px rgba(0,0,0,0.3))',
                    transition: isDraggingSign ? 'none' : 'left 0.05s, top 0.05s',
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <div
                  onPointerDown={handleSignPointerDown}
                  onPointerMove={handleSignPointerMove}
                  onPointerUp={handleSignPointerUp}
                  onPointerCancel={handleSignPointerUp}
                  className="absolute flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded shadow-lg touch-none"
                  style={{
                    left: signPos.x,
                    top: signPos.y,
                    cursor: isDraggingSign ? 'grabbing' : 'grab',
                    zIndex: 20,
                    transition: isDraggingSign ? 'none' : 'left 0.05s, top 0.05s',
                  }}
                >
                  <Crosshair className="h-3 w-3" />
                  서명위치
                </div>
              )
            )}

            {signPos === null && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                <p className="text-sm text-gray-500 bg-white/80 px-3 py-1 rounded">
                  PDF 위 아무 곳이나 클릭하여 서명 위치를 지정하세요
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            클릭: 위치 이동 | 드래그: 세밀 조정 | 아래에 서명을 그리면 미리보기에 실시간 반영됩니다
          </p>
        </div>

        {/* 서명 캔버스 */}
        <div>
          <Label className="text-base font-semibold mb-2 block">서명 그리기</Label>
          <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              width={600}
              height={180}
              className="w-full touch-none cursor-crosshair"
              style={{ maxHeight: '180px', backgroundColor: '#fafafa' }}
            />
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={clearCanvas}>
              <Eraser className="mr-1 h-3 w-3" /> 지우기
            </Button>
          </div>
        </div>

        {/* 실행 */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>
            다시 선택
          </Button>
          <Button onClick={handleSign} className="bg-red-600 hover:bg-red-700 flex-1">
            <Pen className="mr-2 h-4 w-4" />
            서명 삽입
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-red-600 mb-4" />
        <p className="font-medium">서명 삽입 중...</p>
        <p className="text-sm text-muted-foreground mt-1">잠시만 기다려주세요</p>
      </div>
    )
  }

  // done
  return (
    <div className="text-center py-8">
      <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
      <h2 className="text-xl font-bold mb-2">서명 완료!</h2>
      <p className="text-muted-foreground mb-6">PDF에 서명이 삽입되었습니다.</p>
      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={handleReset}>다른 파일 처리</Button>
        <Button onClick={handleDownload} className="bg-red-600 hover:bg-red-700">
          <Download className="mr-2 h-4 w-4" /> 다운로드
        </Button>
      </div>
    </div>
  )
}
