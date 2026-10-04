export type LeadAnswer = 'yes' | 'no' | 'unsure' | 'unknown'
export type LeadScreening = {
  result: 'meets' | 'not_met' | 'review'
  quebecLicence: LeadAnswer
  drivingExperience: LeadAnswer
  combinedAnswer: LeadAnswer
  program: string | null
  language: string | null
  callbackTime: string | null
  website: boolean
}

// These are self-reported marketing questions, NOT verified SAAQ eligibility.
export function getLeadScreening(lead: { rawData?: string | null; notes?: string | null; source?: string }): LeadScreening {
  let columns: { column_id?: string; string_value?: unknown }[] = []
  try {
    const parsed = JSON.parse(lead.rawData || '{}')
    if (Array.isArray(parsed?.user_column_data)) columns = parsed.user_column_data.filter((c: unknown) => c && typeof c === 'object')
  } catch { /* Manual / older leads may not have a payload. */ }
  const value = (id: string, label: string) => {
    const raw = columns.find(c => c.column_id === id)?.string_value
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    const prefix = `${label}: `
    return lead.notes?.split('\n').find(line => line.startsWith(prefix))?.slice(prefix.length).trim() || null
  }
  const answer = (v: string | null): LeadAnswer => {
    switch (v?.toLowerCase()) {
      case 'yes': case 'oui': return 'yes'
      case 'no': case 'non': return 'no'
      case 'not sure': case 'unsure': case 'je ne sais pas': return 'unsure'
      default: return 'unknown'
    }
  }
  const quebecLicence = answer(value('QUEBEC_LICENCE', "Has a Québec driver's licence"))
  const drivingExperience = answer(value('DRIVING_EXPERIENCE', 'At least 2 years of driving experience'))
  const combinedAnswer = answer(value('QUEBEC_LICENCE_EXPERIENCE', 'Québec licence and 2+ years driving experience'))
  const hasSeparate = quebecLicence !== 'unknown' || drivingExperience !== 'unknown'
  const result = hasSeparate
    ? quebecLicence === 'no' || drivingExperience === 'no' ? 'not_met'
      : quebecLicence === 'yes' && drivingExperience === 'yes' ? 'meets' : 'review'
    : combinedAnswer === 'yes' ? 'meets' : combinedAnswer === 'no' ? 'not_met' : 'review'
  return {
    result, quebecLicence, drivingExperience, combinedAnswer,
    program: value('PROGRAM', 'Program'),
    language: value('LANGUAGE', 'Language'),
    callbackTime: value('CALLBACK_TIME', 'Preferred callback time'),
    website: lead.source === 'website' || value('SOURCE_PAGE', 'Source')?.startsWith('Website callback · https://qazidriving.ca/') === true,
  }
}

export const screeningLabels = { meets: 'Pre-qualified', not_met: 'Not pre-qualified', review: 'Needs review' }
export const answerLabels = { yes: 'Yes', no: 'No', unsure: 'Not sure', unknown: 'Not provided' }
