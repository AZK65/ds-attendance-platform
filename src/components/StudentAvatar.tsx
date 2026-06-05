'use client'

/**
 * Round student avatar. Renders the actual photo when one is on file,
 * otherwise falls back to a coloured circle with the student's initials.
 * Initials and background colour are derived from the name so the same
 * student always gets the same fallback colour, which makes scanning a
 * list of students nicer.
 */

interface Props {
  src?: string | null
  name?: string | null
  size?: number      // CSS px, default 48
  className?: string
}

// Deterministic colour pick based on the name string. Eight tasteful
// tints to keep the page from looking like a circus.
const PALETTE = [
  'bg-rose-200 text-rose-900',
  'bg-amber-200 text-amber-900',
  'bg-emerald-200 text-emerald-900',
  'bg-sky-200 text-sky-900',
  'bg-indigo-200 text-indigo-900',
  'bg-violet-200 text-violet-900',
  'bg-fuchsia-200 text-fuchsia-900',
  'bg-orange-200 text-orange-900',
]
function pickColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}
function initials(name: string): string {
  const parts = name.replace(/\s*#\d+\s*/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]!.toUpperCase()
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase()
}

export function StudentAvatar({ src, name, size = 48, className }: Props) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Student'}
        className={`rounded-full object-cover border ${className || ''}`}
        style={{ width: size, height: size }}
      />
    )
  }
  const safeName = (name || '').trim() || '—'
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold border ${pickColor(safeName)} ${className || ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-label={safeName}
    >
      {initials(safeName)}
    </div>
  )
}
