import { NextResponse } from 'next/server'
import { Rsep1Error } from '@/lib/rsep1/errors'

export class SaaqError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message?: string) {
    super(message || code)
    this.name = 'SaaqError'
    this.status = status
    this.code = code
  }
}

export function saaqJson(error: unknown) {
  if (error instanceof SaaqError || error instanceof Rsep1Error) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status })
  }
  console.error('[saaq-attestations]', error)
  return NextResponse.json({ error: 'saaq_failed', message: 'Could not save the attestation' }, { status: 500 })
}
