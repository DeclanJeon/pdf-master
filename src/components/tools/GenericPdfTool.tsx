import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import JSZip from 'jszip'
import { Upload, Download, CheckCircle, Loader2, FileText, Droplets, Eye, EyeOff, Lock } from 'lucide-react'
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
  type CompressPreset,
} from '@/services/pdfUtils'

type Step = 'upload' | 'config' | 'processing' | 'done'
type SplitMode = 'count' | 'range'
type ImageFormat = 'png' | 'jpeg'

interface ProcessOptions {
  watermark?: { text: string; opacity: number; size: number; isTile: boolean }
  password?: string
  compressPreset?: CompressPreset
}

type ZipWriter = {
  file: (path: string, data: Blob | Uint8Array) => void
  generateAsync: (options: { type: 'blob' }) => Promise<Blob>
}

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
  'pdf-to-docx': { acceptMultiple: false },
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

  // 분할 / 이미지 변환 설정
  const [splitMode, setSplitMode] = useState<SplitMode>('count')
  const [splitCount, setSplitCount] = useState('2')
  const [splitRange, setSplitRange] = useState('1-3, 5, 8-10')
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const [imageScale, setImageScale] = useState('2')
  const [compressPreset, setCompressPreset] = useState<CompressPreset>('ebook')

  // 암호 설정/해제 UI
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const config = toolConfigs[toolId] || { acceptMultiple: false }

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    setFiles(acceptedFiles)

    // 추가 옵션이 필요한 도구는 config 단계로, 나머지는 바로 처리
    if (['pdf-watermark', 'pdf-split', 'pdf-to-image', 'pdf-compress', 'pdf-encrypt', 'pdf-unlock'].includes(toolId)) {
      setWatermarkText('')
      setPassword('')
      setPasswordConfirm('')
      setShowPassword(false)
      setStep('config')
      return
    }
    processFiles(acceptedFiles)
  }

  const toBlobPart = (bytes: Uint8Array): BlobPart =>
    bytes.buffer instanceof ArrayBuffer
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : new Uint8Array(bytes).buffer

  const getBaseName = (name: string) => name.replace(/\.[^/.]+$/, '')

  const getPasswordStrength = (value: string) => {
    let score = 0
    if (value.length >= 8) score += 1
    if (value.length >= 12) score += 1
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
    if (/\d/.test(value)) score += 1
    if (/[^A-Za-z0-9]/.test(value)) score += 1

    if (!value) return { label: '입력 전', className: 'text-muted-foreground', width: '0%' }
    if (score <= 2) return { label: '약함', className: 'text-red-600', width: '33%' }
    if (score <= 4) return { label: '보통', className: 'text-amber-600', width: '66%' }
    return { label: '강함', className: 'text-green-600', width: '100%' }
  }

  const validateSplitOptions = () => {
    if (splitMode === 'count') {
      const count = Number(splitCount)
      if (!Number.isInteger(count) || count < 2 || count > 50) {
        toast.error('분할 수는 2~50 사이의 정수로 입력해주세요.')
        return null
      }
      return count
    }

    const normalized = splitRange.trim()
    if (!/^\s*\d+\s*(?:-\s*\d+\s*)?(?:,\s*\d+\s*(?:-\s*\d+\s*)?)*\s*$/.test(normalized)) {
      toast.error('페이지 범위는 1-3, 5, 8-10 형식으로 입력해주세요.')
      return null
    }
    return normalized
  }

  const createZip = (): ZipWriter => new JSZip() as unknown as ZipWriter

  const processFiles = async (acceptedFiles: File[], options: ProcessOptions = {}) => {
    setStep('processing')

    try {
      let result: Uint8Array | Blob
      let resultMime = 'application/pdf'

      switch (toolId) {
        case 'pdf-merge': {
          result = await mergePdfs(acceptedFiles)
          setResultName('merged.pdf')
          break
        }
        case 'pdf-split': {
          const splitValue = validateSplitOptions()
          if (splitValue === null) { setStep('config'); return }

          const splitResults = await splitPdf(acceptedFiles[0], splitMode, splitValue)
          const zip = createZip()
          const width = String(splitResults.length).length
          splitResults.forEach((bytes, index) => {
            zip.file(`split-${String(index + 1).padStart(width, '0')}.pdf`, bytes)
          })
          result = await zip.generateAsync({ type: 'blob' })
          setResultName('split-result.zip')
          break
        }
        case 'pdf-to-image': {
          const scale = Number(imageScale)
          if (![1, 1.5, 2].includes(scale)) {
            toast.error('해상도는 1x, 1.5x, 2x 중 하나를 선택해주세요.')
            setStep('config')
            return
          }

          const images = await pdfToImages(acceptedFiles[0], undefined, {
            format: imageFormat,
            scale,
            quality: imageFormat === 'jpeg' ? 0.9 : undefined,
          })
          const zip = createZip()
          const extension = imageFormat === 'jpeg' ? 'jpg' : 'png'
          const width = String(images.length).length
          await Promise.all(images.map(async (url, index) => {
            const imageBlob = await fetch(url).then((response) => response.blob())
            zip.file(`page-${String(index + 1).padStart(width, '0')}.${extension}`, imageBlob)
          }))
          result = await zip.generateAsync({ type: 'blob' })
          setResultName(`${getBaseName(acceptedFiles[0].name)}-images.zip`)
          break
        }
        case 'pdf-watermark': {
          const opts = options.watermark || { text: 'PDF마스터', opacity: 0.15, size: 48, isTile: false }
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
          result = await compressPdf(acceptedFiles[0], options.compressPreset || compressPreset)
          setResultName(acceptedFiles[0].name.replace('.pdf', '_compressed.pdf'))
          break
        }
        case 'pdf-encrypt': {
          if (!options.password) { setStep('config'); return }
          result = await encryptPdf(acceptedFiles[0], options.password)
          setResultName(acceptedFiles[0].name.replace('.pdf', '_encrypted.pdf'))
          break
        }
        case 'pdf-unlock': {
          if (!options.password) { setStep('config'); return }
          result = await unlockPdf(acceptedFiles[0], options.password)
          setResultName(acceptedFiles[0].name.replace('.pdf', '_unlocked.pdf'))
          break
        }
        case 'pdf-to-hwp': {
          toast.info('PDF를 한글 HWP 문서로 변환합니다. 한글에서 열어 편집할 수 있습니다.')
          const formData = new FormData()
          formData.append('file', acceptedFiles[0])
          const res = await fetch('/api/convert/pdf-to-hwp', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: '변환 실패' }))
            if ((res.status === 403 && err.code === 'PREMIUM_REQUIRED') || (res.status === 429 && err.code === 'FREE_DAILY_LIMIT_EXCEEDED')) {
              toast.error('프리미엄 기능입니다. 결제 페이지로 이동합니다.')
              window.setTimeout(() => { window.location.href = '/pricing' }, 800)
            }
            throw new Error(err.error || 'HWP 변환 실패')
          }
          const { jobId } = await res.json()
          const dlRes = await fetch(`/api/download/${jobId}`)
          if (!dlRes.ok) throw new Error('HWP 다운로드 실패')
          result = await dlRes.blob()
          setResultName(acceptedFiles[0].name.replace('.pdf', '.hwp'))
          break
        }
        case 'pdf-to-docx': {
          toast.info('PDF를 Word에서 편집 가능한 DOCX 문서로 변환합니다.')
          const formData = new FormData()
          formData.append('file', acceptedFiles[0])
          const res = await fetch('/api/convert/pdf-to-docx', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'DOCX 변환 실패' }))
            throw new Error(err.error || 'DOCX 변환 실패')
          }
          const { jobId } = await res.json()
          const dlRes = await fetch(`/api/download/${jobId}`)
          if (!dlRes.ok) throw new Error('DOCX 다운로드 실패')
          result = await dlRes.blob()
          resultMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          setResultName(acceptedFiles[0].name.replace('.pdf', '.docx'))
          break
        }
        case 'pdf-sign': {
          toast.info('서명 이미지 삽입 도구에서 진행해주세요.')
          setStep('upload')
          return
        }
        default:
          toast.info('이 도구는 곧 추가될 예정입니다.')
          setStep('upload')
          return
      }

      const blob = result instanceof Blob ? result : new Blob([toBlobPart(result)], { type: resultMime })
      setResultBlob(blob)
      setStep('done')
      toast.success('처리가 완료되었습니다.')
    } catch (e) {
      console.error(e)
      const message = e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.'
      toast.error(message)
      if (message.includes('프리미엄 기능')) {
        window.setTimeout(() => { window.location.href = '/pricing' }, 800)
      }
      setStep('upload')
    }
  }

  const handleStartWatermark = () => {
    if (!watermarkText.trim()) {
      toast.error('워터마크 텍스트를 입력해주세요.')
      return
    }
    processFiles(files, {
      watermark: {
        text: watermarkText.trim(),
        opacity: watermarkOpacity,
        size: watermarkSize,
        isTile,
      },
    })
  }

  const handleStartSplit = () => {
    if (validateSplitOptions() === null) return
    processFiles(files)
  }

  const handleStartImageConversion = () => {
    processFiles(files)
  }

  const handleStartCompress = () => {
    processFiles(files, { compressPreset })
  }

  const handleStartPassword = () => {
    const trimmedPassword = password.trim()
    if (!trimmedPassword) {
      toast.error('비밀번호를 입력해주세요.')
      return
    }

    if (toolId === 'pdf-encrypt' && trimmedPassword !== passwordConfirm.trim()) {
      toast.error('비밀번호 확인이 일치하지 않습니다.')
      return
    }

    processFiles(files, { password: trimmedPassword })
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
    setPassword('')
    setPasswordConfirm('')
    setShowPassword(false)
  }

  // ============================================================
  // PDF 분할 설정 UI
  // ============================================================
  if (step === 'config' && toolId === 'pdf-split') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{files[0]?.name}</span>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <Label className="text-base font-semibold">분할 방식</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSplitMode('count')}
              className={`rounded-lg border p-4 text-left transition-colors ${splitMode === 'count' ? 'border-red-500 bg-red-50' : 'hover:border-red-200'}`}
            >
              <div className="font-medium">N등분</div>
              <p className="text-sm text-muted-foreground mt-1">PDF를 지정한 개수로 균등하게 나눕니다.</p>
            </button>
            <button
              type="button"
              onClick={() => setSplitMode('range')}
              className={`rounded-lg border p-4 text-left transition-colors ${splitMode === 'range' ? 'border-red-500 bg-red-50' : 'hover:border-red-200'}`}
            >
              <div className="font-medium">페이지 범위</div>
              <p className="text-sm text-muted-foreground mt-1">예: 1-3, 5, 8-10 형태로 묶음을 만듭니다.</p>
            </button>
          </div>
        </div>

        {splitMode === 'count' ? (
          <div>
            <Label htmlFor="split-count" className="text-base font-semibold">분할 수 (2~50)</Label>
            <Input
              id="split-count"
              type="number"
              min={2}
              max={50}
              value={splitCount}
              onChange={(e) => setSplitCount(e.target.value)}
              className="mt-2"
            />
          </div>
        ) : (
          <div>
            <Label htmlFor="split-range" className="text-base font-semibold">페이지 범위</Label>
            <Input
              id="split-range"
              value={splitRange}
              onChange={(e) => setSplitRange(e.target.value)}
              placeholder="1-3, 5, 8-10"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              각 콤마 구간이 별도 PDF로 생성되어 ZIP에 담깁니다. 범위는 실제 페이지 수 안에서 검증됩니다.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>다시 선택</Button>
          <Button onClick={handleStartSplit} className="bg-red-600 hover:bg-red-700 flex-1">
            PDF 분할 ZIP 만들기
          </Button>
        </div>
      </div>
    )
  }

  // ============================================================
  // PDF → 이미지 설정 UI
  // ============================================================
  if (step === 'config' && toolId === 'pdf-to-image') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{files[0]?.name}</span>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <Label className="text-base font-semibold">이미지 포맷</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['png', 'jpeg'] as ImageFormat[]).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => setImageFormat(format)}
                className={`rounded-lg border p-4 text-left uppercase transition-colors ${imageFormat === format ? 'border-red-500 bg-red-50' : 'hover:border-red-200'}`}
              >
                <div className="font-medium">{format === 'png' ? 'PNG' : 'JPEG'}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {format === 'png' ? '선명한 무손실 이미지' : '용량이 작은 압축 이미지'}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <Label className="text-base font-semibold">해상도</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {['1', '1.5', '2'].map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => setImageScale(scale)}
                className={`rounded-lg border p-3 text-center transition-colors ${imageScale === scale ? 'border-red-500 bg-red-50' : 'hover:border-red-200'}`}
              >
                {scale}x
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">높을수록 선명하지만 ZIP 용량과 처리 시간이 증가합니다.</p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>다시 선택</Button>
          <Button onClick={handleStartImageConversion} className="bg-red-600 hover:bg-red-700 flex-1">
            전체 페이지 이미지 ZIP 만들기
          </Button>
        </div>
      </div>
    )
  }

  // ============================================================
  // PDF 압축 설정 UI
  // ============================================================
  if (step === 'config' && toolId === 'pdf-compress') {
    const presets: Array<{ id: CompressPreset; title: string; description: string }> = [
      { id: 'screen', title: '강한 압축', description: '화면 공유용, 가장 작은 용량' },
      { id: 'ebook', title: '권장', description: '품질과 용량의 균형' },
      { id: 'printer', title: '인쇄', description: '인쇄 품질 우선' },
      { id: 'prepress', title: '고품질', description: '출판/보관용' },
    ]

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{files[0]?.name}</span>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <Label className="text-base font-semibold">압축 품질</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setCompressPreset(preset.id)}
                className={`rounded-lg border p-4 text-left transition-colors ${compressPreset === preset.id ? 'border-red-500 bg-red-50' : 'hover:border-red-200'}`}
              >
                <div className="font-medium">{preset.title}</div>
                <p className="text-sm text-muted-foreground mt-1">{preset.description}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Ghostscript 서버 압축을 사용해 기존 래스터화 방식보다 텍스트/벡터 검색성을 보존합니다.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>다시 선택</Button>
          <Button onClick={handleStartCompress} className="bg-red-600 hover:bg-red-700 flex-1">
            PDF 압축
          </Button>
        </div>
      </div>
    )
  }

  // ============================================================
  // 암호 설정/해제 UI
  // ============================================================
  if (step === 'config' && (toolId === 'pdf-encrypt' || toolId === 'pdf-unlock')) {
    const strength = getPasswordStrength(password)
    const isEncrypt = toolId === 'pdf-encrypt'

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{files[0]?.name}</span>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-50 p-2">
              <Lock className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold">{isEncrypt ? 'PDF 비밀번호 설정' : 'PDF 비밀번호 입력'}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isEncrypt ? '다운로드할 암호화 PDF에 적용할 비밀번호를 입력하세요.' : '잠금 해제에 사용할 기존 PDF 비밀번호를 입력하세요.'}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="pdf-password">비밀번호</Label>
            <div className="relative mt-2">
              <Input
                id="pdf-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {isEncrypt && (
            <div>
              <Label htmlFor="pdf-password-confirm">비밀번호 확인</Label>
              <Input
                id="pdf-password-confirm"
                type={showPassword ? 'text' : 'password'}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="mt-2"
              />
              {passwordConfirm && password !== passwordConfirm && (
                <p className="text-xs text-red-600 mt-1">비밀번호가 일치하지 않습니다.</p>
              )}
            </div>
          )}

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">비밀번호 강도</span>
              <span className={strength.className}>{strength.label}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full transition-all ${strength.label === '강함' ? 'bg-green-500' : strength.label === '보통' ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: strength.width }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>다시 선택</Button>
          <Button onClick={handleStartPassword} className="bg-red-600 hover:bg-red-700 flex-1">
            {isEncrypt ? '암호 설정' : '잠금 해제'}
          </Button>
        </div>
      </div>
    )
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
              🔒 이 도구는 기능에 따라 브라우저 처리 또는 서버 임시 변환을 사용합니다. 서버 처리 파일은 짧은 보관 시간 후 정리됩니다.
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
