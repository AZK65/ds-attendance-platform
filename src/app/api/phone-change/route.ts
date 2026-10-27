import { NextRequest, NextResponse } from 'next/server'
import { checkWhatsAppNumber } from '@/lib/whatsapp/client'
import {
  PhoneChangeError,
  applyPhoneChange,
  listPhoneChanges,
  type WhatsAppCheckSnapshot,
} from '@/lib/phone-change'
import { liveRoster } from '@/lib/phone-change-roster'
import { normalizeNorthAmericanPhone } from '@/lib/phone-normalize'
import { staffActor } from '@/lib/staff-actor'

async function readWhatsApp(phone: string): Promise<WhatsAppCheckSnapshot> {
  try {
    const result = await checkWhatsAppNumber(phone)
    if (result.registered) {
      return { status: 'registered', jid: result.jid ?? null, detail: 'This number is on WhatsApp.' }
    }
    return { status: 'not_registered', jid: null, detail: 'This number is not on WhatsApp.' }
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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const externalRaw = params.get('externalStudentId')
  const externalStudentId = externalRaw && /^\d+$/.test(externalRaw) ? Number(externalRaw) : null
  const phone = params.get('phone')
  const logs = await listPhoneChanges({
    externalStudentId,
    localStudentId: params.get('localStudentId'),
    contactId: params.get('contactId'),
    phone,
  })
  return NextResponse.json({
    logs: logs.map(log => ({
      id: log.id,
      oldPhone: log.oldPhone,
      newPhone: log.newPhone,
      oldDisplay: normalizeNorthAmericanPhone(log.oldPhone)?.display ?? log.oldPhone,
      newDisplay: normalizeNorthAmericanPhone(log.newPhone)?.display ?? log.newPhone,
      actorLabel: log.actorLabel,
      studentName: log.studentName,
      recordsUpdated: log.recordsUpdated,
      whatsappRegistered: log.whatsappRegistered,
      whatsappDetail: log.whatsappDetail,
      duplicateWarning: log.duplicateWarning,
      groupAction: log.groupAction,
      groupActionDetail: log.groupActionDetail,
      createdAt: log.createdAt,
    })),
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const normalized = normalizeNorthAmericanPhone(body.newPhone)
    if (!normalized) {
      return NextResponse.json(
        { error: 'Enter a North American number, such as 514-546-0150 or 15145460150.' },
        { status: 400 },
      )
    }
    const whatsapp = await readWhatsApp(normalized.digits)
    const actor = await staffActor(request)
    const result = await applyPhoneChange({
      oldPhone: body.oldPhone,
      newPhone: body.newPhone,
      externalStudentId: body.externalStudentId ?? null,
      localStudentId: body.localStudentId ?? null,
      contactId: body.contactId ?? null,
      name: body.name ?? null,
      whatsappJid: whatsapp.jid ?? null,
    }, actor, liveRoster(), whatsapp)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[phone-change] update failed:', error)
    return NextResponse.json({ error: 'Could not change that phone number.' }, { status: 500 })
  }
}
