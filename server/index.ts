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
const HWPX2HTML_PATH = process.env.HWPX2HTML_PATH || path.resolve(__dirname, 'hwpx2html.py');
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

// --- Cleanup old files every 5 min ---
const MAX_FILE_AGE_MS = 10 * 60 * 1000; // 10 min — delete everything after download
function rmDirRecursive(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    try {
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        rmDirRecursive(fp);
        fs.rmdirSync(fp);
      } else {
        fs.unlinkSync(fp);
      }
    } catch { /* skip */ }
  }
}
setInterval(() => {
  const now = Date.now();
  // Clean uploads dir (direct files)
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    const fp = path.join(UPLOAD_DIR, f);
    try {
      if (now - fs.statSync(fp).mtimeMs > MAX_FILE_AGE_MS) fs.unlinkSync(fp);
    } catch { /* skip */ }
  }
  // Clean outputs dir (job subdirectories)
  for (const jobId of fs.readdirSync(OUTPUT_DIR)) {
    const jobDir = path.join(OUTPUT_DIR, jobId);
    try {
      const stat = fs.statSync(jobDir);
      if (stat.isDirectory() && now - stat.mtimeMs > MAX_FILE_AGE_MS) {
        rmDirRecursive(jobDir);
        fs.rmdirSync(jobDir);
      }
    } catch { /* skip */ }
  }
  // Clean stale in-memory jobs
  for (const [id, job] of jobs) {
    if (now - job.createdAt > MAX_FILE_AGE_MS) jobs.delete(id);
  }
}, 5 * 60 * 1000);

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

  console.log(`[UPLOAD] file=${req.file.originalname} size=${req.file.size} mimetype=${req.file.mimetype}`);

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
  const originalName = req.file.originalname || '';
  const isHwpx = originalName.toLowerCase().endsWith('.hwpx');
  const hwpxPath = isHwpx ? inputPath : path.join(jobDir, 'output.hwpx');
  const htmlPath = path.join(jobDir, 'output.html');
  const pdfPath = path.join(jobDir, 'output.pdf');

  // Run conversion async
  (async () => {
    try {
      // === Method 1: LibreOffice direct HWP→PDF (best layout preservation) ===
      if (!isHwpx) {
        job.progress = 10;
        jobs.set(jobId, { ...job });

        try {
          console.log(`[METHOD1] Trying LibreOffice direct HWP→PDF jobId=${jobId}`);
          await execFileAsync(SOFFICE_PATH, [
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', jobDir,
            inputPath,
          ], { timeout: 120000, env: { ...process.env, HOME: '/tmp', LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8', OOO_LOCALE: 'ko' } });

          // Check if PDF was created (LibreOffice uses original filename)
          const possiblePdfs = fs.readdirSync(jobDir).filter(f => f.endsWith('.pdf'));
          if (possiblePdfs.length > 0) {
            const generatedPdf = path.join(jobDir, possiblePdfs[0]);
            if (generatedPdf !== pdfPath) {
              fs.renameSync(generatedPdf, pdfPath);
            }
            // Cleanup input
            try { fs.unlinkSync(inputPath); } catch { /* skip */ }
            job.status = 'completed';
            job.progress = 100;
            job.resultUrl = `/api/download/${jobId}`;
            jobs.set(jobId, job);
            console.log(`[METHOD1 OK] LibreOffice direct HWP→PDF jobId=${jobId} file=${originalName}`);
            return; // Success!
          }
          console.log(`[METHOD1 FAIL] No PDF generated, falling back`);
        } catch (e) {
          console.log(`[METHOD1 FAIL] ${e instanceof Error ? e.message : 'unknown'}, falling back`);
        }
      }

      // === Method 2 (fallback): HWP→HWPX→HTML→PDF ===
      // Step 1: HWP5 → HWPX (skip if already HWPX)
      job.progress = 20;
      jobs.set(jobId, { ...job });

      if (!isHwpx) {
        await execFileAsync(HWPFORGE_PATH, ['convert-hwp5', inputPath, '-o', hwpxPath], {
          timeout: 60000,
        });
      }

      // Step 2: HWPX → HTML (direct, preserves tables/formatting)
      job.progress = 50;
      jobs.set(jobId, { ...job });

      await execFileAsync('python3', [HWPX2HTML_PATH, hwpxPath, htmlPath], {
        timeout: 30000,
      });

      if (!fs.existsSync(htmlPath)) {
        throw new Error('HTML 변환 결과를 찾을 수 없습니다.');
      }

      // Step 3: HTML → PDF (via LibreOffice)
      job.progress = 80;
      jobs.set(jobId, { ...job });

      await execFileAsync(SOFFICE_PATH, [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', jobDir,
        htmlPath,
      ], { timeout: 60000, env: { ...process.env, HOME: '/tmp', LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8', OOO_LOCALE: 'ko' } });

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
      console.log(`[CONVERT OK] jobId=${jobId} file=${originalName}`);

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
  // Use job.outputPath directly (supports encrypted.pdf, decrypted.pdf, output.pdf, .odt etc.)
  const filePath = (job as any).outputPath || path.join(OUTPUT_DIR, job.id, 'output.pdf');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
  const downloadName = (job as any).resultFilename || 'converted.pdf';
  res.download(filePath, downloadName);
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
// PDF 암호 설정 (qpdf)
// ============================================================
app.post('/api/encrypt', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  const { password } = req.body;
  if (!password) { res.status(400).json({ error: '비밀번호가 필요합니다.' }); return; }

  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const outputPath = path.join(jobDir, 'encrypted.pdf');

    await execFileAsync('qpdf', [
      '--encrypt', password, password, '256',
      '--',
      inputPath, outputPath
    ], { timeout: 30000 });

    if (!fs.existsSync(outputPath)) {
      throw new Error('qpdf 출력 파일이 생성되지 않았습니다.');
    }

    jobs.set(jobId, {
      id: jobId,
      status: 'completed',
      progress: 100,
      createdAt: Date.now(),
      outputPath,
      originalName: req.file.originalname,
      resultFilename: req.file.originalname.replace('.pdf', '_encrypted.pdf'),
      deleteAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({ jobId, status: 'completed', progress: 100 });
  } catch (err: any) {
    res.status(500).json({ error: '암호 설정 실패: ' + (err.message || err) });
  }
});

// ============================================================
// PDF 암호 해제 (qpdf)
// ============================================================
app.post('/api/decrypt', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  const { password } = req.body;
  if (!password) { res.status(400).json({ error: '비밀번호가 필요합니다.' }); return; }

  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const outputPath = path.join(jobDir, 'decrypted.pdf');

    await execFileAsync('qpdf', [
      '--password=' + password,
      '--decrypt',
      inputPath, outputPath
    ], { timeout: 30000 });

    if (!fs.existsSync(outputPath)) {
      throw new Error('qpdf 출력 파일이 생성되지 않았습니다.');
    }

    jobs.set(jobId, {
      id: jobId,
      status: 'completed',
      progress: 100,
      createdAt: Date.now(),
      outputPath,
      originalName: req.file.originalname,
      resultFilename: req.file.originalname.replace('.pdf', '_decrypted.pdf'),
      deleteAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({ jobId, status: 'completed', progress: 100 });
  } catch (err: any) {
    if (err.message?.includes('invalid password') || err.stderr?.includes('invalid password')) {
      res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
    } else {
      res.status(500).json({ error: '암호 해제 실패: ' + (err.message || err) });
    }
  }
});

// ============================================================
// PDF → 한글(HWP/ODT) 변환 (LibreOffice)
// ============================================================
app.post('/api/convert/pdf-to-odt', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }

  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const expectedOdt = path.join(jobDir, baseName + '.odt');

    console.log(`[PDF→ODT] input=${inputPath} baseName=${baseName} expectedOdt=${expectedOdt}`);

    await execFileAsync(SOFFICE_PATH, [
      '--headless',
      '--infilter=writer_pdf_import',
      '--convert-to', 'odt',
      '--outdir', jobDir,
      inputPath,
    ], { timeout: 60000, env: { ...process.env, HOME: '/tmp', LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' } });

    // LibreOffice may name output differently; find any .odt in jobDir
    const files = fs.readdirSync(jobDir);
    console.log(`[PDF→ODT] output dir contents: ${files.join(', ')}`);
    const odtFile = files.find(f => f.endsWith('.odt'));
    if (!odtFile) {
      throw new Error(`ODT 변환 실패: dir=${jobDir} files=[${files.join(',')}]`);
    }
    const odtPath = path.join(jobDir, odtFile);

    jobs.set(jobId, {
      id: jobId,
      status: 'completed',
      progress: 100,
      createdAt: Date.now(),
      outputPath: odtPath,
      originalName: req.file.originalname,
      resultFilename: req.file.originalname.replace('.pdf', '.odt'),
      deleteAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({ jobId, status: 'completed', progress: 100 });
  } catch (err: any) {
    console.error(`[PDF→ODT] ERROR: ${err.message}`);
    res.status(500).json({ error: 'ODT 변환 실패: ' + (err.message || err) });
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
    hwpx2html: fs.existsSync(HWPX2HTML_PATH),
  });
});

app.listen(PORT, () => {
  console.log(`PDF Master API server running on port ${PORT}`);
  console.log(`  HWPForge: ${HWPFORGE_PATH} (${fs.existsSync(HWPFORGE_PATH) ? 'OK' : 'MISSING'})`);
  console.log(`  LibreOffice: ${SOFFICE_PATH}`);
  console.log(`  hwpx2html: ${HWPX2HTML_PATH} (${fs.existsSync(HWPX2HTML_PATH) ? 'OK' : 'MISSING'})`);
});

export default app;
