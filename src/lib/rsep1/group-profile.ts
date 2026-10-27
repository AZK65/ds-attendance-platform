/** Student id for RSEP-1 on a WhatsApp group profile. Blank unless the roster match is Class 1. */
export function groupProfileResultsStudentId(
  vehicleType: string | null | undefined,
  studentId: number | string | null | undefined,
): string | null {
  if (vehicleType !== 'truck') return null
  if (studentId === null || studentId === undefined || studentId === '') return null
  const id = typeof studentId === 'number' ? studentId : Number(studentId)
  if (!Number.isInteger(id) || id <= 0) return null
  return String(id)
}
