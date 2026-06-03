import { type FormEvent, type ChangeEvent, useState } from 'react'
import { MessageSquareText, Send, Mail, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { resolveApiBase } from '@/lib/apiBase'

const CONTACT_EMAIL = 'info@ponslink.com'

export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const apiBase = resolveApiBase(import.meta.env)

  const resetForm = () => {
    setName('')
    setEmail('')
    setSubject('')
    setMessage('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      toast.error('모든 항목을 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${apiBase}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      })

      const payload = await response.json().catch(() => ({ error: '요청 처리에 실패했습니다.' }))

      if (!response.ok) {
        toast.error(typeof payload.error === 'string' ? payload.error : '문의 접수에 실패했습니다.')
        return
      }

      setSubmitted(true)
      toast.success('문의가 접수되었습니다. 빠르게 확인해드릴게요.')
      resetForm()
    } catch {
      toast.error('요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-xl border bg-white p-6 sm:p-8">
        <div className="space-y-1 text-center">
          <MessageSquareText className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="text-2xl font-bold">문의하기</h1>
          <p className="text-sm text-muted-foreground">서비스 이용, 결제, 기술 지원이 필요하면 아래 폼으로 남겨주세요.</p>
          <p className="text-sm text-muted-foreground">접수 메일: <a href={`mailto:${CONTACT_EMAIL}`} className="text-red-600 underline underline-offset-2">{CONTACT_EMAIL}</a></p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <Label htmlFor="contact-name">성함</Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              maxLength={120}
              required
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="contact-email">이메일</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={320}
              required
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="contact-subject">문의 제목</Label>
            <Input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="문의 제목을 입력해주세요"
              maxLength={150}
              required
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="contact-message">내용</Label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
              placeholder="문의 내용을 자세히 입력해 주세요"
              rows={8}
              maxLength={5000}
              required
              disabled={loading}
              className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="bg-red-600 hover:bg-red-700">
              <Send className="mr-2 h-4 w-4" />
              {loading ? '전송 중...' : '문의 보내기'}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              초기화
            </Button>
          </div>
        </form>

        {submitted && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            문의가 접수되었습니다. 접수된 주소로 답변을 보내드릴 수 있습니다.
            <div className="mt-2 flex items-center gap-1 text-green-700">
              <Mail className="h-4 w-4" />
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
