'use client'

import { useEffect, useRef } from 'react'

/**
 * Cloudflare Turnstile — the captcha on the public registration form.
 *
 * Renders NOTHING when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, so the form
 * works unchanged until the keys are added (and on local dev). The server
 * mirrors this: src/lib/bot-guard.ts skips verification when the secret is
 * missing, and enforces it once present.
 *
 * Uses the "managed" widget, which is invisible for almost every real visitor
 * and only shows an interactive challenge when Cloudflare is suspicious.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const holderRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  // Keep the latest callback without re-rendering the widget on every parent
  // state change (the form re-renders constantly as fields are typed).
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!siteKey || !holderRef.current) return
    let cancelled = false

    const render = () => {
      if (cancelled || !window.turnstile || !holderRef.current) return
      if (widgetIdRef.current) return // already rendered
      widgetIdRef.current = window.turnstile.render(holderRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        'error-callback': () => onTokenRef.current(''),
        'expired-callback': () => onTokenRef.current(''),
        theme: 'light',
      })
    }

    if (window.turnstile) {
      render()
    } else if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement('script')
      s.id = SCRIPT_ID
      s.src = SCRIPT_SRC
      s.async = true
      s.defer = true
      s.onload = render
      document.head.appendChild(s)
    } else {
      // Script is in flight from an earlier mount — poll briefly for readiness.
      const t = setInterval(() => {
        if (window.turnstile) {
          clearInterval(t)
          render()
        }
      }, 200)
      setTimeout(() => clearInterval(t), 10_000)
    }

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* already gone */ }
        widgetIdRef.current = null
      }
    }
  }, [siteKey])

  if (!siteKey) return null
  return <div ref={holderRef} className="flex justify-center my-3" />
}
