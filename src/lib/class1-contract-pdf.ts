import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import type { TruckContract } from '@/lib/pricing'
import type { ContractInstallmentRow } from '@/lib/class1-contract-payments'
import { formatContractDate } from '@/lib/class1-contract-signed-date'

// Class 1 service contract. Moved out of the register route so a script can
// render it without starting the server. The registration signature images
// are drawn as stored. Consent boxes are printed from the flags passed in;
// the stored-contract path always passes them checked.

const BLANK_AMOUNT = '$ _______'
const BLANK_DATE = '__ / __ / ____'

export type Class1ContractLang = 'en' | 'fr' | 'both'

export interface Class1ContractSchool {
  name: string
  address: string
  phone: string
  email: string
  saaqNumber: string
  truckTheoryAddress: string
  truckRoadAddress: string
  truckCircuitAddress: string
}

export interface Class1ContractData {
  contractNumber: string
  fullName: string
  dob: string
  permitNumber: string
  address: string
  phone: string
  email: string
  firstCourseDate: string | null
  maxCompletionDate: string | null
  signedAtPlace: string
  consentSaaq: boolean
  consentTransfer: boolean
  consentContact: boolean
  studentSignature: string | null
  repSignature: string | null
  repName: string
  repSignedAt: Date | null
  /**
   * Stored signing timestamp. Null means unknown; never invent a signing date.
   */
  studentSignedAt: Date | null
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingBottom: 50,
    paddingHorizontal: 42,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
    lineHeight: 1.45,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 2,
    borderTopColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  topLeft: { fontSize: 7.5, color: '#555', letterSpacing: 1 },
  topCenter: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#000' },
  topRight: { fontSize: 7.5, color: '#555', letterSpacing: 1, textAlign: 'right' },
  titleBar: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    marginBottom: 14,
  },
  titleH1: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: '#000', lineHeight: 1, marginBottom: 6 },
  titleSub: { fontSize: 9, color: '#555' },
  titleMeta: { width: 220, paddingLeft: 18, borderLeftWidth: 1, borderLeftColor: '#ccc' },
  titleMetaLabel: { fontSize: 6.5, color: '#888', letterSpacing: 1, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  titleMetaValue: { fontSize: 10 },
  titleMetaUnderline: { borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 3, marginBottom: 8 },
  partiesRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 14,
  },
  party: { width: '50%', padding: 12 },
  partyDivider: { borderLeftWidth: 1, borderLeftColor: '#000' },
  partyLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#fff',
    backgroundColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 8,
    letterSpacing: 1,
  },
  partyField: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  partyFieldLabel: { width: 70, fontSize: 7, color: '#555', fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },
  partyFieldValue: { flex: 1, fontSize: 9 },
  prefilled: { fontFamily: 'Helvetica-Bold' },
  section: { marginBottom: 12 },
  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    color: '#fff',
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  sectionNum: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#666',
    marginRight: 10,
  },
  sectionTitle: { color: '#fff', fontSize: 10.5, fontFamily: 'Helvetica-Bold', flex: 1 },
  sectionRef: { color: '#bbb', fontSize: 7, letterSpacing: 1 },
  subsection: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 5,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  subNum: {
    fontSize: 7.5, fontFamily: 'Helvetica-Bold', backgroundColor: '#eee', paddingHorizontal: 6, paddingVertical: 1, marginRight: 6,
  },
  subTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  text: { fontSize: 9, marginBottom: 5, color: '#222', lineHeight: 1.45 },
  bold: { fontFamily: 'Helvetica-Bold' },
  callout: {
    borderLeftWidth: 2,
    borderLeftColor: '#000',
    backgroundColor: '#f6f6f6',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 5,
    fontSize: 9,
    lineHeight: 1.45,
  },
  pricingBlock: { borderWidth: 1, borderColor: '#000', marginBottom: 8 },
  pricingRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  pricingHeader: { backgroundColor: '#000' },
  pricingHeaderText: { color: '#fff', fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  pricingName: { flex: 1, fontSize: 9.5 },
  pricingMeta: { width: 80, fontSize: 8.5, color: '#666', textAlign: 'right' },
  pricingAmount: { width: 100, fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  pricingSubtotal: { backgroundColor: '#f6f6f6' },
  payTable: { borderWidth: 1, borderColor: '#000', marginBottom: 8 },
  payHeaderRow: { flexDirection: 'row', backgroundColor: '#000', paddingVertical: 5, paddingHorizontal: 8 },
  payHeaderCell: { color: '#fff', fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },
  payRow: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8,
    borderBottomWidth: 0.5, borderBottomColor: '#eee', alignItems: 'center',
  },
  payNum: { width: 28, fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  payStep: { flex: 1, fontSize: 9 },
  payCell: { width: 82, fontSize: 8, color: '#888', textAlign: 'center' },
  payCellFilled: { width: 82, fontSize: 8, color: '#1a1a1a', textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  consentBlock: { borderWidth: 0.5, borderColor: '#ccc', marginBottom: 8 },
  consentItem: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  checkbox: {
    width: 11, height: 11, borderWidth: 1, borderColor: '#000',
    marginRight: 10, marginTop: 1, alignItems: 'center', justifyContent: 'center',
  },
  consentTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  consentText: { fontSize: 8.5, color: '#555', lineHeight: 1.45 },
  sigSection: { marginTop: 14 },
  sigBar: { backgroundColor: '#000', paddingVertical: 7, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'space-between' },
  sigBarTitle: { color: '#fff', fontSize: 11, fontFamily: 'Helvetica-Bold' },
  sigBarSub: { color: '#ccc', fontSize: 7, letterSpacing: 1 },
  sigIntro: { backgroundColor: '#f6f6f6', borderLeftWidth: 1, borderLeftColor: '#000', borderRightWidth: 1, borderRightColor: '#000', padding: 10, fontSize: 9 },
  sigPlace: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#000',
  },
  sigPlaceLabel: { fontSize: 7.5, color: '#555', fontFamily: 'Helvetica-Bold', marginRight: 8 },
  sigPlaceValue: { flex: 1, borderBottomWidth: 0.6, borderBottomColor: '#000', paddingBottom: 3 },
  sigPlaceText: { fontSize: 9 },
  sigGrid: { flexDirection: 'row', borderWidth: 1, borderColor: '#000', borderTopWidth: 0 },
  sigBlock: { flex: 1, padding: 12 },
  sigBlockDivider: { borderLeftWidth: 1, borderLeftColor: '#000' },
  sigBlockTag: {
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#fff', backgroundColor: '#000',
    paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8, letterSpacing: 1,
  },
  sigFieldLabel: { fontSize: 6.5, color: '#555', letterSpacing: 0.6, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sigLine: {
    borderBottomWidth: 0.6,
    borderBottomColor: '#000',
    paddingBottom: 3,
    marginBottom: 6,
    minHeight: 16,
    justifyContent: 'flex-end',
  },
  durationLabel: { fontSize: 7, color: '#555', fontFamily: 'Helvetica-Bold', letterSpacing: 0.4, marginBottom: 4 },
  durationValue: { borderBottomWidth: 0.8, borderBottomColor: '#000', paddingBottom: 5, paddingTop: 1 },
  durationText: { fontSize: 10, fontFamily: 'Helvetica-Bold', lineHeight: 1.15 },
  sigImage: { height: 36, marginBottom: 4 },
  footer: {
    marginTop: 14, paddingVertical: 6,
    borderTopWidth: 2, borderTopColor: '#000', borderBottomWidth: 1, borderBottomColor: '#000',
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7, color: '#555', letterSpacing: 0.6,
  },
})

interface SectionInfo { num: string; titleEn: string; titleFr: string; refEn: string; refFr: string }

function formatDateEn(iso?: string | null) {
  if (!iso) return '—'
  try {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

function formatDateFr(iso?: string | null) {
  if (!iso) return '—'
  try {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('fr-CA', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

function PartyField({ label, value, prefilled = false }: { label: string; value: string; prefilled?: boolean }) {
  return React.createElement(View, { style: styles.partyField },
    React.createElement(Text, { style: styles.partyFieldLabel }, label),
    React.createElement(Text, { style: [styles.partyFieldValue, ...(prefilled ? [styles.prefilled] : [])] as never }, value || '—'),
  )
}

function SectionBar({ info, lang }: { info: SectionInfo; lang: 'en' | 'fr' }) {
  return React.createElement(View, { style: styles.sectionBar },
    React.createElement(Text, { style: styles.sectionNum }, info.num),
    React.createElement(Text, { style: styles.sectionTitle }, lang === 'en' ? info.titleEn : info.titleFr),
    React.createElement(Text, { style: styles.sectionRef }, lang === 'en' ? info.refEn : info.refFr),
  )
}

function Sub({ num, title }: { num: string; title: string }) {
  return React.createElement(View, { style: styles.subsection },
    React.createElement(Text, { style: styles.subNum }, num),
    React.createElement(Text, { style: styles.subTitle }, title),
  )
}

// Helvetica has no checkmark glyph, so a "✓" character prints as an empty box.
// The mark is two borders rotated into a check, which the PDF fonts can draw.
function ConsentBox({ checked }: { checked: boolean }) {
  return React.createElement(View, { style: styles.checkbox },
    checked
      ? React.createElement(View, {
          style: {
            width: 7,
            height: 3.5,
            borderBottomWidth: 1.5,
            borderLeftWidth: 1.5,
            borderColor: '#000',
            transform: 'rotate(-50deg)',
            marginTop: -1,
          },
        })
      : null,
  )
}

function ContractPage({
  lang,
  data,
  school,
  pricing,
  rows,
}: {
  lang: 'en' | 'fr'
  pricing: TruckContract
  data: Class1ContractData
  school: Class1ContractSchool
  rows: readonly ContractInstallmentRow[]
}) {
  const contractDate = formatContractDate(data.studentSignedAt, lang)
  const repSignedDate = data.repSignedAt
    ? formatContractDate(data.repSignedAt, lang)
    : ''

  const t = lang === 'en' ? {
    classLine: 'Reg. SAAQ · Class 1',
    title: 'Service Contract',
    subtitle: 'Road Safety Education Program (RSEP) — Class 1\nCompliant with Article 83 of the Driving Schools Regulation.',
    contractNo: 'Contract No.', date: 'Date',
    schoolLabel: 'School', studentLabel: 'Student',
    name: 'Name', saaqNo: 'SAAQ No.', addr: 'Address', phone: 'Phone', email: 'Email',
    fullName: 'Full name', dob: 'Date of birth', lic: 'License No.',
    sec1Body: 'This contract covers a driving course with a theoretical component and a practical component, in accordance with the Road Safety Education Program (RSEP).',
    sec1Body2: 'Training is provided in accordance with SAAQ requirements.',
    sec1IncludesPre: 'The RSEP Class 1 program includes:',
    theoryHours: `${pricing.theoryHours} hours of theoretical training`,
    practicalHours: `${pricing.practicalHours} hours of practical training`,
    sec2Body: 'A financing option through a partner banking institution is available, subject to approval.',
    sec3Body: `Theory sessions are typically 4 to 6 hours in length. The student must complete all ${pricing.theoryHours} hours of theory before sitting the SAAQ theory exam.`,
    sec3Missed: 'Missed theory hours: $30 per hour. Cancellation of practical lessons within 48 hours: $65.',
    sec4Body: 'The student has a maximum of 18 months from the scheduled date of the first course to complete the training.',
    firstCourse: 'First course date',
    maxComplete: 'Maximum completion date',
    consent1Title: 'Transmission of information to the SAAQ',
    consent1Body: 'I authorize the school to transmit the information in my file to the SAAQ for compliance with the Highway Safety Code, complaint follow-up, quality control and validation of course attestations.',
    consent2Title: 'File transfer in case of school closure',
    consent2Body: 'I authorize, if the school ceases activities or has its recognition withdrawn, the transfer of my file to the SAAQ or another school.',
    consent3Title: 'Communication of contact information',
    consent3Body: 'I authorize the school to transmit my contact information and email to the SAAQ for surveys or to send required documents.',
    sigTitle: 'Signatures', sigSub: 'Final Step',
    sigIntro: 'By signing this contract, the student acknowledges having read, understood and accepted all the clauses above.',
    signedAt: 'Signed at',
    student: 'Student', rep: 'Authorized Representative — RSEP Provider',
    sigFull: 'Full name', sig: 'Signature', sigDate: 'Date',
    component: 'Component', hours: 'Hours', preTax: 'Price (pre-tax)',
    theoretical: 'Theoretical Component', practical: 'Practical Component',
    subBefore: 'Subtotal — Before taxes',
    payIntro: 'The total cost is payable in four (4) installments.',
    payHeaders: ['#', 'Milestone', 'Amount', 'Scheduled Date', 'Date Paid'],
    footL: 'Qazi Driving School', footC: 'Compliant — Article 83', footR: 'SAAQ / CPA / 2026',
    sections: [
      { num: '01', titleEn: 'Training Description', titleFr: '', refEn: 'Art. 83 (b)(c)(e)', refFr: '' },
      { num: '02', titleEn: 'Cost and Payment', titleFr: '', refEn: 'Art. 83 (h)', refFr: '' },
      { num: '03', titleEn: 'Absence & Cancellation Policy', titleFr: '', refEn: 'Notice & Fees', refFr: '' },
      { num: '04', titleEn: 'Contract Duration', titleFr: '', refEn: 'Art. 83 (g)', refFr: '' },
      { num: '05', titleEn: 'Commitments', titleFr: '', refEn: 'Art. 83 (i)(j)(k)(l)(m)(q)', refFr: '' },
      { num: '06', titleEn: 'Contract Termination', titleFr: '', refEn: 'Consumer Protection Act', refFr: '' },
      { num: '07', titleEn: 'Student Consents', titleFr: '', refEn: 'Art. 83 (n)(o)(p)', refFr: '' },
    ] as SectionInfo[],
  } : {
    classLine: 'N° SAAQ · Classe 1',
    title: 'Contrat de Service',
    subtitle: 'Programme d’éducation à la sécurité routière (PESR) — Classe 1\nConforme à l’Article 83 du Règlement sur les écoles de conduite.',
    contractNo: 'N° de contrat', date: 'Date',
    schoolLabel: 'École', studentLabel: 'Élève',
    name: 'Nom', saaqNo: 'N° SAAQ', addr: 'Adresse', phone: 'Téléphone', email: 'Courriel',
    fullName: 'Nom complet', dob: 'Date de naissance', lic: 'N° de permis',
    sec1Body: 'Le présent contrat porte sur un cours de conduite comportant un volet théorique et un volet pratique, conformément au PESR.',
    sec1Body2: 'La formation est dispensée conformément aux exigences de la SAAQ.',
    sec1IncludesPre: 'Le programme PESR Classe 1 comprend :',
    theoryHours: `${pricing.theoryHours} heures de formation théorique`,
    practicalHours: `${pricing.practicalHours} heures de formation pratique`,
    sec2Body: 'Une option de financement avec une institution bancaire partenaire est disponible, sous réserve d’approbation.',
    sec3Body: `Les séances théoriques sont généralement d’une durée de 4 à 6 heures. L’élève doit compléter les ${pricing.theoryHours} heures de théorie avant l’examen SAAQ.`,
    sec3Missed: 'Heures théoriques manquées : 30 $/h. Annulation pratique sans préavis de 48 h : 65 $.',
    sec4Body: 'L’élève dispose d’un délai maximal de 18 mois à compter de la date prévue du premier cours.',
    firstCourse: 'Date du premier cours',
    maxComplete: 'Date maximale de fin',
    consent1Title: 'Transmission des renseignements à la SAAQ',
    consent1Body: 'J’autorise l’école à transmettre les renseignements de mon dossier à la SAAQ.',
    consent2Title: 'Transfert du dossier en cas de fermeture',
    consent2Body: 'J’autorise, en cas de fermeture, le transfert de mon dossier à la SAAQ ou à une autre école.',
    consent3Title: 'Communication des coordonnées',
    consent3Body: 'J’autorise l’école à transmettre mes coordonnées à la SAAQ pour sondages ou documents requis.',
    sigTitle: 'Signatures', sigSub: 'Étape finale',
    sigIntro: 'En signant le présent contrat, l’élève reconnaît avoir lu, compris et accepté toutes les clauses ci-dessus.',
    signedAt: 'Signé à',
    student: 'Élève', rep: 'Représentant autorisé — Prestataire-PESR',
    sigFull: 'Nom complet', sig: 'Signature', sigDate: 'Date',
    component: 'Composante', hours: 'Heures', preTax: 'Prix (avant taxes)',
    theoretical: 'Volet théorique', practical: 'Volet pratique',
    subBefore: 'Sous-total — Avant taxes',
    payIntro: 'Le coût total est payable en quatre (4) versements.',
    payHeaders: ['N°', 'Étape', 'Montant', 'Date prévue', 'Date payée'],
    footL: 'École de Conduite Qazi', footC: 'Conforme — Article 83', footR: 'SAAQ / LPC / 2026',
    sections: [
      { num: '01', titleEn: '', titleFr: 'Description de la formation', refEn: '', refFr: 'Art. 83 (b)(c)(e)' },
      { num: '02', titleEn: '', titleFr: 'Coût et paiement', refEn: '', refFr: 'Art. 83 (h)' },
      { num: '03', titleEn: '', titleFr: 'Absence et annulation', refEn: '', refFr: 'Préavis et frais' },
      { num: '04', titleEn: '', titleFr: 'Durée du contrat', refEn: '', refFr: 'Art. 83 (g)' },
      { num: '05', titleEn: '', titleFr: 'Engagements', refEn: '', refFr: 'Art. 83 (i)(j)(k)(l)(m)(q)' },
      { num: '06', titleEn: '', titleFr: 'Résiliation', refEn: '', refFr: 'Loi sur la protection du consommateur' },
      { num: '07', titleEn: '', titleFr: 'Consentements de l’élève', refEn: '', refFr: 'Art. 83 (n)(o)(p)' },
    ] as SectionInfo[],
  }

  const locationRows = [
    { label: lang === 'en' ? 'Theoretical courses' : 'Cours théoriques', value: school.truckTheoryAddress },
    { label: lang === 'en' ? 'Road training starts' : 'Départ des sorties sur route', value: school.truckRoadAddress },
    { label: lang === 'en' ? 'Closed circuit' : 'Circuit fermé', value: school.truckCircuitAddress },
  ]

  return React.createElement(Page, { size: 'LETTER', style: styles.page },
    React.createElement(View, { style: styles.topBar },
      React.createElement(Text, { style: styles.topLeft }, t.classLine),
      React.createElement(Text, { style: styles.topCenter }, school.name),
      React.createElement(Text, { style: styles.topRight }, school.address.split(',')[0]),
    ),
    React.createElement(View, { style: styles.titleBar },
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(Text, { style: styles.titleH1 }, t.title),
        React.createElement(Text, { style: styles.titleSub }, t.subtitle),
      ),
      React.createElement(View, { style: styles.titleMeta },
        React.createElement(Text, { style: styles.titleMetaLabel }, t.contractNo.toUpperCase()),
        React.createElement(View, { style: styles.titleMetaUnderline },
          React.createElement(Text, { style: styles.titleMetaValue }, data.contractNumber || '—'),
        ),
        React.createElement(Text, { style: styles.titleMetaLabel }, t.date.toUpperCase()),
        React.createElement(View, { style: styles.titleMetaUnderline },
          React.createElement(Text, { style: styles.titleMetaValue }, contractDate),
        ),
      ),
    ),
    React.createElement(View, { style: styles.partiesRow },
      React.createElement(View, { style: styles.party },
        React.createElement(Text, { style: styles.partyLabel }, t.schoolLabel.toUpperCase()),
        React.createElement(PartyField, { label: t.name.toUpperCase(), value: school.name, prefilled: true }),
        React.createElement(PartyField, { label: t.saaqNo.toUpperCase(), value: school.saaqNumber }),
        React.createElement(PartyField, { label: t.addr.toUpperCase(), value: school.address, prefilled: true }),
        React.createElement(PartyField, { label: t.phone.toUpperCase(), value: school.phone }),
        React.createElement(PartyField, { label: t.email.toUpperCase(), value: school.email }),
      ),
      React.createElement(View, { style: [styles.party, styles.partyDivider] as never },
        React.createElement(Text, { style: styles.partyLabel }, t.studentLabel.toUpperCase()),
        React.createElement(PartyField, { label: t.fullName.toUpperCase(), value: data.fullName, prefilled: true }),
        React.createElement(PartyField, { label: t.dob.toUpperCase(), value: data.dob }),
        React.createElement(PartyField, { label: t.lic.toUpperCase(), value: data.permitNumber }),
        React.createElement(PartyField, { label: t.addr.toUpperCase(), value: data.address }),
        React.createElement(PartyField, { label: t.phone.toUpperCase(), value: data.phone }),
        React.createElement(PartyField, { label: t.email.toUpperCase(), value: data.email }),
      ),
    ),
    React.createElement(View, { style: styles.section },
      React.createElement(SectionBar, { info: t.sections[0], lang }),
      React.createElement(Text, { style: styles.callout }, t.sec1Body),
      React.createElement(Text, { style: styles.text }, t.sec1IncludesPre),
      React.createElement(Text, { style: styles.text }, `- ${t.theoryHours}\n- ${t.practicalHours}`),
      React.createElement(Text, { style: styles.text }, t.sec1Body2),
      React.createElement(Sub, { num: '1.2', title: lang === 'en' ? 'Training Locations' : 'Lieux de formation' }),
      ...locationRows.map((row, i) =>
        React.createElement(View, { key: i, style: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 } },
          React.createElement(Text, { style: [styles.partyFieldLabel, { width: 148, marginBottom: 3 }] as never }, row.label.toUpperCase()),
          React.createElement(View, { style: { flex: 1, borderBottomWidth: 0.6, borderBottomColor: '#bbb', paddingBottom: 2 } },
            React.createElement(Text, { style: { fontSize: 9 } }, row.value || '—'),
          ),
        ),
      ),
    ),
    React.createElement(View, { style: styles.section, wrap: false },
      React.createElement(SectionBar, { info: t.sections[1], lang }),
      React.createElement(View, { style: styles.pricingBlock, wrap: false },
        React.createElement(View, { style: [styles.pricingRow, styles.pricingHeader] as never },
          React.createElement(Text, { style: [styles.pricingHeaderText, { flex: 1 }] as never }, t.component.toUpperCase()),
          React.createElement(Text, { style: [styles.pricingHeaderText, { width: 80, textAlign: 'right' }] as never }, t.hours.toUpperCase()),
          React.createElement(Text, { style: [styles.pricingHeaderText, { width: 100, textAlign: 'right' }] as never }, t.preTax.toUpperCase()),
        ),
        React.createElement(View, { style: styles.pricingRow },
          React.createElement(Text, { style: styles.pricingName }, t.theoretical),
          React.createElement(Text, { style: styles.pricingMeta }, `${pricing.theoryHours} h`),
          React.createElement(Text, { style: styles.pricingAmount }, `$${pricing.theoryPrice.toLocaleString()}`),
        ),
        React.createElement(View, { style: styles.pricingRow },
          React.createElement(Text, { style: styles.pricingName }, t.practical),
          React.createElement(Text, { style: styles.pricingMeta }, `${pricing.practicalHours} h`),
          React.createElement(Text, { style: styles.pricingAmount }, `$${pricing.practicalPrice.toLocaleString()}`),
        ),
        React.createElement(View, { style: [styles.pricingRow, styles.pricingSubtotal] as never },
          React.createElement(Text, { style: [styles.pricingName, styles.bold] as never }, t.subBefore),
          React.createElement(Text, { style: styles.pricingMeta }, `${pricing.theoryHours + pricing.practicalHours} h`),
          React.createElement(Text, { style: styles.pricingAmount }, `$${pricing.subtotal.toLocaleString()}`),
        ),
      ),
      React.createElement(Text, { style: styles.text }, t.sec2Body),
      React.createElement(Sub, { num: '2.4', title: lang === 'en' ? 'Payment Schedule' : 'Calendrier des versements' }),
      React.createElement(Text, { style: styles.text }, t.payIntro),
      React.createElement(View, { style: styles.payTable, wrap: false },
        React.createElement(View, { style: styles.payHeaderRow },
          React.createElement(Text, { style: [styles.payHeaderCell, { width: 28, textAlign: 'center' }] as never }, t.payHeaders[0]),
          React.createElement(Text, { style: [styles.payHeaderCell, { flex: 1 }] as never }, t.payHeaders[1]),
          React.createElement(Text, { style: [styles.payHeaderCell, { width: 82, textAlign: 'center' }] as never }, t.payHeaders[2]),
          React.createElement(Text, { style: [styles.payHeaderCell, { width: 82, textAlign: 'center' }] as never }, t.payHeaders[3]),
          React.createElement(Text, { style: [styles.payHeaderCell, { width: 82, textAlign: 'center' }] as never }, t.payHeaders[4]),
        ),
        ...rows.map((row) =>
          React.createElement(View, { key: row.number, wrap: false, style: styles.payRow },
            React.createElement(Text, { style: styles.payNum }, row.number),
            React.createElement(Text, { style: styles.payStep }, lang === 'en' ? row.stepEn : row.stepFr),
            React.createElement(Text, { style: row.amount ? styles.payCellFilled : styles.payCell }, row.amount || BLANK_AMOUNT),
            React.createElement(Text, { style: styles.payCell }, row.dateScheduled || BLANK_DATE),
            React.createElement(Text, { style: row.datePaid ? styles.payCellFilled : styles.payCell }, row.datePaid || BLANK_DATE),
          ),
        ),
      ),
    ),
    React.createElement(View, { style: styles.section },
      React.createElement(SectionBar, { info: t.sections[2], lang }),
      React.createElement(Text, { style: styles.text }, t.sec3Body),
      React.createElement(Text, { style: styles.callout }, t.sec3Missed),
    ),
    React.createElement(View, { style: styles.section },
      React.createElement(SectionBar, { info: t.sections[3], lang }),
      React.createElement(Text, { style: styles.text }, t.sec4Body),
      React.createElement(View, { style: { flexDirection: 'row', gap: 20 } },
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Text, { style: styles.durationLabel }, t.firstCourse.toUpperCase()),
          React.createElement(View, { style: styles.durationValue },
            React.createElement(Text, { style: styles.durationText },
              (lang === 'en' ? formatDateEn(data.firstCourseDate) : formatDateFr(data.firstCourseDate)) || '—',
            ),
          ),
        ),
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Text, { style: styles.durationLabel }, t.maxComplete.toUpperCase()),
          React.createElement(View, { style: styles.durationValue },
            React.createElement(Text, { style: styles.durationText },
              (lang === 'en' ? formatDateEn(data.maxCompletionDate) : formatDateFr(data.maxCompletionDate)) || '—',
            ),
          ),
        ),
      ),
    ),
    React.createElement(View, { style: styles.section, wrap: false },
      React.createElement(SectionBar, { info: t.sections[6], lang }),
      React.createElement(View, { style: styles.consentBlock },
        ...[
          { checked: data.consentSaaq, title: t.consent1Title, body: t.consent1Body },
          { checked: data.consentTransfer, title: t.consent2Title, body: t.consent2Body },
          { checked: data.consentContact, title: t.consent3Title, body: t.consent3Body },
        ].map((c, i) =>
          React.createElement(View, { key: i, wrap: false, style: styles.consentItem },
            React.createElement(ConsentBox, { checked: c.checked }),
            React.createElement(View, { style: { flex: 1 } },
              React.createElement(Text, { style: styles.consentTitle }, c.title),
              React.createElement(Text, { style: styles.consentText }, c.body),
            ),
          ),
        ),
      ),
    ),
    React.createElement(View, { style: styles.sigSection, wrap: false },
      React.createElement(View, { style: styles.sigBar },
        React.createElement(Text, { style: styles.sigBarTitle }, t.sigTitle),
        React.createElement(Text, { style: styles.sigBarSub }, t.sigSub),
      ),
      React.createElement(Text, { style: styles.sigIntro }, t.sigIntro),
      React.createElement(View, { style: styles.sigPlace },
        React.createElement(Text, { style: styles.sigPlaceLabel }, t.signedAt),
        React.createElement(View, { style: styles.sigPlaceValue },
          React.createElement(Text, { style: styles.sigPlaceText }, data.signedAtPlace || ' '),
        ),
      ),
      React.createElement(View, { style: styles.sigGrid },
        React.createElement(View, { style: styles.sigBlock },
          React.createElement(Text, { style: styles.sigBlockTag }, t.student.toUpperCase()),
          React.createElement(Text, { style: styles.sigFieldLabel }, t.sigFull.toUpperCase()),
          React.createElement(View, { style: styles.sigLine },
            React.createElement(Text, { style: styles.sigPlaceText }, data.fullName || ' '),
          ),
          React.createElement(Text, { style: styles.sigFieldLabel }, t.sig.toUpperCase()),
          data.studentSignature
            ? React.createElement(Image, { src: data.studentSignature, style: styles.sigImage })
            : React.createElement(View, { style: styles.sigLine },
                React.createElement(Text, { style: styles.sigPlaceText }, ' '),
              ),
          React.createElement(Text, { style: styles.sigFieldLabel }, t.sigDate.toUpperCase()),
          React.createElement(View, { style: styles.sigLine },
            React.createElement(Text, { style: styles.sigPlaceText }, contractDate || ' '),
          ),
        ),
        React.createElement(View, { style: [styles.sigBlock, styles.sigBlockDivider] as never },
          React.createElement(Text, { style: styles.sigBlockTag }, t.rep.toUpperCase()),
          React.createElement(Text, { style: styles.sigFieldLabel }, t.sigFull.toUpperCase()),
          React.createElement(View, { style: styles.sigLine },
            React.createElement(Text, { style: styles.sigPlaceText }, data.repName || ' '),
          ),
          React.createElement(Text, { style: styles.sigFieldLabel }, t.sig.toUpperCase()),
          data.repSignature
            ? React.createElement(Image, { src: data.repSignature, style: styles.sigImage })
            : React.createElement(View, { style: styles.sigLine },
                React.createElement(Text, { style: styles.sigPlaceText }, ' '),
              ),
          React.createElement(Text, { style: styles.sigFieldLabel }, t.sigDate.toUpperCase()),
          React.createElement(View, { style: styles.sigLine },
            React.createElement(Text, { style: styles.sigPlaceText }, repSignedDate || ' '),
          ),
        ),
      ),
    ),
    React.createElement(View, { style: styles.footer },
      React.createElement(Text, null, t.footL),
      React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold', color: '#000' } }, t.footC),
      React.createElement(Text, null, t.footR),
    ),
  )
}

export async function renderClass1ContractPdf(input: {
  lang: Class1ContractLang
  data: Class1ContractData
  school: Class1ContractSchool
  pricing: TruckContract
  rows: readonly ContractInstallmentRow[]
}): Promise<Buffer> {
  const pages: React.ReactElement[] = []
  if (input.lang === 'en' || input.lang === 'both') {
    pages.push(React.createElement(ContractPage, {
      lang: 'en',
      data: input.data,
      school: input.school,
      pricing: input.pricing,
      rows: input.rows,
      key: 'en',
    }))
  }
  if (input.lang === 'fr' || input.lang === 'both') {
    pages.push(React.createElement(ContractPage, {
      lang: 'fr',
      data: input.data,
      school: input.school,
      pricing: input.pricing,
      rows: input.rows,
      key: 'fr',
    }))
  }
  const buffer = await renderToBuffer(React.createElement(Document, null, ...pages))
  return Buffer.from(buffer)
}
