'use client'

/**
 * Round student avatar. Renders the actual photo when one is on file,
 * otherwise falls back to a coloured circle with the student's initials.
 * Initials and background colour are derived from the name so the same
 * student always gets the same fallback colour, which makes scanning a
 * list of students nicer.
 *
 * Pass `zoomable` to make a real photo open in a fullscreen spotlight
 * lightbox on click (used on profile pages). The initials fallback is
 * never zoomable since there's nothing to enlarge.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'

interface Props {
  src?: string | null
  name?: string | null
  size?: number      // CSS px, default 48
  className?: string
  zoomable?: boolean
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

function AvatarLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
        aria-label="Close"
      >
        <X className="h-7 w-7" />
      </button>
      <motion.img
        src={src}
        alt={alt}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl cursor-default"
      />
    </motion.div>,
    document.body
  )
}

export function StudentAvatar({ src, name, size = 48, className, zoomable }: Props) {
  const [open, setOpen] = useState(false)

  if (src) {
    const canZoom = !!zoomable
    return (
      <>
        <img
          src={src}
          alt={name || 'Student'}
          className={`rounded-full object-cover border ${canZoom ? 'cursor-zoom-in transition-opacity hover:opacity-90' : ''} ${className || ''}`}
          style={{ width: size, height: size }}
          onClick={canZoom ? (e) => { e.stopPropagation(); setOpen(true) } : undefined}
        />
        {canZoom && (
          <AnimatePresence>
            {open && (
              <AvatarLightbox src={src} alt={name || 'Student'} onClose={() => setOpen(false)} />
            )}
          </AnimatePresence>
        )}
      </>
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
