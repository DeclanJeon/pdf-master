import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

// Vercel Serverless Function handler
export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'health':
        return res.status(200).json({ status: 'ok' });

      case 'convert':
        // HWP conversion via Vercel is limited (no LibreOffice in serverless)
        // This endpoint should be used with a dedicated backend
        return res.status(501).json({
          error: 'HWP 변환은 전용 서버에서만 지원됩니다.',
          hint: 'Vercel 배포 시 HWP 변환은 별도 백엔드 필요',
        });

      case 'payments-confirm':
        return await handlePaymentConfirm(req, res);

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err: any) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message || '서버 오류' });
  }
}

async function handlePaymentConfirm(req: any, res: any) {
  const { paymentKey, orderId, amount } = req.body || {};

  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
  if (!TOSS_SECRET_KEY) {
    return res.status(500).json({ error: '결제 설정 오류' });
  }

  try {
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`Payment confirmed: ${orderId} - ₩${amount}`);
      return res.status(200).json({ ok: true, orderId, amount });
    } else {
      return res.status(400).json({ error: data.message || '결제 확인 실패' });
    }
  } catch (err: any) {
    return res.status(500).json({ error: '결제 서버 오류' });
  }
}
