import { useState, useRef, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Download, CheckCircle, Loader2, Pen, Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { embedImagesOnPdf } from '@/services/pdfUtils'

type Step = 'upload' | 'sign' | 'processing' | 'done'

export function SignTool() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0]
    if (!f) return
    setFile(f)
    setStep('sign')
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  })

  // Canvas 드로잉 로직
  useEffect(() => {
    if (step !== 'sign') return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      return { x: clientX - rect.left, y: clientY - rect.top }
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
    }

    // Mouse events
    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', endDraw)
    canvas.addEventListener('mouseleave', endDraw)

    // Touch events
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

  const handleSign = async () => {
    if (!file || !canvasRef.current) return

    // 서명 이미지를 Canvas에서 추출
    const signCanvas = canvasRef.current
    setStep('processing')
    try {
      // 서명 이미지를 data URL로 변환
      const signDataUrl = signCanvas.toDataURL('image/png')

      const result = await embedImagesOnPdf(file, [
        {
          x: 380,  // 좌측에서 380pt (A4 우하단)
          y: 80,   // 하단에서 80pt (A4 우하단)
          img: signDataUrl,
          pageIndex: 0,
        },
      ])

      const blob = new Blob([result], { type: 'application/pdf' })
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
  }

  if (step === 'upload') {
    return (
      <div>
        <div className="mb-4 rounded-lg bg-red-50 border border-red-100 p-4">
          <div className="flex items-start gap-2">
            <Pen className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-900">PDF 전자서명</p>
              <p className="text-sm text-red-700 mt-1">
                PDF 파일에 손글씨 서명을 삽입합니다. 서명은 첫 페이지 우하단에 위치합니다.
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
          서명은 브라우저에서만 처리됩니다. 서버로 전송되지 않습니다.
        </p>
      </div>
    )
  }

  if (step === 'sign') {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{file?.name}</span>
          <Badge variant="secondary">{(file!.size / 1024).toFixed(0)} KB</Badge>
        </div>

        <div className="mb-4">
          <h3 className="font-medium mb-2">아래에 서명하세요</h3>
          <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              width={500}
              height={200}
              className="w-full touch-none cursor-crosshair"
              style={{ maxHeight: '200px' }}
            />
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={clearCanvas}>
              <Eraser className="mr-1 h-3 w-3" /> 지우기
            </Button>
          </div>
        </div>

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
