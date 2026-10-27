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

/** Lowercase surname particles. A word that already mixes case is not changed. */
const NAME_PARTICLES = new Set([
  'de', 'la', 'le', 'du', 'des', 'van', 'von', 'da', 'di', 'del', 'della', 'dei',
  'der', 'den', 'dos', 'das', 'do', 'ten', 'ter', 'bin', 'ibn', 'al', 'el', 'af', 'av', 'zu',
])

function letterCases(token: string): { upper: boolean; lower: boolean } {
  let upper = false
  let lower = false
  for (const char of token) {
    if (!/\p{L}/u.test(char)) continue
    if (char !== char.toLocaleLowerCase('en-CA')) upper = true
    if (char !== char.toLocaleUpperCase('en-CA')) lower = true
  }
  return { upper, lower }
}

function titleCaseToken(token: string): string {
  return token
    .toLocaleLowerCase('en-CA')
    .replace(/(^|['’.-])\p{L}/gu, match => match.toLocaleUpperCase('en-CA'))
}

function formatNameToken(token: string): string {
  const { upper, lower } = letterCases(token)
  if (upper && lower) return token
  const lowered = token.toLocaleLowerCase('en-CA')
  if (NAME_PARTICLES.has(lowered)) return lowered
  if (!upper && !lower) return token
  return titleCaseToken(token)
}

/**
 * Title-case each word that is entirely lower or entirely upper.
 * Words that already mix case (McDonald, O'Brien) stay as written.
 * Particles such as "de" and "la" stay lowercase.
 */
export function formatRosterName(value: string): string {
  return value.split(/(\s+)/).map(part => {
    if (!part.trim()) return part
    return part.split('-').map(formatNameToken).join('-')
  }).join('')
}
