/**
 * Idempotent Class 1 theory seed.
 * Writes only the new theory tables. Does not touch Teamup, reminders,
 * ClassSignature, or any existing cohort.
 */
import { prisma } from '@/lib/db'
import {
  AHMED_INSTRUCTOR,
  CLASS1_THEORY_PROGRAM,
  TEMPLATE_V1,
  TEMPLATE_V2,
  type TheoryTemplate,
} from '@/lib/theory-hours'

function templateData(programId: string, template: TheoryTemplate) {
  return {
    programId,
    version: template.version,
    effectiveFrom: template.effectiveFrom,
    daysJson: JSON.stringify(template.days),
    approximateBreakTimes: template.approximateBreakTimes,
    note: template.note,
  }
}

export async function ensureTheoryProgram() {
  const program = await prisma.theoryProgram.upsert({
    where: { code: CLASS1_THEORY_PROGRAM.code },
    create: {
      code: CLASS1_THEORY_PROGRAM.code,
      requiredNetMinutes: CLASS1_THEORY_PROGRAM.requiredNetMinutes,
      requiredSessions: CLASS1_THEORY_PROGRAM.requiredSessions,
    },
    update: {
      requiredNetMinutes: CLASS1_THEORY_PROGRAM.requiredNetMinutes,
      requiredSessions: CLASS1_THEORY_PROGRAM.requiredSessions,
    },
  })

  const templateV1 = await prisma.theoryTemplateVersion.upsert({
    where: { programId_version: { programId: program.id, version: TEMPLATE_V1.version } },
    create: templateData(program.id, TEMPLATE_V1),
    update: templateData(program.id, TEMPLATE_V1),
  })
  const templateV2 = await prisma.theoryTemplateVersion.upsert({
    where: { programId_version: { programId: program.id, version: TEMPLATE_V2.version } },
    create: templateData(program.id, TEMPLATE_V2),
    update: templateData(program.id, TEMPLATE_V2),
  })

  const existingInstructor = await prisma.instructor.findUnique({
    where: { teamupSubcalendarId: AHMED_INSTRUCTOR.teamupSubcalendarId },
  })
  // Names already stored are left alone. A blank field is filled once.
  // The SAAQ number is never written here, including when it is still null.
  const fill = (current: string | null | undefined, value: string) =>
    current && current.trim() ? undefined : value
  const instructor = existingInstructor
    ? await prisma.instructor.update({
      where: { id: existingInstructor.id },
      data: {
        legalName: fill(existingInstructor.legalName, AHMED_INSTRUCTOR.legalName),
        displayName: fill(existingInstructor.displayName, AHMED_INSTRUCTOR.displayName),
        bookletName: fill(existingInstructor.bookletName, AHMED_INSTRUCTOR.bookletName),
      },
    })
    : await prisma.instructor.create({
      data: {
        legalName: AHMED_INSTRUCTOR.legalName,
        displayName: AHMED_INSTRUCTOR.displayName,
        bookletName: AHMED_INSTRUCTOR.bookletName,
        saaqInstructorNo: null,
        teamupSubcalendarId: AHMED_INSTRUCTOR.teamupSubcalendarId,
      },
    })

  return { program, templateV1, templateV2, instructor }
}

export async function loadDefaultTheoryTemplate() {
  const program = await prisma.theoryProgram.findUnique({ where: { code: CLASS1_THEORY_PROGRAM.code } })
  if (!program) return null
  const template = await prisma.theoryTemplateVersion.findUnique({
    where: { programId_version: { programId: program.id, version: TEMPLATE_V2.version } },
  })
  if (!template) return null
  return { program, template }
}
