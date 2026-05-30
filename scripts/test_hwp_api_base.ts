import { resolveApiBase, type ApiBaseEnv } from '../src/lib/apiBase.ts'

function expectEqual(actual: string, expected: string, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nactual: ${actual}\nexpected: ${expected}`)
  }
}

function env(overrides: Partial<ApiBaseEnv>): ApiBaseEnv {
  return {
    DEV: false,
    PROD: false,
    VITE_API_URL: '',
    ...overrides,
  }
}

expectEqual(
  resolveApiBase(env({ DEV: true, VITE_API_URL: 'https://pdfm.ponslink.com' })),
  '',
  'dev with production API URL uses same-origin Vite proxy',
)

expectEqual(
  resolveApiBase(env({ DEV: true, VITE_API_URL: '' })),
  '',
  'dev with empty API URL uses same-origin Vite proxy',
)

expectEqual(
  resolveApiBase(env({ DEV: true, VITE_API_URL: 'http://localhost:3001' })),
  'http://localhost:3001',
  'dev allows localhost API URL',
)

expectEqual(
  resolveApiBase(env({ DEV: true, VITE_API_URL: 'http://127.0.0.1:3001/' })),
  'http://127.0.0.1:3001',
  'dev allows 127.0.0.1 API URL and trims trailing slash',
)

expectEqual(
  resolveApiBase(env({ PROD: true, VITE_API_URL: 'https://pdfm.ponslink.com' })),
  'https://pdfm.ponslink.com',
  'production uses configured API URL',
)

expectEqual(
  resolveApiBase(env({ PROD: true, VITE_API_URL: '' })),
  '',
  'production with empty API URL uses same-origin',
)

console.log('hwp api base tests passed')
