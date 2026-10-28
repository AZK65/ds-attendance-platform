import { randomBytes } from 'crypto'
import { mkdir, open, readFile, rm, stat } from 'fs/promises'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import type { SaaqAttestationFile } from '@prisma/client'
import { prisma } from '@/lib/db'
import { todayToronto } from '@/lib/rsep1/values'
import { SaaqError } from './errors'
import {
  absoluteFromStored,
  cleanOriginalName,
  sha256Hex,
  storedRelativePath,
  type AttestationKind,
  type SniffedType,
} from './sniff'
import {
  assertUploadBytes,
  emptySlot,
  parseReceivedOn,
  type DateChange,
  type FileHistoryItem,
} from './validate'

export interface AttestationActor {
  sessionId: string | null
  ipAddress: string | null
}

export interface AttestationSlot {
  kind: AttestationKind
  status: 'not_received' | 'received'
  receivedOn: string | null
  current: FileHistoryItem | null
  history: FileHistoryItem[]
  dateChanges: DateChange[]
}

export interface AttestationOverview {
  externalStudentId: number
  today: string
  slots: {
    theory: AttestationSlot
    practical: AttestationSlot
  }
}

function newId(): string {
  return `c${randomBytes(16).toString('hex').slice(0, 24)}`
}

async function assertPdfLoads(bytes: Buffer) {
  try {
    // Read-only. The bytes we store are the upload itself, never doc.save().
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
    if (doc.getPageCount() < 1) throw new Error('no pages')
  } catch {
    throw new SaaqError(400, 'invalid_pdf', 'This PDF could not be opened')
  }
}

async function writeExclusive(relative: string, bytes: Buffer) {
  const absolute = absoluteFromStored(relative)
  await mkdir(path.dirname(absolute), { recursive: true })
  const handle = await open(absolute, 'wx')
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } catch (error) {
    await handle.close()
    await rm(absolute, { force: true })
    throw error
  }
  await handle.close()
  return absolute
}

async function fileStillOnDisk(file: SaaqAttestationFile): Promise<boolean> {
  if (!file.storedPath || file.deletedAt) return false
  try {
    const info = await stat(absoluteFromStored(file.storedPath))
    return info.isFile() && info.size === file.sizeBytes
  } catch {
    return false
  }
}

function presentFile(file: SaaqAttestationFile, available: boolean): FileHistoryItem {
  let action: FileHistoryItem['action'] = 'uploaded'
  let actionAt = file.uploadedAt.toISOString()
  if (file.deletedAt) {
    action = 'removed'
    actionAt = file.deletedAt.toISOString()
  } else if (file.replacedAt) {
    action = 'replaced'
    actionAt = file.replacedAt.toISOString()
  }
  return {
    id: file.id,
    version: file.version,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    uploadedAt: file.uploadedAt.toISOString(),
    action,
    actionAt,
    replaceReason: file.replaceReason,
    deletedReason: file.deletedReason,
    available,
  }
}

function readReceivedOn(json: string | null): string | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as { receivedOn?: unknown }
    if (parsed.receivedOn === null) return null
    if (typeof parsed.receivedOn === 'string') return parsed.receivedOn
  } catch {
    return null
  }
  return null
}

async function presentSlot(
  kind: AttestationKind,
  row: {
    id: string
    receivedOn: string | null
    currentFileId: string | null
    files: SaaqAttestationFile[]
  } | null,
): Promise<AttestationSlot> {
  if (!row) return emptySlot(kind)
  const availability = new Map<string, boolean>()
  for (const file of row.files) availability.set(file.id, await fileStillOnDisk(file))
  const currentRow = row.currentFileId
    ? row.files.find(file => file.id === row.currentFileId && !file.deletedAt) || null
    : null
  const currentAvailable = currentRow ? availability.get(currentRow.id) === true : false
  const corrections = await prisma.theoryCorrection.findMany({
    where: { entityType: 'SaaqAttestation', entityId: row.id, kind: 'received_date' },
    orderBy: { createdAt: 'desc' },
  })
  const history = row.files
    .filter(file => file.id !== currentRow?.id)
    .sort((a, b) => b.version - a.version)
    .map(file => presentFile(file, availability.get(file.id) === true))
  return {
    kind,
    status: currentAvailable ? 'received' : 'not_received',
    receivedOn: currentAvailable ? row.receivedOn : null,
    current: currentRow ? presentFile(currentRow, currentAvailable) : null,
    history,
    dateChanges: corrections.map(correction => ({
      at: correction.createdAt.toISOString(),
      before: readReceivedOn(correction.beforeJson),
      after: readReceivedOn(correction.afterJson),
      reason: correction.reason,
    })),
  }
}

export async function getAttestations(externalStudentId: number, now = new Date()): Promise<AttestationOverview> {
  const rows = await prisma.saaqAttestation.findMany({
    where: { externalStudentId },
    include: { files: true },
  })
  const theory = rows.find(row => row.kind === 'theory') || null
  const practical = rows.find(row => row.kind === 'practical') || null
  return {
    externalStudentId,
    today: todayToronto(now),
    slots: {
      theory: await presentSlot('theory', theory),
      practical: await presentSlot('practical', practical),
    },
  }
}

async function prepareBytes(bytes: Buffer, sniffed: SniffedType) {
  if (sniffed.extension === 'pdf') await assertPdfLoads(bytes)
}

export async function uploadAttestation(input: {
  externalStudentId: number
  kind: AttestationKind
  bytes: Buffer
  originalName: string
  receivedOn: string
  reason?: string | null
  actor: AttestationActor
}): Promise<AttestationOverview> {
  const sniffed = assertUploadBytes(input.bytes)
  const receivedOn = parseReceivedOn(input.receivedOn)
  await prepareBytes(input.bytes, sniffed)
  const hash = sha256Hex(input.bytes)
  const attestation = await prisma.saaqAttestation.upsert({
    where: { externalStudentId_kind: { externalStudentId: input.externalStudentId, kind: input.kind } },
    create: { id: newId(), externalStudentId: input.externalStudentId, kind: input.kind },
    update: {},
  })
  const fileId = newId()
  const relative = storedRelativePath(attestation.id, fileId, sniffed.extension)
  const absolute = await writeExclusive(relative, input.bytes)
  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.saaqAttestation.findUniqueOrThrow({ where: { id: attestation.id } })
      const previous = fresh.currentFileId
        ? await tx.saaqAttestationFile.findUnique({ where: { id: fresh.currentFileId } })
        : null
      const replacing = Boolean(previous && !previous.deletedAt && previous.storedPath)
      const reason = replacing ? (input.reason || '').trim() : ''
      if (replacing && !reason) throw new SaaqError(400, 'reason_required', 'Replacing a file needs a reason')
      if (reason.length > 500) throw new SaaqError(400, 'reason_too_long', 'Reason must be 500 characters or fewer')
      const latest = await tx.saaqAttestationFile.findFirst({
        where: { attestationId: attestation.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      await tx.saaqAttestationFile.create({
        data: {
          id: fileId,
          attestationId: attestation.id,
          version: (latest?.version || 0) + 1,
          storedPath: relative,
          originalName: cleanOriginalName(input.originalName),
          mimeType: sniffed.mimeType,
          sizeBytes: input.bytes.length,
          sha256: hash,
          uploadedBySession: input.actor.sessionId,
          uploadedByIp: input.actor.ipAddress,
        },
      })
      if (replacing && previous) {
        await tx.saaqAttestationFile.update({
          where: { id: previous.id },
          data: { replacedAt: new Date(), replaceReason: reason },
        })
        await tx.theoryCorrection.create({
          data: {
            entityType: 'SaaqAttestation',
            entityId: attestation.id,
            kind: 'replace',
            beforeJson: JSON.stringify({
              fileId: previous.id,
              originalName: previous.originalName,
              sha256: previous.sha256,
            }),
            afterJson: JSON.stringify({
              fileId,
              sha256: hash,
              sessionId: input.actor.sessionId,
              ipAddress: input.actor.ipAddress,
            }),
            reason,
            internalOnly: true,
          },
        })
      }
      const dateChanged = fresh.receivedOn !== receivedOn && fresh.receivedOn != null
      await tx.saaqAttestation.update({
        where: { id: attestation.id },
        data: { currentFileId: fileId, receivedOn },
      })
      if (dateChanged) {
        await tx.theoryCorrection.create({
          data: {
            entityType: 'SaaqAttestation',
            entityId: attestation.id,
            kind: 'received_date',
            beforeJson: JSON.stringify({ receivedOn: fresh.receivedOn }),
            afterJson: JSON.stringify({
              receivedOn,
              sessionId: input.actor.sessionId,
              ipAddress: input.actor.ipAddress,
            }),
            reason: reason || 'Updated with the new file',
            internalOnly: true,
          },
        })
      }
    })
  } catch (error) {
    await rm(absolute, { force: true })
    throw error
  }
  return getAttestations(input.externalStudentId)
}

export async function editReceivedOn(input: {
  externalStudentId: number
  kind: AttestationKind
  receivedOn: string
  reason: string
  actor: AttestationActor
}): Promise<AttestationOverview> {
  const receivedOn = parseReceivedOn(input.receivedOn)
  const attestation = await prisma.saaqAttestation.findUnique({
    where: { externalStudentId_kind: { externalStudentId: input.externalStudentId, kind: input.kind } },
  })
  if (!attestation?.currentFileId) {
    throw new SaaqError(400, 'not_received', 'There is no current document to date')
  }
  const current = await prisma.saaqAttestationFile.findUnique({ where: { id: attestation.currentFileId } })
  if (!current || current.deletedAt || !(await fileStillOnDisk(current))) {
    throw new SaaqError(400, 'not_received', 'There is no current document to date')
  }
  if (attestation.receivedOn === receivedOn) {
    throw new SaaqError(400, 'date_unchanged', 'That is already the date received')
  }
  await prisma.$transaction([
    prisma.saaqAttestation.update({
      where: { id: attestation.id },
      data: { receivedOn },
    }),
    prisma.theoryCorrection.create({
      data: {
        entityType: 'SaaqAttestation',
        entityId: attestation.id,
        kind: 'received_date',
        beforeJson: JSON.stringify({ receivedOn: attestation.receivedOn }),
        afterJson: JSON.stringify({
          receivedOn,
          sessionId: input.actor.sessionId,
          ipAddress: input.actor.ipAddress,
        }),
        reason: input.reason,
        internalOnly: true,
      },
    }),
  ])
  return getAttestations(input.externalStudentId)
}

/**
 * Removes the file bytes. The row stays (name, size, hash, reason, time).
 * Deleting the current file sets the slot back to Not received and does not
 * restore an older version — a wrong-student upload must not come back on its own.
 */
export async function deleteAttestationFile(input: {
  externalStudentId: number
  fileId: string
  reason: string
  actor: AttestationActor
}): Promise<AttestationOverview> {
  const file = await prisma.saaqAttestationFile.findUnique({
    where: { id: input.fileId },
    include: { attestation: true },
  })
  if (!file || file.attestation.externalStudentId !== input.externalStudentId) {
    throw new SaaqError(404, 'not_found', 'File not found')
  }
  if (file.deletedAt) {
    if (file.storedPath) {
      await rm(absoluteFromStored(file.storedPath), { force: true })
      await prisma.saaqAttestationFile.update({ where: { id: file.id }, data: { storedPath: null } })
    }
    return getAttestations(input.externalStudentId)
  }
  if (!file.storedPath) throw new SaaqError(404, 'not_found', 'File not found')
  const absolute = absoluteFromStored(file.storedPath)
  const isCurrent = file.attestation.currentFileId === file.id
  await prisma.$transaction(async (tx) => {
    await tx.saaqAttestationFile.update({
      where: { id: file.id },
      data: {
        deletedAt: new Date(),
        deletedReason: input.reason,
        deletedBySession: input.actor.sessionId,
        deletedByIp: input.actor.ipAddress,
      },
    })
    if (isCurrent) {
      await tx.saaqAttestation.update({
        where: { id: file.attestationId },
        data: { currentFileId: null, receivedOn: null },
      })
    }
    await tx.theoryCorrection.create({
      data: {
        entityType: 'SaaqAttestation',
        entityId: file.attestationId,
        kind: 'delete',
        beforeJson: JSON.stringify({
          fileId: file.id,
          originalName: file.originalName,
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
          receivedOn: isCurrent ? file.attestation.receivedOn : null,
        }),
        afterJson: JSON.stringify({
          bytesRemoved: true,
          receivedOn: isCurrent ? null : file.attestation.receivedOn,
          sessionId: input.actor.sessionId,
          ipAddress: input.actor.ipAddress,
        }),
        reason: input.reason,
        internalOnly: true,
      },
    })
    if (isCurrent && file.attestation.receivedOn) {
      await tx.theoryCorrection.create({
        data: {
          entityType: 'SaaqAttestation',
          entityId: file.attestationId,
          kind: 'received_date',
          beforeJson: JSON.stringify({ receivedOn: file.attestation.receivedOn }),
          afterJson: JSON.stringify({
            receivedOn: null,
            sessionId: input.actor.sessionId,
            ipAddress: input.actor.ipAddress,
          }),
          reason: input.reason,
          internalOnly: true,
        },
      })
    }
  })
  try {
    await rm(absolute)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw new SaaqError(500, 'delete_failed', 'The file record was cleared, but the bytes could not be removed')
    }
  }
  await prisma.saaqAttestationFile.update({ where: { id: file.id }, data: { storedPath: null } })
  return getAttestations(input.externalStudentId)
}

export async function readAttestationBytes(externalStudentId: number, fileId: string) {
  const file = await prisma.saaqAttestationFile.findUnique({
    where: { id: fileId },
    include: { attestation: true },
  })
  if (!file || file.attestation.externalStudentId !== externalStudentId || !file.storedPath || file.deletedAt) {
    throw new SaaqError(404, 'not_found', 'File not found')
  }
  if (file.mimeType !== 'application/pdf' && !file.mimeType.startsWith('image/')) {
    throw new SaaqError(404, 'not_found', 'File not found')
  }
  const absolute = absoluteFromStored(file.storedPath)
  const bytes = await readFile(absolute)
  if (sha256Hex(bytes) !== file.sha256) {
    throw new SaaqError(500, 'hash_mismatch', 'Stored file does not match its recorded hash')
  }
  return { bytes, mimeType: file.mimeType, originalName: file.originalName }
}

export async function currentAttestationFiles(externalStudentId: number) {
  const view = await getAttestations(externalStudentId)
  const files: Array<{ filename: string; bytes: Buffer; contentType: string }> = []
  for (const slot of [view.slots.theory, view.slots.practical]) {
    if (slot.status !== 'received' || !slot.current?.available) continue
    const file = await readAttestationBytes(externalStudentId, slot.current.id)
    const extension = file.mimeType === 'application/pdf'
      ? 'pdf'
      : file.mimeType === 'image/png'
        ? 'png'
        : file.mimeType === 'image/webp'
          ? 'webp'
          : file.mimeType === 'image/heic'
            ? 'heic'
            : 'jpg'
    files.push({
      filename: `SAAQ Attestations/${slot.kind}-attestation.${extension}`,
      bytes: file.bytes,
      contentType: file.mimeType,
    })
  }
  return files
}
