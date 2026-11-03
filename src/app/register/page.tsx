'use client'

import { LangProvider } from './i18n'
import { RegisterPageInner } from './registration-form'

export default function RegisterPage() {
  return (
    <LangProvider>
      <RegisterPageInner />
    </LangProvider>
  )
}
