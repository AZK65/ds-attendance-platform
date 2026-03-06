import { NextRequest, NextResponse } from 'next/server'
import { createStudent, updateStudent, type CreateStudentData } from '@/lib/external-db'

// POST /api/students/manage — Create a new student in external MySQL DB
export async function POST(request: NextRequest) {
  try {
    const body: CreateStudentData = await request.json()

    // Validate required fields
    const required: (keyof CreateStudentData)[] = [
      'full_name', 'phone_number', 'permit_number', 'full_address',
      'city', 'postal_code', 'dob', 'email',
    ]
    for (const field of required) {
      if (!body[field]?.trim()) {
        return NextResponse.json(
          { error: `${field.replace(/_/g, ' ')} is required` },
          { status: 400 }
        )
      }
    }

    const result = await createStudent(body)
    return NextResponse.json({ success: true, studentId: result.insertId })
  } catch (error) {
    console.error('[Students Manage] Create error:', error)
    return NextResponse.json(
      { error: 'Failed to create student', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PUT /api/students/manage — Update an existing student in external MySQL DB
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { student_id, ...fields } = body

    if (!student_id) {
      return NextResponse.json(
        { error: 'student_id is required' },
        { status: 400 }
      )
    }

    await updateStudent(student_id, fields)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Students Manage] Update error:', error)
    return NextResponse.json(
      { error: 'Failed to update student', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
