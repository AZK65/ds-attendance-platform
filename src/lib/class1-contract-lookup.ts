// Pick the Class 1 registration a contract render should use.
// Only truck registrations are eligible. Car (Class 5) rows are ignored.

import { namesEqual } from '@/lib/student-match'

export interface Class1RegistrationRef {
  id: string
  vehicleType: string
  contractNumber?: string | null
  externalId?: number | null
  fullName?: string | null
}

export function describeClass1Registration(row: Class1RegistrationRef): string {
  const name = (row.fullName || '').trim() || '(no name)'
  const contract = row.contractNumber ? ` contract ${row.contractNumber}` : ''
  const external = row.externalId ? ` student ${row.externalId}` : ''
  return `${name}${contract}${external} [${row.id}]`
}

/**
 * Match a truck registration by id, contract number, MySQL student id,
 * or full name. More than one name or id match is an error.
 */
export function pickClass1Registration<T extends Class1RegistrationRef>(
  rows: readonly T[],
  query: string,
): T {
  const needle = query.trim()
  if (!needle) throw new Error('Student name or id is required')

  const exact = rows.find((row) => row.id === needle || row.contractNumber === needle)
  if (exact && exact.vehicleType !== 'truck') {
    throw new Error(`Registration "${needle}" is not a Class 1 (truck) contract`)
  }

  const truck = rows.filter((row) => row.vehicleType === 'truck')
  const byKey = truck.filter((row) => row.id === needle || row.contractNumber === needle)
  if (byKey.length === 1) return byKey[0]
  if (byKey.length > 1) throw new Error(ambiguous(byKey, needle))

  if (/^\d+$/.test(needle)) {
    const externalId = Number(needle)
    const byExternal = truck.filter((row) => row.externalId === externalId)
    if (byExternal.length === 1) return byExternal[0]
    if (byExternal.length > 1) throw new Error(ambiguous(byExternal, needle))
  }

  const folded = needle.toLowerCase()
  const byName = truck.filter((row) => {
    const name = (row.fullName || '').trim()
    return name.toLowerCase() === folded || namesEqual(name, needle)
  })
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) throw new Error(ambiguous(byName, needle))

  throw new Error(`No Class 1 registration matched "${needle}"`)
}

function ambiguous(rows: readonly Class1RegistrationRef[], query: string): string {
  const listed = rows.map(describeClass1Registration).join('; ')
  return `More than one Class 1 registration matched "${query}": ${listed}`
}
