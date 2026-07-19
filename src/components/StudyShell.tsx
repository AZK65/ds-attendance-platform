'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap, LogOut, Loader2 } from 'lucide-react'

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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/study" className="flex items-center gap-2 font-bold">
            <span className="h-8 w-8 rounded-lg bg-[#E11D2E] text-white flex items-center justify-center">
              <GraduationCap className="h-4 w-4" />
            </span>
            Qazi Study
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{me.name}</span>
            <button onClick={logout} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children(me)}</main>
    </div>
  )
}
