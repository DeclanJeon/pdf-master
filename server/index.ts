import express, { Request, Response } from 'express';
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
const app = express();
const PORT = process.env.PORT || 3001;

// --- Config ---
const HWPFORGE_PATH = process.env.HWPFORGE_PATH || path.resolve(__dirname, '../../pdf-master-references/HwpForge/target/release/hwpforge');
const SOFFICE_PATH = process.env.SOFFICE_PATH || 'soffice';
const MD2HTML_PATH = process.env.MD2HTML_PATH || path.resolve(__dirname, '../scripts/md2html.py');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '../uploads');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.resolve(__dirname, '../outputs');

// Toss Payments
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || '';

// --- Middleware ---
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Ensure dirs
for (const d of [UPLOAD_DIR, OUTPUT_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// --- Cleanup old files every 10 min ---
const MAX_FILE_AGE_MS = 30 * 60 * 1000; // 30 min
setInterval(() => {
  const now = Date.now();
  for (const dir of [UPLOAD_DIR, OUTPUT_DIR]) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      try {
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > MAX_FILE_AGE_MS) fs.unlinkSync(fp);
      } catch { /* skip */ }
    }
  }
}, 10 * 60 * 1000);

// ============================================================
// HWP → PDF Conversion Pipeline
// ============================================================

interface ConversionJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  resultUrl?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, ConversionJob>();

/**
 * POST /api/convert/hwp-to-pdf
 * Upload HWP file, returns job ID for polling
 */
app.post('/api/convert/hwp-to-pdf', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'HWP 파일을 업로드해주세요.' });
  }

  const jobId = nanoid(16);
  const jobDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const job: ConversionJob = {
    id: jobId,
    status: 'processing',
    progress: 0,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  const inputPath = req.file.path;
  const hwpxPath = path.join(jobDir, 'output.hwpx');
  const mdDir = path.join(jobDir, 'md');
  const mdPath = path.join(mdDir, 'output.md');
  const htmlPath = path.join(jobDir, 'output.html');
  const pdfPath = path.join(jobDir, 'output.pdf');

  // Run conversion async
  (async () => {
    try {
      // Step 1: HWP → HWPX
      job.progress = 10;
      jobs.set(jobId, { ...job });

      await execFileAsync(HWPFORGE_PATH, ['convert-hwp5', inputPath, '-o', hwpxPath], {
        timeout: 60000,
      });

      // Step 2: HWPX → Markdown
      job.progress = 40;
      jobs.set(jobId, { ...job });

      fs.mkdirSync(mdDir, { recursive: true });
      await execFileAsync(HWPFORGE_PATH, ['to-md', hwpxPath, '-o', mdDir], {
        timeout: 60000,
      });

      // Find the actual markdown file (hwpforge creates it with document name)
      const mdFiles = fs.readdirSync(mdDir).filter(f => f.endsWith('.md'));
      const actualMdPath = mdFiles.length > 0 ? path.join(mdDir, mdFiles[0]) : mdPath;

      if (!fs.existsSync(actualMdPath)) {
        throw new Error('Markdown 변환 결과를 찾을 수 없습니다.');
      }

      // Step 3: Markdown → HTML
      job.progress = 60;
      jobs.set(jobId, { ...job });

      await execFileAsync('python3', [MD2HTML_PATH, actualMdPath, htmlPath], {
        timeout: 30000,
      });

      // Step 4: HTML → PDF (via LibreOffice)
      job.progress = 80;
      jobs.set(jobId, { ...job });

      await execFileAsync(SOFFICE_PATH, [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', jobDir,
        htmlPath,
      ], { timeout: 60000 });

      // Verify PDF created
      if (!fs.existsSync(pdfPath)) {
        // LibreOffice might create with html filename
        const altPdf = path.join(jobDir, path.basename(htmlPath, '.html') + '.pdf');
        if (fs.existsSync(altPdf)) {
          fs.renameSync(altPdf, pdfPath);
        } else {
          throw new Error('PDF 파일 생성에 실패했습니다.');
        }
      }

      // Cleanup input
      try { fs.unlinkSync(inputPath); } catch { /* skip */ }

      job.status = 'completed';
      job.progress = 100;
      job.resultUrl = `/api/download/${jobId}`;
      jobs.set(jobId, job);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '변환 중 오류가 발생했습니다.';
      console.error(`HWP conversion failed [${jobId}]:`, message);
      job.status = 'failed';
      job.error = message;
      jobs.set(jobId, job);
      try { fs.unlinkSync(inputPath); } catch { /* skip */ }
    }
  })();

  res.json({ jobId, status: 'processing', progress: 0 });
});

/**
 * GET /api/convert/status/:jobId
 * Poll conversion status
 */
app.get('/api/convert/status/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
  }
  res.json(job);
});

/**
 * GET /api/download/:jobId
 * Download converted PDF
 */
app.get('/api/download/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobs.get(jobId);
  if (!job || job.status !== 'completed') {
    return res.status(404).json({ error: '다운로드할 파일이 없습니다.' });
  }
  const pdfPath = path.join(OUTPUT_DIR, job.id, 'output.pdf');
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ error: 'PDF 파일을 찾을 수 없습니다.' });
  }
  res.download(pdfPath, 'converted.pdf');
});

// ============================================================
// Usage Tracking (for free tier: 3 per day per IP)
// ============================================================

interface UsageRecord {
  count: number;
  date: string; // YYYY-MM-DD
}

const usageByIp = new Map<string, UsageRecord>();

function checkUsageLimit(ip: string): { allowed: boolean; remaining: number } {
  const today = new Date().toISOString().slice(0, 10);
  let record = usageByIp.get(ip);
  if (!record || record.date !== today) {
    record = { count: 0, date: today };
    usageByIp.set(ip, record);
  }
  const FREE_DAILY_LIMIT = 3;
  return {
    allowed: record.count < FREE_DAILY_LIMIT,
    remaining: Math.max(0, FREE_DAILY_LIMIT - record.count),
  };
}

function incrementUsage(ip: string) {
  const today = new Date().toISOString().slice(0, 10);
  let record = usageByIp.get(ip);
  if (!record || record.date !== today) {
    record = { count: 0, date: today };
    usageByIp.set(ip, record);
  }
  record.count++;
}

/**
 * GET /api/usage
 * Check remaining free uses
 */
app.get('/api/usage', (req: Request, res: Response) => {
  const ip = req.ip || 'unknown';
  const limit = checkUsageLimit(ip);
  res.json({
    dailyLimit: 3,
    used: 3 - limit.remaining,
    remaining: limit.remaining,
  });
});

// ============================================================
// Toss Payments Webhook
// ============================================================

interface TossWebhookBody {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
  status?: string;
}

/**
 * POST /api/payments/webhook
 * Toss Payments webhook for payment confirmation
 */
app.post('/api/payments/webhook', async (req: Request<object, object, TossWebhookBody>, res: Response) => {
  const { paymentKey, orderId, amount, status } = req.body;

  if (status !== 'DONE') {
    return res.json({ ok: true });
  }

  // Verify with Toss API
  try {
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const data = await response.json() as Record<string, unknown>;

    if (response.ok) {
      console.log(`Payment confirmed: ${orderId} - ₩${amount}`);
      res.json({ ok: true });
    } else {
      console.error('Payment verification failed:', data);
      res.status(400).json({ error: data.message || '검증 실패' });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '웹훅 처리 중 오류';
    console.error('Webhook error:', message);
    res.status(500).json({ error: '웹훅 처리 중 오류' });
  }
});

/**
 * POST /api/payments/confirm
 * Client-side payment confirmation after Toss widget
 */
app.post('/api/payments/confirm', async (req: Request, res: Response) => {
  const { paymentKey, orderId, amount } = req.body as { paymentKey?: string; orderId?: string; amount?: number };

  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
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

    const data = await response.json() as Record<string, unknown>;

    if (response.ok) {
      console.log(`Premium activated: ${orderId} - ₩${amount}`);
      res.json({ ok: true, orderId, amount });
    } else {
      res.status(400).json({ error: data.message || '결제 확인 실패' });
    }
  } catch {
    res.status(500).json({ error: '결제 서버 오류' });
  }
});

// ============================================================
// Health Check
// ============================================================
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hwpforge: fs.existsSync(HWPFORGE_PATH),
    soffice: true,
    md2html: fs.existsSync(MD2HTML_PATH),
  });
});

app.listen(PORT, () => {
  console.log(`PDF Master API server running on port ${PORT}`);
  console.log(`  HWPForge: ${HWPFORGE_PATH} (${fs.existsSync(HWPFORGE_PATH) ? 'OK' : 'MISSING'})`);
  console.log(`  LibreOffice: ${SOFFICE_PATH}`);
  console.log(`  md2html: ${MD2HTML_PATH} (${fs.existsSync(MD2HTML_PATH) ? 'OK' : 'MISSING'})`);
});

export default app;
