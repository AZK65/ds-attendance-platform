export const REGISTRATION_TERMS_VERSION = '2026-09-05'

export type RegistrationTermsLanguage = 'en' | 'fr'
export type RegistrationVehicleType = 'car' | 'truck'

export interface RegistrationTermsContent {
  title: string
  subtitle: string
  p1: string
  p2: string
  feeIntro: string
  s1Title: string
  s1: string
  s2Title: string
  s2: string
  s3Title: string
  s3a: string
  s3b: string[]
  s4Title: string
  s4: string
  s5Title: string
  s5: string
  s6Title: string
  s6: string
}

export const REGISTRATION_TERMS: Record<RegistrationTermsLanguage, RegistrationTermsContent> = {
  en: {
    title: 'Terms and Conditions',
    subtitle: 'Class 5 (Car Course) — Qazi Driving School',
    p1: 'This agreement is entered into between the student (the "Student") and Qazi Driving School (the "School") for enrolment in the Class 5 driving course. The course is approximately one (1) year in length and is governed by an eighteen (18) month contract. Should the course extend beyond eighteen (18) months, an additional fee of $150 plus applicable taxes will be charged.',
    p2: 'The School operates daily from 11:00 AM to 7:00 PM and is closed on Fridays. The minimum age requirement for enrolment is sixteen (16) years. All fees referenced in this agreement are exclusive of applicable taxes unless otherwise stated.',
    feeIntro: 'The total cost of the course is $1,000, inclusive of taxes and course materials, and is payable in installments as set out in the payment schedule presented during registration.',
    s1Title: '1. Missed Theory Class (Any Phase)',
    s1: 'In the event that the Student misses any scheduled theory class, the Student shall be required to wait for the next available group covering the missed material in order to resume the course. No time limit applies to this provision.',
    s2Title: '2. Missed Road Class',
    s2: "The Student is required to provide the School with at least twenty-four (24) hours' advance notice for any cancellation or rescheduling of a road class. Failure to provide such notice shall result in a penalty of $40 plus applicable taxes.",
    s3Title: '3. Cancellation of Contract',
    s3a: 'The cancellation policy set forth herein shall take effect immediately upon execution of this contract, at any phase of the course. Upon cancellation, the following fees shall apply:',
    s3b: [
      'Administrative cancellation fee of $150 plus applicable taxes.',
      'Each two (2) hour theory class attended: $18.85 plus applicable taxes.',
      'Each one (1) hour road class attended: $42.91 plus applicable taxes.',
      'Course books and materials are non-refundable.',
    ],
    s4Title: '4. Contract Duration',
    s4: 'This contract shall remain in effect for a period of eighteen (18) months from the date of registration. Should the Student require additional time to complete the course beyond this period, a continuation fee of $150 plus applicable taxes shall be charged.',
    s5Title: "5. In-School Exam Retake Policy (Learner's Licence)",
    s5: 'Should the Student fail the in-school written examination on two (2) occasions, a fee of $40 plus applicable taxes shall be assessed for each subsequent attempt thereafter.',
    s6Title: '6. Acknowledgement',
    s6: 'By signing below, the Student acknowledges that they have read, understood, and agree to be bound by all of the terms and conditions set forth in this agreement.',
  },
  fr: {
    title: 'Conditions générales',
    subtitle: 'Classe 5 (cours auto) — École de conduite Qazi',
    p1: 'La présente entente est conclue entre l’élève (« l’Élève ») et École de conduite Qazi (« l’École ») pour l’inscription au cours de conduite Classe 5. Le cours dure environ un (1) an et est régi par un contrat de dix-huit (18) mois. Si la formation se prolonge au-delà de dix-huit (18) mois, des frais supplémentaires de 150 $ plus les taxes applicables seront facturés.',
    p2: "L’École est ouverte tous les jours de 11 h à 19 h et est fermée le vendredi. L’âge minimum pour l’inscription est de seize (16) ans. Tous les frais mentionnés dans la présente entente excluent les taxes applicables, sauf indication contraire.",
    feeIntro: 'Le coût total du cours est de 1 000 $, taxes et manuels inclus, et est payable en plusieurs versements selon le calendrier présenté lors de l’inscription.',
    s1Title: '1. Absence à un cours théorique (toutes phases)',
    s1: "Si l’Élève manque un cours théorique prévu à l’horaire, il devra attendre le prochain groupe couvrant la matière manquée afin de poursuivre sa formation. Aucune limite de temps ne s’applique à cette disposition.",
    s2Title: '2. Absence à un cours pratique',
    s2: 'L’Élève doit aviser l’École au moins vingt-quatre (24) heures à l’avance de toute annulation ou modification d’un cours pratique. À défaut d’un tel préavis, des frais de 40 $ plus les taxes applicables seront facturés.',
    s3Title: '3. Annulation du contrat',
    s3a: "La politique d’annulation prévue aux présentes prend effet immédiatement à la signature du contrat, quelle que soit la phase. En cas d’annulation, les frais suivants s’appliquent :",
    s3b: [
      "Frais administratifs d’annulation de 150 $ plus les taxes applicables.",
      'Chaque cours théorique de deux (2) heures suivi : 18,85 $ plus les taxes applicables.',
      'Chaque cours pratique d’une (1) heure suivi : 42,91 $ plus les taxes applicables.',
      'Les manuels et le matériel de cours ne sont pas remboursables.',
    ],
    s4Title: '4. Durée du contrat',
    s4: 'Le contrat demeure en vigueur pour une période de dix-huit (18) mois à compter de la date d’inscription. Si l’Élève a besoin de temps supplémentaire pour compléter la formation, des frais de prolongation de 150 $ plus les taxes applicables seront facturés.',
    s5Title: '5. Politique de reprise des examens internes (permis d’apprenti)',
    s5: 'Si l’Élève échoue l’examen écrit interne à deux (2) reprises, des frais de 40 $ plus les taxes applicables seront facturés pour chaque tentative subséquente.',
    s6Title: '6. Reconnaissance',
    s6: "En signant ci-dessous, l’Élève reconnaît avoir lu, compris et accepté de se conformer à l’ensemble des conditions énoncées dans la présente entente.",
  },
}

export const REGISTRATION_ACCEPTANCE_STATEMENTS: Record<RegistrationTermsLanguage, string[]> = {
  en: [
    'I agree to the terms and conditions of Qazi Driving School.',
    'I confirm that all information provided is accurate.',
  ],
  fr: [
    "J’accepte les conditions d’École de conduite Qazi.",
    'Je confirme que tous les renseignements fournis sont exacts.',
  ],
}

export const TRUCK_REGISTRATION_CONSENTS = [
  {
    key: 'consentSaaqTransmission' as const,
    title: 'Transmission to SAAQ',
    body: 'I authorize the school to transmit the information in my file to the SAAQ for complaint follow-up, quality control and validation of course attestations.',
  },
  {
    key: 'consentFileTransfer' as const,
    title: 'File transfer on closure',
    body: 'I authorize the transfer of my file to the SAAQ or another school if Qazi Driving School ceases activity or has its recognition withdrawn.',
  },
  {
    key: 'consentContactInfo' as const,
    title: 'Contact information for surveys',
    body: "I authorize the school to transmit my contact information and email to the SAAQ for survey purposes or to send me required documents if I can't complete training.",
  },
]

export interface RegistrationTermsSnapshot {
  version: string
  language: RegistrationTermsLanguage
  vehicleType: RegistrationVehicleType
  acceptedAt: string
  terms: RegistrationTermsContent
  acceptanceStatements: string[]
  truckConsents?: Array<{ key: string; title: string; body: string; accepted: boolean }>
}

export function makeRegistrationTermsSnapshot(input: {
  language?: string | null
  vehicleType?: string | null
  acceptedAt: Date
  consentSaaqTransmission?: boolean
  consentFileTransfer?: boolean
  consentContactInfo?: boolean
}): RegistrationTermsSnapshot {
  const language: RegistrationTermsLanguage = input.language === 'fr' ? 'fr' : 'en'
  const vehicleType: RegistrationVehicleType = input.vehicleType === 'truck' ? 'truck' : 'car'
  const acceptedByKey = {
    consentSaaqTransmission: !!input.consentSaaqTransmission,
    consentFileTransfer: !!input.consentFileTransfer,
    consentContactInfo: !!input.consentContactInfo,
  }

  return {
    version: REGISTRATION_TERMS_VERSION,
    language,
    vehicleType,
    acceptedAt: input.acceptedAt.toISOString(),
    terms: REGISTRATION_TERMS[language],
    acceptanceStatements: REGISTRATION_ACCEPTANCE_STATEMENTS[language],
    ...(vehicleType === 'truck'
      ? {
          truckConsents: TRUCK_REGISTRATION_CONSENTS.map(consent => ({
            ...consent,
            accepted: acceptedByKey[consent.key],
          })),
        }
      : {}),
  }
}

export function readRegistrationTermsSnapshot(
  value: string | null | undefined,
  fallback: Parameters<typeof makeRegistrationTermsSnapshot>[0],
): { snapshot: RegistrationTermsSnapshot; isLegacy: boolean } {
  if (value) {
    try {
      const parsed = JSON.parse(value) as RegistrationTermsSnapshot
      if (parsed?.version && parsed?.acceptedAt && parsed?.terms?.title) {
        return { snapshot: parsed, isLegacy: false }
      }
    } catch { /* use a reconstructed legacy record */ }
  }
  return { snapshot: makeRegistrationTermsSnapshot(fallback), isLegacy: true }
}
