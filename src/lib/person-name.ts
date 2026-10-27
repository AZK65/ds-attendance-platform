/**
 * Title-case a name only when every letter is uppercase, the way roster
 * exports arrive. Mixed-case names are left as typed, including "McDonald".
 * This is the casing used by paper-exam result messages.
 */
export function titleCaseIfUppercase(value: string): string {
  const name = value.trim()
  if (!name) return ''
  const letters = name.replace(/[^\p{L}]/gu, '')
  if (!letters || letters !== letters.toLocaleUpperCase('en-CA')) return name
  return name
    .toLocaleLowerCase('en-CA')
    .replace(/(^|[\s,'’.-])\p{L}/gu, match => match.toLocaleUpperCase('en-CA'))
}
