/**
 * maskingService.ts — V2로 통합됨
 * 모든 기능은 maskingServiceV2.ts에서 제공
 * 이 파일은 하위 호환성을 위한 re-export만 유지
 */

export {
  extractTextFromPdf,
  previewMasking,
  maskPdfPersonalInfo,
  typeLabels,
  typeColors,
  type DetectedInfo,
  type PersonalInfoType,
} from './maskingServiceV2'

// 구 MaskingPattern 타입 호환
export type MaskingPattern = {
  type: 'rrn' | 'phone' | 'email' | 'account' | 'card'
  originalText: string
  maskedText: string
  page?: number
  x?: number
  y?: number
  width?: number
  height?: number
}

export type MaskingResult = {
  totalDetected: number
  masked: number
  patterns: MaskingPattern[]
}
