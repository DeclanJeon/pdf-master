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

interface DetectedInfo {
  type: 'rrn' | 'phone' | 'email' | 'account' | 'card'
  text: string
  maskedText: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
}

// 패턴 정의
const PATTERNS = {
  rrn: /\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-]?\d{7}/g,
  phone: /(01[016789]-?\d{3,4}-?\d{4})|(0[2-6][1-5]?-?\d{3,4}-?\d{4})/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  account: /\d{2,6}-\d{2,6}-\d{2,6}(-\d{1,3})?/g,
  card: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
}

/**
 * pdfjs-dist를 사용해 PDF에서 텍스트 위치 정보를 추출합니다.
 */
export async function extractTextPositions(pdfBytes: Uint8Array): Promise<Map<number, TextItem[]>> {
  const pdfjsLib = await import('pdfjs-dist')
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise
  const textMap = new Map<number, TextItem[]>()

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1 })

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
 */
export function detectInfoFromPositions(textMap: Map<number, TextItem[]>): DetectedInfo[] {
  const detected: DetectedInfo[] = []

  for (const [pageIndex, items] of textMap) {
    // 전체 텍스트 결합
    const fullText = items.map(item => item.str).join(' ')

    // 주민등록번호 감지
    let match: RegExpExecArray | null
    const rrnRegex = new RegExp(PATTERNS.rrn.source, 'g')
    while ((match = rrnRegex.exec(fullText)) !== null) {
      if (isValidRRN(match[0])) {
        const pos = findTextPosition(items, match.index, match[0])
        if (pos) {
          detected.push({
            type: 'rrn',
            text: match[0],
            maskedText: maskRRN(match[0]),
            pageIndex,
            ...pos,
          })
        }
      }
    }

    // 전화번호 감지
    const phoneRegex = new RegExp(PATTERNS.phone.source, 'g')
    while ((match = phoneRegex.exec(fullText)) !== null) {
      const pos = findTextPosition(items, match.index, match[0])
      if (pos) {
        detected.push({
          type: 'phone',
          text: match[0],
          maskedText: maskPhone(match[0]),
          pageIndex,
          ...pos,
        })
      }
    }

    // 이메일 감지
    const emailRegex = new RegExp(PATTERNS.email.source, 'g')
    while ((match = emailRegex.exec(fullText)) !== null) {
      const pos = findTextPosition(items, match.index, match[0])
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
  }

  return detected
}

/**
 * 감지된 위치에서 매칭되는 텍스트 아이템의 위치를 찾습니다.
 */
function findTextPosition(
  items: TextItem[],
  matchIndex: number,
  matchText: string
): { x: number; y: number; width: number; height: number } | null {
  let charIndex = 0
  let startX = 0
  let startY = 0
  let maxWidth = 0
  let maxHeight = 0
  let found = false

  for (const item of items) {
    const itemStart = charIndex
    const itemEnd = charIndex + item.str.length

    if (matchIndex >= itemStart && matchIndex < itemEnd) {
      // 시작 위치 발견
      const offsetInItem = matchIndex - itemStart
      const tx = item.transform
      startX = tx[4] + (offsetInItem > 0 ? offsetInItem * (item.width / item.str.length) : 0)
      startY = tx[5]
      found = true
    }

    if (found) {
      maxWidth += item.width * (Math.min(matchText.length, itemEnd - matchIndex) / item.str.length)
      maxHeight = Math.max(maxHeight, Math.abs(item.transform[3]) || item.height)

      const endOfMatch = matchIndex + matchText.length
      if (itemEnd >= endOfMatch) break
    }

    charIndex = itemEnd + 1 // 공백 고려
  }

  if (!found) return null
  return { x: startX, y: startY, width: maxWidth || 100, height: maxHeight || 14 }
}

/**
 * 감지된 개인정보에 검은 박스를 그려 마스킹합니다.
 */
export async function applyMasking(
  pdfBytes: Uint8Array,
  detected: DetectedInfo[],
  options: {
    fillColor?: [number, number, number] // RGB 0-1
    style?: 'box' | 'blur' | 'replace'
  } = {}
): Promise<{ pdfBytes: Uint8Array; maskedCount: number }> {
  const { style = 'box' } = options
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
      // 검은 박스로 덮기
      page.drawRectangle({
        x: x - 2,
        y: y - 2,
        width: width + 4,
        height: h,
        color: rgb(0, 0, 0),
      })
    } else if (style === 'replace') {
      // 텍스트를 마스킹된 버전으로 교체
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
