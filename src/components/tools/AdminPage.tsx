import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, ShieldCheck, UserSearch, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

type PremiumStatus = {
  isPremium: boolean
  plan: 'one_time' | 'monthly' | 'unknown' | 'admin' | null
  expiresAt: string | null
  oneTimePasses: number
}

type AuthState = {
  loading: boolean
  loggedIn: boolean
  user: { email: string; name: string; avatarUrl?: string } | null
  premium: PremiumStatus | null
}

type AdminSummary = {
  userCount: number
  premiumUserCount: number
  monthlyUserCount: number
  oneTimePassCount: number
  adminEmailsConfigured: number
}

type AdminUser = {
  email: string
  name: string | null
  sessionCount: number
  premium: PremiumStatus
  updatedAt: string | null
}

type AuditLog = {
  id: string
  createdAt: string
  actorEmail: string
  action: string
  targetEmail: string
  reason: string
}

const EMPTY_SUMMARY: AdminSummary = {
  userCount: 0,
  premiumUserCount: 0,
  monthlyUserCount: 0,
  oneTimePassCount: 0,
  adminEmailsConfigured: 0,
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init })
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`JSON API 응답이 아닙니다 (${response.status})`)
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : `요청 실패 (${response.status})`
    throw new Error(message)
  }
  return data as T
}

export default function AdminPage() {
  const [auth, setAuth] = useState<AuthState>({ loading: true, loggedIn: false, user: null, premium: null })
  const [summary, setSummary] = useState<AdminSummary>(EMPTY_SUMMARY)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [query, setQuery] = useState('')
  const [selectedEmail, setSelectedEmail] = useState('')
  const [plan, setPlan] = useState<'one_time' | 'monthly'>('one_time')
  const [reason, setReason] = useState('고객지원 수동 처리')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const isAdminForbidden = useMemo(() => message.includes('관리자 권한'), [message])

  const loadAdminData = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const [authData, summaryData, userData, logData] = await Promise.all([
        fetchJson<AuthState>('/api/auth/me'),
        fetchJson<AdminSummary>('/api/admin/summary'),
        fetchJson<{ users: AdminUser[] }>('/api/admin/users'),
        fetchJson<{ logs: AuditLog[] }>('/api/admin/audit-logs?limit=20'),
      ])
      setAuth({ ...authData, loggedIn: Boolean(authData.loggedIn), loading: false })
      setSummary({ ...EMPTY_SUMMARY, ...summaryData })
      setUsers(userData.users || [])
      setLogs(logData.logs || [])
      setSelectedEmail((current) => current || userData.users?.[0]?.email || '')
    } catch (err) {
      const authData = await fetch('/api/auth/me', { credentials: 'include' }).then((res) => {
        const contentType = res.headers.get('content-type') || ''
        return contentType.includes('application/json') ? res.json() : null
      }).catch(() => null)
      setAuth(authData ? { ...authData, loggedIn: Boolean(authData.loggedIn), loading: false } : { loading: false, loggedIn: false, user: null, premium: null })
      setMessage(err instanceof Error ? err.message : '관리자 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAdminData()
  }, [loadAdminData])

  const searchUsers = async () => {
    const data = await fetchJson<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`)
    setUsers(data.users)
  }

  const mutatePremium = async (action: 'grant' | 'revoke') => {
    if (!selectedEmail || !reason.trim()) {
      setMessage('email과 reason은 필수입니다.')
      return
    }
    const url = action === 'grant' ? '/api/admin/grant-premium' : '/api/admin/revoke-premium'
    await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: selectedEmail, plan, reason }),
    })
    setMessage(action === 'grant' ? '프리미엄 권한을 부여했습니다.' : '프리미엄 권한을 회수했습니다.')
    await loadAdminData()
  }

  const loginAsAdmin = () => {
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent('/admin')}`
  }

  if (auth.loading || loading) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <Loader2 className="w-10 h-10 mx-auto animate-spin text-red-600 mb-4" />
        <p className="text-muted-foreground">관리자 권한을 확인하는 중...</p>
      </div>
    )
  }

  if (!auth.loggedIn || isAdminForbidden) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <Card>
          <CardHeader className="text-center">
            <ShieldCheck className="w-12 h-12 mx-auto text-red-600" />
            <CardTitle>관리자 로그인이 필요합니다</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Google 로그인 세션이 있고 ADMIN_EMAILS allowlist에 포함된 계정만 접근할 수 있습니다.
            </p>
            {message && <p className="text-sm text-red-600">{message}</p>}
            <Button onClick={loginAsAdmin}>Google로 관리자 로그인</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl py-8 space-y-6 px-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-red-600" />관리자 운영</h1>
          <p className="text-sm text-muted-foreground">로그인: {auth.user?.email}</p>
        </div>
        <Button variant="outline" onClick={loadAdminData}>새로고침</Button>
      </div>

      {message && <div className="rounded-lg border px-4 py-3 text-sm">{message}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="총 사용자" value={summary.userCount} />
        <MetricCard title="프리미엄" value={summary.premiumUserCount} />
        <MetricCard title="월 구독" value={summary.monthlyUserCount} />
        <MetricCard title="일회권 잔량" value={summary.oneTimePassCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserSearch className="w-5 h-5" />사용자/권한 조회</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="email/name 검색" />
              <Button variant="outline" onClick={searchUsers}>검색</Button>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-auto">
              {users.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  onClick={() => setSelectedEmail(user.email)}
                  className={`w-full rounded-lg border p-3 text-left transition ${selectedEmail === user.email ? 'border-red-500 bg-red-50' : 'hover:bg-muted'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <p className="text-xs text-muted-foreground">세션 {user.sessionCount}개 · {user.updatedAt ? new Date(user.updatedAt).toLocaleString('ko-KR') : '변경 없음'}</p>
                    </div>
                    <PremiumBadge premium={user.premium} />
                  </div>
                </button>
              ))}
              {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">조회된 사용자가 없습니다.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>권한 수동 조정</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input value={selectedEmail} onChange={(event) => setSelectedEmail(event.target.value)} placeholder="customer@example.com" />
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={plan} onChange={(event) => setPlan(event.target.value as 'one_time' | 'monthly')}>
              <option value="one_time">건당 이용권 1회</option>
              <option value="monthly">월 구독 30일</option>
            </select>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="조정 사유" />
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => mutatePremium('grant')}>권한 부여</Button>
              <Button variant="destructive" onClick={() => mutatePremium('revoke')}>권한 회수</Button>
            </div>
            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              모든 조작은 actor/action/target/reason/before/after와 함께 감사 로그에 기록됩니다.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>최근 감사 로그</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{log.action} → {log.targetEmail}</span>
                <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('ko-KR')}</span>
              </div>
              <p className="text-xs text-muted-foreground">actor={log.actorEmail}; reason={log.reason}</p>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-muted-foreground">아직 감사 로그가 없습니다.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

function PremiumBadge({ premium }: { premium: PremiumStatus }) {
  if (premium.isPremium) {
    const label = premium.plan === 'admin' ? '관리자' : premium.plan === 'monthly' ? '월구독' : `${premium.oneTimePasses}회`
    return <Badge className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />{label}</Badge>
  }
  return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />무료</Badge>
}
