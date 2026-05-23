import { PDFDocument } from 'pdf-lib'
import type { StampOptions } from '@/types'

/**
 * PDF 도장/인감 삽입 서비스
 * 
 * 기능:
 * - 사용자 커스텀 도장 이미지 업로드
 * - 위치 조정 (드래그), 투명도 조절, 여러 페이지 일괄 삽입, 크기 조절
 */

/**
 * 이미지 파일을 PDF에 삽입 가능한 형식으로 변환
 * SVG → Canvas → PNG 변환 지원
 */
async function embedStampImage(pdfDoc: PDFDocument, imageUrl: string) {
  const isSvgBlobUrl = imageUrl.startsWith('blob:') && imageUrl.includes('svg')
    || imageUrl.startsWith('data:image/svg')
  
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
