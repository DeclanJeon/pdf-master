export interface ToolInfo {
  id: string
  name: string
  description: string
  icon: string
  category: ToolCategory
  isPremium: boolean
  isKoreaSpecific: boolean
}

export type ToolCategory = 'convert' | 'edit' | 'security' | 'sign'

export interface PDFPageInfo {
  pageNumber: number
  width: number
  height: number
}

export interface StampOptions {
  imageUrl: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  pageNumbers: number[]
}

export interface MaskingResult {
  totalDetected: number
  masked: number
  patterns: MaskingPattern[]
}

export interface MaskingPattern {
  type: 'rrn' | 'phone' | 'email' | 'account' | 'card'
  page: number
  x: number
  y: number
  width: number
  height: number
  originalText: string
  maskedText: string
}

export interface PricingPlan {
  id: string
  name: string
  price: number
  currency: string
  period: 'day' | 'month' | 'year'
  features: string[]
}

export type ToolStatus = 'idle' | 'loading' | 'processing' | 'done' | 'error'
