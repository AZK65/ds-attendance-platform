import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { BRAND, LOGO_SHA256, emailLetterheadHtml } from './brand'
import { LOGO_FILE } from './brand-assets'
import { invoiceEmailHtml, registrationReceivedEmailHtml } from './document-emails'
import { buildSignatureAttendancePdf } from './signature-attendance-pdf'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test('brand colours are the marketing-site CSS custom properties', () => {
  assert.equal(BRAND.red, '#E32726')
  assert.equal(BRAND.red600, '#C5121F')
  assert.equal(BRAND.blue, '#1E3FCB')
  assert.equal(BRAND.blue700, '#162C8E')
  assert.equal(BRAND.green, '#2FA94A')
  assert.equal(BRAND.green700, '#1F8235')
  assert.equal(BRAND.ink, '#0E1116')
  assert.match(emailLetterheadHtml(), new RegExp(BRAND.red))
  assert.match(emailLetterheadHtml(), new RegExp(BRAND.blue))
  assert.match(emailLetterheadHtml(), new RegExp(BRAND.green))
  assert.match(emailLetterheadHtml(), /cid:qazi-logo/)
})

test('the committed wordmark matches the marketing-site logo', () => {
  const hash = createHash('sha256').update(readFileSync(LOGO_FILE)).digest('hex')
  assert.equal(hash, LOGO_SHA256)
})

test('document emails keep their sentences and add the letterhead', () => {
  const invoice = invoiceEmailHtml({
    studentName: 'Sample Student',
    invoiceNumber: 'INV-1',
    schoolName: 'Qazi Driving School',
  })
  assert.match(invoice, /Bonjour Sample Student/)
  assert.match(invoice, /Please find your invoice <strong>INV-1<\/strong> attached to this email\./)
  assert.match(invoice, /Merci \/ Thank you/)
  assert.match(invoice, /cid:qazi-logo/)

  const received = registrationReceivedEmailHtml({
    firstName: 'Sample',
    schoolName: 'Qazi Driving School',
    fullName: 'Sample Student',
    courseNameEn: 'Class 5 (Car)',
    courseNameFr: 'Classe 5 (Auto)',
    submittedEn: 'October 1, 2026',
    submittedFr: '1 octobre 2026',
    depositDollars: '250.00',
  })
  assert.match(received, /Registration received/)
  assert.match(received, /Inscription reçue/)
  assert.match(received, /authorized only — no charge until approved/)
  assert.match(received, /aucun débit avant l'approbation/)
})

test('the Class 1 booklet keeps the instructor line, split counts, and net length', async () => {
  const pdf = await buildSignatureAttendancePdf({
    studentName: 'Sample Student',
    phone: '514-555-0199',
    isTruck: true,
    theory: {
      hoursLineEn: 'Total: 75 h / 75 h — 15 / 15 classes.',
      hoursLineFr: 'Total : 75 h / 75 h — 15 / 15 cours.',
      instructorLineEn: '',
      instructorLineFr: '',
      headerInstructor: { bookletName: 'Abdul Rahman Ahmed Qazi', saaqInstructorNo: null },
      attendedCount: 15,
      requiredSessions: 15,
      sessions: [{
        sessionNumber: 1,
        date: '2026-08-04',
        startTime: '17:30',
        endTime: '21:30',
        netLabel: '3h45',
        displayEn: 'Signed',
        displayFr: 'Signé',
        basis: 'signature',
        signatureDataUrl: PNG,
        signedAt: '2026-08-04T21:30:00-04:00',
        instructorName: 'Abdul Rahman Ahmed Qazi',
        instructorNo: null,
        instructorSignatureDataUrl: PNG,
        instructorSignedOn: '2026-08-05',
      }],
    },
    signatures: [],
  })
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-booklet-'))
  const file = path.join(dir, 'booklet.pdf')
  writeFileSync(file, pdf)
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
  assert.match(text, /Instructor: Abdul Rahman Ahmed Qazi\. Instructor no\.: Pending/)
  assert.match(text, /1 theory · 0 practical/)
  assert.match(text, /3h45/)
  assert.match(text, /Aug 4, 2026, 5:30 p\.m\./)
  assert.doesNotMatch(text, /signed on/i)
})
