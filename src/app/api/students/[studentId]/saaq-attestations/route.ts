import { NextRequest, NextResponse } from 'next/server'
import { resolveClass1 } from '@/lib/rsep1/access'
import { saaqJson } from '@/lib/saaq-attestations/errors'
import { actorFromRequest, staffUnauthorized } from '@/lib/saaq-attestations/http'
import {
  deleteAttestationFile,
  editReceivedOn,
  getAttestations,
  uploadAttestation,
} from '@/lib/saaq-attestations/store'
import { parseKind, parseReason, parseReceivedOn } from '@/lib/saaq-attestations/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function class1(studentId: string) {
  return resolveClass1(studentId)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const denied = staffUnauthorized(request)
  if (denied) return denied
  try {
    const { studentId } = await params
    const ctx = await class1(studentId)
    return NextResponse.json(await getAttestations(ctx.externalStudentId))
  } catch (error) {
    return saaqJson(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const denied = staffUnauthorized(request)
  if (denied) return denied
  try {
    const { studentId } = await params
    const ctx = await class1(studentId)
    const form = await request.formData()
    const uploaded = form.get('file')
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: 'file_required', message: 'Choose a file' }, { status: 400 })
    }
    const bytes = Buffer.from(await uploaded.arrayBuffer())
    const kind = parseKind(form.get('kind'))
    const receivedOn = parseReceivedOn(form.get('receivedOn'))
    const reasonValue = form.get('reason')
    const view = await uploadAttestation({
      externalStudentId: ctx.externalStudentId,
      kind,
      bytes,
      originalName: uploaded.name || 'document',
      receivedOn,
      reason: typeof reasonValue === 'string' ? reasonValue : null,
      actor: await actorFromRequest(request),
    })
    return NextResponse.json(view)
  } catch (error) {
    return saaqJson(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const denied = staffUnauthorized(request)
  if (denied) return denied
  try {
    const { studentId } = await params
    const ctx = await class1(studentId)
    const body = await request.json().catch(() => ({}))
    const view = await editReceivedOn({
      externalStudentId: ctx.externalStudentId,
      kind: parseKind(body.kind),
      receivedOn: parseReceivedOn(body.receivedOn),
      reason: parseReason(body.reason),
      actor: await actorFromRequest(request),
    })
    return NextResponse.json(view)
  } catch (error) {
    return saaqJson(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const denied = staffUnauthorized(request)
  if (denied) return denied
  try {
    const { studentId } = await params
    const ctx = await class1(studentId)
    const body = await request.json().catch(() => ({}))
    const fileId = typeof body.fileId === 'string' ? body.fileId : ''
    const view = await deleteAttestationFile({
      externalStudentId: ctx.externalStudentId,
      fileId,
      reason: parseReason(body.reason),
      actor: await actorFromRequest(request),
    })
    return NextResponse.json(view)
  } catch (error) {
    return saaqJson(error)
  }
}
