import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

/**
 * PDF 마스킹 서비스 v2
 * pdfjs-dist로 텍스트 위치를 추출하고, pdf-lib로 실제 마스킹 수행
 * 전부 클라이언트 사이드에서 처리 (서버 전송 없음)
 */

interface TextItem {
  str: string
  transform: number[] // [scaleX, skewX, skewY, scaleY, x, y]
  width: number
  height: number
  fontName: string
}

type CharPosition = {
  char: string
  item: TextItem
  charIndex: number
  x: number
  y: number
  width: number
  height: number
}

type NormalizedText = {
  text: string
  chars: CharPosition[]
}

export interface DetectedInfo {
  type: 'rrn' | 'phone' | 'email' | 'account' | 'card'
  text: string
  maskedText: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  verified?: boolean // 체크섬 검증 통과 여부 (RRN, card)
}

// 패턴 정의
const PATTERNS = {
  // RRN: normalized text removes PDF/OCR spacing first, so this covers both
  // 900101-1234567 and 9 0 0 1 0 1 - 1 2 3 4 5 6 7.
  rrn: /(?<![A-Za-z0-9])\d{6}[-]?\d{7}(?![A-Za-z0-9])/g,
  phone: /(01[016789]-?\d{3,4}-?\d{4})|(0[2-6][1-5]?-?\d{3,4}-?\d{4})/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  account: /\d{2,6}-\d{2,6}-\d{2,6}(-\d{1,3})?/g,
  card: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
}

const BUSINESS_ID_CONTEXT = /(구직\s*등록\s*번\s*호|구직등록번호|발급\s*번\s*호|발급번호|등록\s*번\s*호|등록번호)$/

// 감지 우선순위 (높을수록 우선): 같은 텍스트 영역이 겹치면 우선순위 높은 것만 유지
const TYPE_PRIORITY: Record<string, number> = {
  rrn: 5,
  phone: 4,
  card: 3,
  account: 2,
  email: 1,
}

function configurePdfWorker(pdfjsLib: typeof import('pdfjs-dist')) {
  // Keep PDF processing local and avoid a runtime dependency on the cdnjs worker.
  const url = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  )
  url.searchParams.set('v', '1') // cache busting
  pdfjsLib.GlobalWorkerOptions.workerSrc = url.toString()
}

/**
 * pdfjs-dist를 사용해 PDF에서 텍스트 위치 정보를 추출합니다.
 */
export async function extractTextPositions(pdfBytes: Uint8Array): Promise<Map<number, TextItem[]>> {
  const pdfjsLib = await import('pdfjs-dist')
  configurePdfWorker(pdfjsLib)
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise
  const textMap = new Map<number, TextItem[]>()

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()

    const items: TextItem[] = []
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const tx = item.transform
        items.push({
          str: item.str,
          transform: tx,
          width: item.width,
          height: item.height || (tx[0] !== 0 ? Math.abs(tx[0]) * 12 : 12),
          fontName: item.fontName || '',
        })
      }
    }

    textMap.set(i - 1, items)
  }

  return textMap
}

/**
 * 텍스트 위치 정보에서 개인정보를 감지합니다.
 * BUG-1: 주민번호는 패턴 매칭 + 체크섬 검증 결과를 verified 필드로 구분
 * BUG-2: 중복 감지 제거 (우선순위 적용)
 */
export function detectInfoFromPositions(textMap: Map<number, TextItem[]>): DetectedInfo[] {
  const detected: DetectedInfo[] = []

  for (const [pageIndex, items] of textMap) {
    const normalized = normalizeTextItems(items)
    const fullText = normalized.text

    // 주민등록번호 감지: PDF가 숫자를 문자 단위로 분리해도 normalized text에서 검사한다.
    let match: RegExpExecArray | null
    const rrnRegex = new RegExp(PATTERNS.rrn.source, 'g')
    while ((match = rrnRegex.exec(fullText)) !== null) {
      if (isLikelyBusinessIdentifier(fullText, match.index, match[0])) continue

      const valid = isValidRRN(match[0])
      const pos = getMatchPosition(normalized, match.index, match[0].length)
      if (pos) {
        detected.push({
          type: 'rrn',
          text: formatRRN(match[0]),
          maskedText: maskRRN(match[0]),
          pageIndex,
          verified: valid,
          ...pos,
        })
      }
    }

    // 전화번호 감지: 문자 단위로 분리된 0 3 2 - 5 4 0 - 5 6 4 1 형태도 감지한다.
    const phoneRegex = new RegExp(PATTERNS.phone.source, 'g')
    while ((match = phoneRegex.exec(fullText)) !== null) {
      if (isLikelyBusinessIdentifier(fullText, match.index, match[0])) continue

      const pos = getMatchPosition(normalized, match.index, match[0].length)
      if (pos) {
        detected.push({
          type: 'phone',
          text: formatPhone(match[0]),
          maskedText: maskPhone(match[0]),
          pageIndex,
          ...pos,
        })
      }
    }

    // 이메일 감지
    const emailRegex = new RegExp(PATTERNS.email.source, 'g')
    while ((match = emailRegex.exec(fullText)) !== null) {
      const pos = getMatchPosition(normalized, match.index, match[0].length)
      if (pos) {
        detected.push({
          type: 'email',
          text: match[0],
          maskedText: maskEmail(match[0]),
          pageIndex,
          ...pos,
        })
      }
    }

    // 계좌번호 감지 (10자리 이상)
    const accountRegex = new RegExp(PATTERNS.account.source, 'g')
    while ((match = accountRegex.exec(fullText)) !== null) {
      const digits = match[0].replace(/-/g, '')
      if (digits.length >= 10 && !isLikelyDateAccountFalsePositive(match[0])) {
        const pos = getMatchPosition(normalized, match.index, match[0].length)
        if (pos) {
          detected.push({
            type: 'account',
            text: match[0],
            maskedText: maskAccount(match[0]),
            pageIndex,
            ...pos,
          })
        }
      }
    }

    // 신용카드 감지 (Luhn 검증)
    const cardRegex = new RegExp(PATTERNS.card.source, 'g')
    while ((match = cardRegex.exec(fullText)) !== null) {
      const digits = match[0].replace(/[-\s]/g, '')
      if (digits.length === 16 && luhnCheck(digits)) {
        const pos = getMatchPosition(normalized, match.index, match[0].length)
        if (pos) {
          detected.push({
            type: 'card',
            text: match[0],
            maskedText: maskCard(match[0]),
            pageIndex,
            verified: true,
            ...pos,
          })
        }
      }
    }
  }

  // BUG-2: 중복 감지 제거 (같은 위치에 여러 타입이 감지되면 우선순위 적용)
  return deduplicateDetections(detected)
}

/**
 * 중복 감지 제거: 텍스트 영역이 겹치면 우선순위가 높은 것만 유지
 */
function deduplicateDetections(items: DetectedInfo[]): DetectedInfo[] {
  const result: DetectedInfo[] = []

  // 페이지별로 그룹핑
  const byPage = new Map<number, DetectedInfo[]>()
  for (const item of items) {
    if (!byPage.has(item.pageIndex)) byPage.set(item.pageIndex, [])
    byPage.get(item.pageIndex)!.push(item)
  }

  for (const [, pageItems] of byPage) {
    // 이미 확정된 영역
    const claimed: Array<{ x1: number; y1: number; x2: number; y2: number; type: string }> = []

    // 우선순위 높은 순으로 정렬
    const sorted = [...pageItems].sort(
      (a, b) => (TYPE_PRIORITY[b.type] || 0) - (TYPE_PRIORITY[a.type] || 0)
    )

    for (const item of sorted) {
      const ix1 = item.x
      const iy1 = item.y
      const ix2 = item.x + item.width
      const iy2 = item.y + item.height

      // 기존 확정 영역과 겹치는지 확인
      const overlaps = claimed.some(c => {
        const overlapX = Math.max(0, Math.min(ix2, c.x2) - Math.max(ix1, c.x1))
        const overlapY = Math.max(0, Math.min(iy2, c.y2) - Math.max(iy1, c.y1))
        const overlapArea = overlapX * overlapY
        const itemArea = item.width * item.height
        return overlapArea / itemArea > 0.5 // 50% 이상 겹치면 중복
      })

      if (!overlaps) {
        result.push(item)
        claimed.push({ x1: ix1, y1: iy1, x2: ix2, y2: iy2, type: item.type })
      }
    }
  }

  return result
}

/**
 * PDF.js 텍스트 아이템을 공백 제거 normalized stream으로 바꾼다.
 * 공공기관 PDF처럼 숫자가 문자 단위 아이템으로 분리되어도 정규식은 연속 문자열로 검사하고,
 * 각 normalized 문자는 원본 PDF 좌표를 보존해서 실제 마스킹 위치를 복원한다.
 */
function normalizeTextItems(items: TextItem[]): NormalizedText {
  const chars: CharPosition[] = []

  for (const item of items) {
    const raw = [...item.str]
    if (raw.length === 0) continue

    const tx = item.transform
    const widthPerChar = item.width > 0 ? item.width / raw.length : Math.abs(tx[0]) || 8
    const height = Math.abs(tx[3]) || item.height || 12

    raw.forEach((char, charIndex) => {
      if (/\s/.test(char)) return
      chars.push({
        char,
        item,
        charIndex,
        x: tx[4] + charIndex * widthPerChar,
        y: tx[5],
        width: widthPerChar,
        height,
      })
    })
  }

  return {
    text: chars.map(c => c.char).join(''),
    chars,
  }
}

function getMatchPosition(
  normalized: NormalizedText,
  matchIndex: number,
  matchLength: number
): { x: number; y: number; width: number; height: number } | null {
  const matchChars = normalized.chars.slice(matchIndex, matchIndex + matchLength)
  if (matchChars.length === 0) return null

  const xs = matchChars.map(c => c.x)
  const ys = matchChars.map(c => c.y)
  const x2s = matchChars.map(c => c.x + c.width)
  const y2s = matchChars.map(c => c.y + c.height)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const width = Math.max(...x2s) - x
  const height = Math.max(...y2s) - y

  return { x, y, width, height }
}

function isLikelyBusinessIdentifier(fullText: string, matchIndex: number, matchText: string): boolean {
  const before = fullText.slice(Math.max(0, matchIndex - 30), matchIndex)
  const after = fullText.slice(matchIndex + matchText.length, matchIndex + matchText.length + 5)

  // 구직등록번호는 보통 K + 숫자열 형태다. 주민번호로 오탐하지 않는다.
  if (/[A-Za-z]$/.test(before)) return true
  if (/^[A-Za-z0-9]/.test(after)) return true

  const compactBefore = before.replace(/\s/g, '')
  return BUSINESS_ID_CONTEXT.test(before) || BUSINESS_ID_CONTEXT.test(compactBefore)
}

function isLikelyDateAccountFalsePositive(text: string): boolean {
  const [first, second, third] = text.split('-')
  if (!first || !second || !third) return false
  const year = Number(first)
  const month = Number(second)
  const day = Number(third.slice(0, 2))
  return first.length === 4 && year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31
}

function formatRRN(rrn: string): string {
  const cleaned = rrn.replace('-', '')
  if (cleaned.length !== 13) return rrn
  return `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/-/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10 && digits.startsWith('02')) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return phone
}

/**
 * 감지된 개인정보에 마스킹을 적용합니다.
 */
export async function applyMasking(
  pdfBytes: Uint8Array,
  detected: DetectedInfo[],
  options: {
    fillColor?: [number, number, number]
    style?: 'box' | 'replace'
  } = {}
): Promise<{ pdfBytes: Uint8Array; maskedCount: number }> {
  const { style = 'replace' } = options
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pages = pdfDoc.getPages()

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  let maskedCount = 0

  for (const item of detected) {
    if (item.pageIndex >= pages.length) continue
    const page = pages[item.pageIndex]
    const { height: pageHeight } = page.getSize()

    const x = item.x
    const y = pageHeight - item.y - item.height // PDF 좌표계 변환
    const width = item.width
    const h = item.height + 4 // 여유분

    if (style === 'box') {
      page.drawRectangle({
        x: x - 2,
        y: y - 2,
        width: width + 4,
        height: h,
        color: rgb(0, 0, 0),
      })
    } else if (style === 'replace') {
      page.drawRectangle({
        x: x - 2,
        y: y - 2,
        width: width + 4,
        height: h,
        color: rgb(1, 1, 1), // 흰 박스로 덮고
      })
      page.drawText(item.maskedText, {
        x,
        y,
        size: item.height * 0.85,
        font,
        color: rgb(0, 0, 0),
      })
    }

    maskedCount++
  }

  const saved = await pdfDoc.save()
  return { pdfBytes: new Uint8Array(saved), maskedCount }
}

// 마스킹 헬퍼 함수들
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

function isValidRRN(rrn: string): boolean {
  const cleaned = rrn.replace('-', '')
  if (cleaned.length !== 13) return false
  const digits = cleaned.split('').map(Number)
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * weights[i], 0)
  const checkDigit = (11 - (sum % 11)) % 10
  return checkDigit === digits[12]
}

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
 * PDF 파일에서 텍스트를 추출합니다 (preview용)
 */
export async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  configurePdfWorker(pdfjsLib)
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
 * 텍스트에서 감지 (preview용) — 체크섬 안 되어도 감지
 */
export function previewMasking(text: string): Omit<DetectedInfo, 'pageIndex' | 'x' | 'y' | 'width' | 'height'>[] {
  const result: Omit<DetectedInfo, 'pageIndex' | 'x' | 'y' | 'width' | 'height'>[] = []
  let match: RegExpExecArray | null

  const normalizedText = text.replace(/\s+/g, '')

  const rrnRegex = new RegExp(PATTERNS.rrn.source, 'g')
  while ((match = rrnRegex.exec(normalizedText)) !== null) {
    if (isLikelyBusinessIdentifier(normalizedText, match.index, match[0])) continue
    result.push({ type: 'rrn', text: formatRRN(match[0]), maskedText: maskRRN(match[0]), verified: isValidRRN(match[0]) })
  }

  const phoneRegex = new RegExp(PATTERNS.phone.source, 'g')
  while ((match = phoneRegex.exec(normalizedText)) !== null) {
    if (isLikelyBusinessIdentifier(normalizedText, match.index, match[0])) continue
    result.push({ type: 'phone', text: formatPhone(match[0]), maskedText: maskPhone(match[0]) })
  }

  const emailRegex = new RegExp(PATTERNS.email.source, 'g')
  while ((match = emailRegex.exec(text)) !== null) {
    result.push({ type: 'email', text: match[0], maskedText: maskEmail(match[0]) })
  }

  const accountRegex = new RegExp(PATTERNS.account.source, 'g')
  while ((match = accountRegex.exec(text)) !== null) {
    const digits = match[0].replace(/-/g, '')
    if (digits.length >= 10 && !isLikelyDateAccountFalsePositive(match[0])) {
      result.push({ type: 'account', text: match[0], maskedText: maskAccount(match[0]) })
    }
  }

  const cardRegex = new RegExp(PATTERNS.card.source, 'g')
  while ((match = cardRegex.exec(text)) !== null) {
    const digits = match[0].replace(/[-\s]/g, '')
    if (digits.length === 16 && luhnCheck(digits)) {
      result.push({ type: 'card', text: match[0], maskedText: maskCard(match[0]), verified: true })
    }
  }

  // preview도 중복 제거 (텍스트 기준)
  return deduplicatePreview(result)
}

function deduplicatePreview(items: Omit<DetectedInfo, 'pageIndex' | 'x' | 'y' | 'width' | 'height'>[]): Omit<DetectedInfo, 'pageIndex' | 'x' | 'y' | 'width' | 'height'>[] {
  const result: typeof items = []
  const claimed = new Set<string>()

  // 우선순위 높은 순
  const sorted = [...items].sort((a, b) => (TYPE_PRIORITY[b.type] || 0) - (TYPE_PRIORITY[a.type] || 0))

  for (const item of sorted) {
    const key = item.text
    if (!claimed.has(key)) {
      result.push(item)
      claimed.add(key)
    }
  }

  return result
}

// 타입별 라벨/컬러 (공통 사용)
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

/**
 * 전체 마스킹 파이프라인 (한 번에 실행)
 */
export async function maskPdfPersonalInfo(
  pdfBytes: Uint8Array,
  options: {
    maskRRN?: boolean
    maskPhone?: boolean
    maskEmail?: boolean
    maskAccount?: boolean
    maskCard?: boolean
    style?: 'box' | 'replace'
  } = {}
): Promise<{ pdfBytes: Uint8Array; detected: DetectedInfo[]; maskedCount: number }> {
  const textMap = await extractTextPositions(pdfBytes)
  let detected = detectInfoFromPositions(textMap)

  // 필터링
  const typeFilter: string[] = []
  if (options.maskRRN !== false) typeFilter.push('rrn')
  if (options.maskPhone !== false) typeFilter.push('phone')
  if (options.maskEmail !== false) typeFilter.push('email')
  if (options.maskAccount) typeFilter.push('account')
  if (options.maskCard) typeFilter.push('card')

  detected = detected.filter(d => typeFilter.includes(d.type))

  const { pdfBytes: resultBytes, maskedCount } = await applyMasking(
    pdfBytes,
    detected,
    { style: options.style || 'replace' }
  )

  return { pdfBytes: resultBytes, detected, maskedCount }
}
