import { prisma } from './db'

/**
 * SAAQ attestation barcodes are issued from CertificateSettings as one
 * closed range: nextAttestationNumber through attestationNumberEnd.
 * A replacement block is stored ahead of time on AppPreference under
 * `saaqPendingAttestationRange` as JSON `{ start, end, count }`.
 *
 * The pending block is not contiguous with the current one. Numbers
 * between attestationNumberEnd and the pending start were never issued
 * by SAAQ, so once the current stock is exhausted the next claim jumps
 * to pending.start and adopts that range. It does not walk the gap.
 */
export const SAAQ_PENDING_ATTESTATION_RANGE_KEY = 'saaqPendingAttestationRange'

const EXHAUSTED_ERROR = 'Attestation number range exhausted. Please update settings with a new range.'
const CONFLICT_ERROR = 'Could not reserve unique certificate numbers. Please try again.'

export type CertificateNumberClaim =
  | {
      ok: true
      contractNumber: number
      attestationNumber: number
      schoolName: string
      schoolAddress: string
      schoolCity: string
      schoolProvince: string
      schoolPostalCode: string
      schoolNumber: string
    }
  | { ok: false; status: 400 | 409; error: string }

type PendingAttestationRange = { start: number; end: number }

class RollbackClaim extends Error {
  constructor() {
    super('certificate number claim rolled back')
  }
}

function asCounter(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

export function parsePendingAttestationRange(raw: string | null | undefined): PendingAttestationRange | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const start = asCounter((parsed as { start?: unknown }).start)
  const end = asCounter((parsed as { end?: unknown }).end)
  if (start == null || end == null || end < start) return null
  return { start, end }
}

/**
 * Atomically claim the next unused certificate numbers. updateMany is the
 * compare-and-swap, so two requests cannot take the same pair.
 *
 * Attestation numbers stay inside the current CertificateSettings range
 * until that range is exhausted. The following claim then activates
 * `saaqPendingAttestationRange` (next becomes start + 1, end becomes the
 * pending end) and returns its start. With no usable pending range the
 * claim is refused.
 */
export async function claimNextCertificateNumbers(): Promise<CertificateNumberClaim> {
  await prisma.certificateSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  })

  for (let attempt = 0; attempt < 100; attempt++) {
    const settings = await prisma.certificateSettings.findUniqueOrThrow({
      where: { id: 'default' },
    })

    const inStock = settings.nextAttestationNumber <= settings.attestationNumberEnd
    let attestationNumber = settings.nextAttestationNumber
    let nextAttestationNumber = settings.nextAttestationNumber + 1
    let attestationNumberEnd = settings.attestationNumberEnd
    let clearPendingValue: string | null = null

    if (!inStock) {
      const pendingRow = await prisma.appPreference.findUnique({
        where: { key: SAAQ_PENDING_ATTESTATION_RANGE_KEY },
      })
      const pending = parsePendingAttestationRange(pendingRow?.value)
      // A range that starts at or before the closed end would reopen stock
      // we already issued and then continue into the unissued gap.
      if (!pending || pending.start <= settings.attestationNumberEnd) {
        return { ok: false, status: 400, error: EXHAUSTED_ERROR }
      }
      attestationNumber = pending.start
      nextAttestationNumber = pending.start + 1
      attestationNumberEnd = pending.end
      clearPendingValue = pendingRow!.value
    }

    const alreadyUsed = await prisma.certificate.findFirst({
      where: {
        OR: [
          { contractNumber: String(settings.nextContractNumber) },
          { attestationNumber: String(attestationNumber) },
        ],
      },
      select: { id: true },
    })

    let claimed = false
    try {
      claimed = await prisma.$transaction(async (tx) => {
        if (clearPendingValue != null) {
          const removed = await tx.appPreference.deleteMany({
            where: {
              key: SAAQ_PENDING_ATTESTATION_RANGE_KEY,
              value: clearPendingValue,
            },
          })
          if (removed.count !== 1) return false
        }

        const updated = await tx.certificateSettings.updateMany({
          where: {
            id: 'default',
            nextContractNumber: settings.nextContractNumber,
            nextAttestationNumber: settings.nextAttestationNumber,
            attestationNumberEnd: settings.attestationNumberEnd,
          },
          data: {
            nextContractNumber: settings.nextContractNumber + 1,
            nextAttestationNumber,
            attestationNumberEnd,
          },
        })
        if (updated.count !== 1) {
          if (clearPendingValue != null) throw new RollbackClaim()
          return false
        }
        return true
      })
    } catch (error) {
      if (error instanceof RollbackClaim) continue
      throw error
    }

    if (!claimed) continue
    if (alreadyUsed) continue

    return {
      ok: true,
      contractNumber: settings.nextContractNumber,
      attestationNumber,
      schoolName: settings.schoolName,
      schoolAddress: settings.schoolAddress,
      schoolCity: settings.schoolCity,
      schoolProvince: settings.schoolProvince,
      schoolPostalCode: settings.schoolPostalCode,
      schoolNumber: settings.schoolNumber,
    }
  }

  return { ok: false, status: 409, error: CONFLICT_ERROR }
}
