import { PDFDocument } from 'pdf-lib'
import type { StampOptions } from '@/types'

/**
 * PDF 도장/인감 삽입 서비스
 * 
 * 기능:
 * - 한국식 원형 인감 (이중 테두리, 세로쓰기)
 * - 사각 직인 (기업/관공서용)
 * - 타원 도장 (은행/금융기관용)
 * - 사용자 커스텀 도장 이미지 업로드
 * - 위치 조정, 투명도 조절, 여러 페이지 일괄 삽입, 크기 조절
 */

/**
 * 이미지 파일을 PDF에 삽입 가능한 형식으로 변환
 * SVG → Canvas → PNG 변환 지원
 */
async function embedStampImage(pdfDoc: PDFDocument, imageUrl: string) {
  const isSvgBlobUrl = imageUrl.startsWith('blob:') || imageUrl.includes('.svg') || imageUrl.startsWith('data:image/svg')
  
  if (isSvgBlobUrl) {
    const pngBytes = await svgToPng(imageUrl)
    return await pdfDoc.embedPng(pngBytes)
  }

  const response = await fetch(imageUrl)
  const arrayBuffer = await response.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  const isPng = imageUrl.toLowerCase().endsWith('.png') || 
    new Uint8Array(arrayBuffer.slice(0, 4))[0] === 0x89
  
  if (isPng) {
    return await pdfDoc.embedPng(uint8Array)
  }
  return await pdfDoc.embedJpg(uint8Array)
}

/**
 * SVG 이미지를 Canvas를 거쳐 PNG Uint8Array로 변환
 */
async function svgToPng(svgUrl: string, size = 400): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob 실패'))
          return
        }
        const arrayBuffer = await blob.arrayBuffer()
        URL.revokeObjectURL(svgUrl)
        resolve(new Uint8Array(arrayBuffer))
      }, 'image/png')
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      reject(new Error('SVG 이미지 로드 실패'))
    }
    
    img.src = svgUrl
  })
}

/**
 * PDF에 도장 이미지를 삽입합니다.
 */
export async function insertStamp(
  pdfBytes: Uint8Array,
  options: StampOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const stampImage = await embedStampImage(pdfDoc, options.imageUrl)
  
  const pages = pdfDoc.getPages()
  const targetPages = options.pageNumbers.length > 0
    ? options.pageNumbers.filter(p => p >= 1 && p <= pages.length).map(p => p - 1)
    : pages.map((_, i) => i)

  for (const pageIndex of targetPages) {
    const page = pages[pageIndex]
    const { height } = page.getSize()
    page.drawImage(stampImage, {
      x: options.x,
      y: height - options.y - options.height,
      width: options.width,
      height: options.height,
      opacity: options.opacity,
    })
  }

  const saved = await pdfDoc.save()
  return new Uint8Array(saved)
}

/**
 * 기본 도장 크기 계산 (A4 기준)
 * 일반적인 한국 도장 크기: 20mm × 20mm ≈ 56.7pt × 56.7pt
 */
export function getDefaultStampSize(_pageWidth: number): { width: number; height: number } {
  const stampSizePt = 56.7
  return { width: stampSizePt, height: stampSizePt }
}

/**
 * 기본 도장 위치 계산
 */
export function getDefaultStampPosition(
  pageWidth: number,
  pageHeight: number,
  stampWidth: number,
  stampHeight: number,
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' = 'bottom-right'
): { x: number; y: number } {
  const margin = 50

  switch (position) {
    case 'bottom-right':
      return { x: pageWidth - margin - stampWidth, y: pageHeight - margin - stampHeight }
    case 'bottom-left':
      return { x: margin, y: pageHeight - margin - stampHeight }
    case 'top-right':
      return { x: pageWidth - margin - stampWidth, y: margin }
    case 'top-left':
      return { x: margin, y: margin }
    case 'center':
      return { x: (pageWidth - stampWidth) / 2, y: (pageHeight - stampHeight) / 2 }
    default:
      return { x: pageWidth - margin - stampWidth, y: pageHeight - margin - stampHeight }
  }
}

// ============================================================
// 도장 템플릿 정의
// ============================================================

export interface StampTemplate {
  id: string
  name: string
  description: string
  color: string
  shape: 'circle' | 'square' | 'oval'
}

export const stampTemplates: StampTemplate[] = [
  {
    id: 'circle-red',
    name: '원형 인감',
    description: '가장 일반적인 한국 원형 인감 — 이중 테두리, 세로쓰기',
    color: '#C41E3A',
    shape: 'circle',
  },
  {
    id: 'circle-red-star',
    name: '원형 인감 (별문)',
    description: '중앙에 별문이 있는 전통 인감 스타일',
    color: '#C41E3A',
    shape: 'circle',
  },
  {
    id: 'square-red',
    name: '사각 직인',
    description: '기업/관공서용 사각 직인 — 이중 테두리',
    color: '#C41E3A',
    shape: 'square',
  },
  {
    id: 'oval-red',
    name: '타원 도장',
    description: '은행/금융기관용 타원 도장',
    color: '#C41E3A',
    shape: 'oval',
  },
  {
    id: 'circle-blue',
    name: '원형 도장 (파랑)',
    description: '은행/금융용 파란 원형 도장',
    color: '#1B4F8A',
    shape: 'circle',
  },
  {
    id: 'circle-red-outline',
    name: '원형 외곽인',
    description: '텍스트가 테두리를 따라 배치된 외곽인 스타일',
    color: '#C41E3A',
    shape: 'circle',
  },
  {
    id: 'square-blue',
    name: '사각 직인 (파랑)',
    description: '기업용 파란 사각 직인',
    color: '#1B4F8A',
    shape: 'square',
  },
  {
    id: 'circle-black',
    name: '원형 도장 (검정)',
    description: '심플한 검정 원형 도장',
    color: '#1A1A1A',
    shape: 'circle',
  },
]

// ============================================================
// SVG 도장 생성 함수
// ============================================================

/**
 * SVG 도장 템플릿을 생성합니다.
 * 한국 전통 도장 스타일: 이중 테두리, 세로쓰기(우→좌), 명조체
 */
export function generateStampSVG(
  template: StampTemplate,
  text: string
): string {
  const size = 400
  const { color, shape, id } = template

  // 테두리 SVG 생성
  let borderSVG = ''
  switch (shape) {
    case 'circle':
      borderSVG = generateCircleBorder(size, color, id)
      break
    case 'square':
      borderSVG = generateSquareBorder(size, color, id)
      break
    case 'oval':
      borderSVG = generateOvalBorder(size, color)
      break
  }

  // 텍스트 SVG 생성 (세로쓰기)
  let textSVG = ''
  switch (id) {
    case 'circle-red-outline':
      textSVG = generateOutlineText(size, color, text)
      break
    default:
      textSVG = generateVerticalText(size, color, text, shape)
      break
  }

  // 잉크 질감 효과 필터 (살짝 불규칙한 인쇄 효과)
  const filterSVG = `
    <defs>
      <filter id="ink-texture" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </defs>
  `

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${filterSVG}<g filter="url(#ink-texture)">${borderSVG}${textSVG}</g></svg>`
}

/**
 * 원형 이중 테두리 생성
 */
function generateCircleBorder(size: number, color: string, id: string): string {
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2 - 8
  const innerR = outerR - 12

  let extra = ''
  // 별문 스타일: 중앙에 작은 별/점
  if (id === 'circle-red-star') {
    extra = `<circle cx="${cx}" cy="${cy}" r="12" fill="${color}" opacity="0.3"/>
      <polygon points="${cx},${cy-8} ${cx+3},${cy-2} ${cx+8},${cy-2} ${cx+4},${cy+2} ${cx+6},${cy+8} ${cx},${cy+4} ${cx-6},${cy+8} ${cx-4},${cy+2} ${cx-8},${cy-2} ${cx-3},${cy-2}" fill="${color}"/>`
  }

  return `
    <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="${color}" stroke-width="6"/>
    <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="${color}" stroke-width="3"/>
    ${extra}
  `
}

/**
 * 사각 이중 테두리 생성
 */
function generateSquareBorder(size: number, color: string, id: string): string {
  const outerPad = 8
  const innerPad = outerPad + 12
  const outerW = size - outerPad * 2
  const outerH = size - outerPad * 2
  const innerW = size - innerPad * 2
  const innerH = size - innerPad * 2

  return `
    <rect x="${outerPad}" y="${outerPad}" width="${outerW}" height="${outerH}" fill="none" stroke="${color}" stroke-width="6"/>
    <rect x="${innerPad}" y="${innerPad}" width="${innerW}" height="${innerH}" fill="none" stroke="${color}" stroke-width="3"/>
  `
}

/**
 * 타원 이중 테두리 생성
 */
function generateOvalBorder(size: number, color: string): string {
  const cx = size / 2
  const cy = size / 2
  const outerRx = size / 2 - 8
  const outerRy = size / 2 - 30
  const innerRx = outerRx - 12
  const innerRy = outerRy - 8

  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${outerRx}" ry="${outerRy}" fill="none" stroke="${color}" stroke-width="6"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${innerRx}" ry="${innerRy}" fill="none" stroke="${color}" stroke-width="3"/>
  `
}

/**
 * 세로쓰기 텍스트 생성 (한국 전통 도장 스타일)
 * - 글자를 세로로 배치 (위→아래)
 * - 여러 열일 때 오른쪽 열부터 왼쪽으로 (우→좌)
 * - 글자 수에 따라 자동 레이아웃 조정
 */
function generateVerticalText(size: number, color: string, text: string, shape: 'circle' | 'square' | 'oval'): string {
  const chars = text.split('')
  const len = chars.length

  // 열당 최대 글자 수과 열 수 계산
  let cols: number
  let maxCharsPerCol: number

  if (len <= 2) {
    cols = 1
    maxCharsPerCol = len
  } else if (len <= 4) {
    cols = 2
    maxCharsPerCol = 2
  } else if (len <= 6) {
    cols = 2
    maxCharsPerCol = 3
  } else if (len <= 9) {
    cols = 3
    maxCharsPerCol = 3
  } else {
    cols = Math.ceil(len / 3)
    maxCharsPerCol = Math.ceil(len / cols)
  }

  // 폰트 크기: 도장 크기와 글자 수에 따라 조정
  const availableHeight = shape === 'oval' ? size - 120 : size - 80
  const availableWidth = shape === 'oval' ? size - 100 : size - 80
  const charSizeByHeight = availableHeight / maxCharsPerCol
  const charSizeByWidth = availableWidth / cols
  const fontSize = Math.min(charSizeByHeight, charSizeByWidth, 80) * 0.75

  // 열 간격
  const colGap = fontSize * 1.3
  const totalWidth = cols * colGap
  const startX = size / 2 + totalWidth / 2 - colGap / 2  // 오른쪽부터 시작
  const totalHeight = maxCharsPerCol * (fontSize * 1.2)
  const startY = size / 2 - totalHeight / 2 + fontSize * 0.4

  let svg = ''
  let charIndex = 0

  // 오른쪽 열부터 왼쪽으로 (한국 전통 세로쓰기 방향)
  for (let col = 0; col < cols; col++) {
    const x = startX - col * colGap
    const charsInCol = Math.min(maxCharsPerCol, len - charIndex)
    
    for (let row = 0; row < charsInCol; row++) {
      const y = startY + row * (fontSize * 1.2)
      svg += `<text x="${x}" y="${y}" fill="${color}" font-size="${fontSize}" font-family="serif, 'Noto Serif KR', 'Batang', '명조', SimSun, serif" text-anchor="middle" dominant-baseline="central">${chars[charIndex]}</text>`
      charIndex++
    }
  }

  return svg
}

/**
 * 외곽인 텍스트 생성 (텍스트가 원형 테두리를 따라 배치)
 * 상단에 성씨, 하단에 이름이 호 형태
 */
function generateOutlineText(size: string | number, color: string, text: string): string {
  const s = typeof size === 'string' ? parseInt(size) : size
  const cx = s / 2
  const cy = s / 2
  const r = s / 2 - 35  // 텍스트가 배치될 원의 반지름

  const chars = text.split('')
  const len = chars.length

  // 상단 반원에 글자 배치 (왼쪽→오른쪽)
  const topChars = len <= 2 ? chars : chars.slice(0, Math.ceil(len / 2))
  const bottomChars = len <= 2 ? [] : chars.slice(Math.ceil(len / 2))

  let svg = ''

  // 상단: 오른쪽에서 왼쪽으로 (시계 방향의 위쪽 반)
  const topStartAngle = -90 + (topChars.length - 1) * 12
  for (let i = 0; i < topChars.length; i++) {
    const angle = (topStartAngle - i * 24) * Math.PI / 180
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    const rotation = (topStartAngle - i * 24) + 90
    svg += `<text x="${x}" y="${y}" fill="${color}" font-size="32" font-family="serif, 'Noto Serif KR', 'Batang', SimSun, serif" text-anchor="middle" dominant-baseline="central" transform="rotate(${rotation}, ${x}, ${y})">${topChars[i]}</text>`
  }

  // 하단: 왼쪽에서 오른쪽으로 (시계 방향의 아래쪽 반)
  const bottomStartAngle = 90 - (bottomChars.length - 1) * 12
  for (let i = 0; i < bottomChars.length; i++) {
    const angle = (bottomStartAngle + i * 24) * Math.PI / 180
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    const rotation = (bottomStartAngle + i * 24) - 90
    svg += `<text x="${x}" y="${y}" fill="${color}" font-size="32" font-family="serif, 'Noto Serif KR', 'Batang', SimSun, serif" text-anchor="middle" dominant-baseline="central" transform="rotate(${rotation}, ${x}, ${y})">${bottomChars[i]}</text>`
  }

  return svg
}

/**
 * SVG를 Blob URL로 변환
 */
export function svgToBlobUrl(svg: string): string {
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  return URL.createObjectURL(blob)
}
