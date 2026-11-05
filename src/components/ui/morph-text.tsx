'use client'
import { TextMorph } from 'torph/react'

type MorphTextProps = {
  children: string | number
  className?: string
  locale?: string
  /** Reserve space for a button's longest state without shifting its neighbours. */
  reserve?: string
}

/** Presentation only: never interpolates data or delays the accessible value.
 * The animated glyphs are hidden from assistive technology; a single plain-text
 * copy stays current. Torph honours reduced motion and leaves SSR text intact.
 */
export function MorphText({ children, className = '', locale = 'en-CA', reserve }: MorphTextProps) {
  const text = String(children)
  return (
    <span className={`inline-grid max-w-full align-baseline tabular-nums ${className}`} data-morph-text="">
      <span className="sr-only">{text}</span>
      {reserve && <span aria-hidden="true" className="invisible col-start-1 row-start-1 pointer-events-none select-none">{reserve}</span>}
      <span aria-hidden="true" className="col-start-1 row-start-1 min-w-0 print:hidden">
        <TextMorph duration={350} ease="cubic-bezier(0.32, 0.72, 0, 1)" locale={locale} respectReducedMotion scale={false}>{text}</TextMorph>
      </span>
      <span aria-hidden="true" className="hidden col-start-1 row-start-1 print:inline">{text}</span>
    </span>
  )
}
