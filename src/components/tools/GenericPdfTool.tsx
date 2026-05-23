import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Download, CheckCircle, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
} from '@/services/pdfUtils'

type Step = 'upload' | 'processing' | 'done'

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

  const config = toolConfigs[toolId] || { acceptMultiple: false }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    setFiles(acceptedFiles)
    setStep('processing')

    try {
      const pdfBytes = new Uint8Array(await acceptedFiles[0].arrayBuffer())
      let result: Uint8Array | Blob

      switch (toolId) {
        case 'pdf-merge': {
          const allBytes = await Promise.all(
            acceptedFiles.map(async f => new Uint8Array(await f.arrayBuffer()))
          )
          result = await mergePdfs(allBytes)
          setResultName('merged.pdf')
          break
        }
        case 'pdf-split': {
          result = await splitPdf(pdfBytes, { mode: 'single' })
          setResultName('split.zip')
          break
        }
        case 'pdf-to-image': {
          const images = await pdfToImages(pdfBytes)
          // 첫 번째 페이지 이미지 반환
          result = images[0] || new Blob()
          setResultName('page-1.png')
          break
        }
        case 'pdf-watermark': {
          result = await addWatermark(pdfBytes, { text: 'PDF마스터', fontSize: 48, opacity: 0.15 })
          setResultName(acceptedFiles[0].name.replace('.pdf', '_watermarked.pdf'))
          break
        }
        case 'pdf-pagenumber': {
          result = await addPageNumbers(pdfBytes)
          setResultName(acceptedFiles[0].name.replace('.pdf', '_numbered.pdf'))
          break
        }
        case 'pdf-compress': {
          result = await compressPdf(pdfBytes)
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
          // PDF → ODT 변환 (한글에서 ODT 열기 가능)
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
          const odtBlob = await dlRes.blob()
          result = odtBlob
          setResultName(acceptedFiles[0].name.replace('.pdf', '.odt'))
          break
        }
        case 'pdf-sign': {
          // 서명은 별도 SignCanvas 컴포넌트에서 처리 (signStep으로 분기)
          toast.info('서명 기능은 아래 서명 패드에서 진행해주세요.')
          setStep('upload')
          return
        }
        default:
          // HWP 등 아직 구현되지 않은 도구
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
  }, [toolId])

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
