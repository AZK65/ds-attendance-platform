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
    // clientWidth/clientHeight are the stable layout dimensions. Unlike
    // getBoundingClientRect(), they are not distorted by a parent dialog's
    // zoom animation, browser zoom transform, or other CSS transforms.
    const layoutWidth = canvas.clientWidth
    const layoutHeight = canvas.clientHeight
    if (layoutWidth < 1 || layoutHeight < 1) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    // Snapshot current ink so orientation/layout changes do not erase it.
    const snapshot = document.createElement('canvas')
    snapshot.width = canvas.width
    snapshot.height = canvas.height
    const ctx = canvas.getContext('2d')
    if (ctx && snapshot.width > 0 && snapshot.height > 0) {
      snapshot.getContext('2d')?.drawImage(canvas, 0, 0)
    }
    canvas.width = Math.round(layoutWidth * dpr)
    canvas.height = Math.round(layoutHeight * dpr)
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    if (snapshot.width > 0 && snapshot.height > 0) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, canvas.width, canvas.height)
      ctx.restore()
    }
  }, [strokeColor, strokeWidth])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const frame = requestAnimationFrame(fitCanvas)
    const observer = new ResizeObserver(fitCanvas)
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [fitCanvas])

  const getPos = (e: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    // Pointer coordinates and rect are in transformed visual pixels. Convert
    // back to the untransformed CSS layout space used by the DPR-scaled ctx.
    const scaleX = rect.width > 0 ? canvas.clientWidth / rect.width : 1
    const scaleY = rect.height > 0 ? canvas.clientHeight / rect.height : 1
    return {
      x: ((e as PointerEvent).clientX - rect.left) * scaleX,
      y: ((e as PointerEvent).clientY - rect.top) * scaleY,
    }
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
