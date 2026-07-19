'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NextImage from 'next/image'
import { LogOut, Loader2 } from 'lucide-react'

interface Me { authed: boolean; name?: string; vehicleType?: string }

// Wraps every logged-in study page: checks the session, shows a branded
// header with logout, and redirects to /study/login when not authenticated.
export function StudyShell({ children }: { children: (me: Me) => React.ReactNode }) {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/lms/auth')
      .then(r => r.json())
      .then((d: Me) => {
        if (cancelled) return
        if (!d.authed) { router.replace('/study/login'); return }
        setMe(d)
      })
      .catch(() => { if (!cancelled) router.replace('/study/login') })
    return () => { cancelled = true }
  }, [router])

  const logout = async () => {
    await fetch('/api/lms/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) })
    router.replace('/study/login')
  }

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5]">
        <Loader2 className="h-6 w-6 animate-spin text-ink/40" />
      </div>
    )
  }

  const firstName = me.name ? me.name.split(/[ ,]/)[0] : ''

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#0B0B0F]">
      <header className="sticky top-0 z-10 bg-white border-b border-black/[0.07]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/study" className="flex items-center">
            <NextImage src="/qazi-logo.png" alt="Qazi Driving School" width={96} height={32} priority className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            {firstName && <span className="text-sm text-ink/60 hidden sm:inline">{firstName}</span>}
            <button onClick={logout} className="text-sm text-ink/60 hover:text-ink flex items-center gap-1">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children(me)}</main>
    </div>
  )
}
