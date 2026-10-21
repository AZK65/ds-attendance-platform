export function maskPhone(value: string | null | undefined): string | null {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length < 4) return null
  return `•••-•••-${digits.slice(-4)}`
}

export function maskLicence(value: string | null | undefined): string | null {
  const clean = (value || '').replace(/\s+/g, '')
  if (clean.length < 4) return null
  return `•••${clean.slice(-4)}`
}

export function scoreLabel(score: number | null | undefined, total: number | null | undefined): string | null {
  if (score == null || total == null) return null
  return `${score}/${total}`
}
