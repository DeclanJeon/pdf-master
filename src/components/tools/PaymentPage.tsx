import React, { useState, useEffect } from 'react';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import {
  CreditCard, CheckCircle2, Loader2, Crown,
  Shield, Zap, Lock, ArrowRight, Sparkles, X as XIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/appStore';

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || '';

interface Feature {
  name: string;
  free: boolean | string;
  perUse: boolean | string;
  monthly: boolean | string;
}

const FEATURES: Feature[] = [
  { name: '주민번호 마스킹',     free: true,  perUse: true,  monthly: true },
  { name: '도장/인감 삽입',      free: true,  perUse: true,  monthly: true },
  { name: 'PDF 병합/분할/압축',  free: true,  perUse: true,  monthly: true },
  { name: 'HWP → PDF 변환',      free: '3회', perUse: true,  monthly: true },
  { name: '워터마크 제거',       free: false, perUse: true,  monthly: true },
  { name: 'PDF 암호 설정/해제',   free: false, perUse: true,  monthly: true },
  { name: '하루 사용 제한',       free: '3건', perUse: '없음', monthly: '없음' },
  { name: '파일 보관',           free: '10분', perUse: '10분', monthly: '10분' },
  { name: '광고 없음',           free: false, perUse: true,  monthly: true },
  { name: '우선 처리',           free: false, perUse: false, monthly: true },
];

export default function PaymentPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [premium, setPremium] = useState(false);
  const { dailyFreeUsed, dailyFreeLimit } = useAppStore();

  useEffect(() => {
    const expiry = localStorage.getItem('pdfmaster_premium_expiry');
    if (expiry && new Date(expiry) > new Date()) {
      setPremium(true);
    }
  }, []);

  const handlePayment = async (planId: string, price: number, name: string) => {
    if (!TOSS_CLIENT_KEY) {
      alert('개발 모드: 결제 없이 프리미엄이 활성화됩니다.');
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + (planId === 'monthly' ? 30 : 1));
      localStorage.setItem('pdfmaster_premium_expiry', expiry.toISOString());
      setPremium(true);
      return;
    }

    setLoading(planId);

    try {
      const orderId = `pdfmaster-${planId}-${Date.now()}`;
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);

      await tossPayments.requestPayment('카드', {
        amount: price,
        orderId,
        orderName: `PDF마스터 ${name}`,
        customerName: '사용자',
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
      });
    } catch (err: any) {
      if (err.code !== 'USER_CANCEL') {
        console.error('Payment error:', err);
        alert(`결제 오류: ${err.message}`);
      }
    } finally {
      setLoading(null);
    }
  };

  if (premium) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">프리미엄 활성화됨</h2>
        <p className="text-muted-foreground mb-2">모든 도구를 제한 없이 사용할 수 있습니다.</p>
        <p className="text-sm text-muted-foreground mb-8">
          만료: {new Date(localStorage.getItem('pdfmaster_premium_expiry') || '').toLocaleDateString('ko-KR')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            localStorage.removeItem('pdfmaster_premium_expiry');
            setPremium(false);
          }}
        >
          프리미엄 해지
        </Button>
      </div>
    );
  }

  const renderCell = (value: boolean | string) => {
    if (typeof value === 'string') {
      return <span className="text-sm text-foreground">{value}</span>;
    }
    return value
      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
      : <XIcon className="w-4 h-4 text-gray-300" />;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 py-4">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
          <Crown className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">요금제 선택</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          기본 기능은 무료로 사용하세요. 더 많은 기능이 필요할 때만 결제하세요.
        </p>
      </div>

      {/* 3-Column Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-4 md:gap-6 items-start">
        {/* Free Plan */}
        <Card className="relative border-gray-200">
          <CardHeader className="text-center pb-2">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-gray-500" />
            </div>
            <CardTitle className="text-lg">무료</CardTitle>
            <div className="mt-3">
              <span className="text-4xl font-bold">₩0</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">영구 무료</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2.5">
              {[
                '주민번호 마스킹',
                '도장/인감 삽입',
                'PDF 병합/분할/압축',
                '하루 3건까지',
                '워터마크 포함',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
              {[
                'HWP → PDF 변환',
                '워터마크 제거',
                'PDF 암호 설정',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <XIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full" disabled>
              현재 플랜
            </Button>
          </CardContent>
        </Card>

        {/* Per-Use Plan */}
        <Card className="relative border-blue-200 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-blue-100 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <CardTitle className="text-lg">건당 결제</CardTitle>
            <div className="mt-3">
              <span className="text-4xl font-bold">₩1,000</span>
              <span className="text-muted-foreground text-sm">/건</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">필요할 때만</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2.5">
              {[
                '무료 플랜의 모든 기능',
                'HWP → PDF 변환',
                '워터마크 제거',
                'PDF 암호 설정/해제',
                '사용 제한 없음',
                '광고 없음',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={() => handlePayment('per-use', 1000, '건당 결제')}
              disabled={loading !== null}
            >
              {loading === 'per-use' ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CreditCard className="w-4 h-4 mr-2" />
              )}
              1,000원 결제
            </Button>
          </CardContent>
        </Card>

        {/* Monthly Plan */}
        <Card className="relative border-red-300 shadow-xl ring-2 ring-red-100">
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-600 to-orange-500 px-4 shadow-md">
            <Sparkles className="w-3 h-3 mr-1" />
            가장 인기
          </Badge>
          <CardHeader className="text-center pb-2">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-md">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <CardTitle className="text-lg">월 구독</CardTitle>
            <div className="mt-3">
              <span className="text-4xl font-bold">₩5,900</span>
              <span className="text-muted-foreground text-sm">/월</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">무제한 모든 기능</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2.5">
              {[
                '건당 결제의 모든 기능',
                '무제한 변환/편집',
                '우선 처리 속도',
                '광고 없음',
                '새 기능 우선 체험',
                '하루 1커피 가격',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 shadow-md"
              onClick={() => handlePayment('monthly', 5900, '월 구독')}
              disabled={loading !== null}
            >
              {loading === 'monthly' ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              5,900원 / 월 구독
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Feature Comparison Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-center">기능 비교</h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left py-3 px-4 font-medium w-[40%]">기능</th>
                <th className="text-center py-3 px-3 font-medium">무료</th>
                <th className="text-center py-3 px-3 font-medium text-blue-600">건당</th>
                <th className="text-center py-3 px-3 font-medium text-red-600">월 구독</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="py-2.5 px-4">{f.name}</td>
                  <td className="text-center py-2.5 px-3">{renderCell(f.free)}</td>
                  <td className="text-center py-2.5 px-3">{renderCell(f.perUse)}</td>
                  <td className="text-center py-2.5 px-3">{renderCell(f.monthly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trust Section */}
      <div className="grid md:grid-cols-3 gap-6 text-center">
        <div className="space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <h3 className="font-semibold text-sm">안전한 결제</h3>
          <p className="text-xs text-muted-foreground">토스페이먼츠 PCI-DSS 인증<br/>카카오페이 · 네이버페이 · 토스</p>
        </div>
        <div className="space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="font-semibold text-sm">파일 보안</h3>
          <p className="text-xs text-muted-foreground">파일은 서버에 저장되지 않습니다<br/>10분 후 자동 삭제</p>
        </div>
        <div className="space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-purple-100 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-purple-600" />
          </div>
          <h3 className="font-semibold text-sm">언제든 해지</h3>
          <p className="text-xs text-muted-foreground">구독은 언제든 해지 가능<br/>건당 결제는 자동 청구 없음</p>
        </div>
      </div>

      {/* FAQ Mini */}
      <div className="space-y-3 max-w-2xl mx-auto">
        <h2 className="text-xl font-bold text-center">자주 묻는 질문</h2>
        {[
          {
            q: '무료로 얼마나 쓸 수 있나요?',
            a: '하루 3건까지 무료입니다. 주민번호 마스킹, 도장 삽입, PDF 병합 등 기본 기능은 제한 없이 사용 가능합니다.',
          },
          {
            q: '건당 결제는 어떻게 하나요?',
            a: 'HWP 변환, 워터마크 제거, PDF 암호 설정 등 프리미엄 기능을 사용할 때마다 1,000원씩 결제합니다. 자동 청구는 없습니다.',
          },
          {
            q: '파일이 서버에 남나요?',
            a: '아니요. 모든 파일은 처리 후 10분 이내 자동 삭제됩니다. PDF마스터는 어떤 파일도 보관하지 않습니다.',
          },
          {
            q: '환불은 어떻게 하나요?',
            a: '결제 완료 후 7일 이내 환불 가능합니다. 이메일(refund@pdfm.ponslink.com)로 문의해주세요.',
          },
        ].map((item, i) => (
          <details key={i} className="group rounded-lg border bg-card">
            <summary className="flex items-center justify-between py-3 px-4 cursor-pointer font-medium text-sm">
              {item.q}
              <span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="px-4 pb-3 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
