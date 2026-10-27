import { findStudentsByPhone, getStudentById, updateStudent } from './external-db'
import type { RosterGateway, RosterStudent } from './phone-change'

function toRoster(row: { student_id: number; full_name: string; phone_number: string }): RosterStudent {
  return {
    student_id: row.student_id,
    full_name: row.full_name,
    phone_number: row.phone_number,
  }
}

export function liveRoster(): RosterGateway {
  return {
    async updatePhone(studentId, phoneNumber) {
      await updateStudent(studentId, { phone_number: phoneNumber })
    },
    async findByPhone(phone) {
      const rows = await findStudentsByPhone(phone)
      return rows.map(toRoster)
    },
    async getById(studentId) {
      const row = await getStudentById(studentId)
      return row ? toRoster(row) : null
    },
  }
}
