import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { applyMasking, detectInfoFromPositions, previewMasking } from '../src/services/maskingServiceV2.ts'

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

async function testMaskingCoordinates() {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([612, 792])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  page.drawText('RRN: 900101-1234567', { x: 80, y: 700, size: 14, font })

  const originalBytes = await pdfDoc.save()
  const detected = [{
    type: 'rrn' as const,
    text: '900101-1234567',
    maskedText: '900101-1******',
    pageIndex: 0,
    x: 80,
    y: 700,
    width: 144,
    height: 14,
  }]
  const result = await applyMasking(new Uint8Array(originalBytes), detected, { style: 'box' })
  writeFileSync('/tmp/masking-coordinate-regression.pdf', result.pdfBytes)

  execFileSync('pdftoppm', ['-png', '-r', '72', '/tmp/masking-coordinate-regression.pdf', '/tmp/masking-coordinate-regression'])
  execFileSync('python3', ['-c', `
from PIL import Image
img = Image.open('/tmp/masking-coordinate-regression-1.png').convert('RGB')
# PDF y=700 on a 792pt page should render near image y≈80 from the top.
# If the old flipped coordinate is used, the black box appears near y≈700 instead.
top_pixel = img.getpixel((85, 84))
bottom_pixel = img.getpixel((85, 705))
def is_black(p): return max(p) < 40
def is_white(p): return min(p) > 220
if not is_black(top_pixel):
    raise SystemExit(f'expected black mask near original text at top coordinate, got {top_pixel}')
if not is_white(bottom_pixel):
    raise SystemExit(f'expected no mirrored mask near bottom coordinate, got {bottom_pixel}')
`])
}

await testMaskingCoordinates()
console.log('masking coordinate regression tests passed')
