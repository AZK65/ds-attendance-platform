// Render a Class 1 service contract from a SQLite file. Does not start the
// server and does not write invoices, balances, or the registration.
//
//   npm run contract:render -- --db <path> --student <name or id> [--out <pdf>] [--lang en|fr|both]
//
// DATABASE_URL is set before the app modules load so Prisma reads this file.

import fs from 'node:fs'
import path from 'node:path'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) return undefined
  return value
}

const db = arg('--db')
const student = arg('--student')
const out = arg('--out')
const lang = arg('--lang') || 'both'

if (!db || !student || (lang !== 'en' && lang !== 'fr' && lang !== 'both')) {
  console.error('Usage: npm run contract:render -- --db <path> --student <name or id> [--out <pdf>] [--lang en|fr|both]')
  process.exit(1)
}

const abs = path.resolve(db)
if (!fs.existsSync(abs)) {
  console.error(`Database file not found: ${abs}`)
  process.exit(1)
}

const studentQuery = student
const langChoice = lang
process.env.DATABASE_URL = `file:${abs}`

async function main() {
  const { renderClass1ContractFromDatabase } = await import('../src/lib/class1-contract-render')
  try {
    const rendered = await renderClass1ContractFromDatabase(studentQuery, langChoice)
    const slug = (rendered.fullName || rendered.contractNumber || rendered.id)
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'student'
    const dest = path.resolve(out || `class1-contract-${slug}.pdf`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, rendered.buffer)
    console.log(dest)
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

void main()
