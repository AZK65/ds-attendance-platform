export const PROFILE_TEXT_FIELDS = ['full_name', 'permit_number', 'full_address', 'apartment', 'city', 'postal_code', 'dob', 'email', 'status'] as const
export type ProfileTextField = typeof PROFILE_TEXT_FIELDS[number]
export type StudentProfileFields = Record<ProfileTextField, string> & { user_defined_contract_number: number | null }

export function profileFields(value: Record<string, unknown>): StudentProfileFields {
  return {
    ...Object.fromEntries(PROFILE_TEXT_FIELDS.map(key => [key, key === 'dob'
      ? (value[key] instanceof Date ? (value[key] as Date).toISOString().slice(0, 10) : String(value[key] || '').slice(0, 10)).replace(/^0000-00-00$/, '')
      : String(value[key] || '')])) as Record<ProfileTextField, string>,
    user_defined_contract_number: value.user_defined_contract_number == null ? null : Number(value.user_defined_contract_number),
  }
}

export function validateProfileFields(input: unknown): StudentProfileFields {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter the student details.')
  const value = input as Record<string, unknown>
  const allowed = new Set<string>([...PROFILE_TEXT_FIELDS, 'user_defined_contract_number'])
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('Use Change phone number for phone changes. Only profile details can be edited here.')
  for (const key of PROFILE_TEXT_FIELDS) {
    if (typeof value[key] !== 'string' || value[key].length > 255) throw new Error(`Check ${key.replaceAll('_', ' ')}.`)
  }
  const fields = profileFields(value)
  fields.dob = (value.dob as string).trim()
  for (const key of PROFILE_TEXT_FIELDS) fields[key] = fields[key].trim()
  if (!fields.full_name) throw new Error('Full name is required.')
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new Error('Enter a valid email address.')
  if (fields.dob && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.dob)
    || !Number.isFinite(Date.parse(fields.dob)) || new Date(fields.dob).toISOString().slice(0, 10) !== fields.dob
    || fields.dob > new Date().toISOString().slice(0, 10))) throw new Error('Enter a valid date of birth.')
  const contract = value.user_defined_contract_number
  if (contract !== null && (typeof contract !== 'number' || !Number.isSafeInteger(contract) || contract <= 0)) throw new Error('Contract number must be a positive whole number, or blank.')
  return fields
}
