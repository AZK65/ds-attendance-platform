'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import NextImage from 'next/image'
import { Loader2 } from 'lucide-react'

type Mode = 'login' | 'reset-request' | 'reset-confirm'

export default function StudyLoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const post = (body: Record<string, unknown>) =>
    fetch('/api/lms/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'login') {
        const res = await post({ action: 'login', username, password })
        if (res.ok) { router.replace('/study'); router.refresh(); return }
        setError((await res.json()).error || 'Login failed')
      } else if (mode === 'reset-request') {
        const res = await post({ action: 'reset-request', username })
        if (res.ok) { setInfo('If that account exists, a reset code was sent to the student’s WhatsApp.'); setMode('reset-confirm') }
        else setError((await res.json()).error || 'Could not send code')
      } else {
        const res = await post({ action: 'reset-confirm', username, code, newPassword })
        if (res.ok) { setInfo('Password updated. You can log in now.'); setMode('login'); setPassword('') }
        else setError((await res.json()).error || 'Reset failed')
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5] text-[#0B0B0F] p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-black/[0.07] p-7">
        <div className="flex flex-col items-center text-center mb-6">
          <NextImage src="/qazi-logo.png" alt="Qazi Driving School" width={120} height={40} priority className="h-9 w-auto mb-4" />
          <h1 className="text-[26px] leading-tight tracking-tight">
            <span className="font-sans">Qazi </span>
            <span className="font-serif italic text-[#E11D2E]">Study Portal</span>
          </h1>
          <p className="text-sm text-ink/60 mt-1">
            {mode === 'login' ? 'Sign in to your course' : 'Reset your password'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-ink/60">Username</label>
            <input
              className="mt-1 w-full rounded-xl border border-black/[0.12] px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#E11D2E]"
              placeholder="first.last@qazidrivingschool.ca"
              autoCapitalize="none" autoCorrect="off"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>

          {mode === 'login' && (
            <div>
              <label className="text-xs font-medium text-ink/60">Password</label>
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-black/[0.12] px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#E11D2E]"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {mode === 'reset-confirm' && (
            <>
              <div>
                <label className="text-xs font-medium text-ink/60">6-digit code (from WhatsApp)</label>
                <input
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-black/[0.12] px-3 py-2.5 text-sm bg-white tracking-widest focus:outline-none focus:border-[#E11D2E]"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink/60">New password</label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-black/[0.12] px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#E11D2E]"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-[#C5121F]">{error}</p>}
          {info && <p className="text-sm text-green-600">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#0B0B0F] text-white py-2.5 text-sm font-medium hover:bg-black disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : mode === 'reset-request' ? 'Send reset code' : 'Set new password'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === 'login' ? (
            <button className="text-ink/60 hover:underline" onClick={() => { setMode('reset-request'); setError(''); setInfo('') }}>
              Forgot password?
            </button>
          ) : (
            <button className="text-ink/60 hover:underline" onClick={() => { setMode('login'); setError(''); setInfo('') }}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
