import { NextRequest, NextResponse } from 'next/server'
import { checkWhatsAppNumber } from '@/lib/whatsapp/client'
import { PhoneChangeError, previewPhoneChange, type WhatsAppCheckSnapshot } from '@/lib/phone-change'
import { liveRoster } from '@/lib/phone-change-roster'

async function readWhatsApp(phone: string): Promise<WhatsAppCheckSnapshot> {
  try {
    const result = await checkWhatsAppNumber(phone)
    if (result.registered) {
      return {
        status: 'registered',
        jid: result.jid ?? null,
        detail: 'This number is on WhatsApp.',
      }
    }
    return {
      status: 'not_registered',
      jid: null,
      detail: 'This number is not on WhatsApp.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp could not be checked.'
    const offline = /not connected/i.test(message)
    return {
      status: 'unavailable',
      jid: null,
      detail: offline
        ? 'WhatsApp is not connected, so this number could not be checked.'
        : message,
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const preview = await previewPhoneChange({
      oldPhone: body.oldPhone,
      newPhone: body.newPhone,
      externalStudentId: body.externalStudentId ?? null,
      localStudentId: body.localStudentId ?? null,
      contactId: body.contactId ?? null,
      name: body.name ?? null,
    }, liveRoster())
    const whatsapp = preview.sameNumber ? null : await readWhatsApp(preview.normalized.digits)
    return NextResponse.json({ ...preview, whatsapp })
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[phone-change] preview failed:', error)
    return NextResponse.json({ error: 'Could not check that number.' }, { status: 500 })
  }
}
