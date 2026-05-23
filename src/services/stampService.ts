import { PDFDocument } from 'pdf-lib'
import type { StampOptions } from '@/types'

/**
 * PDF 도장/인감 삽입 서비스
 * 
 * 기능:
 * - 한국식 원형 도장 이미지 삽입
 * - 직인(사각) 도장 삽입
 * - 사용자 커스텀 도장 이미지 업로드
 * - 위치 조정 (드래그앤드롭)
 * - 투명도 조절
 * - 여러 페이지 일괄 삽입
 * - 크기 조절
 */

/**
 * 이미지 파일을 PDF에 삽입 가능한 형식으로 변환
 */
async function embedStampImage(pdfDoc: PDFDocument, imageUrl: string) {
  const response = await fetch(imageUrl)
  const arrayBuffer = await response.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  // PNG 투명도 지원을 위해 PNG 우선, 그 외 JPG
  const isPng = imageUrl.toLowerCase().endsWith('.png') || 
    new Uint8Array(arrayBuffer.slice(0, 4))[0] === 0x89
  
  if (isPng) {
    return await pdfDoc.embedPng(uint8Array)
  }
  return await pdfDoc.embedJpg(uint8Array)
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
    : pages.map((_, i) => i) // 기본: 모든 페이지

  for (const pageIndex of targetPages) {
    const page = pages[pageIndex]
    const { height } = page.getSize()

    // PDF 좌표계: 좌측 하단이 원점
    page.drawImage(stampImage, {
      x: options.x,
      y: height - options.y - options.height, // 상단 기준을 PDF 하단 기준으로 변환
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
export function getDefaultStampSize(pageWidth: number): { width: number; height: number } {
  // A4 기준 도장 크기 (20mm)
  const stampSizePt = 56.7
  return { width: stampSizePt, height: stampSizePt }
}

/**
 * 기본 도장 위치 계산 (우측 하단 서명란)
 * 한국 문서에서 도장은 보통 우측 하단에 위치
 */
export function getDefaultStampPosition(
  pageWidth: number,
  pageHeight: number,
  stampWidth: number,
  stampHeight: number,
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' = 'bottom-right'
): { x: number; y: number } {
  const margin = 50 // 여백

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

/**
 * 기본 도장 템플릿 목록 (SVG 기반)
 */
export const stampTemplates = [
  {
    id: 'circle-red',
    name: '원형 인감 (빨강)',
    description: '가장 일반적인 한국 원형 인감',
    color: '#DC2626',
    shape: 'circle' as const,
  },
  {
    id: 'square-red',
    name: '사각 직인 (빨강)',
    description: '기업/관공서용 사각 직인',
    color: '#DC2626',
    shape: 'square' as const,
  },
  {
    id: 'oval-red',
    name: '타원 도장 (빨강)',
    description: '중간 크기 타원 도장',
    color: '#DC2626',
    shape: 'oval' as const,
  },
  {
    id: 'circle-blue',
    name: '원형 도장 (파랑)',
    description: '은행/금융기관용 파란 도장',
    color: '#2563EB',
    shape: 'circle' as const,
  },
]

/**
 * SVG 도장 템플릿을 생성합니다.
 */
export function generateStampSVG(
  template: typeof stampTemplates[number],
  text: string
): string {
  const size = 200
  const { color, shape } = template

  let borderSVG = ''
  if (shape === 'circle') {
    borderSVG = `<circle cx="${size/2}" cy="${size/2}" r="${size/2 - 4}" fill="none" stroke="${color}" stroke-width="6"/>`
  } else if (shape === 'square') {
    borderSVG = `<rect x="4" y="4" width="${size-8}" height="${size-8}" fill="none" stroke="${color}" stroke-width="6"/>`
  } else {
    borderSVG = `<ellipse cx="${size/2}" cy="${size/2}" rx="${size/2 - 4}" ry="${size/2 - 15}" fill="none" stroke="${color}" stroke-width="6"/>`
  }

  // 텍스트를 도장 내부에 배치
  const chars = text.split('')
  const fontSize = chars.length <= 2 ? 50 : chars.length <= 4 ? 36 : 24
  const lineHeight = fontSize + 8
  const startY = size / 2 - ((Math.ceil(chars.length / 2) - 1) * lineHeight) / 2

  let textSVG = ''
  for (let i = 0; i < chars.length; i++) {
    const row = Math.floor(i / 2)
    const col = i % 2
    const x = chars.length <= 2 
      ? size / 2 
      : col === 0 ? size / 2 - fontSize / 2 - 5 : size / 2 + fontSize / 2 + 5
    const y = chars.length <= 2 
      ? size / 2 + (i * lineHeight)
      : startY + row * lineHeight
    
    textSVG += `<text x="${x}" y="${y}" fill="${color}" font-size="${fontSize}" font-family="serif" text-anchor="middle" dominant-baseline="central">${chars[i]}</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${borderSVG}${textSVG}</svg>`
}

/**
 * SVG를 Blob URL로 변환
 */
export function svgToBlobUrl(svg: string): string {
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  return URL.createObjectURL(blob)
}
