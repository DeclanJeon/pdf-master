import type { ToolInfo, ToolCategory } from '@/types'

export const tools: ToolInfo[] = [
  // 변환 (Convert)
  {
    id: 'hwp-to-pdf',
    name: '한글(HWP) → PDF 변환',
    description: '한글 문서를 PDF로 변환합니다. 글꼴과 레이아웃을 보존합니다.',
    icon: 'FileText',
    category: 'convert' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: true,
  },
  {
    id: 'pdf-to-hwp',
    name: 'PDF → HWP 변환',
    description: 'PDF를 한글에서 편집 가능한 HWP 문서로 변환합니다.',
    icon: 'FileUp',
    category: 'convert' as ToolCategory,
    isPremium: true,
    isKoreaSpecific: true,
  },
  {
    id: 'pdf-to-docx',
    name: 'PDF → Word(DOCX) 변환',
    description: 'PDF를 Word에서 편집 가능한 DOCX 문서로 변환합니다. 텍스트와 표 구조 보존을 우선합니다.',
    icon: 'FileText',
    category: 'convert' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: false,
  },
  {
    id: 'pdf-merge',
    name: 'PDF 병합',
    description: '여러 PDF를 하나로 합칩니다.',
    icon: 'Merge',
    category: 'convert' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: false,
  },
  {
    id: 'pdf-split',
    name: 'PDF 분할',
    description: 'PDF를 페이지별로 나눕니다.',
    icon: 'Split',
    category: 'convert' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: false,
  },
  {
    id: 'pdf-to-image',
    name: 'PDF → 이미지 변환',
    description: 'PDF 페이지를 고해상도 이미지로 변환합니다.',
    icon: 'Image',
    category: 'convert' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: false,
  },

  // 편집 (Edit)
  {
    id: 'pdf-stamp',
    name: '도장/인감 삽입',
    description: 'PDF에 한국식 도장, 인감, 사인을 삽입합니다. 여러 페이지에 일괄 적용 가능.',
    icon: 'Stamp',
    category: 'edit' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: true,
  },
  {
    id: 'pdf-watermark',
    name: '워터마크 삽입',
    description: 'PDF에 텍스트 또는 이미지 워터마크를 추가합니다.',
    icon: 'Droplets',
    category: 'edit' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: false,
  },
  {
    id: 'pdf-compress',
    name: 'PDF 압축',
    description: 'PDF 파일 크기를 줄입니다.',
    icon: 'FileDown',
    category: 'edit' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: false,
  },
  {
    id: 'pdf-pagenumber',
    name: '페이지 번호 추가',
    description: 'PDF에 페이지 번호를 삽입합니다.',
    icon: 'Hash',
    category: 'edit' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: false,
  },

  // 보안 (Security)
  {
    id: 'pdf-mask-rrn',
    name: '주민번호 자동 마스킹',
    description: '주민등록번호, 전화번호, 이메일 등 개인정보를 자동으로 감지하고 마스킹합니다.',
    icon: 'ShieldCheck',
    category: 'security' as ToolCategory,
    isPremium: false,
    isKoreaSpecific: true,
  },
  {
    id: 'pdf-encrypt',
    name: 'PDF 암호 설정',
    description: 'PDF에 비밀번호를 설정합니다.',
    icon: 'Lock',
    category: 'security' as ToolCategory,
    isPremium: true,
    isKoreaSpecific: false,
  },
  {
    id: 'pdf-unlock',
    name: 'PDF 암호 해제',
    description: 'PDF의 비밀번호를 해제합니다.',
    icon: 'Unlock',
    category: 'security' as ToolCategory,
    isPremium: true,
    isKoreaSpecific: false,
  },

  // 서명 (Sign)
  {
    id: 'pdf-sign',
    name: '서명 이미지 삽입',
    description: 'PDF에 손글씨 서명 이미지를 삽입합니다. 인증서 기반 법적 전자서명은 아닙니다.',
    icon: 'PenTool',
    category: 'sign' as ToolCategory,
    isPremium: true,
    isKoreaSpecific: true,
  },
]

export const categoryLabels: Record<ToolCategory, string> = {
  convert: '변환',
  edit: '편집',
  security: '보안',
  sign: '서명',
}

export const categoryDescriptions: Record<ToolCategory, string> = {
  convert: '문서 형식을 변환합니다',
  edit: 'PDF를 편집합니다',
  security: '개인정보를 보호합니다',
  sign: '서명과 도장을 추가합니다',
}

export function getToolById(id: string): ToolInfo | undefined {
  return tools.find(t => t.id === id)
}

export function getToolsByCategory(category: ToolCategory): ToolInfo[] {
  return tools.filter(t => t.category === category)
}
