import { detectInfoFromPositions, previewMasking } from '../src/services/maskingServiceV2.ts'

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nactual: ${JSON.stringify(actual)}\nexpected: ${JSON.stringify(expected)}`)
  }
}

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function makeItems(text: string) {
  let x = 10
  return [...text].map((char) => {
    const item = {
      str: char,
      transform: [8, 0, 0, 10, x, 100],
      width: char.trim() ? 8 : 4,
      height: 10,
      fontName: 'TestFont',
    }
    x += item.width
    return item
  })
}

function typesFromPreview(text: string) {
  return previewMasking(text).map(item => `${item.type}:${item.text}`)
}

const spacedPreview = typesFromPreview('주민번호 9 0 0 1 0 1 - 1 2 3 4 5 6 7 연락처 0 3 2 - 5 4 0 - 5 6 4 1')
expectEqual(spacedPreview, [
  'rrn:900101-1234567',
  'phone:032-540-5641',
], 'preview detects spaced RRN and phone')

const jobRegistrationPreview = previewMasking('구직등록번호 K 1 5 0 1 1 2 6 0 5 1 3 0 1 3 6')
expect(!jobRegistrationPreview.some(item => item.type === 'rrn'), 'preview does not treat job registration number as RRN')

const positioned = detectInfoFromPositions(new Map([[0, makeItems('주민번호 9 0 0 1 0 1 - 1 2 3 4 5 6 7 연락처 0 3 2 - 5 4 0 - 5 6 4 1')]] as any))
expectEqual(positioned.map(item => `${item.type}:${item.text}`), [
  'rrn:900101-1234567',
  'phone:032-540-5641',
], 'positioned detection detects spaced RRN and phone')
expect(positioned.every(item => item.width > 0 && item.height > 0), 'detections include positive mask boxes')

const positionedJobRegistration = detectInfoFromPositions(new Map([[0, makeItems('구직등록번호 K 1 5 0 1 1 2 6 0 5 1 3 0 1 3 6')]] as any))
expect(!positionedJobRegistration.some(item => item.type === 'rrn'), 'positioned detection does not treat job registration number as RRN')
expect(!positionedJobRegistration.some(item => item.type === 'phone'), 'positioned detection does not treat job registration number as phone')

const positionedDate = detectInfoFromPositions(new Map([[0, makeItems('발급일시 2026-05-22 17:53:39')]] as any))
expect(!positionedDate.some(item => item.type === 'account'), 'positioned detection does not treat date/time as account')

console.log('masking detection regression tests passed')
