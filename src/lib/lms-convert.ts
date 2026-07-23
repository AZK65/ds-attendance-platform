import { promises as fs } from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { exec } from 'child_process'
import { LMS_UPLOADS_DIR } from '@/lib/lms'

const run = (cmd: string, timeoutMs: number) =>
  new Promise<{ ok: boolean; err?: string }>(resolve => {
    exec(cmd, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 }, (error, _stdout, stderr) => {
      if (error) resolve({ ok: false, err: stderr || error.message })
      else resolve({ ok: true })
    })
  })

async function commandExists(bin: string): Promise<boolean> {
  const r = await run(`command -v ${bin}`, 5000)
  return r.ok
}

// Convert a PDF or PowerPoint file (already stored in the uploads dir) into
// per-slide PNGs, also stored in the uploads dir. Returns the ordered list of
// PNG filenames. Best-effort: returns [] if the tools (LibreOffice / poppler)
// aren't installed or conversion fails — the caller falls back to the embed.
export async function convertToSlides(sourceFilename: string, mimetype: string): Promise<string[]> {
  const pdftoppm = await commandExists('pdftoppm')
  if (!pdftoppm) return []

  const sourcePath = path.join(LMS_UPLOADS_DIR, path.basename(sourceFilename))
  const work = path.join(LMS_UPLOADS_DIR, `_conv_${randomBytes(6).toString('hex')}`)
  await fs.mkdir(work, { recursive: true })

  try {
    let pdfPath: string

    if (mimetype === 'application/pdf' || /\.pdf$/i.test(sourceFilename)) {
      pdfPath = sourcePath
    } else {
      // PowerPoint → PDF via LibreOffice headless.
      const soffice = (await commandExists('soffice')) ? 'soffice' : (await commandExists('libreoffice')) ? 'libreoffice' : ''
      if (!soffice) return []
      const conv = await run(
        `${soffice} --headless --norestore -env:UserInstallation=file://${work}/lo --convert-to pdf --outdir ${work} "${sourcePath}"`,
        180_000,
      )
      if (!conv.ok) { console.error('[lms-convert] pptx→pdf failed:', conv.err); return [] }
      const files = await fs.readdir(work)
      const pdf = files.find(f => f.toLowerCase().endsWith('.pdf'))
      if (!pdf) return []
      pdfPath = path.join(work, pdf)
    }

    // PDF → PNG per page (~1600px wide at 130dpi is crisp for slides).
    const outPrefix = path.join(work, 'slide')
    const ppm = await run(`pdftoppm -png -r 130 "${pdfPath}" "${outPrefix}"`, 180_000)
    if (!ppm.ok) { console.error('[lms-convert] pdf→png failed:', ppm.err); return [] }

    const pngs = (await fs.readdir(work))
      .filter(f => /^slide-?\d+\.png$/i.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] || '0', 10)
        const nb = parseInt(b.match(/(\d+)/)?.[1] || '0', 10)
        return na - nb
      })

    // Move each PNG to a stable, unguessable name in the uploads dir.
    const stored: string[] = []
    for (const png of pngs) {
      const dest = `slide_${randomBytes(10).toString('hex')}.png`
      await fs.rename(path.join(work, png), path.join(LMS_UPLOADS_DIR, dest))
      stored.push(dest)
    }
    return stored
  } catch (e) {
    console.error('[lms-convert] error:', e)
    return []
  } finally {
    // Clean the work dir (ignore errors).
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
