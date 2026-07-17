import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, AlertCircle, Loader2, CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { resolveApiBase } from '@/lib/apiBase';
import { Link } from 'react-router-dom';

const API_BASE = resolveApiBase(import.meta.env);

type Step = 'upload' | 'converting' | 'done' | 'error';

interface ConversionResult {
  jobId: string;
  status: string;
  progress: number;
  usage?: {
    dailyLimit: number;
    used: number;
    remaining: number;
    unlimited?: boolean;
  };
}

export default function HwpToPdfTool() {
  const [step, setStep] = useState<Step>('upload');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [usageRemaining, setUsageRemaining] = useState(3);
  const [dailyLimit, setDailyLimit] = useState(3);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/usage`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setUsageRemaining(d.remaining ?? 3);
        setDailyLimit(d.dailyLimit ?? 3);
      })
      .catch(() => {
        setUsageRemaining(3);
        setDailyLimit(3);
      });
  }, []);

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
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (data.status === 'failed') {
          setErrorMsg(data.error || '변환 중 오류가 발생했습니다.');
          setStep('error');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch {
        failCount++;
        if (failCount >= 5) {
          setErrorMsg('서버 연결 오류가 반복됩니다. 잠시 후 다시 시도해주세요.');
          setStep('error');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
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
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (typeof err.remaining === 'number') {
          setUsageRemaining(err.remaining);
        }
        throw new Error(err.error || '업로드 실패');
      }

      const data: ConversionResult = await res.json();
      if (typeof data.usage?.remaining === 'number') {
        setUsageRemaining(data.usage.remaining);
      }
      if (typeof data.usage?.dailyLimit === 'number') {
        setDailyLimit(data.usage.dailyLimit);
      }
      setProgress(10);
      startPolling(data.jobId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.');
      setStep('error');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/x-hwp': ['.hwp', '.hwpx'],
      'application/haansofthwp': ['.hwp', '.hwpx'],
      'application/octet-stream': ['.hwp', '.hwpx'],
    },
    maxFiles: 1,
    disabled: step === 'converting',
  });

  const handleReset = () => {
    setStep('upload');
    setProgress(0);
    setFileName('');
    setDownloadUrl('');
    setErrorMsg('');
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const progressSteps = [
    { label: '파일 업로드', min: 5 },
    { label: '문서 해석', min: 20 },
    { label: '레이아웃 변환', min: 50 },
    { label: 'PDF 생성', min: 80 },
    { label: '완료', min: 100 },
  ];

  const pdfName = fileName.replace(/\.(hwp|hwpx)$/i, '.pdf');

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className="overflow-hidden border-blue-200/80 bg-gradient-to-br from-blue-50 via-white to-sky-50 shadow-sm">
        <CardContent className="flex items-start gap-3 pt-5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Info className="h-4 w-4" />
          </div>
          <div className="text-sm text-blue-900">
            <p className="mb-1 font-semibold">HWP / HWPX → PDF 변환</p>
            <p className="leading-6 text-blue-800/90">
              한글 파일을 설치 없이 PDF로 변환합니다. 텍스트·표는 대부분 보존되며,
              복잡한 도형/이미지 레이아웃은 문서에 따라 차이가 날 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className="border-blue-200 bg-white text-blue-800">
                오늘 남은 횟수 {usageRemaining}/{dailyLimit}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                서버 임시 처리 후 자동 정리
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {step === 'upload' && (
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-red-600" />
              HWP / HWPX 파일 업로드
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all sm:p-12
                ${isDragActive
                  ? 'border-red-400 bg-red-50 shadow-inner'
                  : 'border-stone-300 bg-stone-50/60 hover:border-red-300 hover:bg-white hover:shadow-sm'}`}
            >
              <input {...getInputProps()} />
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
                <Upload className="h-6 w-6 text-stone-500" />
              </div>
              <p className="text-lg font-semibold text-stone-800">
                {isDragActive ? '여기에 놓으세요' : '파일을 드래그하거나 클릭해서 선택'}
              </p>
              <p className="mt-2 text-sm text-stone-500">.hwp, .hwpx 지원 · 최대 50MB</p>
              <div className="mt-5 inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
                공공기관 제출 · 이메일 첨부 · 출력용 PDF
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'converting' && (
        <Card className="border-stone-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-red-600" />
              변환 진행 중
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="truncate text-sm text-stone-600" title={fileName}>파일: {fileName}</p>

            <div className="h-3 w-full overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-sm font-medium text-stone-600">{progress}%</p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {progressSteps.map((ps) => (
                <div key={ps.label} className="flex items-center gap-1.5 rounded-lg bg-stone-50 px-2 py-1.5 text-xs">
                  {progress >= ps.min ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  ) : (
                    <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-stone-300" />
                  )}
                  <span className={progress >= ps.min ? 'font-medium text-green-700' : 'text-stone-400'}>
                    {ps.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && (
        <Card className="border-green-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              변환 완료
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4 ring-1 ring-green-100">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">
                <FileText className="h-6 w-6 text-red-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-stone-900">{pdfName}</p>
                <p className="text-sm text-stone-500">PDF 변환 완료 · 바로 다운로드하세요</p>
              </div>
              <Badge className="border-green-200 bg-green-100 text-green-800">완료</Badge>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={downloadUrl}
                download={pdfName || 'converted.pdf'}
                className={buttonVariants({ className: 'flex-1 bg-red-600 hover:bg-red-700' })}
              >
                <Download className="mr-2 h-4 w-4" />
                PDF 다운로드
              </a>
              <Button variant="outline" onClick={handleReset}>
                다른 파일 변환
              </Button>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
              이어서 주민번호 마스킹이나 도장 삽입이 필요하면{' '}
              <Link to="/pdf-rrn-mask" className="font-semibold text-red-600 hover:underline">마스킹</Link>
              {' · '}
              <Link to="/pdf-stamp" className="font-semibold text-red-600 hover:underline">도장</Link>
              도구를 이용하세요.
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'error' && (
        <Card className="border-red-200 shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3 rounded-2xl bg-red-50 p-4 ring-1 ring-red-100">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div>
                <p className="font-semibold text-red-800">변환 실패</p>
                <p className="mt-1 text-sm leading-6 text-red-700">{errorMsg}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                다시 시도
              </Button>
              <Link to="/pricing" className={buttonVariants({ variant: 'default', className: 'flex-1 bg-red-600 hover:bg-red-700' })}>
                요금제 보기
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
