export interface ApiBaseEnv {
  DEV: boolean
  PROD: boolean
  VITE_API_URL?: string
}

const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function normalizeApiUrl(apiUrl: string | undefined) {
  return (apiUrl ?? '').trim().replace(/\/+$/, '')
}

function isLocalApiUrl(apiUrl: string) {
  try {
    const url = new URL(apiUrl)
    return LOCAL_API_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export function resolveApiBase(env: ApiBaseEnv) {
  const configuredApiUrl = normalizeApiUrl(env.VITE_API_URL)

  if (!configuredApiUrl) return ''
  if (env.DEV) return isLocalApiUrl(configuredApiUrl) ? configuredApiUrl : ''
  if (env.PROD) return configuredApiUrl

  return configuredApiUrl
}
