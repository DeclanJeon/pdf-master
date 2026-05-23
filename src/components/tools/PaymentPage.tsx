import React, { useState, useEffect } from 'react';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import { CreditCard, CheckCircle2, XCircle, Loader2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/appStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || '';

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  popular?: boolean;
}

const PLANS: PricingPlan[] = [
  {
    id: 'per-use',
    name: '건당 결제',
    price: 1000,
    period: '1회',
    features: ['HWP→PDF 변환 1회', '도장 삽입 1회', '워터마크 없음', '30일 보관'],
  },
  {
    id: 'monthly',
    name: '월 구독',
    price: 5900,
    period: '월',
    features: ['무제한 변환/편집', '모든 도구 사용', '워터마크 없음', '우선 지원', 'API 액세스'],
    popular: true,
  },
];

export default function PaymentPage() {
  const [loading, setLoading] = useState(false);
  const [premium, setPremium] = useState(false);
  const { usageCount } = useAppStore();

  useEffect(() => {
    // Check if user has premium (from localStorage for now)
    const expiry = localStorage.getItem('pdfmaster_premium_expiry');
    if (expiry && new Date(expiry) > new Date()) {
      setPremium(true);
    }
  }, []);

  const handlePayment = async (plan: PricingPlan) => {
    if (!TOSS_CLIENT_KEY) {
      // Fallback: simulate payment for dev
      alert('개발 모드: 결제 없이 프리미엄이 활성화됩니다.');
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + (plan.id === 'monthly' ? 30 : 1));
      localStorage.setItem('pdfmaster_premium_expiry', expiry.toISOString());
      setPremium(true);
      return;
    }

    setLoading(true);

    try {
      const orderId = `pdfmaster-${plan.id}-${Date.now()}`;
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);

      await tossPayments.requestPayment(plan.id === 'monthly' ? '카드' : '카드', {
        amount: plan.price,
        orderId,
        orderName: `PDF마스터 ${plan.name}`,
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
      setLoading(false);
    }
  };

  if (premium) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
        <h2 className="text-2xl font-bold mb-2">프리미엄 활성화됨</h2>
        <p className="text-gray-600 mb-4">모든 도구를 제한 없이 사용할 수 있습니다.</p>
        <Button
          variant="outline"
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

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <Crown className="w-10 h-10 mx-auto mb-3 text-yellow-500" />
        <h1 className="text-2xl font-bold">프리미엄으로 업그레이드</h1>
        <p className="text-gray-600 mt-2">
          무료: 하루 3건 (워터마크 포함) / 오늘 사용: {usageCount}건
        </p>
      </div>

      {/* Plans */}
      <div className="grid md:grid-cols-2 gap-6">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={`relative ${plan.popular ? 'border-red-300 shadow-lg' : ''}`}
          >
            {plan.popular && (
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-red-600">
                인기
              </Badge>
            )}
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <div className="mt-2">
                <span className="text-3xl font-bold">₩{plan.price.toLocaleString()}</span>
                <span className="text-gray-500">/{plan.period}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className={`w-full ${plan.popular ? 'bg-red-600 hover:bg-red-700' : ''}`}
                onClick={() => handlePayment(plan)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                {plan.price.toLocaleString()}원 결제
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trust badges */}
      <div className="text-center text-xs text-gray-400 space-y-1">
        <p>토스페이먼츠 결제 | 카카오페이 · 네이버페이 · 토스 지원</p>
        <p>결제 정보는 PDF마스터 서버에 저장되지 않습니다</p>
      </div>
    </div>
  );
}
