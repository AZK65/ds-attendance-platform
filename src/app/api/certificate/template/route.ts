import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

// Store template in a data directory
const TEMPLATE_DIR = path.join(process.cwd(), 'data', 'templates')
const TEMPLATE_PATH = path.join(TEMPLATE_DIR, 'blank-certificate.pdf')

// Ensure template directory exists
async function ensureDir() {
  try {
    await fs.mkdir(TEMPLATE_DIR, { recursive: true })
  } catch {
    // Directory already exists
  }
}

// GET - Check if template exists and return it
export async function GET() {
  try {
    await ensureDir()

    try {
      const fileBuffer = await fs.readFile(TEMPLATE_PATH)
      const base64 = `data:application/pdf;base64,${fileBuffer.toString('base64')}`
      return NextResponse.json({
        exists: true,
        template: base64
      })
    } catch {
      return NextResponse.json({ exists: false }, { status: 404 })
    }
  } catch (error) {
    console.error('Error checking template:', error)
    return NextResponse.json(
      { error: 'Failed to check template' },
      { status: 500 }
    )
  }
}

// POST - Upload new template
export async function POST(request: NextRequest) {
  try {
    await ensureDir()

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Verify it's a PDF
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      )
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Save to disk
    await fs.writeFile(TEMPLATE_PATH, buffer)

    return NextResponse.json({
      success: true,
      message: 'Template uploaded successfully'
    })
  } catch (error) {
    console.error('Error uploading template:', error)
    return NextResponse.json(
      { error: 'Failed to upload template' },
      { status: 500 }
    )
  }
}

// DELETE - Remove template
export async function DELETE() {
  try {
    await fs.unlink(TEMPLATE_PATH)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true }) // Already doesn't exist
  }
}
