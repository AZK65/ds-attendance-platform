import { NextResponse } from 'next/server'
import { Rsep1Error } from './errors'

export function rsep1Json(error: unknown) {
  if (error instanceof Rsep1Error) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status })
  }
  console.error('[rsep1]', error)
  return NextResponse.json({ error: 'rsep1_failed' }, { status: 500 })
}
