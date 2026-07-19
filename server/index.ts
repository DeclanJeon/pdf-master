import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath, pathToFileURL } from 'url';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DOMAIN = process.env.DOMAIN || 'pdfm.ponslink.com';
const PROD_URL = `https://${DOMAIN}`;
const DEV_FRONTEND_URL = 'http://localhost:5173';

// --- Config ---
const LOCAL_HWPFORGE_PATH = path.resolve(__dirname, '../../pdf-master-references/HwpForge/target/release/hwpforge');
const LEGACY_LOCAL_HWPFORGE_PATH = './pdf-master-references/HwpForge/target/release/hwpforge';
const HWPFORGE_ENV_PATH = process.env.HWPFORGE_PATH;
const HWPFORGE_PATH = !IS_PRODUCTION && HWPFORGE_ENV_PATH === LEGACY_LOCAL_HWPFORGE_PATH
  ? LOCAL_HWPFORGE_PATH
  : HWPFORGE_ENV_PATH || (IS_PRODUCTION ? '' : LOCAL_HWPFORGE_PATH);
const SOFFICE_PATH = process.env.SOFFICE_PATH || 'soffice';
const HWPX2HTML_PATH = process.env.HWPX2HTML_PATH || path.resolve(__dirname, 'hwpx2html.py');
const MD2HTML_PATH = process.env.MD2HTML_PATH || path.resolve(__dirname, '../scripts/md2html.py');
const LOCAL_RHWP_PATH = path.resolve(process.env.HOME || '', '.cargo/bin/rhwp');
function resolveRhwpPath(): string {
  const configured = (process.env.RHWP_PATH || '').trim();
  if (configured) {
    if (configured.includes(path.sep) || configured.startsWith('.')) {
      const absolute = path.resolve(configured);
      if (fs.existsSync(absolute)) return absolute;
    } else if (commandAvailable(configured)) {
      return configured;
    }
  }
  if (fs.existsSync(LOCAL_RHWP_PATH)) return LOCAL_RHWP_PATH;
  return configured || 'rhwp';
}
const RHWP_PATH = resolveRhwpPath();
const LOCAL_RHWP_INGEST_EXPORTER_PATH = path.resolve(__dirname, '../tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter');
const RHWP_INGEST_EXPORTER_PATH = process.env.RHWP_INGEST_EXPORTER_PATH
  || (fs.existsSync(LOCAL_RHWP_INGEST_EXPORTER_PATH) ? LOCAL_RHWP_INGEST_EXPORTER_PATH : 'rhwp-ingest-exporter');
const PDFTOTEXT_PATH = process.env.PDFTOTEXT_PATH || 'pdftotext';
const PDFTOHTML_PATH = process.env.PDFTOHTML_PATH || 'pdftohtml';
const PDFTOPPM_PATH = process.env.PDFTOPPM_PATH || 'pdftoppm';
const PDF2DOCX_SCRIPT_PATH = process.env.PDF2DOCX_SCRIPT_PATH || path.resolve(__dirname, '../scripts/pdf_to_docx.py');
const PDF_LAYOUT_EXTRACT_SCRIPT_PATH = process.env.PDF_LAYOUT_EXTRACT_SCRIPT_PATH || path.resolve(__dirname, '../scripts/pdf_layout_extract.py');
const SVG_TO_SEARCHABLE_PDF_SCRIPT_PATH = process.env.SVG_TO_SEARCHABLE_PDF_SCRIPT_PATH
  || path.resolve(__dirname, '../scripts/svg_to_searchable_pdf.py');
const PDF2DOCX_MODE_CANDIDATE = process.env.PDF2DOCX_LAYOUT_MODE || process.env.PDF2DOCX_MODE || 'faithful';
const PDF2DOCX_LAYOUT_MODE = ['faithful', 'editable', 'absolute'].includes(PDF2DOCX_MODE_CANDIDATE)
  ? PDF2DOCX_MODE_CANDIDATE
  : 'faithful';
const ODT_TO_HWPX_SCRIPT_PATH = process.env.ODT_TO_HWPX_SCRIPT_PATH || path.resolve(__dirname, '../scripts/odt_to_hwpx.py');
const PDF_HWP_PRIMARY_PIPELINE = process.env.PDF_HWP_PRIMARY_PIPELINE || 'pymupdf-native';
const QPDF_PATH = process.env.QPDF_PATH || 'qpdf';
const GHOSTSCRIPT_PATH = process.env.GHOSTSCRIPT_PATH || process.env.GS_PATH || 'gs';
const IMAGEMAGICK_PATH = process.env.IMAGEMAGICK_PATH || process.env.MAGICK_PATH || 'magick';
const CHROME_PATH = process.env.CHROME_PATH || process.env.CHROMIUM_PATH || (fs.existsSync('/home/declan/.local/bin/google-chrome') ? '/home/declan/.local/bin/google-chrome' : 'google-chrome');
const PDFUNITE_PATH = process.env.PDFUNITE_PATH || 'pdfunite';
const HANCOM_DOCSCONVERTER_BASE_URL = process.env.HANCOM_DOCSCONVERTER_BASE_URL || 'https://docsconverter-example.cloud.hancom.com';
const HANCOM_DOCSCONVERTER_ENABLED = process.env.HANCOM_DOCSCONVERTER_ENABLED !== 'false';
const LOCAL_PDF2DOCX_PYTHON_PATH = path.resolve(__dirname, '../.venv-pdf2docx/bin/python');
const PYTHON_PATH = process.env.PYTHON_PATH
  || (fs.existsSync(LOCAL_PDF2DOCX_PYTHON_PATH) ? LOCAL_PDF2DOCX_PYTHON_PATH : 'python3');
const PDF_TEXT_ERASE_SCRIPT_PATH = process.env.PDF_TEXT_ERASE_SCRIPT_PATH || path.resolve(__dirname, '../scripts/erase_pdf_text_background.py');
const PDF_HWP_VISUAL_MODE = process.env.PDF_HWP_VISUAL_MODE || 'editable-native';
const PDF_HWP_USES_PAGE_BACKGROUND = PDF_HWP_VISUAL_MODE === 'clean-background-visible-text' || PDF_HWP_VISUAL_MODE === 'source-image-top';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '../uploads');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.resolve(__dirname, '../outputs');
const AUTH_STORE_PATH = process.env.AUTH_STORE_PATH || path.resolve(__dirname, '../data/auth-store.json');
const USAGE_STORE_PATH = process.env.USAGE_STORE_PATH || path.resolve(__dirname, '../data/usage-store.json');
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'pdfm_session';
const OAUTH_STATE_COOKIE_NAME = 'pdfm_oauth_state';
const OAUTH_REDIRECT_COOKIE_NAME = 'pdfm_oauth_redirect';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PRODUCTION ? '' : crypto.randomBytes(32).toString('hex'));
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || IS_PRODUCTION;
// URLs: env var가 설정되어 있으면 우선 사용, 없으면 NODE_ENV에 따라 자동 파생
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.APP_URL || (IS_PRODUCTION ? PROD_URL : `http://localhost:${PORT}`);
const FRONTEND_URL = process.env.FRONTEND_URL || (IS_PRODUCTION ? PROD_URL : DEV_FRONTEND_URL);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${PUBLIC_BASE_URL}/api/auth/callback`;
const POLAR_ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN || '';
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || '';
const POLAR_ONE_TIME_PRODUCT_ID = process.env.POLAR_ONE_TIME_PRODUCT_ID || process.env.POLAR_PRODUCT_ID || '';
const POLAR_MONTHLY_PRODUCT_ID = process.env.POLAR_MONTHLY_PRODUCT_ID || process.env.POLAR_SUBSCRIPTION_PRODUCT_ID || '';
const POLAR_CHECKOUT_CURRENCY = (process.env.POLAR_CHECKOUT_CURRENCY || 'krw').toLowerCase();
const POLAR_ONE_TIME_CHECKOUT_URL = process.env.POLAR_ONE_TIME_CHECKOUT_URL || '';
const POLAR_MONTHLY_CHECKOUT_URL = process.env.POLAR_MONTHLY_CHECKOUT_URL || '';
const POLAR_CHECKOUT_SUCCESS_URL = process.env.POLAR_CHECKOUT_SUCCESS_URL || `${FRONTEND_URL}/pricing?success=true`;
const POLAR_CHECKOUT_CANCEL_URL = process.env.POLAR_CHECKOUT_CANCEL_URL || `${FRONTEND_URL}/pricing?canceled=true`;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((email) => normalizeEmail(email)).filter(Boolean);
const ADMIN_AUDIT_LOG_PATH = process.env.ADMIN_AUDIT_LOG_PATH || path.resolve(__dirname, '../data/admin-audit.log');
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '';
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const CONTACT_RECIPIENT_EMAIL = process.env.CONTACT_EMAIL || 'info@ponslink.com';
const CONTACT_SUBJECT_PREFIX = '[PDF마스터 문의]';
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || FRONTEND_URL)
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const PLACEHOLDER_SECRETS = new Set([
  '',
  'change-me-in-production',
  'replace-with-a-strong-random-session-secret',
  'your-google-client-secret',
]);
const ALL_ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPolarProductId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

function isPlaceholderConfigValue(value: string, examples: string[] = []): boolean {
  const normalized = value.trim();
  if (!normalized || examples.includes(normalized)) return true;
  if (normalized === ALL_ZERO_UUID) return true;
  return /x{6,}/i.test(normalized) || normalized.includes('your-') || normalized.includes('replace-with-');
}

function configuredPolarProducts() {
  return {
    one_time: POLAR_ONE_TIME_PRODUCT_ID,
    monthly: POLAR_MONTHLY_PRODUCT_ID,
  } as const;
}

function configuredPolarCheckoutUrl(plan: 'one_time' | 'monthly'): string {
  return plan === 'monthly' ? POLAR_MONTHLY_CHECKOUT_URL : POLAR_ONE_TIME_CHECKOUT_URL;
}

function isPolarCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'buy.polar.sh' && url.pathname.startsWith('/polar_cl_');
  } catch {
    return false;
  }
}

function clientIpAddress(req: Request): string | undefined {
  const forwardedFor = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || req.ip || undefined;
}

function productionConfigErrors(): string[] {
  if (!IS_PRODUCTION) return [];
  const errors: string[] = [];
  if (PLACEHOLDER_SECRETS.has(SESSION_SECRET) || SESSION_SECRET.length < 32) errors.push('SESSION_SECRET must be a non-placeholder value with at least 32 characters');
  if (!PUBLIC_BASE_URL && !process.env.APP_URL) errors.push('PUBLIC_BASE_URL or APP_URL is required');
  if (!FRONTEND_URL) errors.push('FRONTEND_URL is required');
  if (CORS_ALLOWED_ORIGINS.length === 0) errors.push('CORS_ORIGIN is required');
  if (!GOOGLE_CLIENT_ID || isPlaceholderConfigValue(GOOGLE_CLIENT_ID, ['your-google-client-id.apps.googleusercontent.com'])) errors.push('GOOGLE_CLIENT_ID is required');
  if (!GOOGLE_CLIENT_SECRET || PLACEHOLDER_SECRETS.has(GOOGLE_CLIENT_SECRET) || isPlaceholderConfigValue(GOOGLE_CLIENT_SECRET, ['your-google-client-secret'])) errors.push('GOOGLE_CLIENT_SECRET is required');
  if (!GOOGLE_REDIRECT_URI) errors.push('GOOGLE_REDIRECT_URI is required');
  if (!POLAR_ACCESS_TOKEN || isPlaceholderConfigValue(POLAR_ACCESS_TOKEN, ['polar_oat_xxxxxxxxxxxxxxxxxxxxx'])) errors.push('POLAR_ACCESS_TOKEN is required');
  if (!POLAR_WEBHOOK_SECRET || isPlaceholderConfigValue(POLAR_WEBHOOK_SECRET, ['whsec_xxxxxxxxxxxxxxxxxxxxx', 'polar_whsec_xxxxxxxxxxxxxxxxxxxxx'])) errors.push('POLAR_WEBHOOK_SECRET is required');
  if (isPlaceholderConfigValue(POLAR_ONE_TIME_PRODUCT_ID) || !isPolarProductId(POLAR_ONE_TIME_PRODUCT_ID)) errors.push('POLAR_ONE_TIME_PRODUCT_ID must be a valid Polar product UUID');
  if (isPlaceholderConfigValue(POLAR_MONTHLY_PRODUCT_ID) || !isPolarProductId(POLAR_MONTHLY_PRODUCT_ID)) errors.push('POLAR_MONTHLY_PRODUCT_ID must be a valid Polar product UUID');
  if (!isPolarCheckoutUrl(POLAR_ONE_TIME_CHECKOUT_URL)) errors.push('POLAR_ONE_TIME_CHECKOUT_URL must be a valid Polar checkout link');
  if (!isPolarCheckoutUrl(POLAR_MONTHLY_CHECKOUT_URL)) errors.push('POLAR_MONTHLY_CHECKOUT_URL must be a valid Polar checkout link');
  if (POLAR_CHECKOUT_CURRENCY !== 'krw') errors.push('POLAR_CHECKOUT_CURRENCY must be krw');
  if (COOKIE_SECURE !== true) errors.push('COOKIE_SECURE must be true in production');
  return errors;
}

const STARTUP_CONFIG_ERRORS = productionConfigErrors();
if (STARTUP_CONFIG_ERRORS.length > 0) {
  throw new Error(`Production configuration is not launch-ready: ${STARTUP_CONFIG_ERRORS.join('; ')}`);
}

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!IS_PRODUCTION && CORS_ALLOWED_ORIGINS.length === 0) return callback(null, true);
  if (!origin) return callback(null, true);
  const normalizedOrigin = origin.replace(/\/$/, '');
  return callback(null, CORS_ALLOWED_ORIGINS.includes(normalizedOrigin));
}

// --- Middleware ---
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RequestWithRawBody).rawBody = Buffer.from(buf);
  },
}));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface SessionRecord {
  id: string;
  user: UserProfile;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

interface PremiumRecord {
  email: string;
  oneTimePasses: number;
  subscriptionExpiresAt?: string;
  plan?: 'one_time' | 'monthly' | 'unknown';
  productIds: string[];
  eventIds: string[];
  updatedAt: string;
}

interface AuthStore {
  sessions: Record<string, SessionRecord>;
  premiumByEmail: Record<string, PremiumRecord>;
  polarWebhookEvents: Record<string, { type: string; email?: string; processedAt: string }>;
}

interface PremiumStatus {
  isPremium: boolean;
  plan: 'one_time' | 'monthly' | 'unknown' | 'admin' | null;
  expiresAt: string | null;
  oneTimePasses: number;
}

interface UsageInfo {
  allowed: boolean;
  remaining: number;
  used: number;
  dailyLimit: number;
  unlimited?: boolean;
}

interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface PremiumRequest extends Request {
  sessionRecord?: SessionRecord | null;
  premiumStatus?: PremiumStatus;
}

interface PremiumTrialRequest extends PremiumRequest {
  trialUsage?: UsageInfo;
}

interface AdminRequest extends Request {
  adminSession?: SessionRecord;
}

interface AdminAuditRecord {
  id: string;
  createdAt: string;
  actorEmail: string;
  action: 'premium.grant' | 'premium.revoke' | 'premium.adjust';
  targetEmail: string;
  before: PremiumStatus;
  after: PremiumStatus;
  reason: string;
}

function defaultAuthStore(): AuthStore {
  return { sessions: {}, premiumByEmail: {}, polarWebhookEvents: {} };
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readAuthStore(): AuthStore {
  try {
    if (!fs.existsSync(AUTH_STORE_PATH)) return defaultAuthStore();
    const parsed = JSON.parse(fs.readFileSync(AUTH_STORE_PATH, 'utf8')) as Partial<AuthStore>;
    return {
      sessions: parsed.sessions || {},
      premiumByEmail: parsed.premiumByEmail || {},
      polarWebhookEvents: parsed.polarWebhookEvents || {},
    };
  } catch (err) {
    console.error('[AUTH] Failed to read auth store:', err instanceof Error ? err.message : err);
    return defaultAuthStore();
  }
}

function writeAuthStore(store: AuthStore) {
  ensureParentDir(AUTH_STORE_PATH);
  const tempPath = `${AUTH_STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tempPath, AUTH_STORE_PATH);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeLine(value: string, maxLength: number): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, Math.max(1, maxLength));
}

function sanitizeMessage(value: string, maxLength: number): string {
  return value
    .replace(/\r/g, '')
    .trim()
    .slice(0, Math.max(1, maxLength));
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br/>');
}

function contactTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

function signValue(value: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function signedCookieValue(value: string): string {
  return `${value}.${signValue(value)}`;
}

function verifySignedCookieValue(signedValue?: string): string | null {
  if (!signedValue) return null;
  const separatorIndex = signedValue.lastIndexOf('.');
  if (separatorIndex <= 0) return null;
  const value = signedValue.slice(0, separatorIndex);
  const signature = signedValue.slice(separatorIndex + 1);
  const expected = signValue(value);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer) ? value : null;
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || '';
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [name, ...valueParts] = part.trim().split('=');
    if (!name || valueParts.length === 0) return cookies;
    cookies[name] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

function cookieOptions(maxAgeMs = SESSION_TTL_MS): string {
  const options = [
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (COOKIE_SECURE) options.push('Secure');
  return options.join('; ');
}

function setSignedCookie(res: Response, name: string, value: string, maxAgeMs = SESSION_TTL_MS) {
  res.append('Set-Cookie', `${name}=${encodeURIComponent(signedCookieValue(value))}; ${cookieOptions(maxAgeMs)}`);
}

function clearCookie(res: Response, name: string) {
  res.append('Set-Cookie', `${name}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`);
}

function getRequestBaseUrl(req: Request): string {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function getGoogleRedirectUri(req: Request): string {
  return GOOGLE_REDIRECT_URI || `${getRequestBaseUrl(req)}/api/auth/callback`;
}

function getSafeRedirectPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;
  return value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

function getFrontendRedirectUrl(req: Request, pathValue: string): string {
  const frontendBaseUrl = (FRONTEND_URL || getRequestBaseUrl(req)).replace(/\/$/, '');
  return `${frontendBaseUrl}${pathValue}`;
}

function createSession(user: UserProfile): SessionRecord {
  const store = readAuthStore();
  const now = Date.now();
  const session: SessionRecord = {
    id: nanoid(32),
    user: { ...user, email: normalizeEmail(user.email) },
    createdAt: now,
    updatedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  store.sessions[session.id] = session;
  writeAuthStore(store);
  return session;
}

function getSessionFromRequest(req: Request): SessionRecord | null {
  const sessionId = verifySignedCookieValue(parseCookies(req)[SESSION_COOKIE_NAME]);
  if (!sessionId) return null;
  const store = readAuthStore();
  const session = store.sessions[sessionId];
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    delete store.sessions[sessionId];
    writeAuthStore(store);
    return null;
  }
  return session;
}

function deleteSession(req: Request) {
  const sessionId = verifySignedCookieValue(parseCookies(req)[SESSION_COOKIE_NAME]);
  if (!sessionId) return;
  const store = readAuthStore();
  if (store.sessions[sessionId]) {
    delete store.sessions[sessionId];
    writeAuthStore(store);
  }
}

function getPremiumStatusForEmail(email?: string): PremiumStatus {
  if (!email) {
    return { isPremium: false, plan: null, expiresAt: null, oneTimePasses: 0 };
  }
  if (isAdminEmail(email)) {
    return { isPremium: true, plan: 'admin', expiresAt: null, oneTimePasses: 0 };
  }
  const record = readAuthStore().premiumByEmail[normalizeEmail(email)];
  if (!record) {
    return { isPremium: false, plan: null, expiresAt: null, oneTimePasses: 0 };
  }
  const subscriptionActive = record.subscriptionExpiresAt ? Date.parse(record.subscriptionExpiresAt) > Date.now() : false;
  const hasOneTimePass = (record.oneTimePasses || 0) > 0;
  return {
    isPremium: subscriptionActive || hasOneTimePass,
    plan: subscriptionActive ? 'monthly' : hasOneTimePass ? 'one_time' : record.plan || null,
    expiresAt: subscriptionActive ? record.subscriptionExpiresAt || null : null,
    oneTimePasses: Math.max(0, record.oneTimePasses || 0),
  };
}

function consumeOneTimePassForEmail(email?: string) {
  if (!email) return;
  if (isAdminEmail(email)) return;
  const store = readAuthStore();
  const key = normalizeEmail(email);
  const record = store.premiumByEmail[key];
  if (!record) return;
  const subscriptionActive = record.subscriptionExpiresAt ? Date.parse(record.subscriptionExpiresAt) > Date.now() : false;
  if (!subscriptionActive && record.oneTimePasses > 0) {
    record.oneTimePasses -= 1;
    record.updatedAt = new Date().toISOString();
    writeAuthStore(store);
  }
}

function consumeOneTimePassForRequest(req: PremiumRequest) {
  consumeOneTimePassForEmail(req.sessionRecord?.user.email);
}


function isAdminEmail(email?: string): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(normalizeEmail(email)));
}

function requireAdmin(req: AdminRequest, res: Response, next: () => void) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: '관리자 로그인이 필요합니다.', code: 'LOGIN_REQUIRED' });
  }
  if (!isAdminEmail(session.user.email)) {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.', code: 'ADMIN_REQUIRED' });
  }
  req.adminSession = session;
  next();
}

function publicPremiumRecord(email: string) {
  return {
    email: normalizeEmail(email),
    status: getPremiumStatusForEmail(email),
    record: readAuthStore().premiumByEmail[normalizeEmail(email)] || null,
  };
}

function appendAdminAudit(record: AdminAuditRecord) {
  ensureParentDir(ADMIN_AUDIT_LOG_PATH);
  fs.appendFileSync(ADMIN_AUDIT_LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8');
}

function readAdminAuditLogs(limit = 50): AdminAuditRecord[] {
  try {
    if (!fs.existsSync(ADMIN_AUDIT_LOG_PATH)) return [];
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return fs.readFileSync(ADMIN_AUDIT_LOG_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-safeLimit)
      .reverse()
      .map((line) => JSON.parse(line) as AdminAuditRecord);
  } catch (err) {
    console.error('[ADMIN] Failed to read audit log:', err instanceof Error ? err.message : err);
    return [];
  }
}

function collectAdminUsers() {
  const store = readAuthStore();
  const byEmail = new Map<string, { email: string; name: string | null; sessionCount: number; premium: PremiumStatus; updatedAt: string | null }>();

  for (const session of Object.values(store.sessions)) {
    const email = normalizeEmail(session.user.email);
    const existing = byEmail.get(email) || {
      email,
      name: session.user.name || null,
      sessionCount: 0,
      premium: getPremiumStatusForEmail(email),
      updatedAt: null,
    };
    existing.sessionCount += 1;
    existing.name = existing.name || session.user.name || null;
    existing.updatedAt = new Date(Math.max(Date.parse(existing.updatedAt || '0') || 0, session.updatedAt || session.createdAt)).toISOString();
    byEmail.set(email, existing);
  }

  for (const [email, record] of Object.entries(store.premiumByEmail)) {
    const normalized = normalizeEmail(email);
    const existing = byEmail.get(normalized) || {
      email: normalized,
      name: null,
      sessionCount: 0,
      premium: getPremiumStatusForEmail(normalized),
      updatedAt: null,
    };
    existing.premium = getPremiumStatusForEmail(normalized);
    existing.updatedAt = record.updatedAt || existing.updatedAt;
    byEmail.set(normalized, existing);
  }

  return Array.from(byEmail.values()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function adminGrantPremium(targetEmail: string, plan: 'one_time' | 'monthly', reason: string, oneTimePasses?: number, subscriptionExpiresAt?: string) {
  const store = readAuthStore();
  const email = normalizeEmail(targetEmail);
  const now = new Date();
  const existing = store.premiumByEmail[email] || {
    email,
    oneTimePasses: 0,
    productIds: [],
    eventIds: [],
    updatedAt: now.toISOString(),
  } satisfies PremiumRecord;

  if (plan === 'monthly') {
    existing.subscriptionExpiresAt = subscriptionExpiresAt && !Number.isNaN(Date.parse(subscriptionExpiresAt))
      ? new Date(subscriptionExpiresAt).toISOString()
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    existing.plan = 'monthly';
  } else {
    existing.oneTimePasses = Math.max(1, oneTimePasses || 1);
    existing.plan = 'one_time';
  }
  existing.updatedAt = now.toISOString();
  if (!existing.eventIds.includes(`admin:${reason}`)) existing.eventIds.push(`admin:${reason}`);
  store.premiumByEmail[email] = existing;
  writeAuthStore(store);
  return getPremiumStatusForEmail(email);
}

function adminRevokePremium(targetEmail: string) {
  const store = readAuthStore();
  const email = normalizeEmail(targetEmail);
  const existing = store.premiumByEmail[email] || {
    email,
    oneTimePasses: 0,
    productIds: [],
    eventIds: [],
    updatedAt: new Date().toISOString(),
  } satisfies PremiumRecord;
  existing.oneTimePasses = 0;
  existing.subscriptionExpiresAt = undefined;
  existing.plan = 'unknown';
  existing.updatedAt = new Date().toISOString();
  store.premiumByEmail[email] = existing;
  writeAuthStore(store);
  return getPremiumStatusForEmail(email);
}

function requirePremium(req: PremiumTrialRequest, res: Response, next: () => void) {
  const session = getSessionFromRequest(req);
  const premium = getPremiumStatusForEmail(session?.user.email);
  const isAdmin = isAdminEmail(session?.user.email);
  if (isAdmin || premium.isPremium) {
    req.sessionRecord = session;
    req.premiumStatus = premium;
    return next();
  }

  if (req.path === '/api/convert/hwp-to-pdf') {
    req.sessionRecord = session;
    req.premiumStatus = premium;
    return next();
  }

  const usage = consumeFreeUsageForRequest(req);
  if (!usage.allowed) {
    console.warn('[PREMIUM] free trial blocked', {
      path: req.path,
      hasSession: Boolean(session),
      email: session?.user.email || null,
      isAdmin,
      isPremium: premium.isPremium,
      plan: premium.plan,
      oneTimePasses: premium.oneTimePasses,
      expiresAt: premium.expiresAt,
    });
    return res.status(429).json({
      error: '오늘 무료 이용 횟수를 모두 사용했습니다. 내일 다시 이용하거나 결제 후 이용해주세요.',
      code: 'FREE_DAILY_LIMIT_EXCEEDED',
      dailyLimit: usage.dailyLimit,
      used: usage.used,
      remaining: usage.remaining,
    });
  }

  req.sessionRecord = session;
  req.premiumStatus = premium;
  req.trialUsage = usage;
  next();
}

function commandAvailable(command: string, args: string[] = ['--version']): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function expectJsonResponse(response: globalThis.Response, context: string): Promise<any> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${context} failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${context} did not return JSON: ${text.slice(0, 300)}`);
  }
}

async function convertHwpToPdfWithHancomDocsconverter(inputPath: string, outputPath: string) {
  if (!HANCOM_DOCSCONVERTER_ENABLED) {
    throw new Error('Hancom docsconverter is disabled by HANCOM_DOCSCONVERTER_ENABLED=false');
  }

  const baseUrl = HANCOM_DOCSCONVERTER_BASE_URL.replace(/\/$/, '');
  const originalName = path.basename(inputPath);
  const sourceBytes = fs.readFileSync(inputPath);
  const form = new FormData();
  form.append('file', new Blob([sourceBytes]), originalName);

  const uploadResponse = await fetch(`${baseUrl}/rest/upload_file`, {
    method: 'POST',
    body: form,
  });
  const uploadJson = await expectJsonResponse(uploadResponse, 'Hancom docsconverter upload');
  if (uploadJson?.code !== '0000' || !uploadJson?.upload_file_path) {
    throw new Error(`Hancom docsconverter upload failed: ${JSON.stringify(uploadJson).slice(0, 500)}`);
  }

  const convertUrl = `${baseUrl}/hwp/doc2pdf?file_path=${encodeURIComponent(uploadJson.upload_file_path)}`;
  const convertResponse = await fetch(convertUrl, { method: 'GET' });
  const convertJson = await expectJsonResponse(convertResponse, 'Hancom docsconverter doc2pdf');
  const result = convertJson?.docsconverter?.result;
  const resourcePath = convertJson?.docsconverter?.file?.resource_file?.[0];
  if (result?.code !== '0000' || !resourcePath) {
    throw new Error(`Hancom docsconverter doc2pdf failed: ${JSON.stringify(convertJson).slice(0, 500)}`);
  }

  const downloadUrl = resourcePath.startsWith('http') ? resourcePath : `${baseUrl}${resourcePath}`;
  const pdfResponse = await fetch(downloadUrl, { method: 'GET' });
  if (!pdfResponse.ok) {
    throw new Error(`Hancom docsconverter PDF download failed: HTTP ${pdfResponse.status}`);
  }
  const contentType = pdfResponse.headers.get('content-type') || '';
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  if (!contentType.includes('application/pdf') && !pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(`Hancom docsconverter download was not application/pdf: ${contentType}`);
  }
  if (pdfBytes.length === 0) {
    throw new Error('Hancom docsconverter returned an empty PDF');
  }
  fs.writeFileSync(outputPath, pdfBytes);
}

function materializeSvgDataUriImages(svgPath: string, assetDir: string): string {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const dataUriPattern = /\b((?:xlink:)?href)=(['"])data:image\/(png|jpe?g|gif|webp);base64,([^'"]+)\2/gi;
  let imageIndex = 0;
  let replaced = false;

  const rewrittenSvg = svg.replace(dataUriPattern, (_match, attrName: string, quote: string, ext: string, base64Data: string) => {
    fs.mkdirSync(assetDir, { recursive: true });
    const normalizedExt = ext.toLowerCase() === 'jpeg' ? 'jpg' : ext.toLowerCase();
    const imageBuffer = Buffer.from(base64Data.replace(/\s+/g, ''), 'base64');
    const imagePath = path.join(assetDir, `image_${String(++imageIndex).padStart(3, '0')}.${normalizedExt}`);
    fs.writeFileSync(imagePath, imageBuffer);
    replaced = true;
    return `${attrName}=${quote}${imagePath}${quote}`;
  });

  if (!replaced) return svgPath;

  const sanitizedSvgPath = path.join(assetDir, path.basename(svgPath));
  fs.writeFileSync(sanitizedSvgPath, rewrittenSvg, 'utf8');
  return sanitizedSvgPath;
}

function getSvgDimensions(svgPath: string): { width: number; height: number } {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const widthMatch = svg.match(/<svg[^>]*\bwidth="([0-9.]+)(?:px)?"/i);
  const heightMatch = svg.match(/<svg[^>]*\bheight="([0-9.]+)(?:px)?"/i);
  if (widthMatch && heightMatch) {
    return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
  }
  const viewBoxMatch = svg.match(/<svg[^>]*\bviewBox="\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*"/i);
  if (viewBoxMatch) {
    return { width: Number(viewBoxMatch[1]), height: Number(viewBoxMatch[2]) };
  }
  return { width: 793.7066666666667, height: 1122.5066666666667 };
}

function createSvgPrintWrapperHtml(svgPath: string, width: number, height: number): string {
  const rawSvg = fs.readFileSync(svgPath, 'utf8');
  const inlineSvg = rawSvg.replace(/<svg\b/i, `<svg style="display:block;width:${width}px;height:${height}px"`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden}svg{display:block;width:${width}px!important;height:${height}px!important}</style></head><body>${inlineSvg}</body></html>`;
}

function countSvgTextElements(svgPath: string): number {
  const svg = fs.readFileSync(svgPath, 'utf8');
  return (svg.match(/<text\b/gi) || []).length;
}

function countPdfExtractableTextChars(pdfPath: string): number | null {
  try {
    const stdout = execFileSync(PDFTOTEXT_PATH, ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.replace(/\s+/g, '').length;
  } catch {
    return null;
  }
}

async function renderSvgPageToPdfWithChrome(svgPath: string, pagePdfPath: string, workDir: string) {
  const { width, height } = getSvgDimensions(svgPath);
  const wrapperPath = path.join(workDir, `${path.basename(svgPath, '.svg')}.print.html`);
  fs.writeFileSync(wrapperPath, createSvgPrintWrapperHtml(svgPath, width, height), 'utf8');
  await execFileAsync(CHROME_PATH, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--print-to-pdf-no-header',
    `--print-to-pdf=${pagePdfPath}`,
    pathToFileURL(wrapperPath).href,
  ], { timeout: 60000 });
  if (!fs.existsSync(pagePdfPath) || fs.statSync(pagePdfPath).size === 0) {
    throw new Error(`Chrome SVG→PDF 변환 결과를 찾을 수 없습니다: ${path.basename(svgPath)}`);
  }
}

async function convertHwpToPdfWithRhwpSvg(inputPath: string, jobDir: string, outputPath: string) {
  const svgDir = path.join(jobDir, 'rhwp-svg');
  const pagePdfDir = path.join(jobDir, 'rhwp-page-pdf');
  fs.mkdirSync(svgDir, { recursive: true });
  fs.mkdirSync(pagePdfDir, { recursive: true });

  await execFileAsync(RHWP_PATH, ['export-svg', inputPath, '-o', svgDir, '--font-style', '--embed-fonts'], {
    timeout: 120000,
    env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' },
  });

  const svgFiles = fs.readdirSync(svgDir)
    .filter((name) => name.toLowerCase().endsWith('.svg'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(svgDir, name));

  if (svgFiles.length === 0) {
    throw new Error('rhwp SVG 렌더링 결과를 찾을 수 없습니다.');
  }

  const sourceSvgTextElementCount = svgFiles.reduce((sum, svgPath) => sum + countSvgTextElements(svgPath), 0);

  // Prefer PyMuPDF reconstruction so per-glyph rhwp SVG text remains searchable.
  // Chrome print-to-pdf keeps visuals but often splits words (APPLICATION -> APPLI CATI ON).
  if (fs.existsSync(SVG_TO_SEARCHABLE_PDF_SCRIPT_PATH)) {
    try {
      console.log(`[METHOD3] Trying searchable SVG→PDF via PyMuPDF jobDir=${path.basename(jobDir)}`);
      await execFileAsync(PYTHON_PATH, [
        SVG_TO_SEARCHABLE_PDF_SCRIPT_PATH,
        svgDir,
        '-o', outputPath,
      ], {
        timeout: 120000,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' },
      });
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        if (sourceSvgTextElementCount > 0) {
          const textCharCount = countPdfExtractableTextChars(outputPath);
          if (textCharCount !== null && textCharCount === 0) {
            throw new Error('searchable SVG→PDF produced an empty-text PDF');
          }
        }
        return;
      }
      throw new Error('searchable SVG→PDF output missing');
    } catch (searchableErr) {
      console.warn(`[METHOD3] searchable SVG→PDF failed: ${searchableErr instanceof Error ? searchableErr.message : searchableErr}; falling back to Chrome/ImageMagick`);
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* skip */ }
    }
  }

  const pagePdfPaths: string[] = [];
  for (const [index, svgPath] of svgFiles.entries()) {
    const pagePdfPath = path.join(pagePdfDir, `page_${String(index + 1).padStart(3, '0')}.pdf`);
    const svgAssetDir = path.join(pagePdfDir, `page_${String(index + 1).padStart(3, '0')}_assets`);
    const renderableSvgPath = materializeSvgDataUriImages(svgPath, svgAssetDir);
    try {
      await renderSvgPageToPdfWithChrome(renderableSvgPath, pagePdfPath, svgAssetDir);
    } catch (chromeErr) {
      console.warn(`[METHOD2] Chrome SVG→PDF failed for ${path.basename(svgPath)}: ${chromeErr instanceof Error ? chromeErr.message : chromeErr}; falling back to ImageMagick`);
      await execFileAsync(IMAGEMAGICK_PATH, ['-density', '96', renderableSvgPath, pagePdfPath], { timeout: 60000 });
    }
    if (!fs.existsSync(pagePdfPath) || fs.statSync(pagePdfPath).size === 0) {
      throw new Error(`ImageMagick SVG→PDF 변환 결과를 찾을 수 없습니다: ${path.basename(svgPath)}`);
    }
    pagePdfPaths.push(pagePdfPath);
  }

  await execFileAsync(PDFUNITE_PATH, [...pagePdfPaths, outputPath], { timeout: 120000 });
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('pdfunite 병합 PDF 생성에 실패했습니다.');
  }

  if (sourceSvgTextElementCount > 0) {
    const textCharCount = countPdfExtractableTextChars(outputPath);
    if (textCharCount !== null && textCharCount === 0) {
      throw new Error('rhwp SVG HWP→PDF 결과가 이미지-only PDF입니다. 텍스트 PDF를 유지하기 위해 fallback을 실패 처리합니다.');
    }
  }
}

function qpdfUnavailableResponse(res: Response) {
  return res.status(503).json({
    error: 'PDF 암호 설정/해제 기능은 현재 서버에 qpdf가 설치되어 있지 않아 사용할 수 없습니다. 관리자에게 qpdf 설치를 요청해주세요.',
    code: 'QPDF_UNAVAILABLE',
  });
}

function ghostscriptUnavailableResponse(res: Response) {
  return res.status(503).json({
    error: 'PDF 압축 기능은 현재 서버에 Ghostscript가 설치되어 있지 않아 사용할 수 없습니다. 관리자에게 ghostscript 설치 또는 Docker 이미지 재빌드를 요청해주세요.',
    code: 'GHOSTSCRIPT_UNAVAILABLE',
  });
}

function pdfToHwpUnavailableResponse(res: Response, missing: string[]) {
  return res.status(503).json({
    error: `PDF → HWP 변환에 필요한 서버 구성요소가 없습니다: ${missing.join(', ')}. 관리자에게 rhwp-ingest-exporter/poppler-utils 설치 또는 Docker 이미지 재빌드를 요청해주세요.`,
    code: 'PDF_TO_HWP_UNAVAILABLE',
    missing,
  });
}

function pdfToDocxUnavailableResponse(res: Response, missing: string[]) {
  return res.status(503).json({
    error: `PDF → DOCX 변환에 필요한 서버 구성요소가 없습니다: ${missing.join(', ')}. 관리자에게 pdf2docx 설치 또는 Docker 이미지 재빌드를 요청해주세요.`,
    code: 'PDF_TO_DOCX_UNAVAILABLE',
    missing,
  });
}

function isHwp5File(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const signature = fs.readFileSync(filePath).subarray(0, 8);
  return signature.equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]));
}

function isDocxFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const data = fs.readFileSync(filePath);
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4B) return false;
  const zipText = data.toString('latin1');
  return zipText.includes('[Content_Types].xml') && zipText.includes('word/document.xml');
}

function splitPdfTextPages(text: string): string[] {
  const pages = text
    .split('\f')
    .map((page) => page.replace(/\r\n/g, '\n').trim())
    .filter((page) => page.length > 0);
  return pages.length > 0 ? pages : ['PDF에서 추출 가능한 텍스트가 없습니다. 스캔 이미지 PDF는 OCR 단계가 필요합니다.'];
}

interface PdfPageImage {
  id: string;
  natural_w: number;
  natural_h: number;
}

function getPngDimensions(filePath: string): { width: number; height: number } {
  const png = fs.readFileSync(filePath);
  const signature = png.subarray(0, 8);
  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
    throw new Error(`${path.basename(filePath)} 파일이 PNG 형식이 아닙니다.`);
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function listRenderedPdfPageImages(jobDir: string): PdfPageImage[] {
  return fs.readdirSync(jobDir)
    .filter((name) => /^page-\d+\.png$/i.test(name) || /^page\d+\.png$/i.test(name) || /^page\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => {
      const dimensions = getPngDimensions(path.join(jobDir, name));
      return {
        id: name,
        natural_w: dimensions.width,
        natural_h: dimensions.height,
      };
    });
}

function createRhwpIngestFromPdfPageImages(images: PdfPageImage[]) {
  return {
    version: '1',
    page_size: DEFAULT_HWP_PAGE_SIZE_MM,
    default_font: '함초롬바탕',
    questions: images.map((image, index) => ({
      number: index + 1,
      stem: '',
      auto_number: false,
      stem_blocks: [
        {
          type: 'image',
          ref: image.id,
          placement: 'between',
        },
      ],
      choices: [],
      media: [
        {
          id: image.id,
          natural_w: image.natural_w,
          natural_h: image.natural_h,
          target_w_mm: 170,
          placement: 'between',
        },
      ],
    })),
  };
}

const DEFAULT_HWP_PAGE_SIZE_MM = { width_mm: 210, height_mm: 297 };

function pxToMm(value: number): number {
  return Number(((value * 25.4) / 96).toFixed(3));
}

function pageSizePxToMm(pageSize: { width: number; height: number }) {
  const widthMm = pxToMm(pageSize.width);
  const heightMm = pxToMm(pageSize.height);
  return {
    width_mm: widthMm > 0 ? widthMm : DEFAULT_HWP_PAGE_SIZE_MM.width_mm,
    height_mm: heightMm > 0 ? heightMm : DEFAULT_HWP_PAGE_SIZE_MM.height_mm,
  };
}

function createRhwpIngestFromPdfText(pages: string[], pageSize = DEFAULT_HWP_PAGE_SIZE_MM) {
  const toTextBlocks = (text: string, index: number) => {
    const lines = text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd());
    const blocks = lines
      .filter((line) => line.trim().length > 0)
      .map((line) => ({ type: 'text', text: line }));
    if (pages.length > 1) {
      blocks.unshift({ type: 'text', text: `[${index + 1}페이지]` });
    }
    return blocks.length > 0
      ? blocks
      : [{ type: 'text', text: 'PDF에서 추출 가능한 텍스트가 없습니다. 스캔 이미지 PDF는 OCR 단계가 필요합니다.' }];
  };

  return {
    version: '1',
    page_size: pageSize,
    default_font: '함초롬바탕',
    questions: pages.map((text, index) => {
      const stemBlocks = toTextBlocks(text, index);
      const stem = stemBlocks.map((block) => block.text).join('\n');
      return {
        number: index + 1,
        stem,
        auto_number: false,
        stem_blocks: stemBlocks,
        choices: [],
        media: [],
      };
    }),
  };
}

interface PdfHtmlFontSpec {
  id: string;
  size: number;
  family: string;
  color: string;
}

interface PdfLayoutTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  baseline?: number;
  natural_width?: number;
  font_family: string;
  font_size: number;
  bold: boolean;
  color: string;
}

interface PdfLayoutImage extends PdfPageImage {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfLayoutPage {
  width: number;
  height: number;
  background?: PdfPageImage;
  images: PdfLayoutImage[];
  lines: PdfLayoutTextLine[];
  boxes: Array<{ x: number; y: number; width: number; height: number; stroke?: string; fill?: string; stroke_width?: number }>;
  tables?: PdfLayoutTable[];
}

interface PdfLayoutTableCell {
  row: number;
  col: number;
  row_span: number;
  col_span: number;
  text: string;
  font_family?: string;
  font_size?: number;
  bold?: boolean;
  color?: string;
  style?: { stroke?: string; fill?: string };
}

interface PdfLayoutTable {
  x: number;
  y: number;
  width: number;
  height: number;
  columns: number[];
  row_heights: number[];
  cells: PdfLayoutTableCell[];
}

type PdfLayoutIngest = ReturnType<typeof createRhwpIngestFromPdfText> & {
  pdf_layout?: { unit: string; visual_mode?: string; pages: PdfLayoutPage[] };
};

function groupPdfLinesByY(lines: PdfLayoutTextLine[], tolerance = 6): PdfLayoutTextLine[][] {
  const groups: PdfLayoutTextLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const group = groups.find((candidate) => Math.abs(candidate[0].y - line.y) <= tolerance);
    if (group) group.push(line);
    else groups.push([line]);
  }
  return groups.map((group) => group.sort((a, b) => a.x - b.x));
}

function inferTableBoxesFromPdfLines(lines: PdfLayoutTextLine[]) {
  const boxes: PdfLayoutPage['boxes'] = [];
  const rowGroups = groupPdfLinesByY(lines)
    .filter((group) => group.some((line) => line.text.trim().length > 0))
    .sort((a, b) => a[0].y - b[0].y);

  for (let i = 0; i < rowGroups.length; i += 1) {
    const header = rowGroups[i];
    if (header.length < 2) continue;

    const headerHeight = Math.max(...header.map((line) => line.height));
    const nearbyRows = rowGroups
      .slice(i, i + 8)
      .filter((group, idx, arr) => {
        if (idx === 0) return true;
        const previous = arr[idx - 1][0];
        const gap = group[0].y - previous.y;
        return gap > 0 && gap < headerHeight * 3.2;
      });
    if (nearbyRows.length < 2) continue;

    const allRowLines = nearbyRows.flat();
    const padX = Math.max(5, headerHeight * 0.35);
    const padY = Math.max(4, headerHeight * 0.25);
    const tableLeft = Math.max(0, Math.min(...header.map((line) => line.x)) - padX);
    const tableRight = Math.max(...allRowLines.map((line) => line.x + line.width)) + padX;

    const sortedHeader = [...header].sort((a, b) => a.x - b.x);
    const colBounds = [tableLeft];
    for (let c = 0; c < sortedHeader.length - 1; c += 1) {
      colBounds.push((sortedHeader[c].x + sortedHeader[c].width + sortedHeader[c + 1].x) / 2);
    }
    colBounds.push(tableRight);
    if (colBounds.length < 3 || colBounds.some((value, idx) => idx > 0 && value <= colBounds[idx - 1])) continue;

    const rowBounds = [Math.max(0, nearbyRows[0][0].y - padY)];
    for (let r = 0; r < nearbyRows.length - 1; r += 1) {
      const current = nearbyRows[r][0];
      const next = nearbyRows[r + 1][0];
      rowBounds.push((current.y + current.height + next.y) / 2);
    }
    const lastRow = nearbyRows[nearbyRows.length - 1];
    rowBounds.push(Math.max(...lastRow.map((line) => line.y + line.height)) + padY);

    for (let r = 0; r < rowBounds.length - 1; r += 1) {
      for (let c = 0; c < colBounds.length - 1; c += 1) {
        boxes.push({
          x: colBounds[c],
          y: rowBounds[r],
          width: colBounds[c + 1] - colBounds[c],
          height: rowBounds[r + 1] - rowBounds[r],
          stroke: '#000000',
        });
      }
    }
    i += nearbyRows.length - 1;
  }

  return boxes;
}

function parseXmlAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([\w:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(value)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function resolveOdtHref(rootDir: string, href: string): string | null {
  if (!href || href.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(href) || path.isAbsolute(href)) {
    return null;
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, href);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(parseInt(code, 16)));
}

function odfLengthToPx(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(in|cm|mm|pt|px)?$/i);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = (match[2] || 'px').toLowerCase();
  if (!Number.isFinite(amount)) return fallback;
  switch (unit) {
    case 'in': return amount * 96;
    case 'cm': return amount * 96 / 2.54;
    case 'mm': return amount * 96 / 25.4;
    case 'pt': return amount * 96 / 72;
    case 'px':
    default:
      return amount;
  }
}

function odfLengthToPt(value: string | undefined, fallback = 12): number {
  if (!value) return fallback;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(in|cm|mm|pt|px)?$/i);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = (match[2] || 'pt').toLowerCase();
  if (!Number.isFinite(amount)) return fallback;
  switch (unit) {
    case 'in': return amount * 72;
    case 'cm': return amount * 72 / 2.54;
    case 'mm': return amount * 72 / 25.4;
    case 'px': return amount * 72 / 96;
    case 'pt':
    default:
      return amount;
  }
}

function decodeOdfText(value: string): string {
  return decodeXmlEntities(value
    .replace(/<text:s\b[^>]*text:c="(\d+)"[^>]*\/>/g, (_m, count) => ' '.repeat(Number(count) || 1))
    .replace(/<text:s\b[^>]*\/>/g, ' ')
    .replace(/<text:tab\b[^>]*\/>/g, '\t')
    .replace(/<text:line-break\b[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function parseOdtTextStyles(xml: string): Map<string, { font_family: string; font_size: number; bold: boolean; color: string }> {
  const styles = new Map<string, { font_family: string; font_size: number; bold: boolean; color: string }>();
  const styleRegex = /<style:style\b([^>]*)style:family="text"([^>]*)>([\s\S]*?)<\/style:style>/g;
  let match: RegExpExecArray | null;
  while ((match = styleRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(`${match[1]} ${match[2]}`);
    const name = attrs['style:name'];
    if (!name) continue;
    const propMatch = match[3].match(/<style:text-properties\b([^>]*)\/>/);
    const props = parseXmlAttributes(propMatch?.[1] || '');
    const font = (props['fo:font-family'] || props['style:font-family-asian'] || '함초롬바탕').replace(/&apos;|'/g, '');
    styles.set(name, {
      font_family: decodeXmlEntities(font),
      font_size: odfLengthToPt(props['fo:font-size'] || props['style:font-size-asian'], 12),
      bold: (props['fo:font-weight'] || props['style:font-weight-asian'] || '').toLowerCase() === 'bold',
      color: props['fo:color'] || '#000000',
    });
  }
  return styles;
}

function parseOdtGraphicStyles(xml: string): Map<string, { stroke?: string; fill?: string }> {
  const styles = new Map<string, { stroke?: string; fill?: string }>();
  const styleRegex = /<style:style\b([^>]*)style:family="graphic"([^>]*)>([\s\S]*?)<\/style:style>/g;
  let match: RegExpExecArray | null;
  while ((match = styleRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(`${match[1]} ${match[2]}`);
    const name = attrs['style:name'];
    if (!name) continue;
    const propMatch = match[3].match(/<style:graphic-properties\b([^>]*)\/>/);
    const props = parseXmlAttributes(propMatch?.[1] || '');
    styles.set(name, {
      stroke: props['draw:stroke'] === 'none' ? undefined : (props['svg:stroke-color'] || '#000000'),
      fill: props['draw:fill'] === 'solid' ? (props['draw:fill-color'] || '#FFFFFF') : undefined,
    });
  }
  return styles;
}

interface OdtTableLayoutStyles {
  columns: Map<string, number>;
  rows: Map<string, number>;
  cells: Map<string, { stroke?: string; fill?: string }>;
}

function parseOdtTableLayoutStyles(xml: string): OdtTableLayoutStyles {
  const columns = new Map<string, number>();
  const rows = new Map<string, number>();
  const cells = new Map<string, { stroke?: string; fill?: string }>();
  const styleRegex = /<style:style\b([^>]*)style:family="(table-column|table-row|table-cell)"([^>]*)>([\s\S]*?)<\/style:style>/g;
  let match: RegExpExecArray | null;
  while ((match = styleRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(`${match[1]} ${match[3]}`);
    const name = attrs['style:name'];
    if (!name) continue;
    if (match[2] === 'table-column') {
      const propMatch = match[4].match(/<style:table-column-properties\b([^>]*)\/>/);
      const props = parseXmlAttributes(propMatch?.[1] || '');
      const width = odfLengthToPx(props['style:column-width']);
      if (width > 0) columns.set(name, width);
    } else if (match[2] === 'table-row') {
      const propMatch = match[4].match(/<style:table-row-properties\b([^>]*)\/>/);
      const props = parseXmlAttributes(propMatch?.[1] || '');
      const height = odfLengthToPx(props['style:row-height'] || props['style:min-row-height']);
      if (height > 0) rows.set(name, height);
    } else {
      const propMatch = match[4].match(/<style:table-cell-properties\b([^>]*)\/>/);
      const props = parseXmlAttributes(propMatch?.[1] || '');
      const border = props['fo:border'] || props['fo:border-left'] || props['fo:border-right'] || props['fo:border-top'] || props['fo:border-bottom'];
      const borderColor = border?.match(/#[0-9a-f]{6}/i)?.[0];
      cells.set(name, {
        stroke: border && !/none/i.test(border) ? (borderColor || '#000000') : undefined,
        fill: props['fo:background-color'] && props['fo:background-color'] !== 'transparent' ? props['fo:background-color'] : undefined,
      });
    }
  }
  return { columns, rows, cells };
}

function parseOdtPageSize(stylesXml: string): { width: number; height: number } {
  const pageLayout = stylesXml.match(/<style:page-layout\b[^>]*>[\s\S]*?<style:page-layout-properties\b([^>]*)\/>/);
  const attrs = parseXmlAttributes(pageLayout?.[1] || '');
  return {
    width: odfLengthToPx(attrs['fo:page-width'], 8.2681 * 96),
    height: odfLengthToPx(attrs['fo:page-height'], 11.6929 * 96),
  };
}

interface PdfVectorBoxPage {
  width: number;
  height: number;
  boxes: Array<{ x: number; y: number; width: number; height: number; stroke?: string; fill?: string }>;
  lines: PdfLayoutTextLine[];
}

async function extractPdfVectorBoxes(inputPath: string): Promise<PdfVectorBoxPage[]> {
  const script = String.raw`
import json
import sys

try:
    import fitz
except Exception:
    print(json.dumps([]))
    raise SystemExit(0)

def color_to_hex(color):
    if color is None:
        return None
    if isinstance(color, int):
        return '#%06X' % (color & 0xFFFFFF)
    try:
        r, g, b = color[:3]
    except Exception:
        return None
    return '#%02X%02X%02X' % (round(max(0, min(1, r)) * 255), round(max(0, min(1, g)) * 255), round(max(0, min(1, b)) * 255))

def center_inside(rect, box):
    cx = (rect[0] + rect[2]) / 2
    cy = (rect[1] + rect[3]) / 2
    return box['x'] <= cx <= box['x'] + box['width'] and box['y'] <= cy <= box['y'] + box['height']

pages = []
doc = fitz.open(sys.argv[1])
for page in doc:
    boxes = []
    for drawing in page.get_drawings():
        fill = color_to_hex(drawing.get('fill'))
        stroke = color_to_hex(drawing.get('color'))
        rect = drawing.get('rect')
        if rect is None:
            continue
        width = float(rect.x1 - rect.x0)
        height = float(rect.y1 - rect.y0)
        keep = (width >= 5 and height >= 0.3) or (height >= 5 and width >= 0.3) or (width > 1 and height > 1)
        if not keep:
            continue
        if not fill and not stroke:
            stroke = '#000000'
        boxes.append({
            'x': float(rect.x0),
            'y': float(rect.y0),
            'width': width,
            'height': height,
            'stroke': stroke,
            'fill': fill,
        })
    lines = []
    text = page.get_text('dict')
    for block in text.get('blocks', []):
        if block.get('type') != 0:
            continue
        for line in block.get('lines', []):
            spans = line.get('spans', [])
            content = ''.join(span.get('text', '') for span in spans).strip()
            bbox = line.get('bbox')
            if not content or not bbox or not any(center_inside(bbox, box) for box in boxes if box.get('fill')):
                continue
            span = spans[0] if spans else {}
            lines.append({
                'text': content,
                'x': float(bbox[0]),
                'y': float(bbox[1]),
                'width': float(bbox[2] - bbox[0]),
                'height': float(bbox[3] - bbox[1]),
                'font_family': span.get('font') or 'Helvetica',
                'font_size': float(span.get('size') or max(1, bbox[3] - bbox[1])),
                'bold': bool(span.get('flags', 0) & 16),
                'color': color_to_hex(span.get('color')) or '#000000',
            })
    pages.append({'width': float(page.rect.width), 'height': float(page.rect.height), 'boxes': boxes, 'lines': lines})
print(json.dumps(pages))
`;
  try {
    const { stdout } = await execFileAsync(PYTHON_PATH, ['-c', script, inputPath], { timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
    const parsed = JSON.parse(stdout || '[]') as PdfVectorBoxPage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`[PDF→HWP] PDF vector box extraction skipped: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

function mergePdfVectorBoxes(ingest: PdfLayoutIngest, vectorPages: PdfVectorBoxPage[]) {
  const pages = ingest.pdf_layout?.pages;
  if (!pages || vectorPages.length === 0) return;
  pages.forEach((page, index) => {
    const vectorPage = vectorPages[index];
    if (!vectorPage || vectorPage.width <= 0 || vectorPage.height <= 0) return;
    const sx = page.width / vectorPage.width;
    const sy = page.height / vectorPage.height;
    for (const box of vectorPage.boxes) {
      page.boxes.push({
        x: box.x * sx,
        y: box.y * sy,
        width: box.width * sx,
        height: box.height * sy,
        stroke: box.stroke,
        fill: box.fill,
      });
    }
    for (const line of vectorPage.lines) {
      const recoveredLine = {
        ...line,
        x: line.x * sx,
        y: line.y * sy,
        width: line.width * sx,
        height: line.height * sy,
        font_size: line.font_size * sx,
      };
      const recoveredKey = normalizePdfWord(recoveredLine.text).toLowerCase();
      if (recoveredKey) {
        let bestIndex = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        const recoveredCenterX = recoveredLine.x + recoveredLine.width / 2;
        const recoveredCenterY = recoveredLine.y + recoveredLine.height / 2;
        for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex += 1) {
          const existingLine = page.lines[lineIndex];
          if (normalizePdfWord(existingLine.text).toLowerCase() !== recoveredKey) continue;
          const existingCenterX = existingLine.x + existingLine.width / 2;
          const existingCenterY = existingLine.y + existingLine.height / 2;
          const distance = Math.hypot(existingCenterX - recoveredCenterX, existingCenterY - recoveredCenterY);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = lineIndex;
          }
        }
        const duplicateDistanceThreshold = Math.max(12, recoveredLine.height * 2);
        if (bestIndex >= 0 && bestDistance <= duplicateDistanceThreshold) page.lines.splice(bestIndex, 1);
      }
      page.lines.push(recoveredLine);
    }
  });
}

function parseOdtPlainTextParagraphs(
  xml: string,
  pageSize: { width: number; height: number },
  textStyles: Map<string, { font_family: string; font_size: number; bold: boolean; color: string }>,
): PdfLayoutTextLine[] {
  const lines: PdfLayoutTextLine[] = [];
  const rawParagraphs: Array<{ text: string; style: { font_family: string; font_size: number; bold: boolean; color: string } }> = [];
  const paragraphRegex = /<text:p\b([^>]*)>([\s\S]*?)<\/text:p>/g;
  let paragraphMatch: RegExpExecArray | null;
  while ((paragraphMatch = paragraphRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(paragraphMatch[1]);
    const body = paragraphMatch[2];
    const text = decodeOdfText(body);
    if (!text) continue;
    const spanStyle = body.match(/<text:span\b[^>]*text:style-name="([^"]+)"/)?.[1];
    const style = (spanStyle && textStyles.get(spanStyle)) || (attrs['text:style-name'] && textStyles.get(attrs['text:style-name'])) || {
      font_family: '함초롬바탕',
      font_size: 12,
      bold: false,
      color: '#000000',
    };
    rawParagraphs.push({ text, style });
  }

  // Preserve the paragraph order produced by LibreOffice DOCX→ODT.  Real-world
  // Korean certificate PDFs often arrive here already in visual top-down order;
  // forcing a reverse breaks those documents.
  let y = 80;
  for (const paragraph of rawParagraphs) {
    const height = Math.max(14, paragraph.style.font_size * 1.35);
    lines.push({
      text: paragraph.text,
      x: 72,
      y,
      width: Math.max(1, pageSize.width - 144),
      height,
      font_family: paragraph.style.font_family,
      font_size: paragraph.style.font_size,
      bold: paragraph.style.bold,
      color: paragraph.style.color,
    });
    y += height + 4;
  }
  return lines;
}

function parseOdtTablesIntoLayout(
  xml: string,
  odtExtractDir: string,
  jobDir: string,
  page: PdfLayoutPage,
  pageSize: { width: number; height: number },
  textStyles: Map<string, { font_family: string; font_size: number; bold: boolean; color: string }>,
  tableStyles: OdtTableLayoutStyles,
) {
  const tableRegex = /<table:table(?!-)\b([^>]*)>([\s\S]*?)<\/table:table>/g;
  let tableMatch: RegExpExecArray | null;
  let tableY = 72;

  while ((tableMatch = tableRegex.exec(xml)) !== null) {
    const leadingXml = xml.slice(0, tableMatch.index).replace(/<table:table(?!-)\b[\s\S]*?<\/table:table>/g, '');
    const leadingLines = parseOdtPlainTextParagraphs(leadingXml, pageSize, textStyles);
    const leadingBottom = leadingLines.reduce((bottom, line) => Math.max(bottom, line.y + line.height), 0);
    if (leadingBottom > 0) tableY = Math.max(tableY, leadingBottom + 10);
    const tableBody = tableMatch[2];
    const columns: number[] = [];
    const columnRegex = /<table:table-column\b([^>]*?)\/>/g;
    let columnMatch: RegExpExecArray | null;
    while ((columnMatch = columnRegex.exec(tableBody)) !== null) {
      const attrs = parseXmlAttributes(columnMatch[1]);
      const repeated = Math.max(1, Number(attrs['table:number-columns-repeated'] || 1) || 1);
      const width = tableStyles.columns.get(attrs['table:style-name'] || '') || 96;
      for (let i = 0; i < repeated; i += 1) columns.push(width);
    }
    if (columns.length === 0) columns.push(Math.max(1, page.width - 144));

    const tableWidth = columns.reduce((sum, value) => sum + value, 0);
    const tableX = Math.max(0, (page.width - tableWidth) / 2);
    let rowY = tableY;
    const tableRowHeights: number[] = [];
    const tableCells: PdfLayoutTableCell[] = [];
    const rowRegex = /<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tableBody)) !== null) {
      const rowAttrs = parseXmlAttributes(rowMatch[1]);
      const rowBody = rowMatch[2];
      const rowHeight = Math.max(18, tableStyles.rows.get(rowAttrs['table:style-name'] || '') || 28);
      tableRowHeights.push(rowHeight);
      const rowIndex = tableRowHeights.length - 1;
      let colIndex = 0;
      let cellMatch: RegExpExecArray | null;
      const cellRegex = /<table:(table-cell|covered-table-cell)\b([^>]*)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g;
      while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
        if (cellMatch[1] === 'covered-table-cell') {
          colIndex += 1;
          continue;
        }
        const cellAttrs = parseXmlAttributes(cellMatch[2]);
        const cellBody = cellMatch[3] || '';
        const span = Math.max(1, Number(cellAttrs['table:number-columns-spanned'] || 1) || 1);
        const x = tableX + columns.slice(0, colIndex).reduce((sum, value) => sum + value, 0);
        const width = columns.slice(colIndex, colIndex + span).reduce((sum, value) => sum + value, 0) || columns[colIndex] || 96;
        const cellStyle = tableStyles.cells.get(cellAttrs['table:style-name'] || '') || { stroke: '#000000' };
        page.boxes.push({
          x,
          y: rowY,
          width,
          height: rowHeight,
          stroke: cellStyle.stroke || '#000000',
          fill: cellStyle.fill,
        });

        const imageRegex = /<draw:frame\b([^>]*)>([\s\S]*?)<\/draw:frame>/g;
        let imageFrameMatch: RegExpExecArray | null;
        while ((imageFrameMatch = imageRegex.exec(cellBody)) !== null) {
          const frameAttrs = parseXmlAttributes(imageFrameMatch[1]);
          const imageMatch = imageFrameMatch[2].match(/<draw:image\b([^>]*)>/);
          const imageAttrs = parseXmlAttributes(imageMatch?.[1] || '');
          const href = imageAttrs['xlink:href'];
          if (!href) continue;
          const sourcePath = resolveOdtHref(odtExtractDir, href);
          if (!sourcePath) continue;
          if (!fs.existsSync(sourcePath)) continue;
          const ext = path.extname(href) || '.png';
          const id = `odt-table-image-${page.images.length + 1}${ext}`;
          fs.copyFileSync(sourcePath, path.join(jobDir, id));
          const imageWidth = Math.max(1, Math.min(width, odfLengthToPx(frameAttrs['svg:width'], width)));
          const imageHeight = Math.max(1, Math.min(rowHeight, odfLengthToPx(frameAttrs['svg:height'], rowHeight)));
          let dimensions = { width: Math.round(imageWidth), height: Math.round(imageHeight) };
          try { dimensions = getPngDimensions(path.join(jobDir, id)); } catch { /* non-png or unknown dimensions */ }
          page.images.push({
            id,
            natural_w: dimensions.width,
            natural_h: dimensions.height,
            x: x + Math.max(0, (width - imageWidth) / 2),
            y: rowY + Math.max(0, (rowHeight - imageHeight) / 2),
            width: imageWidth,
            height: imageHeight,
          });
        }

        const paragraphRegex = /<text:p\b([^>]*)>([\s\S]*?)<\/text:p>/g;
        let paragraphMatch: RegExpExecArray | null;
        const cellTextLines: string[] = [];
        let cellTextStyle: { font_family: string; font_size: number; bold: boolean; color: string } | null = null;
        while ((paragraphMatch = paragraphRegex.exec(cellBody)) !== null) {
          const paragraphAttrs = parseXmlAttributes(paragraphMatch[1]);
          const text = decodeOdfText(paragraphMatch[2]);
          if (!text) continue;
          const spanStyle = paragraphMatch[2].match(/<text:span\b[^>]*text:style-name="([^"]+)"/)?.[1];
          const paragraphStyle = (spanStyle && textStyles.get(spanStyle))
            || (paragraphAttrs['text:style-name'] && textStyles.get(paragraphAttrs['text:style-name']))
            || null;
          if (!cellTextStyle && paragraphStyle) cellTextStyle = paragraphStyle;
          cellTextLines.push(text);
        }
        tableCells.push({
          row: rowIndex,
          col: colIndex,
          row_span: Math.max(1, Number(cellAttrs['table:number-rows-spanned'] || 1) || 1),
          col_span: span,
          text: cellTextLines.join('\n').trim(),
          font_family: cellTextStyle?.font_family,
          font_size: cellTextStyle?.font_size,
          bold: cellTextStyle?.bold,
          color: cellTextStyle?.color,
          style: { stroke: cellStyle.stroke || '#000000', fill: cellStyle.fill },
        });
        colIndex += span;
      }
      rowY += rowHeight;
    }
    page.tables = page.tables || [];
    page.tables.push({
      x: tableX,
      y: tableY,
      width: tableWidth,
      height: Math.max(1, rowY - tableY),
      columns,
      row_heights: tableRowHeights,
      cells: tableCells,
    });
    tableY = rowY + 10;
  }
}

function parsePdfHtmlLayoutPages(xml: string, pageImages: PdfPageImage[] = []): PdfLayoutPage[] {
  const fonts = new Map<string, PdfHtmlFontSpec>();
  const fontRegex = /<fontspec\b([^>]*)\/>/g;
  let fontMatch: RegExpExecArray | null;
  while ((fontMatch = fontRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(fontMatch[1]);
    if (!attrs.id) continue;
    fonts.set(attrs.id, {
      id: attrs.id,
      size: Number(attrs.size || 12) || 12,
      family: attrs.family || '함초롬바탕',
      color: attrs.color || '#000000',
    });
  }

  const pages: PdfLayoutPage[] = [];
  const pageRegex = /<page\b([^>]*)>([\s\S]*?)<\/page>/g;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageRegex.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(pageMatch[1]);
    const width = Number(attrs.width || 0) || 892;
    const height = Number(attrs.height || 0) || 1262;
    const body = pageMatch[2];
    const images: PdfLayoutImage[] = [];
    const imageRegex = /<image\b([^>]*)\/>/g;
    let imageMatch: RegExpExecArray | null;
    while ((imageMatch = imageRegex.exec(body)) !== null) {
      const imageAttrs = parseXmlAttributes(imageMatch[1]);
      const src = imageAttrs.src || '';
      if (!src) continue;
      const id = path.basename(src);
      let dimensions: { width: number; height: number } | null = null;
      try {
        if (fs.existsSync(src)) dimensions = getPngDimensions(src);
      } catch {
        dimensions = null;
      }
      images.push({
        id,
        natural_w: dimensions?.width || Math.max(1, Number(imageAttrs.width || 1) || 1),
        natural_h: dimensions?.height || Math.max(1, Number(imageAttrs.height || 1) || 1),
        x: Number(imageAttrs.left || 0) || 0,
        y: Number(imageAttrs.top || 0) || 0,
        width: Math.max(1, Number(imageAttrs.width || 1) || 1),
        height: Math.max(1, Number(imageAttrs.height || 1) || 1),
      });
    }

    const lines: PdfLayoutTextLine[] = [];
    const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = textRegex.exec(body)) !== null) {
      const textAttrs = parseXmlAttributes(textMatch[1]);
      const rawText = textMatch[2];
      const text = decodeXmlEntities(rawText).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const font = fonts.get(textAttrs.font || '') || {
        id: textAttrs.font || '0',
        size: Math.max(8, Number(textAttrs.height || 16) || 12),
        family: '함초롬바탕',
        color: '#000000',
      };
      lines.push({
        text,
        x: Number(textAttrs.left || 0) || 0,
        y: Number(textAttrs.top || 0) || 0,
        width: Math.max(1, Number(textAttrs.width || 1) || 1),
        height: Math.max(1, Number(textAttrs.height || font.size) || font.size),
        font_family: font.family,
        font_size: font.size,
        bold: /<b\b/i.test(rawText),
        color: font.color,
      });
    }
    pages.push({
      width,
      height,
      background: pageImages[pages.length],
      images,
      lines,
      boxes: inferTableBoxesFromPdfLines(lines),
    });
  }

  return pages;
}

function createRhwpIngestFromPdfHtmlLayout(xml: string, pageImages: PdfPageImage[] = []): PdfLayoutIngest {
  const pages = parsePdfHtmlLayoutPages(xml, pageImages);
  const fallbackText = 'PDF에서 추출 가능한 텍스트가 없습니다. 스캔 이미지 PDF는 OCR 단계가 필요합니다.';
  const textPages = pages.length > 0
    ? pages.map((page) => page.lines.map((line) => line.text).join('\n').trim() || fallbackText)
    : [fallbackText];
  const ingest = createRhwpIngestFromPdfText(textPages) as PdfLayoutIngest;
  ingest.pdf_layout = {
    unit: 'pdfhtml',
    visual_mode: PDF_HWP_VISUAL_MODE,
    pages: pages.length > 0 ? pages : [{
      width: 892,
      height: 1262,
      background: pageImages[0],
      images: [],
      lines: [{
        text: fallbackText,
        x: 80,
        y: 80,
        width: 720,
        height: 24,
        font_family: '함초롬바탕',
        font_size: 16,
        bold: false,
        color: '#000000',
      }],
      boxes: [],
    }],
  };
  return ingest;
}

async function extractOdtArchive(odtPath: string, extractDir: string) {
  fs.mkdirSync(extractDir, { recursive: true });
  await execFileAsync(PYTHON_PATH, [
    '-c',
    'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
    odtPath,
    extractDir,
  ], { timeout: 30000 });
}

async function convertPdfToDocxWithPdf2docx(inputPath: string, jobDir: string, convertMode?: string): Promise<string> {
  const mode = (convertMode && ['faithful', 'editable', 'absolute'].includes(convertMode)) ? convertMode : PDF2DOCX_LAYOUT_MODE;
  const docxPath = path.join(jobDir, 'pdf2docx-output.docx');
  await execFileAsync(PYTHON_PATH, [
    PDF2DOCX_SCRIPT_PATH,
    inputPath,
    docxPath,
    '--layout-mode',
    mode,
  ], { timeout: 180000, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' } });
  if (!fs.existsSync(docxPath) || fs.statSync(docxPath).size === 0) {
    throw new Error('pdf2docx PDF→DOCX 결과 파일이 생성되지 않았습니다.');
  }
  return docxPath;
}

async function convertDocxToOdtForRhwpIngest(docxPath: string, jobDir: string): Promise<string> {
  await execFileAsync(SOFFICE_PATH, [
    '--headless',
    '--convert-to', 'odt:writer8',
    '--outdir', jobDir,
    docxPath,
  ], { timeout: 120000, env: { ...process.env, HOME: '/tmp', LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8', OOO_LOCALE: 'ko' } });
  const expectedOdtPath = path.join(jobDir, `${path.basename(docxPath, path.extname(docxPath))}.odt`);
  const odtCandidates = fs.readdirSync(jobDir)
    .filter((name) => name.toLowerCase().endsWith('.odt'))
    .sort((a, b) => fs.statSync(path.join(jobDir, b)).mtimeMs - fs.statSync(path.join(jobDir, a)).mtimeMs);
  const actualOdtPath = fs.existsSync(expectedOdtPath) ? expectedOdtPath : (odtCandidates[0] ? path.join(jobDir, odtCandidates[0]) : '');
  if (!actualOdtPath || !fs.existsSync(actualOdtPath)) {
    throw new Error('LibreOffice DOCX→ODT 결과 파일이 생성되지 않았습니다.');
  }
  return actualOdtPath;
}

async function createRhwpIngestFromPdf2DocxPipeline(inputPath: string, jobDir: string): Promise<PdfLayoutIngest> {
  const docxPath = await convertPdfToDocxWithPdf2docx(inputPath, jobDir);
  const odtPath = await convertDocxToOdtForRhwpIngest(docxPath, jobDir);
  const odtExtractDir = path.join(jobDir, 'docx-odt-extract');
  await extractOdtArchive(odtPath, odtExtractDir);
  return createRhwpIngestFromLibreOfficeOdt(odtExtractDir, jobDir);
}

async function createRhwpIngestFromDocx(inputPath: string, jobDir: string): Promise<PdfLayoutIngest> {
  const odtPath = await convertDocxToOdtForRhwpIngest(inputPath, jobDir);
  const odtExtractDir = path.join(jobDir, 'docx-odt-extract');
  await extractOdtArchive(odtPath, odtExtractDir);
  return createRhwpIngestFromLibreOfficeOdt(odtExtractDir, jobDir);
}

async function exportRhwpHwpxToPdf(hwpxPath: string, pdfPath: string, jobDir: string): Promise<void> {
  const svgDir = path.join(jobDir, 'rhwp-svg-export');
  await execFileAsync(RHWP_PATH, ['export-svg', hwpxPath, '-o', svgDir, '--font-style', '--embed-fonts'], {
    timeout: 120000, env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' },
  });
  const svgFiles = fs.readdirSync(svgDir).filter((f) => f.endsWith('.svg')).sort();
  if (svgFiles.length === 0) throw new Error('rhwp export-svg produced no SVG');
  await execFileAsync(PYTHON_PATH, [SVG_TO_SEARCHABLE_PDF_SCRIPT_PATH, svgDir, '-o', pdfPath], {
    timeout: 120000, env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' },
  });
  if (!fs.existsSync(pdfPath)) throw new Error('HWP→PDF (rhwp) 결과가 생성되지 않았습니다.');
}
async function attachSourceImageBackgrounds(ingest: PdfLayoutIngest, inputPath: string, jobDir: string): Promise<void> {
  await execFileAsync(PDFTOPPM_PATH, [
    '-png',
    '-r', '144',
    inputPath,
    path.join(jobDir, 'page'),
  ], { timeout: 120000 });
  const pageImages = listRenderedPdfPageImages(jobDir);
  const pages = ingest.pdf_layout?.pages || [];
  if (pageImages.length < pages.length) {
    throw new Error(`PDF 원본 페이지 배경 이미지가 부족합니다. expected=${pages.length} actual=${pageImages.length}`);
  }
  pages.forEach((page, index) => {
    page.background = pageImages[index];
    // The source image is the complete visual representation. Do not let
    // extracted glyphs, inferred tables, vectors, or inline images alter it.
    page.images = [];
    page.lines = [];
    page.boxes = [];
    page.tables = [];
  });
  ingest.pdf_layout = {
    ...(ingest.pdf_layout as NonNullable<PdfLayoutIngest['pdf_layout']>),
    visual_mode: 'source-image-top',
    pages,
  };
  ingest.questions = pages.map((_page, index) => ({
    number: index + 1,
    stem: '',
    auto_number: false,
    stem_blocks: [],
    choices: [],
    media: [],
  }));
}

async function createStructuredHwpxFromPdfLayout(ingest: PdfLayoutIngest, outputPath: string, jobDir: string): Promise<void> {
  const pages = ingest.pdf_layout?.pages || [];
  if (pages.length !== 1) throw new Error('구조화된 HWPX 변환은 현재 단일 페이지 PDF만 지원합니다.');
  const page = pages[0];
  if (!page) throw new Error('PDF layout에 페이지가 없습니다.');
  const table = page.tables?.[0];
  const preLines = (page.lines || [])
    .filter((line) => !table || line.y < table.y)
    .reduce((groups, line) => {
      const key = Math.round(line.y / 3);
      const group = groups.get(key) || [];
      group.push(line);
      groups.set(key, group);
      return groups;
    }, new Map<number, PdfLayoutTextLine[]>());
  const preText = Array.from(preLines.values())
    .map((group) => group.sort((a, b) => a.x - b.x).map((line) => line.text).join('').trim())
    .filter(Boolean);
  const title = preText.slice().sort((a, b) => b.length - a.length)[0] || 'PDF 문서';
  const slogan = preText.filter((line) => line !== title).slice(0, 1);
  const tableTopAdjustment = table ? Math.round((table.y - 124.55) * 100) : 0;
  const textParagraph = (text: string): any => ({
    runs: [{ content: { Text: text }, char_shape_id: 0 }],
    para_shape_id: 0,
  });
  const paragraphs = [textParagraph(title), ...slogan.map(textParagraph)];
  if (table && table.columns.length > 0) {
    const cellMap = new Map(table.cells.map((cell) => [`${cell.row}:${cell.col}`, cell]));
    const occupied = new Set<string>();
    const tableRows = table.row_heights.map((rowHeight, row) => {
      const cells = [];
      for (let col = 0; col < table.columns.length; col += 1) {
        if (occupied.has(`${row}:${col}`)) continue;
        const cell = cellMap.get(`${row}:${col}`);
        const colSpan = Math.max(1, cell?.col_span || 1);
        const rowSpan = Math.max(1, cell?.row_span || 1);
        for (let spanRow = row; spanRow < row + rowSpan; spanRow += 1) {
          for (let spanCol = col; spanCol < col + colSpan; spanCol += 1) {
            occupied.add(`${spanRow}:${spanCol}`);
          }
        }
        cells.push({
          paragraphs: [textParagraph(cell?.text || '')],
          col_span: colSpan,
          row_span: rowSpan,
          width: Math.max(300, Math.round(table.columns.slice(col, col + colSpan).reduce((sum, width) => sum + width, 0) * 100)),
          height: Math.max(300, Math.round(table.row_heights.slice(row, row + rowSpan).reduce((sum, height) => sum + height, 0) * 100)),
        });
      }
      return { height: Math.max(300, Math.round(rowHeight * 100)), cells };
    });
    paragraphs.push({
      runs: [{
        content: {
          Table: {
            rows: tableRows,
            width: Math.round(table.width * 100),
            page_break: 'none',
            repeat_header: false,
          },
        },
        char_shape_id: 0,
      }],
      para_shape_id: 0,
    });
  }
  const document = {
    sections: [{
      paragraphs,
      page_settings: {
        width: 59528, height: 84188,
        margin_left: 6700, margin_right: 5000, margin_top: Math.max(0, 9600 + tableTopAdjustment), margin_bottom: 3000,
        header_margin: 0, footer_margin: 0, gutter: 0,
        gutter_type: 'LeftOnly', mirror_margins: false, landscape: false,
      },
    }],
    metadata: { keywords: [], extras: {} },
  };
  const jsonPath = path.join(jobDir, 'pdf-to-hwpx.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ document }), 'utf8');
  await execFileAsync(HWPFORGE_PATH, ['from-json', jsonPath, '-o', outputPath], {
    timeout: 120000,
    env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' },
  });
  if (!isHwpxFile(outputPath)) throw new Error('HWPForge가 유효한 HWPX를 생성하지 못했습니다.');
}


function isHwpxFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const data = fs.readFileSync(filePath);
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4B) return false;
  const zipText = data.toString('latin1');
  return zipText.includes('Contents/content.hpf') || zipText.includes('Contents/section');
}
async function createRhwpIngestFromPyMuPdfLayout(inputPath: string, jobDir: string, preferGlyphLayout = true): Promise<PdfLayoutIngest> {
  if (!fs.existsSync(PDF_LAYOUT_EXTRACT_SCRIPT_PATH)) {
    throw new Error(`PDF layout extractor missing: ${PDF_LAYOUT_EXTRACT_SCRIPT_PATH}`);
  }
  const layoutJsonPath = path.join(jobDir, 'pymupdf-layout.json');
  await execFileAsync(PYTHON_PATH, [
    PDF_LAYOUT_EXTRACT_SCRIPT_PATH,
    inputPath,
    '--media-dir', jobDir,
    '-o', layoutJsonPath,
  ], {
    timeout: 120000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' },
  });
  if (!fs.existsSync(layoutJsonPath) || fs.statSync(layoutJsonPath).size === 0) {
    throw new Error('PyMuPDF PDF layout JSON이 생성되지 않았습니다.');
  }

  const parsed = JSON.parse(fs.readFileSync(layoutJsonPath, 'utf8')) as {
    unit?: string;
    glyph_unit?: string;
    pages?: Array<{
      width: number;
      height: number;
      lines?: PdfLayoutTextLine[];
      glyphs?: Array<{
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
        baseline?: number;
        font_family?: string;
        font_size?: number;
        bold?: boolean;
        color?: string;
      }>;
      boxes?: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        stroke?: string;
        fill?: string;
        stroke_width?: number;
      }>;
      images?: Array<{ id: string; x: number; y: number; width: number; height: number; natural_w?: number; natural_h?: number }>;
      tables?: PdfLayoutTable[];
    }>;
  };
  const sourcePages = Array.isArray(parsed.pages) ? parsed.pages : [];
  if (sourcePages.length === 0) {
    throw new Error('PyMuPDF PDF layout에 페이지가 없습니다.');
  }

  // Prefer per-glyph advances when extractor provides them. This preserves PDF
  // character positions much more tightly than whole-line textboxes.
  const useGlyphLayout = preferGlyphLayout && sourcePages.some((page) => Array.isArray(page.glyphs) && page.glyphs.length > 0);
  const layoutUnit = useGlyphLayout ? (parsed.glyph_unit || 'pdfglyph') : (parsed.unit || 'pdfpt');

  const orderedPages: PdfLayoutPage[] = sourcePages.map((page) => {
    const sourceLines = useGlyphLayout && Array.isArray(page.glyphs) && page.glyphs.length > 0
      ? page.glyphs
      : (page.lines || []);
    return {
      width: Number(page.width) || DEFAULT_HWP_PAGE_SIZE_MM.width_mm * 96 / 25.4,
      height: Number(page.height) || DEFAULT_HWP_PAGE_SIZE_MM.height_mm * 96 / 25.4,
      images: (page.images || []).map((image) => ({
        id: image.id,
        natural_w: image.natural_w || Math.max(1, Math.round(image.width)),
        natural_h: image.natural_h || Math.max(1, Math.round(image.height)),
        x: image.x,
        y: image.y,
        width: image.width,
        height: image.height,
      })),
      lines: sourceLines.map((line: any) => ({
        text: line.text,
        x: line.x,
        y: line.y,
        width: line.width,
        height: line.height,
        baseline: line.baseline,
        font_family: line.font_family || '함초롬바탕',
        font_size: line.font_size || Math.max(8, (line.height || 10) * 0.72),
        bold: Boolean(line.bold),
        color: line.color || '#000000',
      })),
      boxes: (page.boxes || []).map((box) => ({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        stroke: box.stroke,
        fill: box.fill,
        stroke_width: box.stroke_width,
      })),
      // Structured tables: preserve when the extractor detected them, even in
      // glyph layout mode. HWP table cells are positioned by HWP itself; the
      // glyph runs inside a detected table region are still shown as editable
      // text, so dropping tables here was a data-loss bug (tables vanished in
      // PDF→HWP output). Keep them whenever present.
      tables: Array.isArray((page as any).tables) ? (page as any).tables : [],
    };
  });

  // PyMuPDF layout coordinates are PDF points (1/72"). Do not use the CSS-px (96dpi) helper.
  const pageSizeMm = {
    width_mm: Number(((orderedPages[0].width * 25.4) / 72).toFixed(3)),
    height_mm: Number(((orderedPages[0].height * 25.4) / 72).toFixed(3)),
  };
  const fallbackText = 'PDF에서 추출 가능한 텍스트가 없습니다. 스캔 이미지 PDF는 OCR 단계가 필요합니다.';
  const ingest = createRhwpIngestFromPdfText(
    orderedPages.map((page) => page.lines.map((line) => line.text).join('\n').trim() || fallbackText),
    pageSizeMm,
  ) as PdfLayoutIngest;
  ingest.pdf_layout = {
    unit: layoutUnit,
    visual_mode: 'editable-native',
    pages: orderedPages,
  };
  return ingest;
}

function createRhwpIngestFromLibreOfficeOdt(odtExtractDir: string, jobDir: string): PdfLayoutIngest {
  const contentPath = path.join(odtExtractDir, 'content.xml');
  const stylesPath = path.join(odtExtractDir, 'styles.xml');
  const contentXml = fs.readFileSync(contentPath, 'utf8');
  const stylesXml = fs.existsSync(stylesPath) ? fs.readFileSync(stylesPath, 'utf8') : '';
  const textStyles = parseOdtTextStyles(contentXml);
  const graphicStyles = parseOdtGraphicStyles(`${stylesXml}\n${contentXml}`);
  const tableStyles = parseOdtTableLayoutStyles(contentXml);
  const contentXmlWithoutTables = contentXml.replace(/<table:table(?!-)\b[\s\S]*?<\/table:table>/g, '');
  const contentXmlWithoutTablesAndFrames = contentXmlWithoutTables.replace(/<draw:frame\b[\s\S]*?<\/draw:frame>/g, '');
  const pageSize = parseOdtPageSize(stylesXml);
  const pages = new Map<number, PdfLayoutPage>();
  const ensurePage = (pageNumber: number) => {
    const pageIndex = Math.max(1, pageNumber || 1);
    if (!pages.has(pageIndex)) {
      pages.set(pageIndex, {
        width: pageSize.width,
        height: pageSize.height,
        images: [],
        lines: [],
        boxes: [],
      });
    }
    return pages.get(pageIndex)!;
  };

  parseOdtTablesIntoLayout(contentXml, odtExtractDir, jobDir, ensurePage(1), pageSize, textStyles, tableStyles);

  const frameRegex = /<draw:frame\b([^>]*)>([\s\S]*?)<\/draw:frame>/g;
  let frameMatch: RegExpExecArray | null;
  while ((frameMatch = frameRegex.exec(contentXmlWithoutTables)) !== null) {
    const attrs = parseXmlAttributes(frameMatch[1]);
    const body = frameMatch[2];
    const page = ensurePage(Number(attrs['text:anchor-page-number'] || 1));
    const x = odfLengthToPx(attrs['svg:x']);
    const y = odfLengthToPx(attrs['svg:y']);
    const width = Math.max(1, odfLengthToPx(attrs['svg:width'], 1));
    const height = Math.max(1, odfLengthToPx(attrs['svg:height'], 1));

    const imageMatch = body.match(/<draw:image\b([^>]*)>/);
    if (imageMatch) {
      const imageAttrs = parseXmlAttributes(imageMatch[1]);
      const href = imageAttrs['xlink:href'];
      if (href) {
        const sourcePath = resolveOdtHref(odtExtractDir, href);
        if (sourcePath && fs.existsSync(sourcePath)) {
          const ext = path.extname(href) || '.png';
          const id = `odt-image-${page.images.length + 1}${ext}`;
          fs.copyFileSync(sourcePath, path.join(jobDir, id));
          let dimensions = { width: Math.round(width), height: Math.round(height) };
          try { dimensions = getPngDimensions(path.join(jobDir, id)); } catch { /* non-png or unknown dimensions */ }
          page.images.push({
            id,
            natural_w: dimensions.width,
            natural_h: dimensions.height,
            x,
            y,
            width,
            height,
          });
        }
      }
      continue;
    }

    if (/<draw:text-box\b/i.test(body)) {
      const frameStyle = graphicStyles.get(attrs['draw:style-name'] || '') || {};
      if (frameStyle.fill || frameStyle.stroke) {
        page.boxes.push({
          x,
          y,
          width,
          height,
          stroke: frameStyle.stroke,
          fill: frameStyle.fill,
        });
      }
      const text = decodeOdfText(body);
      if (!text) continue;
      const spanStyle = body.match(/<text:span\b[^>]*text:style-name="([^"]+)"/)?.[1];
      const style = (spanStyle && textStyles.get(spanStyle)) || {
        font_family: '함초롬바탕',
        font_size: Math.max(8, height * 0.72),
        bold: false,
        color: '#000000',
      };
      page.lines.push({
        text,
        x,
        y,
        width,
        height,
        font_family: style.font_family,
        font_size: style.font_size,
        bold: style.bold,
        color: style.color,
      });
    }
  }

  const lineRegex = /<draw:line\b([^>]*)>[\s\S]*?<\/draw:line>/g;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lineRegex.exec(contentXmlWithoutTables)) !== null) {
    const attrs = parseXmlAttributes(lineMatch[1]);
    const page = ensurePage(Number(attrs['text:anchor-page-number'] || 1));
    const style = graphicStyles.get(attrs['draw:style-name'] || '') || {};
    const x1 = odfLengthToPx(attrs['svg:x1']);
    const y1 = odfLengthToPx(attrs['svg:y1']);
    const x2 = odfLengthToPx(attrs['svg:x2']);
    const y2 = odfLengthToPx(attrs['svg:y2']);
    page.boxes.push({
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.max(1, Math.abs(x2 - x1)),
      height: Math.max(1, Math.abs(y2 - y1)),
      stroke: style.stroke || '#000000',
    });
  }

  const polygonRegex = /<draw:(?:polygon|rect)\b([^>]*)>[\s\S]*?<\/draw:(?:polygon|rect)>/g;
  let polygonMatch: RegExpExecArray | null;
  while ((polygonMatch = polygonRegex.exec(contentXmlWithoutTables)) !== null) {
    const attrs = parseXmlAttributes(polygonMatch[1]);
    const page = ensurePage(Number(attrs['text:anchor-page-number'] || 1));
    const style = graphicStyles.get(attrs['draw:style-name'] || '') || {};
    if (!style.fill && !style.stroke) continue;
    page.boxes.push({
      x: odfLengthToPx(attrs['svg:x']),
      y: odfLengthToPx(attrs['svg:y']),
      width: Math.max(1, odfLengthToPx(attrs['svg:width'], 1)),
      height: Math.max(1, odfLengthToPx(attrs['svg:height'], 1)),
      stroke: style.stroke,
      fill: style.fill,
    });
  }

  const plainTextLines = parseOdtPlainTextParagraphs(contentXmlWithoutTablesAndFrames, pageSize, textStyles);
  if (plainTextLines.length > 0) {
    const firstPage = ensurePage(1);
    const existingTextSet = new Set(
      firstPage.lines.map((line) => normalizePdfWord(line.text).toLowerCase()).filter(Boolean),
    );
    let plainCursorY = 0;
    const nativeTables = firstPage.tables || [];
    for (const plainLine of plainTextLines) {
      const normalized = normalizePdfWord(plainLine.text).toLowerCase();
      if (!normalized || existingTextSet.has(normalized)) continue;
      const adjustedLine = { ...plainLine };
      for (const table of nativeTables) {
        const lineBottom = adjustedLine.y + adjustedLine.height;
        const tableBottom = table.y + table.height;
        if (adjustedLine.y < tableBottom && lineBottom > table.y) {
          adjustedLine.y = tableBottom + 10;
        }
      }
      if (adjustedLine.y < plainCursorY) adjustedLine.y = plainCursorY;
      plainCursorY = adjustedLine.y + adjustedLine.height + 4;
      firstPage.lines.push(adjustedLine);
    }
  }

  const orderedPages = [...pages.entries()].sort((a, b) => a[0] - b[0]).map(([, page]) => ({
    ...page,
    lines: page.lines.sort((a, b) => a.y - b.y || a.x - b.x),
    boxes: page.boxes.sort((a, b) => a.y - b.y || a.x - b.x),
    images: page.images.sort((a, b) => a.y - b.y || a.x - b.x),
    tables: (page.tables || []).sort((a, b) => a.y - b.y || a.x - b.x),
  }));
  const fallbackText = 'PDF에서 추출 가능한 텍스트가 없습니다. 스캔 이미지 PDF는 OCR 단계가 필요합니다.';
  const ingest = createRhwpIngestFromPdfText(
    orderedPages.length > 0
      ? orderedPages.map((page) => {
        const lineText = page.lines.map((line) => line.text);
        const tableText = (page.tables || [])
          .flatMap((table) => [...table.cells]
            .sort((a, b) => a.row - b.row || a.col - b.col)
            .map((cell) => cell.text)
            .filter(Boolean));
        return [...lineText, ...tableText].join('\n').trim() || fallbackText;
      })
      : [fallbackText],
    pageSizePxToMm(pageSize),
  ) as PdfLayoutIngest;
  ingest.pdf_layout = {
    unit: 'odt',
    visual_mode: 'editable-native',
    pages: orderedPages.length > 0 ? orderedPages : [{
      width: pageSize.width,
      height: pageSize.height,
      images: [],
      lines: [{
        text: fallbackText,
        x: 80,
        y: 80,
        width: 720,
        height: 24,
        font_family: '함초롬바탕',
        font_size: 16,
        bold: false,
        color: '#000000',
      }],
      boxes: [],
    }],
  };
  return ingest;
}

function normalizePdfWord(value: string): string {
  return decodeXmlEntities(value).replace(/\s+/g, ' ').trim();
}

function findStyleForBboxWord(
  word: { text: string; x: number; y: number; width: number; height: number },
  bboxPage: { width: number; height: number },
  htmlPage: PdfLayoutPage | undefined,
): PdfLayoutTextLine | null {
  if (!htmlPage || htmlPage.lines.length === 0 || bboxPage.width <= 0 || bboxPage.height <= 0) return null;
  const scaleX = htmlPage.width / bboxPage.width;
  const scaleY = htmlPage.height / bboxPage.height;
  const cx = (word.x + word.width / 2) * scaleX;
  const cy = (word.y + word.height / 2) * scaleY;
  const normalizedWord = word.text.toLowerCase();

  let best: { line: PdfLayoutTextLine; score: number } | null = null;
  for (const line of htmlPage.lines) {
    const lineCx = line.x + line.width / 2;
    const lineCy = line.y + line.height / 2;
    const containsText = line.text.toLowerCase().includes(normalizedWord);
    const insideY = cy >= line.y - line.height && cy <= line.y + line.height * 2;
    const insideX = cx >= line.x - line.height && cx <= line.x + line.width + line.height;
    const score = Math.abs(cy - lineCy) * 4
      + Math.abs(cx - lineCx) * 0.15
      + (containsText ? 0 : 200)
      + (insideY ? 0 : 100)
      + (insideX ? 0 : 50);
    if (!best || score < best.score) best = { line, score };
  }
  return best?.line || null;
}

function glyphWeight(ch: string): number {
  if (ch.charCodeAt(0) > 0x7F) return 1;
  if (/[ilI.,:;!'`|]/.test(ch)) return 0.28;
  if ('fjt[]()'.includes(ch)) return 0.36;
  if (/[MW@#%&]/.test(ch)) return 0.9;
  if (/[A-Z0-9]/.test(ch)) return 0.62;
  return 0.52;
}

function splitBboxWordIntoGlyphLines(
  word: { text: string; x: number; y: number; width: number; height: number },
  style: PdfLayoutTextLine | null,
  fallbackFontSize: number,
): PdfLayoutTextLine[] {
  const glyphs = [...word.text];
  if (glyphs.length <= 1) {
    return [{
      text: word.text,
      x: word.x,
      y: word.y,
      width: word.width,
      height: word.height,
      font_family: style?.font_family || '함초롬바탕',
      font_size: style?.font_size || fallbackFontSize,
      bold: Boolean(style?.bold),
      color: style?.color || '#000000',
    }];
  }

  const weights = glyphs.map(glyphWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || glyphs.length;
  let cursor = word.x;
  return glyphs.map((glyph, index) => {
    const isLast = index === glyphs.length - 1;
    const width = isLast ? (word.x + word.width) - cursor : word.width * (weights[index] / totalWeight);
    const line = {
      text: glyph,
      x: cursor,
      y: word.y,
      width: Math.max(0.2, width),
      height: word.height,
      font_family: style?.font_family || '함초롬바탕',
      font_size: style?.font_size || fallbackFontSize,
      bold: Boolean(style?.bold),
      color: style?.color || '#000000',
    };
    cursor += width;
    return line;
  });
}

function applyPdfWordBboxLayout(ingest: PdfLayoutIngest, bboxXml: string) {
  const layout = ingest.pdf_layout;
  if (!layout || !bboxXml.trim()) return;
  if (layout.visual_mode === 'clean-background-visible-text') {
    // In the editable visible mode keep pdftohtml's whole text lines.
    // Those become normal HWP paragraphs, which users can select and edit
    // directly. The bbox/glyph overlay is kept for non-clean modes where
    // pixel positioning matters more than ordinary paragraph editing.
    return;
  }
  const htmlPages = layout.pages.map((page) => ({
    ...page,
    lines: [...page.lines],
    boxes: [...page.boxes],
  }));
  const bboxPages: PdfLayoutPage[] = [];
  const pageRegex = /<page\b([^>]*)>([\s\S]*?)<\/page>/g;
  let pageMatch: RegExpExecArray | null;

  while ((pageMatch = pageRegex.exec(bboxXml)) !== null) {
    const pageIndex = bboxPages.length;
    const attrs = parseXmlAttributes(pageMatch[1]);
    const width = Number(attrs.width || 0) || htmlPages[pageIndex]?.width || 892;
    const height = Number(attrs.height || 0) || htmlPages[pageIndex]?.height || 1262;
    const htmlPage = htmlPages[pageIndex];
    const scaleFromHtmlX = htmlPage && htmlPage.width > 0 ? width / htmlPage.width : 1;
    const scaleFromHtmlY = htmlPage && htmlPage.height > 0 ? height / htmlPage.height : 1;
    const body = pageMatch[2];
    const wordRegex = /<word\b([^>]*)>([\s\S]*?)<\/word>/g;
    const lines: PdfLayoutTextLine[] = [];
    let wordMatch: RegExpExecArray | null;

    while ((wordMatch = wordRegex.exec(body)) !== null) {
      const wordAttrs = parseXmlAttributes(wordMatch[1]);
      const text = normalizePdfWord(wordMatch[2]);
      if (!text) continue;
      const xMin = Number(wordAttrs.xMin || 0);
      const yMin = Number(wordAttrs.yMin || 0);
      const xMax = Number(wordAttrs.xMax || xMin);
      const yMax = Number(wordAttrs.yMax || yMin);
      if (![xMin, yMin, xMax, yMax].every(Number.isFinite) || xMax <= xMin || yMax <= yMin) continue;
      const word = { text, x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
      const style = findStyleForBboxWord(word, { width, height }, htmlPage);
      const scaledStyle = style ? {
        ...style,
        font_size: Math.max(1, style.font_size * scaleFromHtmlX),
      } : null;
      lines.push(...splitBboxWordIntoGlyphLines(
        word,
        scaledStyle,
        Math.max(1, word.height * 0.9),
      ));
    }

    const boxes = (htmlPage?.boxes || []).map((box) => ({
      ...box,
      x: box.x * scaleFromHtmlX,
      y: box.y * scaleFromHtmlY,
      width: box.width * scaleFromHtmlX,
      height: box.height * scaleFromHtmlY,
    }));

    bboxPages.push({
      width,
      height,
      background: htmlPage?.background,
      images: htmlPage?.images || [],
      lines: lines.length > 0 ? lines : htmlPage?.lines || [],
      boxes,
    });
  }

  if (bboxPages.some((page) => page.lines.length > 0)) {
    layout.unit = 'pdfglyph';
    layout.pages = bboxPages;
  }
}


function clampImageCoordinate(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), max);
}

function textEraseRects(page: PdfLayoutPage): Array<{ x0: number; y0: number; x1: number; y1: number }> {
  const background = page.background;
  if (!background || page.width <= 0 || page.height <= 0) return [];
  const sx = background.natural_w / page.width;
  const sy = background.natural_h / page.height;

  return page.lines
    .filter((line) => line.text.trim().length > 0)
    .map((line) => {
      const padX = Math.max(2, Math.round(line.height * sx * 0.08));
      const padY = Math.max(1, Math.round(line.height * sy * 0.08));
      const x0 = clampImageCoordinate((line.x * sx) - padX, background.natural_w);
      const y0 = clampImageCoordinate((line.y * sy) - padY, background.natural_h);
      const x1 = clampImageCoordinate(((line.x + line.width) * sx) + padX, background.natural_w);
      const y1 = clampImageCoordinate(((line.y + line.height) * sy) + padY, background.natural_h);
      if (x1 <= x0 || y1 <= y0) return null;
      return { x0, y0, x1, y1 };
    })
    .filter((rect): rect is { x0: number; y0: number; x1: number; y1: number } => Boolean(rect));
}

async function createTextErasedPdfPageBackgrounds(ingest: PdfLayoutIngest, jobDir: string) {
  const pages = ingest.pdf_layout?.pages || [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const background = page.background;
    if (!background) continue;

    const sourcePath = path.join(jobDir, background.id);
    if (!fs.existsSync(sourcePath)) continue;

    const cleanId = `page-clean-${index + 1}.png`;
    const cleanPath = path.join(jobDir, cleanId);
    const rects = textEraseRects(page);

    if (rects.length === 0) {
      fs.copyFileSync(sourcePath, cleanPath);
    } else {
      const rectsPath = path.join(jobDir, `page-clean-${index + 1}-rects.json`);
      fs.writeFileSync(rectsPath, JSON.stringify(rects), 'utf8');
      await execFileAsync(PYTHON_PATH, [
        PDF_TEXT_ERASE_SCRIPT_PATH,
        sourcePath,
        rectsPath,
        cleanPath,
      ], { timeout: 60000 });
    }

    const dimensions = getPngDimensions(cleanPath) || { width: background.natural_w, height: background.natural_h };
    page.background = {
      id: cleanId,
      natural_w: dimensions.width,
      natural_h: dimensions.height,
    };
  }
}

// Ensure dirs
for (const d of [UPLOAD_DIR, OUTPUT_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ============================================================
// Auth + Premium
// ============================================================

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}

function getConfiguredGoogleAuthError() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return {
      error: 'Google OAuth 환경변수가 설정되지 않았습니다.',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
      requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET'],
    };
  }
  return null;
}

app.get('/api/auth/google', (req: Request, res: Response) => {
  const configError = getConfiguredGoogleAuthError();
  if (configError) return res.status(503).json(configError);

  const state = nanoid(32);
  setSignedCookie(res, OAUTH_STATE_COOKIE_NAME, state, 10 * 60 * 1000);
  setSignedCookie(res, OAUTH_REDIRECT_COOKIE_NAME, getSafeRedirectPath(req.query.redirect), 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/callback', async (req: Request, res: Response) => {
  const configError = getConfiguredGoogleAuthError();
  if (configError) return res.status(503).json(configError);

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
  const expectedState = verifySignedCookieValue(parseCookies(req)[OAUTH_STATE_COOKIE_NAME]);
  const redirectCookie = verifySignedCookieValue(parseCookies(req)[OAUTH_REDIRECT_COOKIE_NAME]);
  clearCookie(res, OAUTH_STATE_COOKIE_NAME);
  clearCookie(res, OAUTH_REDIRECT_COOKIE_NAME);

  if (!code) return res.status(400).json({ error: 'Google OAuth code가 없습니다.', code: 'GOOGLE_CODE_MISSING' });
  if (!expectedState || returnedState !== expectedState) {
    return res.status(400).json({ error: 'OAuth state 검증에 실패했습니다.', code: 'GOOGLE_STATE_INVALID' });
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: getGoogleRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(502).json({
        error: tokenData.error_description || tokenData.error || 'Google token 교환에 실패했습니다.',
        code: 'GOOGLE_TOKEN_EXCHANGE_FAILED',
      });
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json() as GoogleUserInfoResponse;
    if (!userInfoResponse.ok || !userInfo.email) {
      return res.status(502).json({ error: 'Google 사용자 정보를 가져오지 못했습니다.', code: 'GOOGLE_USERINFO_FAILED' });
    }

    const session = createSession({
      id: userInfo.sub || userInfo.email,
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
      avatarUrl: userInfo.picture,
    });
    setSignedCookie(res, SESSION_COOKIE_NAME, session.id);

    const redirectTo = getSafeRedirectPath(redirectCookie, '/');
    res.redirect(getFrontendRedirectUrl(req, redirectTo));
  } catch (err) {
    console.error('[AUTH] Google callback failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Google 로그인 처리 중 오류가 발생했습니다.', code: 'GOOGLE_AUTH_FAILED' });
  }
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    clearCookie(res, SESSION_COOKIE_NAME);
    return res.json({
      loggedIn: false,
      user: null,
      premium: getPremiumStatusForEmail(),
      isAdmin: false,
    });
  }

  res.json({
    loggedIn: true,
    user: session.user,
    premium: getPremiumStatusForEmail(session.user.email),
    isAdmin: isAdminEmail(session.user.email),
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  deleteSession(req);
  clearCookie(res, SESSION_COOKIE_NAME);
  res.json({ ok: true });
});

function hasProcessedPolarEvent(eventId?: string): boolean {
  if (!eventId) return false;
  return Boolean(readAuthStore().polarWebhookEvents[eventId]);
}

function recordProcessedPolarEvent(eventId: string | undefined, type: string, email?: string) {
  if (!eventId) return;
  const store = readAuthStore();
  store.polarWebhookEvents[eventId] = { type, email: email ? normalizeEmail(email) : undefined, processedAt: new Date().toISOString() };
  writeAuthStore(store);
}

function rawBodyForSignature(req: Request): Buffer {
  return (req as RequestWithRawBody).rawBody || Buffer.from(JSON.stringify(req.body || {}));
}

function constantTimeEquals(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function signatureCandidates(signatureHeader: string): string[] {
  return signatureHeader
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .flatMap((part) => {
      const value = part.includes('=') ? part.slice(part.indexOf('=') + 1) : part;
      return value && value !== 'v1' ? [value.replace(/^v1,/, '')] : [];
    });
}

function polarWebhookSecretBytes(): Buffer {
  if (!POLAR_WEBHOOK_SECRET.startsWith('whsec_')) return Buffer.from(POLAR_WEBHOOK_SECRET);
  return Buffer.from(POLAR_WEBHOOK_SECRET.slice('whsec_'.length), 'base64');
}

function verifyPolarWebhookSignature(req: Request): boolean {
  if (!POLAR_WEBHOOK_SECRET) return false;
  const signatureHeader = req.get('polar-webhook-signature') || req.get('webhook-signature') || '';
  const webhookId = req.get('webhook-id') || req.get('polar-webhook-id') || '';
  const webhookTimestamp = req.get('webhook-timestamp') || req.get('polar-webhook-timestamp') || '';
  if (!signatureHeader) return false;
  if (!webhookId || !webhookTimestamp) return false;

  const body = rawBodyForSignature(req);
  const signedPayload = Buffer.concat([
    Buffer.from(`${webhookId}.${webhookTimestamp}.`),
    body,
  ]);
  const expectedBase64 = crypto.createHmac('sha256', polarWebhookSecretBytes()).update(signedPayload).digest('base64');

  return signatureCandidates(signatureHeader).some((candidate) => {
    const normalized = candidate.replace(/^sha256=/, '');
    return constantTimeEquals(Buffer.from(expectedBase64), Buffer.from(normalized));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findStringByKeys(value: unknown, keys: string[], predicate: (candidate: string) => boolean = Boolean): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  for (const [key, nested] of Object.entries(value)) {
    if (keys.includes(key) && typeof nested === 'string' && predicate(nested)) return nested;
  }
  for (const nested of Object.values(value)) {
    const found = findStringByKeys(nested, keys, predicate);
    if (found) return found;
  }
  return undefined;
}

function stringFromRecord(record: Record<string, unknown>, keys: string[], predicate: (candidate: string) => boolean = Boolean): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && predicate(value)) return value;
  }
  return undefined;
}

function extractPolarProductId(data: unknown): string | undefined {
  if (!isRecord(data)) return findStringByKeys(data, ['productId', 'product_id'], Boolean);
  const direct = stringFromRecord(data, ['productId', 'product_id'], Boolean);
  if (direct) return direct;
  if (isRecord(data.product)) {
    const productId = stringFromRecord(data.product, ['id', 'productId', 'product_id'], Boolean);
    if (productId) return productId;
  }
  if (Array.isArray(data.products)) {
    for (const product of data.products) {
      if (!isRecord(product)) continue;
      const productId = stringFromRecord(product, ['id', 'productId', 'product_id'], Boolean);
      if (productId) return productId;
    }
  }
  return findStringByKeys(data, ['productId', 'product_id'], Boolean);
}

function extractPolarPurchase(payload: unknown) {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  const email = findStringByKeys(data, ['customerEmail', 'customer_email', 'email'], (value) => value.includes('@'));
  const productId = extractPolarProductId(data);
  const expiresAt = findStringByKeys(data, ['expiresAt', 'expires_at', 'currentPeriodEnd', 'current_period_end'], (value) => !Number.isNaN(Date.parse(value)));
  return { email, productId, expiresAt };
}

function recordPolarPurchase(email: string, productId?: string, eventId?: string, expiresAt?: string): PremiumRecord | null {
  const store = readAuthStore();
  const key = normalizeEmail(email);
  const now = new Date();
  const existing = store.premiumByEmail[key] || {
    email: key,
    oneTimePasses: 0,
    productIds: [],
    eventIds: [],
    updatedAt: now.toISOString(),
  } satisfies PremiumRecord;

  if (eventId && existing.eventIds.includes(eventId)) {
    return existing;
  }

  const isMonthly = Boolean(productId && POLAR_MONTHLY_PRODUCT_ID && productId === POLAR_MONTHLY_PRODUCT_ID);
  const isOneTime = Boolean(productId && POLAR_ONE_TIME_PRODUCT_ID && productId === POLAR_ONE_TIME_PRODUCT_ID);
  if (!isMonthly && !isOneTime) {
    console.warn(`[POLAR] Ignoring grant for unconfigured productId=${productId || 'missing'} email=${key}`);
    return null;
  }
  if (isMonthly) {
    const defaultExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    existing.subscriptionExpiresAt = expiresAt || defaultExpiry;
    existing.plan = 'monthly';
  } else {
    existing.oneTimePasses += 1;
    existing.plan = 'one_time';
  }

  if (productId && !existing.productIds.includes(productId)) existing.productIds.push(productId);
  if (eventId) existing.eventIds.push(eventId);
  existing.updatedAt = now.toISOString();
  store.premiumByEmail[key] = existing;
  writeAuthStore(store);
  return existing;
}

function recordPolarSubscriptionEnded(email: string, eventId?: string) {
  const store = readAuthStore();
  const key = normalizeEmail(email);
  const existing = store.premiumByEmail[key];
  if (!existing) return null;
  if (eventId && existing.eventIds.includes(eventId)) return existing;
  existing.subscriptionExpiresAt = new Date().toISOString();
  if (existing.plan === 'monthly') existing.plan = 'unknown';
  if (eventId) existing.eventIds.push(eventId);
  existing.updatedAt = new Date().toISOString();
  writeAuthStore(store);
  return existing;
}

app.post('/api/polar/checkout', async (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: '로그인이 필요합니다.', code: 'LOGIN_REQUIRED' });
  if (!POLAR_ACCESS_TOKEN) return res.status(503).json({ error: 'Polar API 토큰이 설정되지 않았습니다.', code: 'POLAR_NOT_CONFIGURED' });

  const { productId, plan } = req.body as { productId?: string; plan?: 'one_time' | 'monthly' };
  if (productId) {
    return res.status(400).json({ error: '클라이언트에서 직접 productId를 지정할 수 없습니다.', code: 'POLAR_PRODUCT_ID_NOT_ALLOWED' });
  }
  const selectedPlan = plan === 'monthly' ? 'monthly' : 'one_time';
  const configuredCheckoutUrl = configuredPolarCheckoutUrl(selectedPlan);
  if (configuredCheckoutUrl) {
    if (!isPolarCheckoutUrl(configuredCheckoutUrl)) {
      return res.status(503).json({ error: '선택한 Polar checkout 링크 형식이 올바르지 않습니다.', code: 'POLAR_CHECKOUT_URL_INVALID' });
    }
    const url = new URL(configuredCheckoutUrl);
    if (session.user.email) url.searchParams.set('customer_email', session.user.email);
    return res.json({ checkoutUrl: url.toString(), checkout: { source: 'configured_link', plan: selectedPlan } });
  }

  const selectedProductId = configuredPolarProducts()[selectedPlan];
  if (!selectedProductId) {
    return res.status(503).json({ error: '선택한 Polar 상품이 서버에 설정되지 않았습니다.', code: 'POLAR_PRODUCT_NOT_CONFIGURED' });
  }
  if (!isPolarProductId(selectedProductId)) {
    return res.status(503).json({ error: '선택한 Polar 상품 ID 형식이 올바르지 않습니다. 관리자에게 product ID를 확인해주세요.', code: 'POLAR_PRODUCT_ID_INVALID' });
  }

  try {
    const response = await fetch('https://api.polar.sh/v1/checkouts/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        products: [selectedProductId],
        currency: POLAR_CHECKOUT_CURRENCY,
        customer_email: session.user.email,
        customer_ip_address: clientIpAddress(req),
        external_customer_id: session.user.id,
        success_url: POLAR_CHECKOUT_SUCCESS_URL || `${getFrontendRedirectUrl(req, '/pricing')}?success=1`,
        return_url: POLAR_CHECKOUT_SUCCESS_URL || `${getFrontendRedirectUrl(req, '/pricing')}?success=1`,
      }),
    });
    const data = await response.json() as Record<string, unknown>;
    const errorDetail = Array.isArray(data.detail)
      ? data.detail.map((item) => isRecord(item) && typeof item.msg === 'string' ? item.msg : JSON.stringify(item)).join('; ')
      : data.detail || data.message;
    if (!response.ok) return res.status(response.status).json({ error: errorDetail || 'Polar checkout 생성 실패' });
    res.json({ checkoutUrl: data.url || data.checkout_url, checkout: data });
  } catch (err) {
    console.error('[POLAR] Checkout failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Polar checkout 처리 중 오류가 발생했습니다.' });
  }
});

app.post('/api/polar/webhook', (req: Request, res: Response) => {
  if (!POLAR_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'POLAR_WEBHOOK_SECRET이 설정되지 않았습니다.', code: 'POLAR_WEBHOOK_NOT_CONFIGURED' });
  }
  if (!verifyPolarWebhookSignature(req)) {
    return res.status(401).json({ error: 'Polar webhook signature verification failed', code: 'POLAR_SIGNATURE_INVALID' });
  }

  const eventType = typeof req.body?.type === 'string'
    ? req.body.type
    : typeof req.body?.event === 'string'
      ? req.body.event
      : typeof req.body?.event_type === 'string'
        ? req.body.event_type
        : '';

  const deliveryId = req.get('webhook-id') || req.get('polar-webhook-id') || '';
  const grantEvents = ['order.paid', 'subscription.active', 'subscription.renewed'];
  const cancellationEvents = ['subscription.revoked'];
  const lifecycleEvents = ['subscription.canceled', 'subscription.updated'];
  if (![...grantEvents, ...cancellationEvents, ...lifecycleEvents].includes(eventType)) {
    recordProcessedPolarEvent(deliveryId, eventType);
    return res.json({ ok: true, ignored: true });
  }

  const purchase = extractPolarPurchase(req.body);
  const idempotencyKey = deliveryId;
  if (hasProcessedPolarEvent(idempotencyKey)) {
    return res.json({ ok: true, duplicate: true });
  }
  if (!purchase.email) {
    return res.status(400).json({ error: 'Polar webhook에서 구매자 email을 찾지 못했습니다.', code: 'POLAR_EMAIL_MISSING' });
  }

  if (lifecycleEvents.includes(eventType)) {
    recordProcessedPolarEvent(idempotencyKey, eventType, purchase.email);
    return res.json({ ok: true, ignored: true });
  }

  const record = cancellationEvents.includes(eventType)
    ? recordPolarSubscriptionEnded(purchase.email, idempotencyKey)
    : recordPolarPurchase(purchase.email, purchase.productId, idempotencyKey, purchase.expiresAt);
  recordProcessedPolarEvent(idempotencyKey, eventType, purchase.email);
  if (!record) return res.json({ ok: true, ignored: true });
  res.json({ ok: true, premium: getPremiumStatusForEmail(record.email) });
});


// ============================================================
// Admin / Operations MVP
// ============================================================
app.get('/api/admin/summary', requireAdmin, (_req: AdminRequest, res: Response) => {
  const users = collectAdminUsers();
  res.json({
    userCount: users.length,
    premiumUserCount: users.filter((user) => user.premium.isPremium).length,
    monthlyUserCount: users.filter((user) => user.premium.plan === 'monthly' && user.premium.isPremium).length,
    oneTimePassCount: users.reduce((sum, user) => sum + user.premium.oneTimePasses, 0),
    adminEmailsConfigured: ADMIN_EMAILS.length,
  });
});

app.get('/api/admin/users', requireAdmin, (req: AdminRequest, res: Response) => {
  const q = typeof req.query.q === 'string' ? normalizeEmail(req.query.q) : '';
  const premiumFilter = typeof req.query.premium === 'string' ? req.query.premium : 'all';
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  let users = collectAdminUsers();
  if (q) users = users.filter((user) => user.email.includes(q) || (user.name || '').toLowerCase().includes(q));
  if (premiumFilter === 'true') users = users.filter((user) => user.premium.isPremium);
  if (premiumFilter === 'false') users = users.filter((user) => !user.premium.isPremium);
  res.json({ users: users.slice(offset, offset + limit), total: users.length, limit, offset });
});

app.get('/api/admin/users/:email', requireAdmin, (req: AdminRequest, res: Response) => {
  const paramEmail = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
  const email = normalizeEmail(paramEmail || '');
  const store = readAuthStore();
  const sessions = Object.values(store.sessions)
    .filter((session) => normalizeEmail(session.user.email) === email)
    .map((session) => ({ id: session.id, user: session.user, createdAt: session.createdAt, updatedAt: session.updatedAt, expiresAt: session.expiresAt }));
  res.json({ ...publicPremiumRecord(email), sessions });
});

app.post('/api/admin/grant-premium', requireAdmin, (req: AdminRequest, res: Response) => {
  const { email, plan, oneTimePasses, subscriptionExpiresAt, reason } = req.body as {
    email?: string;
    plan?: 'one_time' | 'monthly';
    oneTimePasses?: number;
    subscriptionExpiresAt?: string;
    reason?: string;
  };
  if (!email || !email.includes('@')) return res.status(400).json({ error: '유효한 email이 필요합니다.', code: 'EMAIL_REQUIRED' });
  if (plan !== 'one_time' && plan !== 'monthly') return res.status(400).json({ error: 'plan은 one_time 또는 monthly여야 합니다.', code: 'PLAN_REQUIRED' });
  if (!reason || reason.trim().length < 3) return res.status(400).json({ error: '권한 변경 사유가 필요합니다.', code: 'REASON_REQUIRED' });

  const targetEmail = normalizeEmail(email);
  const before = getPremiumStatusForEmail(targetEmail);
  const after = adminGrantPremium(targetEmail, plan, reason.trim(), oneTimePasses, subscriptionExpiresAt);
  appendAdminAudit({
    id: nanoid(16),
    createdAt: new Date().toISOString(),
    actorEmail: req.adminSession?.user.email || 'unknown',
    action: before.isPremium ? 'premium.adjust' : 'premium.grant',
    targetEmail,
    before,
    after,
    reason: reason.trim(),
  });
  res.json({ ok: true, email: targetEmail, premium: after });
});

app.post('/api/admin/revoke-premium', requireAdmin, (req: AdminRequest, res: Response) => {
  const { email, reason } = req.body as { email?: string; reason?: string };
  if (!email || !email.includes('@')) return res.status(400).json({ error: '유효한 email이 필요합니다.', code: 'EMAIL_REQUIRED' });
  if (!reason || reason.trim().length < 3) return res.status(400).json({ error: '권한 회수 사유가 필요합니다.', code: 'REASON_REQUIRED' });

  const targetEmail = normalizeEmail(email);
  const before = getPremiumStatusForEmail(targetEmail);
  const after = adminRevokePremium(targetEmail);
  appendAdminAudit({
    id: nanoid(16),
    createdAt: new Date().toISOString(),
    actorEmail: req.adminSession?.user.email || 'unknown',
    action: 'premium.revoke',
    targetEmail,
    before,
    after,
    reason: reason.trim(),
  });
  res.json({ ok: true, email: targetEmail, premium: after });
});

app.get('/api/admin/audit-logs', requireAdmin, (req: AdminRequest, res: Response) => {
  res.json({ logs: readAdminAuditLogs(Number(req.query.limit) || 50) });
});

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
  outputPath?: string;
  originalName?: string;
  resultFilename?: string;
  deleteAt?: number;
  ownerEmail?: string;
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

  const originalName = req.file.originalname || '';
  if (!originalName.toLowerCase().endsWith('.hwp') && !originalName.toLowerCase().endsWith('.hwpx')) {
    try { fs.unlinkSync(req.file.path); } catch { /* skip */ }
    return res.status(400).json({ error: 'HWP/HWPX 파일만 변환 가능합니다.', code: 'INVALID_FILE_TYPE' });
  }

  const usageContext = getFreeUsageContext(req);
  let usageAfter: ReturnType<typeof checkUsageLimit> | null = null;
  if (!usageContext.exempt) {
    const usageBefore = checkUsageLimit(usageContext.key);
    if (!usageBefore.allowed) {
      try { fs.unlinkSync(req.file.path); } catch { /* skip */ }
      return res.status(429).json({
        error: '오늘 무료 변환 횟수를 모두 사용했습니다. 내일 다시 이용하거나 결제 후 계속 사용할 수 있습니다.',
        code: 'FREE_DAILY_LIMIT_EXCEEDED',
        dailyLimit: FREE_DAILY_LIMIT,
        used: FREE_DAILY_LIMIT,
        remaining: 0,
      });
    }
    usageAfter = incrementUsage(usageContext.key);
  }

  console.log(`[UPLOAD] file=${req.file.originalname} size=${req.file.size} mimetype=${req.file.mimetype} usageKey=${usageContext.key} usageRemaining=${usageAfter?.remaining ?? 'unlimited'}`);

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

      if (!isHwpx) {
        job.progress = 20;
        jobs.set(jobId, { ...job });

        try {
          console.log(`[METHOD2] Trying Hancom docsconverter HWP→PDF jobId=${jobId}`);
          await convertHwpToPdfWithHancomDocsconverter(inputPath, pdfPath);
          try {
            fs.unlinkSync(inputPath);
          } catch (cleanupErr) {
            console.warn(`[METHOD2] input cleanup failed: ${cleanupErr instanceof Error ? cleanupErr.message : cleanupErr}`);
          }
          job.status = 'completed';
          job.progress = 100;
          job.resultUrl = `/api/download/${jobId}`;
          jobs.set(jobId, job);
          console.log(`[METHOD2 OK] Hancom docsconverter HWP→PDF jobId=${jobId} file=${originalName}`);
          return;
        } catch (e) {
          console.log(`[METHOD2 FAIL] ${e instanceof Error ? e.message : 'unknown'}, falling back to rhwp SVG`);
        }
      }

      if (!isHwpx) {
        job.progress = 35;
        jobs.set(jobId, { ...job });

        try {
          console.log(`[METHOD3] Trying rhwp SVG HWP→PDF jobId=${jobId}`);
          await convertHwpToPdfWithRhwpSvg(inputPath, jobDir, pdfPath);
          try {
            fs.unlinkSync(inputPath);
          } catch (cleanupErr) {
            console.warn(`[METHOD3] input cleanup failed: ${cleanupErr instanceof Error ? cleanupErr.message : cleanupErr}`);
          }
          job.status = 'completed';
          job.progress = 100;
          job.resultUrl = `/api/download/${jobId}`;
          jobs.set(jobId, job);
          console.log(`[METHOD3 OK] rhwp SVG HWP→PDF jobId=${jobId} file=${originalName}`);
          return;
        } catch (e) {
          console.log(`[METHOD3 FAIL] ${e instanceof Error ? e.message : 'unknown'}, falling back to HWPX/HTML`);
        }
      }

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

      // Reject blank PDF produced by the HTML reconstruction fallback.
      const textCharCount = countPdfExtractableTextChars(pdfPath);
      if (textCharCount !== null && textCharCount === 0) {
        throw new Error('HWPX/HTML HWP→PDF 결과가 빈 페이지 PDF입니다. 상위 변환 경로를 확인하세요.');
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

  res.json({
    jobId,
    status: 'processing',
    progress: 0,
    usage: usageAfter
      ? { dailyLimit: FREE_DAILY_LIMIT, used: FREE_DAILY_LIMIT - usageAfter.remaining, remaining: usageAfter.remaining }
      : { dailyLimit: FREE_DAILY_LIMIT, used: 0, remaining: FREE_DAILY_LIMIT, unlimited: true },
  });
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
  if (job.ownerEmail) {
    const session = getSessionFromRequest(req);
    const canDownload = session && (isAdminEmail(session.user.email) || normalizeEmail(session.user.email) === normalizeEmail(job.ownerEmail));
    if (!canDownload) return res.status(403).json({ error: '다운로드 권한이 없습니다.', code: 'DOWNLOAD_FORBIDDEN' });
  }
  // Use job.outputPath directly (supports encrypted.pdf, decrypted.pdf, output.pdf, .odt etc.)
  const filePath = job.outputPath || path.join(OUTPUT_DIR, job.id, 'output.pdf');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
  const downloadName = job.resultFilename || 'converted.pdf';
  res.download(filePath, downloadName);
});

// ============================================================
// Usage Tracking (for free tier: 3 per day per IP)
// ============================================================

interface UsageRecord {
  count: number;
  date: string; // YYYY-MM-DD
}

const FREE_DAILY_LIMIT = 3;

interface UsageStore {
  records: Record<string, UsageRecord>;
}

function defaultUsageStore(): UsageStore {
  return { records: {} };
}

function readUsageStore(): UsageStore {
  try {
    if (!fs.existsSync(USAGE_STORE_PATH)) return defaultUsageStore();
    const parsed = JSON.parse(fs.readFileSync(USAGE_STORE_PATH, 'utf8')) as Partial<UsageStore>;
    return { records: parsed.records || {} };
  } catch (err) {
    console.error('[USAGE] Failed to read usage store:', err instanceof Error ? err.message : err);
    return defaultUsageStore();
  }
}

function writeUsageStore(store: UsageStore) {
  ensureParentDir(USAGE_STORE_PATH);
  const tempPath = `${USAGE_STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tempPath, USAGE_STORE_PATH);
}

function getFreeUsageContext(req: Request): { key: string; exempt: boolean } {
  const session = getSessionFromRequest(req);
  const email = session?.user.email;
  const premium = getPremiumStatusForEmail(email);
  const exempt = Boolean(email && (isAdminEmail(email) || premium.isPremium));
  const key = email ? `user:${normalizeEmail(email)}` : `ip:${clientIpAddress(req) || 'unknown'}`;
  return { key, exempt };
}

function currentUsageRecord(store: UsageStore, key: string): UsageRecord {
  const today = new Date().toISOString().slice(0, 10);
  const record = store.records[key];
  if (!record || record.date !== today) return { count: 0, date: today };
  return record;
}

function usageLimitFromRecord(record: UsageRecord): { allowed: boolean; remaining: number; used: number; dailyLimit: number } {
  const used = Math.min(record.count, FREE_DAILY_LIMIT);
  return {
    allowed: record.count < FREE_DAILY_LIMIT,
    remaining: Math.max(0, FREE_DAILY_LIMIT - record.count),
    used,
    dailyLimit: FREE_DAILY_LIMIT,
  };
}

function checkUsageLimit(key: string): { allowed: boolean; remaining: number; used: number; dailyLimit: number } {
  const store = readUsageStore();
  return usageLimitFromRecord(currentUsageRecord(store, key));
}

function incrementUsage(key: string): { allowed: boolean; remaining: number; used: number; dailyLimit: number } {
  const store = readUsageStore();
  const record = currentUsageRecord(store, key);
  record.count++;
  store.records[key] = record;
  writeUsageStore(store);
  return usageLimitFromRecord(record);
}

function consumeFreeUsageForRequest(req: Request): UsageInfo {
  const usageContext = getFreeUsageContext(req);
  if (usageContext.exempt) {
    return {
      allowed: true,
      remaining: FREE_DAILY_LIMIT,
      used: 0,
      dailyLimit: FREE_DAILY_LIMIT,
      unlimited: true,
    };
  }

  const before = checkUsageLimit(usageContext.key);
  if (!before.allowed) {
    return {
      allowed: false,
      remaining: before.remaining,
      used: before.used,
      dailyLimit: before.dailyLimit,
    };
  }

  const after = incrementUsage(usageContext.key);
  return {
    allowed: after.allowed,
    remaining: after.remaining,
    used: after.used,
    dailyLimit: after.dailyLimit,
  };
}

/**
 * GET /api/usage
 * Check remaining free uses
 */
app.get('/api/usage', (req: Request, res: Response) => {
  const usageContext = getFreeUsageContext(req);
  if (usageContext.exempt) {
    return res.json({
      dailyLimit: FREE_DAILY_LIMIT,
      used: 0,
      remaining: FREE_DAILY_LIMIT,
      unlimited: true,
    });
  }
  const limit = checkUsageLimit(usageContext.key);
  res.json({
    dailyLimit: FREE_DAILY_LIMIT,
    used: limit.used,
    remaining: limit.remaining,
    unlimited: false,
  });
});

app.post('/api/usage/consume', (req: Request, res: Response) => {
  const usage = consumeFreeUsageForRequest(req);
  if (!usage.allowed) {
    return res.status(429).json({
      error: '오늘 무료 이용 횟수를 모두 사용했습니다. 내일 다시 이용하거나 결제 후 이용해주세요.',
      code: 'FREE_DAILY_LIMIT_EXCEEDED',
      dailyLimit: usage.dailyLimit,
      used: usage.used,
      remaining: usage.remaining,
      unlimited: Boolean(usage.unlimited),
    });
  }

  res.json({
    dailyLimit: usage.dailyLimit,
    used: usage.used,
    remaining: usage.remaining,
    unlimited: Boolean(usage.unlimited),
  });
});

app.post('/api/contact', async (req: Request, res: Response) => {
  const body = req.body as Partial<ContactPayload>;
  const name = sanitizeLine(typeof body.name === 'string' ? body.name : '', 120);
  const email = sanitizeLine(typeof body.email === 'string' ? body.email : '', 320);
  const subject = sanitizeLine(typeof body.subject === 'string' ? body.subject : '', 150);
  const message = sanitizeMessage(typeof body.message === 'string' ? body.message : '', 5000);

  if (!name) {
    return res.status(400).json({ error: '성함을 입력해주세요.', code: 'CONTACT_NAME_REQUIRED' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: '연락 가능한 이메일을 입력해주세요.', code: 'CONTACT_EMAIL_INVALID' });
  }
  if (!subject) {
    return res.status(400).json({ error: '제목을 입력해주세요.', code: 'CONTACT_SUBJECT_REQUIRED' });
  }
  if (!message || message.length < 3) {
    return res.status(400).json({ error: '문의 내용을 3자 이상 입력해주세요.', code: 'CONTACT_MESSAGE_REQUIRED' });
  }

  if (!SMTP_HOST || !SMTP_FROM) {
    return res.status(503).json({
      error: '문의 전송이 현재 비활성화되어 있습니다.',
      code: 'CONTACT_SMTP_NOT_CONFIGURED',
    });
  }

  const senderIp = clientIpAddress(req) || 'unknown';
  const session = getSessionFromRequest(req);
  const userEmail = session?.user.email || '미로그인 사용자';
  const text = [
    `문의 접수`,
    `이름: ${name}`,
    `보내는 주소: ${email}`,
    `로그인 계정: ${userEmail}`,
    `IP: ${senderIp}`,
    `제목: ${subject}`,
    '',
    message,
  ].join('\n');
  const html = [
    `<strong>문의 접수</strong><br/>`,
    `이름: ${escapeText(name)}<br/>`,
    `보내는 주소: ${escapeText(email)}<br/>`,
    `로그인 계정: ${escapeText(userEmail)}<br/>`,
    `IP: ${escapeText(senderIp)}<br/>`,
    `제목: ${escapeText(subject)}<br/><br/>`,
    `<div style="white-space: pre-wrap;">${escapeText(message)}</div>`,
  ].join('');

  try {
    const transporter = contactTransporter();
    await transporter.verify();
    await transporter.sendMail({
      from: SMTP_FROM,
      to: CONTACT_RECIPIENT_EMAIL,
      replyTo: email,
      subject: `${CONTACT_SUBJECT_PREFIX} ${subject}`,
      text,
      html,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[CONTACT] send failed:', err instanceof Error ? err.message : err);
    res.status(500).json({
      error: '문의 메일 전송에 실패했습니다. 잠시 후 다시 시도해주세요.',
      code: 'CONTACT_SEND_FAILED',
    });
  }
});

// ============================================================
// PDF 압축 (Ghostscript)
// ============================================================
app.post('/api/compress', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  if (!commandAvailable(GHOSTSCRIPT_PATH, ['--version'])) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
    ghostscriptUnavailableResponse(res);
    return;
  }

  const preset = typeof req.body?.preset === 'string' ? req.body.preset : 'ebook';
  const allowedPresets = new Set(['screen', 'ebook', 'printer', 'prepress']);
  if (!allowedPresets.has(preset)) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
    res.status(400).json({ error: '압축 품질은 screen, ebook, printer, prepress 중 하나여야 합니다.', code: 'INVALID_COMPRESS_PRESET' });
    return;
  }

  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  const inputPath = req.file.path;
  const gsInputPath = path.join(jobDir, 'input.pdf');
  const outputPath = path.join(jobDir, 'compressed.pdf');

  try {
    fs.mkdirSync(jobDir, { recursive: true });
    fs.copyFileSync(inputPath, gsInputPath);
    try {
      await execFileAsync(GHOSTSCRIPT_PATH, [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=/${preset}`,
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSubsetFonts=true',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${outputPath}`,
        gsInputPath,
      ], { timeout: 120000 });
    } catch (err) {
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw err;
      }
      console.warn('[COMPRESS] Ghostscript returned non-zero but produced a PDF; continuing.');
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('Ghostscript 출력 파일이 생성되지 않았습니다.');
    }

    const originalSize = req.file.size;
    const compressedSize = fs.statSync(outputPath).size;
    const reductionPercent = originalSize > 0
      ? Math.max(0, Math.round((1 - compressedSize / originalSize) * 100))
      : 0;

    jobs.set(jobId, {
      id: jobId,
      status: 'completed',
      progress: 100,
      createdAt: Date.now(),
      outputPath,
      originalName: req.file.originalname,
      resultFilename: req.file.originalname.replace(/\.pdf$/i, '_compressed.pdf'),
      deleteAt: Date.now() + 10 * 60 * 1000,
    });

    res.json({ jobId, status: 'completed', progress: 100, originalSize, compressedSize, reductionPercent });
  } catch (err: any) {
    console.error(`[COMPRESS] ERROR: ${err.message || err}`);
    res.status(500).json({ error: 'PDF 압축 실패: ' + (err.message || err) });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
  }
});

// ============================================================
// PDF 암호 설정 (qpdf)
// ============================================================
app.post('/api/encrypt', requirePremium, upload.single('file'), async (req: PremiumRequest, res: Response) => {
  if (!commandAvailable(QPDF_PATH)) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
    qpdfUnavailableResponse(res);
    return;
  }
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  const { password } = req.body;
  if (!password) { res.status(400).json({ error: '비밀번호가 필요합니다.' }); return; }

  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const outputPath = path.join(jobDir, 'encrypted.pdf');

    await execFileAsync(QPDF_PATH, [
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
      ownerEmail: req.sessionRecord?.user.email,
    });
    consumeOneTimePassForRequest(req);
    res.json({ jobId, status: 'completed', progress: 100 });
  } catch (err: any) {
    res.status(500).json({ error: '암호 설정 실패: ' + (err.message || err) });
  }
});

// ============================================================
// PDF 암호 해제 (qpdf)
// ============================================================
app.post('/api/decrypt', requirePremium, upload.single('file'), async (req: PremiumRequest, res: Response) => {
  if (!commandAvailable(QPDF_PATH)) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
    qpdfUnavailableResponse(res);
    return;
  }
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  const { password } = req.body;
  if (!password) { res.status(400).json({ error: '비밀번호가 필요합니다.' }); return; }

  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const outputPath = path.join(jobDir, 'decrypted.pdf');

    await execFileAsync(QPDF_PATH, [
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
      ownerEmail: req.sessionRecord?.user.email,
    });
    consumeOneTimePassForRequest(req);
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
// HWP -> DOCX 변환 (HWP -> PDF -> DOCX chain via open-source pdf2docx)
// ============================================================
app.post('/api/convert/hwp-to-docx', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  const originalName = req.file.originalname || '';
  if (!originalName.toLowerCase().endsWith('.hwp') && !originalName.toLowerCase().endsWith('.hwpx')) {
    try { fs.unlinkSync(req.file.path); } catch { /* skip */ }
    return res.status(400).json({ error: 'HWP/HWPX 파일만 변환 가능합니다.', code: 'INVALID_FILE_TYPE' });
  }
  const missing: string[] = [];
  if (!fs.existsSync(PDF2DOCX_SCRIPT_PATH)) missing.push('pdf_to_docx.py');
  if (!commandAvailable(PYTHON_PATH, ['-c', 'import pdf2docx'])) missing.push('pdf2docx');
  if (!fs.existsSync(HWPFORGE_PATH) && !fs.existsSync(HWPX2HTML_PATH)) missing.push('hwpforge/hwpx2html');
  if (missing.length > 0) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
    res.status(503).json({ error: `HWP→DOCX 변환에 필요한 구성요소가 없습니다: ${missing.join(', ')}` });
    return;
  }
  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const isHwpx = originalName.toLowerCase().endsWith('.hwpx');
    const hwpxPath = isHwpx ? inputPath : path.join(jobDir, 'output.hwpx');
    if (!isHwpx) {
      await execFileAsync(HWPFORGE_PATH, ['convert', '--output', hwpxPath, inputPath], { timeout: 120000 });
    }
    const pdfPath = path.join(jobDir, 'output.pdf');
    await exportRhwpHwpxToPdf(hwpxPath, pdfPath, jobDir);
    const docxPath = await convertPdfToDocxWithPdf2docx(pdfPath, jobDir);
    if (!isDocxFile(docxPath)) throw new Error('생성된 파일이 유효한 DOCX 형식이 아닙니다.');
    jobs.set(jobId, {
      id: jobId, status: 'completed', progress: 100, createdAt: Date.now(),
      outputPath: docxPath, originalName: req.file.originalname,
      resultFilename: req.file.originalname.replace(/\.(hwp|hwpx)$/i, '.docx'),
      deleteAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({ jobId, status: 'completed', progress: 100, format: 'docx' });
  } catch (err: any) {
    console.error(`[HWP→DOCX] ERROR: ${err.message}`);
    res.status(500).json({ error: 'DOCX 변환 실패: ' + (err.message || err) });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
  }
});
// PDF → DOCX 변환 (editable Word document via open-source pdf2docx)
// ============================================================
app.post('/api/convert/pdf-to-docx', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }

  const missing: string[] = [];
  if (!fs.existsSync(PDF2DOCX_SCRIPT_PATH)) missing.push('pdf_to_docx.py');
  if (!commandAvailable(PYTHON_PATH, ['-c', 'import pdf2docx'])) missing.push('pdf2docx');
  if (missing.length > 0) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
    pdfToDocxUnavailableResponse(res, missing);
    return;
  }

  const convertMode = (req.body?.mode || req.body?.layoutMode || req.query?.mode) as string | undefined;
  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const outputPath = await convertPdfToDocxWithPdf2docx(inputPath, jobDir, convertMode);

    if (!isDocxFile(outputPath)) {
      throw new Error('생성된 파일이 유효한 DOCX 형식이 아닙니다.');
    }

    jobs.set(jobId, {
      id: jobId,
      status: 'completed',
      progress: 100,
      createdAt: Date.now(),
      outputPath,
      originalName: req.file.originalname,
      resultFilename: req.file.originalname.replace(/\.pdf$/i, '.docx'),
      deleteAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({ jobId, status: 'completed', progress: 100, format: 'docx' });
  } catch (err: any) {
    console.error(`[PDF→DOCX] ERROR: ${err.message}`);
    if (err.stderr) console.error(`[PDF→DOCX] STDERR: ${err.stderr}`);
    if (err.stdout) console.error(`[PDF→DOCX] STDOUT: ${err.stdout}`);
    res.status(500).json({ error: 'DOCX 변환 실패: ' + (err.message || err) });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
  }
});

// DOCX -> PDF (via LibreOffice)
app.post('/api/convert/docx-to-pdf', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  const missing: string[] = [];
  if (!commandAvailable(SOFFICE_PATH, ['--version'])) missing.push('LibreOffice');
  if (missing.length > 0) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
    res.status(503).json({ error: `DOCX→PDF 변환에 필요한 구성요소가 없습니다: ${missing.join(', ')}` });
    return;
  }
  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const outputPath = path.join(jobDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
    await execFileAsync(SOFFICE_PATH, [
      '--headless', '--convert-to', 'pdf', '--outdir', jobDir, inputPath,
    ], { timeout: 120000, env: { ...process.env, HOME: '/tmp', LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8', OOO_LOCALE: 'ko' } });
    if (!fs.existsSync(outputPath)) throw new Error('PDF 출력 파일이 생성되지 않았습니다.');
    jobs.set(jobId, {
      id: jobId, status: 'completed', progress: 100, createdAt: Date.now(),
      outputPath, originalName: req.file.originalname,
      resultFilename: req.file.originalname.replace(/\.docx$/i, '.pdf'),
      deleteAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({ jobId, status: 'completed', progress: 100, format: 'pdf' });
  } catch (err: any) {
    console.error(`[DOCX→PDF] ERROR: ${err.message}`);
    res.status(500).json({ error: 'PDF 변환 실패: ' + (err.message || err) });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
  }
});
// ============================================================
// PDF → HWP 변환 (editable native HWP text/images/vector boxes + rhwp HWP serializer)
// ============================================================
async function handlePdfToHwp(req: PremiumRequest, res: Response, outputFormat: 'hwp' | 'hwpx') {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }

  const missing: string[] = [];
  if (!commandAvailable(RHWP_INGEST_EXPORTER_PATH)) missing.push('rhwp-ingest-exporter');
  if (!commandAvailable(PYTHON_PATH, ['-c', 'import fitz'])) missing.push('python3-pymupdf(PyMuPDF)');
  if (!fs.existsSync(PDF_LAYOUT_EXTRACT_SCRIPT_PATH)) missing.push('pdf_layout_extract.py');
  if (PDF_HWP_PRIMARY_PIPELINE === 'pdf2docx-docx') {
    if (!fs.existsSync(PDF2DOCX_SCRIPT_PATH)) missing.push('pdf_to_docx.py');
    if (!commandAvailable(PYTHON_PATH, ['-c', 'import pdf2docx'])) missing.push('pdf2docx');
    if (!commandAvailable(SOFFICE_PATH, ['--version'])) missing.push('LibreOffice');
  }
  if (!commandAvailable(PDFTOTEXT_PATH, ['-v'])) missing.push('pdftotext(poppler-utils)');
  if (!commandAvailable(PDFTOHTML_PATH, ['-v'])) missing.push('pdftohtml(poppler-utils)');
  if (PDF_HWP_USES_PAGE_BACKGROUND && !commandAvailable(PDFTOPPM_PATH, ['-h'])) missing.push('pdftoppm(poppler-utils)');
  if (PDF_HWP_VISUAL_MODE === 'clean-background-visible-text' && !commandAvailable(PYTHON_PATH, ['-c', 'import PIL'])) missing.push('python3-pil(Pillow)');
  if (PDF_HWP_VISUAL_MODE === 'clean-background-visible-text' && !fs.existsSync(PDF_TEXT_ERASE_SCRIPT_PATH)) missing.push('erase_pdf_text_background.py');
  if (missing.length > 0) {
    try { fs.unlinkSync(req.file.path); } catch { /* skip */ }
    pdfToHwpUnavailableResponse(res, missing);
    return;
  }

  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const layoutXmlPath = path.join(jobDir, 'layout.xml');
    const ingestPath = path.join(jobDir, 'ingest.json');
    const outputPath = path.join(jobDir, `output.${outputFormat}`);
    let ingest: PdfLayoutIngest | null = null;

    if (PDF_HWP_PRIMARY_PIPELINE === 'pymupdf-native') {
      try {
        ingest = await createRhwpIngestFromPyMuPdfLayout(inputPath, jobDir, outputFormat !== 'hwp');
      } catch (nativeErr) {
        console.warn(`[PDF→${outputFormat.toUpperCase()}] pymupdf-native path failed; trying pdf2docx→DOCX: ${nativeErr instanceof Error ? nativeErr.message : nativeErr}`);
      }
    }

    if (!ingest && (PDF_HWP_PRIMARY_PIPELINE === 'pdf2docx-docx' || PDF_HWP_PRIMARY_PIPELINE === 'pymupdf-native')) {
      try {
        ingest = await createRhwpIngestFromPdf2DocxPipeline(inputPath, jobDir);
      } catch (docxErr) {
        console.warn(`[PDF→${outputFormat.toUpperCase()}] pdf2docx→DOCX path failed; falling back to Poppler layout: ${docxErr instanceof Error ? docxErr.message : docxErr}`);
      }
    }

    if (!ingest) {
      let pageImages: PdfPageImage[] = [];
      if (PDF_HWP_USES_PAGE_BACKGROUND) {
        await execFileAsync(PDFTOPPM_PATH, ['-png', '-r', '144', inputPath, path.join(jobDir, 'page')], { timeout: 120000 });
        pageImages = listRenderedPdfPageImages(jobDir);
        if (pageImages.length === 0) throw new Error('PDF 원본 배경 이미지를 렌더링하지 못했습니다.');
      }
      await execFileAsync(PDFTOHTML_PATH, ['-xml', '-enc', 'UTF-8', '-nodrm', inputPath, layoutXmlPath], { timeout: 60000 });
      const layoutXml = fs.existsSync(layoutXmlPath) ? fs.readFileSync(layoutXmlPath, 'utf8') : '';
      const { stdout: bboxLayoutXml } = await execFileAsync(PDFTOTEXT_PATH, ['-bbox-layout', inputPath, '-'], { timeout: 60000, maxBuffer: 20 * 1024 * 1024 });
      ingest = createRhwpIngestFromPdfHtmlLayout(layoutXml, pageImages);
      if (PDF_HWP_VISUAL_MODE !== 'editable-native') applyPdfWordBboxLayout(ingest, bboxLayoutXml);
      if (PDF_HWP_VISUAL_MODE === 'clean-background-visible-text') await createTextErasedPdfPageBackgrounds(ingest, jobDir);
    }

    if (outputFormat === 'hwpx') {
      const layout = ingest.pdf_layout;
      if (!layout) throw new Error('PDF layout missing for HWPX conversion.');
      layout.visual_mode = 'clean-background-visible-text';
      for (const page of layout.pages) {
        const tableTop = page.tables?.[0]?.y ?? Number.POSITIVE_INFINITY;
        const grouped = new Map<number, PdfLayoutTextLine[]>();
        for (const line of (page.lines || []).filter((item) => item.y < tableTop)) {
          const key = Math.round(line.y / 3);
          const group = grouped.get(key) || [];
          group.push(line);
          grouped.set(key, group);
        }
        page.lines = Array.from(grouped.values()).map((group) => {
          const ordered = group.sort((a, b) => a.x - b.x);
          const x = Math.min(...ordered.map((line) => line.x));
          const right = Math.max(...ordered.map((line) => line.x + line.width));
          return {
            ...ordered[0],
            text: ordered.map((line) => line.text).join('').trim(),
            x,
            y: Math.min(...ordered.map((line) => line.y)),
            width: Math.max(1, right - x),
          };
        });
        page.background = undefined;
        page.images = [];
        page.boxes = [];
      }
    } else if (PDF_HWP_VISUAL_MODE === 'source-image-top') {
      await attachSourceImageBackgrounds(ingest, inputPath, jobDir);
    } else {
      mergePdfVectorBoxes(ingest, await extractPdfVectorBoxes(inputPath));
    }
    fs.writeFileSync(ingestPath, JSON.stringify(ingest, null, 2), 'utf8');

    if (outputFormat === 'hwpx') {
      await createStructuredHwpxFromPdfLayout(ingest, outputPath, jobDir);
    } else {
      await execFileAsync(RHWP_INGEST_EXPORTER_PATH, [
        ingestPath, '--media-dir', jobDir, '-o', outputPath, '--format', outputFormat,
      ], { timeout: 120000, env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' } });
    }

    if (!fs.existsSync(outputPath)) throw new Error(`${outputFormat.toUpperCase()} 출력 파일이 생성되지 않았습니다.`);
    if (outputFormat === 'hwp' ? !isHwp5File(outputPath) : !isHwpxFile(outputPath)) {
      throw new Error(`생성된 파일이 유효한 ${outputFormat.toUpperCase()} 형식이 아닙니다.`);
    }

    const finalResultFilename = req.file.originalname.replace(/\.pdf$/i, `.${outputFormat}`);
    jobs.set(jobId, {
      id: jobId, status: 'completed', progress: 100, createdAt: Date.now(),
      outputPath, originalName: req.file.originalname, resultFilename: finalResultFilename,
      deleteAt: Date.now() + 10 * 60 * 1000, ownerEmail: getSessionFromRequest(req)?.user.email,
    });
    consumeOneTimePassForRequest(req);
    res.json({ jobId, status: 'completed', progress: 100, format: outputFormat });
  } catch (err: any) {
    console.error(`[PDF→${outputFormat.toUpperCase()}] ERROR: ${err.message}`);
    if (err.stderr) console.error(`[PDF→${outputFormat.toUpperCase()}] STDERR: ${err.stderr}`);
    if (err.stdout) console.error(`[PDF→${outputFormat.toUpperCase()}] STDOUT: ${err.stdout}`);
    res.status(500).json({ error: `${outputFormat.toUpperCase()} 변환 실패: ` + (err.message || err) });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
  }
}

app.post('/api/convert/pdf-to-hwp', requirePremium, upload.single('file'), async (req: PremiumRequest, res: Response) => {
  await handlePdfToHwp(req, res, 'hwp');
});

app.post('/api/convert/pdf-to-hwpx', requirePremium, upload.single('file'), async (req: PremiumRequest, res: Response) => {
  await handlePdfToHwp(req, res, 'hwpx');
});

// DOCX -> HWP (via LibreOffice ODT ingest)
app.post('/api/convert/docx-to-hwp', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  const missing: string[] = [];
  if (!commandAvailable(SOFFICE_PATH, ['--version'])) missing.push('LibreOffice');
  if (missing.length > 0) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
    pdfToHwpUnavailableResponse(res, missing);
    return;
  }
  const jobId = nanoid();
  const jobDir = path.join(OUTPUT_DIR, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = req.file.path;
    const ingestPath = path.join(jobDir, 'ingest.json');
    const outputPath = path.join(jobDir, 'output.hwp');
    console.log(`[DOCX→HWP] input=${inputPath} ingest=${ingestPath} output=${outputPath}`);
    const ingest = await createRhwpIngestFromDocx(inputPath, jobDir);
    fs.writeFileSync(ingestPath, JSON.stringify(ingest, null, 2), 'utf8');
    await execFileAsync(RHWP_INGEST_EXPORTER_PATH, [
      ingestPath, '--media-dir', jobDir, '-o', outputPath, '--format', 'hwp',
    ], { timeout: 120000, env: { ...process.env, LANG: 'ko_KR.UTF-8', LC_ALL: 'ko_KR.UTF-8' } });
    if (!fs.existsSync(outputPath)) throw new Error('HWP 출력 파일이 생성되지 않았습니다.');
    if (!isHwp5File(outputPath)) throw new Error('생성된 파일이 HWP5(OLE) 형식이 아닙니다.');
    jobs.set(jobId, {
      id: jobId, status: 'completed', progress: 100, createdAt: Date.now(),
      outputPath, originalName: req.file.originalname,
      resultFilename: req.file.originalname.replace(/\.docx$/i, '.hwp'),
      deleteAt: Date.now() + 10 * 60 * 1000,
      ownerEmail: getSessionFromRequest(req)?.user.email,
    });
    consumeOneTimePassForRequest(req);
    res.json({ jobId, status: 'completed', progress: 100, format: 'hwp' });
  } catch (err: any) {
    console.error(`[DOCX→HWP] ERROR: ${err.message}`);
    res.status(500).json({ error: 'HWP 변환 실패: ' + (err.message || err) });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* skip */ } }
  }
});
// ============================================================
// Health Check
// ============================================================
function dependencyStatus() {
  return {
    hwpforge: fs.existsSync(HWPFORGE_PATH),
    soffice: commandAvailable(SOFFICE_PATH),
    hwpx2html: fs.existsSync(HWPX2HTML_PATH),
    qpdf: commandAvailable(QPDF_PATH),
    ghostscript: commandAvailable(GHOSTSCRIPT_PATH, ['--version']),
    rhwp: commandAvailable(RHWP_PATH),
    rhwpIngestExporter: commandAvailable(RHWP_INGEST_EXPORTER_PATH),
    pdftotext: commandAvailable(PDFTOTEXT_PATH, ['-v']),
    pdftohtml: commandAvailable(PDFTOHTML_PATH, ['-v']),
    pdftoppm: commandAvailable(PDFTOPPM_PATH, ['-h']),
    imagemagick: commandAvailable(IMAGEMAGICK_PATH, ['-version']),
    chrome: commandAvailable(CHROME_PATH, ['--version']),
    pdfunite: commandAvailable(PDFUNITE_PATH, ['-v']),
    pythonPillow: commandAvailable(PYTHON_PATH, ['-c', 'import PIL']),
    pythonPyMuPDF: commandAvailable(PYTHON_PATH, ['-c', 'import fitz']),
    pdf2docx: commandAvailable(PYTHON_PATH, ['-c', 'import pdf2docx']),
    pdf2docxScript: fs.existsSync(PDF2DOCX_SCRIPT_PATH),
    pdfLayoutExtractScript: fs.existsSync(PDF_LAYOUT_EXTRACT_SCRIPT_PATH),
    pdf2docxMode: PDF2DOCX_LAYOUT_MODE,
    pdfToHwpPrimaryPipeline: PDF_HWP_PRIMARY_PIPELINE,
  };
}

function readinessProblems(): string[] {
  const problems = [...STARTUP_CONFIG_ERRORS];
  for (const dir of [UPLOAD_DIR, OUTPUT_DIR, path.dirname(AUTH_STORE_PATH), path.dirname(ADMIN_AUDIT_LOG_PATH)]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      problems.push(`Directory is not writable: ${path.basename(dir)}`);
    }
  }
  return problems;
}

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/readyz', (_req: Request, res: Response) => {
  const problems = readinessProblems();
  res.status(problems.length > 0 ? 503 : 200).json({
    status: problems.length > 0 ? 'not_ready' : 'ready',
    problems,
    production: IS_PRODUCTION,
    dependencies: dependencyStatus(),
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    ...dependencyStatus(),
  });
});

app.listen(PORT, () => {
  console.log(`PDF Master API server running on port ${PORT}`);
  console.log(`  HWPForge: ${HWPFORGE_PATH} (${fs.existsSync(HWPFORGE_PATH) ? 'OK' : 'MISSING'})`);
  console.log(`  LibreOffice: ${SOFFICE_PATH}`);
  console.log(`  hwpx2html: ${HWPX2HTML_PATH} (${fs.existsSync(HWPX2HTML_PATH) ? 'OK' : 'MISSING'})`);
  console.log(`  rhwp: ${RHWP_PATH} (${commandAvailable(RHWP_PATH) ? 'OK' : 'MISSING'})`);
  console.log(`  pdftotext: ${PDFTOTEXT_PATH} (${commandAvailable(PDFTOTEXT_PATH, ['-v']) ? 'OK' : 'MISSING'})`);
  console.log(`  pdftohtml: ${PDFTOHTML_PATH} (${commandAvailable(PDFTOHTML_PATH, ['-v']) ? 'OK' : 'MISSING'})`);
  console.log(`  pdftoppm: ${PDFTOPPM_PATH} (${commandAvailable(PDFTOPPM_PATH, ['-h']) ? 'OK' : 'MISSING'})`);
  console.log(`  imagemagick: ${IMAGEMAGICK_PATH} (${commandAvailable(IMAGEMAGICK_PATH, ['-version']) ? 'OK' : 'MISSING'})`);
  console.log(`  chrome: ${CHROME_PATH} (${commandAvailable(CHROME_PATH, ['--version']) ? 'OK' : 'MISSING'})`);
  console.log(`  pdfunite: ${PDFUNITE_PATH} (${commandAvailable(PDFUNITE_PATH, ['-v']) ? 'OK' : 'MISSING'})`);
  console.log(`  python-pillow: ${PYTHON_PATH} (${commandAvailable(PYTHON_PATH, ['-c', 'import PIL']) ? 'OK' : 'MISSING'})`);
  console.log(`  python-pymupdf: ${PYTHON_PATH} (${commandAvailable(PYTHON_PATH, ['-c', 'import fitz']) ? 'OK' : 'MISSING'})`);
  console.log(`  pdf2docx: ${PYTHON_PATH} (${commandAvailable(PYTHON_PATH, ['-c', 'import pdf2docx']) ? 'OK' : 'MISSING'})`);
  console.log(`  pdf2docx-script: ${PDF2DOCX_SCRIPT_PATH} (${fs.existsSync(PDF2DOCX_SCRIPT_PATH) ? 'OK' : 'MISSING'})`);
  console.log(`  pdf-layout-extract: ${PDF_LAYOUT_EXTRACT_SCRIPT_PATH} (${fs.existsSync(PDF_LAYOUT_EXTRACT_SCRIPT_PATH) ? 'OK' : 'MISSING'})`);
  console.log(`  PDF→DOCX mode: ${PDF2DOCX_LAYOUT_MODE}`);
  console.log(`  PDF→HWP primary pipeline: ${PDF_HWP_PRIMARY_PIPELINE}`);
  console.log(`  qpdf: ${QPDF_PATH} (${commandAvailable(QPDF_PATH) ? 'OK' : 'MISSING'})`);
  console.log(`  Ghostscript: ${GHOSTSCRIPT_PATH} (${commandAvailable(GHOSTSCRIPT_PATH, ['--version']) ? 'OK' : 'MISSING'})`);
  console.log(`  rhwp-ingest-exporter: ${RHWP_INGEST_EXPORTER_PATH} (${commandAvailable(RHWP_INGEST_EXPORTER_PATH) ? 'OK' : 'MISSING'})`);
});

export default app;
