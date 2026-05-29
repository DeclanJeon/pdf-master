import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { ShieldCheck, Upload, Download, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { maskPdfPersonalInfo, extractTextFromPdf, previewMasking, typeLabels, typeColors, type PersonalInfoType } from '@/services/maskingServiceV2'
import { toast } from 'sonner'

type Step = 'upload' | 'preview' | 'processing' | 'done'

const toBlobPart = (bytes: Uint8Array): BlobPart =>
  bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : new Uint8Array(bytes).buffer

export function MaskingTool() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [previewItems, setPreviewItems] = useState<any[]>([])
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null)
  const [maskedCount, setMaskedCount] = useState(0)

  const [options, setOptions] = useState({
    maskRRN: true,
    maskPhone: true,
    maskEmail: true,
    maskAccount: false,
    maskCard: false,
    style: 'replace' as 'box' | 'replace',
  })

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0]
    if (!f) return

    setFile(f)
    const buffer = await f.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // pdfjs-dist worker가 ArrayBuffer를 전송(transfer)하므로, masking pipe용 독립 복사본 보존
    // .slice()는 새 ArrayBuffer를 할당한 진짜 복사본을 반환한다
    setPdfBytes(bytes.slice())

    // 미리보기: 텍스트에서 감지
    try {
      const text = await extractTextFromPdf(bytes)
      const detected = previewMasking(text)
      setPreviewItems(detected)
      setStep('preview')
    } catch {
      toast.error('PDF 텍스트 추출에 실패했습니다.')
      setStep('upload')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  })

  const handleMask = async () => {
    if (!pdfBytes) return
    setStep('processing')

    try {
      const result = await maskPdfPersonalInfo(pdfBytes, {
        maskRRN: options.maskRRN,
        maskPhone: options.maskPhone,
        maskEmail: options.maskEmail,
        maskAccount: options.maskAccount,
        maskCard: options.maskCard,
        style: options.style,
      })

      setResultBytes(result.pdfBytes)
      setMaskedCount(result.maskedCount)
      setStep('done')
      toast.success(`${result.maskedCount}개의 개인정보를 마스킹했습니다.`)
    } catch (e) {
      console.error('[MaskingTool] maskPdfPersonalInfo failed:', e)
      toast.error(`마스킹 처리 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`)
      setStep('preview')
    }
  }

  const handleDownload = () => {
    if (!resultBytes || !file) return
    const blob = new Blob([toBlobPart(resultBytes)], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name.replace('.pdf', '_masked.pdf')
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleReset = () => {
    setStep('upload')
    setFile(null)
    setPdfBytes(null)
    setPreviewItems([])
    setResultBytes(null)
    setMaskedCount(0)
  }

  if (step === 'upload') {
    return (
      <div>
        <div className="mb-4 rounded-lg bg-red-50 border border-red-100 p-4">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-900">개인정보 자동 마스킹</p>
              <p className="text-sm text-red-700 mt-1">
                주민등록번호, 전화번호, 이메일을 자동으로 감지하여 마스킹합니다.
                개인정보보호법 제24조에 따른 법적 의무를 준수할 수 있습니다.
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
          🔒 이 마스킹 도구는 브라우저에서 처리됩니다. HWP 변환·암호 기능 등 일부 도구는 서버 처리를 사용합니다.
        </p>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium">{file?.name}</span>
          <Badge variant="secondary">{(file!.size / 1024).toFixed(0)} KB</Badge>
        </div>

        {previewItems.length > 0 ? (
          <>
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-900">
                    {previewItems.length}개의 개인정보가 감지되었습니다
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(
                      previewItems.reduce((acc, item) => {
                        acc[item.type] = (acc[item.type] || 0) + 1
                        return acc
                      }, {} as Record<string, number>)
                    ).map(([type, count]) => (
                      <Badge key={type} className={`${typeColors[type as PersonalInfoType]} text-white`}>
                        {typeLabels[type as PersonalInfoType]} {String(count)}건
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 감지된 항목 상세 */}
            <div className="mb-4 space-y-2 max-h-48 overflow-y-auto">
              {previewItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {typeLabels[item.type as PersonalInfoType]}
                    </Badge>
                    <span className="font-mono text-muted-foreground">{item.text}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-mono font-medium">{item.maskedText}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-100 p-4">
            <CheckCircle className="h-5 w-5 text-green-600 inline mr-2" />
            <span className="text-green-900">감지된 개인정보가 없습니다.</span>
          </div>
        )}

        {/* 마스킹 옵션 */}
        <div className="mb-6 rounded-lg border p-4">
          <h3 className="font-medium mb-3">마스킹 항목 선택</h3>
          <div className="space-y-3">
            {([
              ['maskRRN', '주민등록번호', true],
              ['maskPhone', '전화번호', true],
              ['maskEmail', '이메일', true],
              ['maskAccount', '계좌번호', false],
              ['maskCard', '신용카드번호', false],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={key}>{label}</Label>
                <Switch
                  id={key}
                  checked={options[key] as boolean}
                  onCheckedChange={(v) => setOptions(prev => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
            <h3 className="font-medium mb-3">마스킹 방식</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="style"
                  value="replace"
                  checked={options.style === 'replace'}
                  onChange={() => setOptions(prev => ({ ...prev, style: 'replace' }))}
                />
                마스킹 텍스트 표시 (900101-1*******)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="style"
                  value="box"
                  checked={options.style === 'box'}
                  onChange={() => setOptions(prev => ({ ...prev, style: 'box' }))}
                />
                검은 박스로 가리기
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>
            다시 선택
          </Button>
          <Button onClick={handleMask} className="bg-red-600 hover:bg-red-700 flex-1">
            <ShieldCheck className="mr-2 h-4 w-4" />
            마스킹 실행
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-red-600 mb-4" />
        <p className="font-medium">개인정보 마스킹 중...</p>
        <p className="text-sm text-muted-foreground mt-1">잠시만 기다려주세요</p>
      </div>
    )
  }

  // done
  return (
    <div className="text-center py-8">
      <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
      <h2 className="text-xl font-bold mb-2">마스킹 완료!</h2>
      <p className="text-muted-foreground mb-6">
        {maskedCount}개의 개인정보가 마스킹되었습니다.
      </p>

      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={handleReset}>
          다른 파일 처리
        </Button>
        <Button onClick={handleDownload} className="bg-red-600 hover:bg-red-700">
          <Download className="mr-2 h-4 w-4" />
          다운로드
        </Button>
      </div>
    </div>
  )
}
