'use client'

// Kiosk-mode wrapper around the existing /register flow. Strips the
// public nav and footer chrome so the iPad shows only the registration
// content edge-to-edge, and resets to the select screen after each
// completed submission. Reuses RegisterPageInner so we don't fork the
// 800-line state machine.

import { LangProvider } from '@/app/register/i18n'
import { RegisterPageInner } from '@/app/register/page'

export default function KioskRegisterPage() {
  return (
    <LangProvider>
      <div className="min-h-screen">
        <RegisterPageInner kiosk />
      </div>
    </LangProvider>
  )
}
