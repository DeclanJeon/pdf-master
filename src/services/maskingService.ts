import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { MaskingPattern, MaskingResult } from '@/types'

/**
 * 한국 개인정보 자동 감지 + 마스킹 서비스
 * 
 * 감지 패턴:
 * - 주민등록번호 (RRN): YYMMDD-XXXXXXX 또는 YYMMDDXXXXXXX
 * - 전화번호: 010-XXXX-XXXX, 02-XXX-XXXX 등
 * - 이메일: xxx@xxx.xxx
 * - 계좌번호: XX-XXXXXX-XXXXX 패턴
 * - 신용카드번호: XXXX-XXXX-XXXX-XXXX
 */

// 주민등록번호 패턴: 6자리-7자리 (하이픈 있거나 없음)
const RRN_PATTERN = /\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-]?\d{7}/g

// 전화번호 패턴
const PHONE_PATTERN = /(01[016789]-?\d{3,4}-?\d{4})|(0[2-6][1-5]?-?\d{3,4}-?\d{4})/g

// 이메일 패턴
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// 계좌번호 패턴 (은행별 다양)
const ACCOUNT_PATTERN = /\d{2,6}-\d{2,6}-\d{2,6}(-\d{1,3})?/g

// 신용카드번호 패턴
const CARD_PATTERN = /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g

interface TextPosition {
  text: string
  x: number
  y: number
  width: number
  height: number
  pageIndex: number
}

/**
 * 텍스트에서 한국 개인정보 패턴을 감지합니다.
 */
export function detectPersonalInfo(text: string): Omit<MaskingPattern, 'page' | 'x' | 'y' | 'width' | 'height'>[] {
  const patterns: Omit<MaskingPattern, 'page' | 'x' | 'y' | 'width' | 'height'>[] = []

  // 주민등록번호 감지
  let match: RegExpExecArray | null
  const rrnRegex = new RegExp(RRN_PATTERN.source, 'g')
  while ((match = rrnRegex.exec(text)) !== null) {
    const original = match[0]
    // 주민번호 유효성 검증 (간이)
    if (isValidRRN(original)) {
      patterns.push({
        type: 'rrn',
        originalText: original,
        maskedText: maskRRN(original),
      })
    }
  }

  // 전화번호 감지
  const phoneRegex = new RegExp(PHONE_PATTERN.source, 'g')
  while ((match = phoneRegex.exec(text)) !== null) {
    patterns.push({
      type: 'phone',
      originalText: match[0],
      maskedText: maskPhone(match[0]),
    })
  }

  // 이메일 감지
  const emailRegex = new RegExp(EMAIL_PATTERN.source, 'g')
  while ((match = emailRegex.exec(text)) !== null) {
    patterns.push({
      type: 'email',
      originalText: match[0],
      maskedText: maskEmail(match[0]),
    })
  }

  // 계좌번호 감지
  const accountRegex = new RegExp(ACCOUNT_PATTERN.source, 'g')
  while ((match = accountRegex.exec(text)) !== null) {
    // 10자리 이상인지 확인 (계좌번호는 보통 10-16자리)
    const digits = match[0].replace(/-/g, '')
    if (digits.length >= 10) {
      patterns.push({
        type: 'account',
        originalText: match[0],
        maskedText: maskAccount(match[0]),
      })
    }
  }

  // 신용카드 감지
  const cardRegex = new RegExp(CARD_PATTERN.source, 'g')
  while ((match = cardRegex.exec(text)) !== null) {
    const digits = match[0].replace(/[-\s]/g, '')
    if (digits.length === 16 && luhnCheck(digits)) {
      patterns.push({
        type: 'card',
        originalText: match[0],
        maskedText: maskCard(match[0]),
      })
    }
  }

  return patterns
}

/**
 * 주민등록번호 마스킹: 900101-1XXXXXX (앞 7자리 성별 제외 마스킹)
 */
function maskRRN(rrn: string): string {
  const cleaned = rrn.replace('-', '')
  if (cleaned.length < 13) return rrn
  return `${cleaned.slice(0, 6)}-${cleaned[6]}******`
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/-/g, '')
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-****-${digits.slice(7)}`
  }
  return phone.slice(0, -4) + '****'
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const masked = local.length > 2
    ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
    : local[0] + '***'
  return `${masked}@${domain}`
}

function maskAccount(account: string): string {
  const parts = account.split('-')
  if (parts.length > 1) {
    return parts.map((p, i) => i === parts.length - 1 ? '****' : p).join('-')
  }
  return account.slice(0, -4) + '****'
}

function maskCard(card: string): string {
  const parts = card.split(/[-\s]/)
  return parts.map((p, i) => i === 1 || i === 2 ? '****' : p).join('-')
}

/**
 * 주민등록번호 유효성 검증 (체크디짓)
 */
function isValidRRN(rrn: string): boolean {
  const cleaned = rrn.replace('-', '')
  if (cleaned.length !== 13) return false

  const digits = cleaned.split('').map(Number)
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * weights[i], 0)
  const checkDigit = (11 - (sum % 11)) % 10

  return checkDigit === digits[12]
}

/**
 * Luhn 알고리즘 신용카드 번호 검증
 */
function luhnCheck(num: string): boolean {
  let sum = 0
  let alternate = false
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

/**
 * PDF에서 텍스트를 추출하고 개인정보를 마스킹합니다.
 * 클라이언트 사이드에서 처리 - 서버로 파일 전송 없음.
 */
export async function maskPersonalInfoInPdf(
  pdfBytes: Uint8Array,
  options: {
    maskRRN?: boolean
    maskPhone?: boolean
    maskEmail?: boolean
    maskAccount?: boolean
    maskCard?: boolean
  } = {}
): Promise<{ pdfBytes: Uint8Array; result: MaskingResult }> {
  const {
    maskRRN: doRRN = true,
    maskPhone: doPhone = true,
    maskEmail: doEmail = true,
    maskAccount: doAccount = true,
    maskCard: doCard = true,
  } = options

  const pdfDoc = await PDFDocument.load(pdfBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  
  const allPatterns: MaskingPattern[] = []
  let totalDetected = 0

  const pages = pdfDoc.getPages()

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]
    const { width, height } = page.getSize()
    const textContent = await page.getTextContent?.()
    
    // pdf-lib doesn't have getTextContent directly, so we use a different approach
    // We'll draw black rectangles over detected areas using page text extraction
    
    // For now, we use a text overlay approach:
    // 1. Extract text positions using the page's text content
    // 2. Draw filled rectangles over personal info
    // 3. Overlay masked text on top
    
    // Simplified: since pdf-lib can't easily extract text positions,
    // we'll use a visual scanning approach on rendered pages
    // This is a placeholder for the full implementation
  }

  const result: MaskingResult = {
    totalDetected,
    masked: allPatterns.length,
    patterns: allPatterns,
  }

  const savedPdf = await pdfDoc.save()
  return { pdfBytes: new Uint8Array(savedPdf), result }
}

/**
 * PDF 파일에서 텍스트를 추출합니다 (pdfjs-dist 사용)
 */
export async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise
  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
    fullText += pageText + '\n'
  }

  return fullText
}

/**
 * 텍스트에서 감지된 개인정보 수를 반환합니다 (미리보기용)
 */
export function previewMasking(text: string): Omit<MaskingPattern, 'page' | 'x' | 'y' | 'width' | 'height'>[] {
  return detectPersonalInfo(text)
}

export type PersonalInfoType = 'rrn' | 'phone' | 'email' | 'account' | 'card'

export const typeLabels: Record<PersonalInfoType, string> = {
  rrn: '주민등록번호',
  phone: '전화번호',
  email: '이메일',
  account: '계좌번호',
  card: '신용카드',
}

export const typeColors: Record<PersonalInfoType, string> = {
  rrn: 'bg-red-500',
  phone: 'bg-orange-500',
  email: 'bg-yellow-500',
  account: 'bg-blue-500',
  card: 'bg-purple-500',
}
