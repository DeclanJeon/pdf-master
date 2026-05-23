import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, AlertCircle, Loader2, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/appStore';

const API_BASE = import.meta.env.VITE_API_URL || '';

type Step = 'upload' | 'converting' | 'done' | 'error';

interface ConversionResult {
  jobId: string;
  status: string;
  progress: number;
}

export default function HwpToPdfTool() {
  const [step, setStep] = useState<Step>('upload');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [jobId, setJobId] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [usageRemaining, setUsageRemaining] = useState(3);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { incrementUsageCount, usageCount } = useAppStore();

  // Fetch usage on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/usage`)
      .then(r => r.json())
      .then(d => setUsageRemaining(d.remaining ?? 3))
      .catch(() => {});
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const startPolling = (jid: string) => {
    let failCount = 0;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/convert/status/${jid}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        setProgress(data.progress || 0);

        if (data.status === 'completed') {
          setDownloadUrl(`${API_BASE}${data.resultUrl}`);
          setStep('done');
          incrementUsageCount();
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (data.status === 'failed') {
          setErrorMsg(data.error || '변환 중 오류가 발생했습니다.');
          setStep('error');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (err: any) {
        failCount++;
        if (failCount >= 5) {
          setErrorMsg('서버 연결 오류가 반복됩니다. 잠시 후 다시 시도해주세요.');
          setStep('error');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
        // Otherwise silently retry on next interval
      }
    }, 3000);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.hwp') && !file.name.toLowerCase().endsWith('.hwpx')) {
      setErrorMsg('HWP/HWPX 파일만 변환 가능합니다.');
      setStep('error');
      return;
    }

    setFileName(file.name);
    setStep('converting');
    setProgress(5);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/convert/hwp-to-pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '업로드 실패');
      }

      const data: ConversionResult = await res.json();
      setJobId(data.jobId);
      setProgress(10);
      startPolling(data.jobId);
    } catch (err: any) {
      setErrorMsg(err.message || '업로드 중 오류가 발생했습니다.');
      setStep('error');
    }
  }, [incrementUsageCount]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/x-hwp': ['.hwp', '.hwpx'] },
    maxFiles: 1,
    disabled: step === 'converting',
  });

  const handleReset = () => {
    setStep('upload');
    setProgress(0);
    setFileName('');
    setJobId('');
    setDownloadUrl('');
    setErrorMsg('');
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const progressSteps = [
    { label: 'HWP 업로드', min: 5 },
    { label: 'HWPX 변환', min: 10 },
    { label: 'Markdown 변환', min: 40 },
    { label: 'HTML 변환', min: 60 },
    { label: 'PDF 생성', min: 80 },
    { label: '완료', min: 100 },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">HWP → PDF 변환 안내</p>
            <p>한글(HWP) 파일을 PDF로 변환합니다. 변환은 서버에서 처리되며,
            텍스트와 표는 대부분 보존됩니다. 복잡한 이미지/도형은 일부 차이가 있을 수 있습니다.</p>
            <p className="mt-1 text-blue-600">오늘 남은 무료 횟수: <strong>{usageRemaining}/3</strong></p>
          </div>
        </CardContent>
      </Card>

      {/* Upload Step */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              HWP 파일 업로드
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-red-300 hover:bg-gray-50'}`}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium text-gray-700">
                {isDragActive ? '여기에 놓으세요' : 'HWP 파일을 드래그하거나 클릭하세요'}
              </p>
              <p className="text-sm text-gray-500 mt-2">.hwp 파일만 지원 (최대 50MB)</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Converting Step */}
      {step === 'converting' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              변환 진행 중
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">파일: {fileName}</p>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="bg-red-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 text-center">{progress}%</p>

            {/* Step indicators */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {progressSteps.map((ps) => (
                <div key={ps.label} className="flex items-center gap-1.5 text-xs">
                  {progress >= ps.min ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-gray-300 flex-shrink-0" />
                  )}
                  <span className={progress >= ps.min ? 'text-green-700 font-medium' : 'text-gray-400'}>
                    {ps.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done Step */}
      {step === 'done' && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              변환 완료!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
              <FileText className="w-8 h-8 text-red-500" />
              <div>
                <p className="font-medium">{fileName.replace('.hwp', '.pdf')}</p>
                <p className="text-sm text-gray-500">PDF 변환 완료</p>
              </div>
              <Badge className="ml-auto bg-green-100 text-green-800 border-green-200">완료</Badge>
            </div>

            <div className="flex gap-3">
              <Button asChild className="flex-1 bg-red-600 hover:bg-red-700">
                <a href={downloadUrl} download="converted.pdf">
                  <Download className="w-4 h-4 mr-2" />
                  PDF 다운로드
                </a>
              </Button>
              <Button variant="outline" onClick={handleReset}>
                다른 파일 변환
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Step */}
      {step === 'error' && (
        <Card className="border-red-200">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-800">변환 실패</p>
                <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleReset} className="w-full">
              다시 시도
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
