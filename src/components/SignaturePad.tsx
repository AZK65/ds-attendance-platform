'use client'

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

interface Props {
  /** Called whenever ink changes — passes the latest PNG data URL, or null when cleared. */
  onChange?: (dataUrl: string | null) => void
  /** Height in CSS pixels. Default 160. */
  height?: number
  /** Placeholder text shown when the canvas is empty. */
  placeholder?: string
  className?: string
  strokeColor?: string
  strokeWidth?: number
}

export interface SignaturePadHandle {
  clear: () => void
  toDataUrl: () => string | null
}

// Tablet-friendly signature canvas:
//  - Backs the canvas store with devicePixelRatio so strokes stay sharp.
//  - Uses pointer events when available (handles stylus, finger and mouse
//    uniformly without the "two listeners fighting" issues that plagued
//    the touch+mouse setup we had on /register).
//  - Disables touch-action / overscroll so dragging on the pad doesn't
//    scroll the page on iPad.
//  - Re-renders on window resize so a rotation or sidebar change keeps
//    coordinates accurate.
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { onChange, height = 160, placeholder, className, strokeColor = '#000', strokeWidth = 2.5 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    // Snapshot current ink so we can repaint after resize.
    const ctx = canvas.getContext('2d')
    let snapshot: ImageData | null = null
    if (ctx && canvas.width > 0 && canvas.height > 0) {
      try { snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height) } catch { snapshot = null }
    }
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    if (snapshot) {
      // Best-effort restore (will look right when DPR doesn't change)
      try { ctx.putImageData(snapshot, 0, 0) } catch { /* ignore */ }
    }
  }, [strokeColor, strokeWidth])

  useEffect(() => {
    fitCanvas()
    const onResize = () => fitCanvas()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitCanvas])

  const getPos = (e: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: (e as PointerEvent).clientX - rect.left, y: (e as PointerEvent).clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    drawingRef.current = true
    const canvas = canvasRef.current
    if (canvas) canvas.setPointerCapture(e.pointerId)
    const { x, y } = getPos(e)
    lastPointRef.current = { x, y }
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(x, y)
    // Dot for taps that never move
    ctx.lineTo(x + 0.01, y + 0.01)
    ctx.stroke()
    setHasInk(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    const last = lastPointRef.current
    if (last) {
      // Mid-point smoothing — gives a noticeably nicer line than raw lineTo.
      const midX = (last.x + x) / 2
      const midY = (last.y + y) / 2
      ctx.quadraticCurveTo(last.x, last.y, midX, midY)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(midX, midY)
    }
    lastPointRef.current = { x, y }
    setHasInk(true)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    canvasRef.current?.releasePointerCapture(e.pointerId)
    lastPointRef.current = null
    if (onChange && canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'))
  }

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    setHasInk(false)
    onChange?.(null)
  }, [onChange])

  useImperativeHandle(ref, () => ({
    clear,
    toDataUrl: () => (hasInk ? canvasRef.current?.toDataURL('image/png') ?? null : null),
  }), [clear, hasInk])

  return (
    <div className={`relative border-2 rounded-lg bg-white dark:bg-gray-900 overflow-hidden ${className || ''}`}>
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair"
        style={{ height, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {!hasInk && placeholder && (
        <p className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
          {placeholder}
        </p>
      )}
    </div>
  )
})
