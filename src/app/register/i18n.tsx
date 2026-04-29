'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type Lang = 'fr' | 'en'
export const LANG_STORAGE_KEY = 'qazi:lang'

type Dict = typeof dict.en

const dict = {
  en: {
    nav: {
      courses: 'Courses',
      packages: 'Packages',
      contact: 'Contact',
      signup: 'Sign up',
      signupCurrent: 'Sign up — current page',
      courseCar: 'Class 5',
      courseCarMeta: 'Car',
      courseTruck: 'Classes 1 & 3',
      courseTruckMeta: 'Truck',
    },
    hero: {
      eyebrow: 'Student Registration',
      h1a: "Let's get you",
      h1Accent: 'on the road.',
      lead: 'Complete your registration for the Class 5 driving course with Qazi Driving School. It only takes a few minutes.',
      class5Label: 'Class 5 — Next group',
      class5Date: 'June 2026',
      class5Cadence: 'New group every 5 weeks',
      truckLabel: 'Classes 1 & 3 — Truck',
      truckNote: 'Contact us for schedule',
      truckCta: 'Contact',
    },
    steps: {
      personal: 'Personal Info',
      address: 'Address',
      documents: 'Documents',
      agreement: 'Agreement',
      payment: 'Payment',
    },
    select: {
      heading: 'Which course are you registering for?',
      sub: 'Choose your program to continue.',
      class5Title: 'Class 5',
      class5Sub: 'Car — online registration',
      class5Cta: 'Continue',
      truckTitle: 'Classes 1 & 3',
      truckSub: 'Truck — register in person',
      truckCta: 'See details',
    },
    truck: {
      heading: 'Classes 1 & 3 — Truck',
      body: 'Truck course registration (Classes 1 and 3) is completed in person at our school. Please visit us or give us a call so we can walk you through the program and schedule.',
      visitLabel: 'Visit us',
      address: '786 Rue Jean-Talon O, Montréal, QC H3N 1S2',
      callLabel: 'Call us',
      phone: '(514) 555-0199',
      hoursLabel: 'Hours',
      hours: 'Open daily 11 AM – 7 PM · Closed Fridays',
      backToChoice: 'Back to course selection',
    },
    personal: {
      heading: 'Personal Information',
      fullName: 'Full Name',
      fullNamePh: 'First and Last Name',
      phone: 'Phone Number',
      phonePh: '(514) 123-4567',
      email: 'Email',
      emailPh: 'email@example.com',
      dob: 'Date of Birth',
    },
    address: {
      heading: 'Address',
      street: 'Street Address',
      streetPh: '123 Main Street, Apt 4',
      city: 'City',
      province: 'Province',
      postal: 'Postal Code',
      postalPh: 'H1N 1K4',
    },
    documents: {
      heading: 'Documents',
      sub: "Upload photos of your learner's permit and ID (optional but recommended)",
      permitNumber: "Learner's Permit Number",
      permitPhoto: "Learner's Permit Photo",
      idPhoto: 'Government ID Photo',
      takePhoto: 'Take Photo or Upload',
      takePhotoHint: 'Tap to open camera',
      idHint: 'Passport, health card, or other government ID',
      remove: 'Remove',
    },
    agreement: {
      heading: 'Agreement & Signature',
      agreeTerms: 'I agree to the terms and conditions of Qazi Driving School',
      agreeAccurate: 'I confirm that all information provided is accurate',
      signature: 'Signature',
      clear: 'Clear',
      signHint: 'Draw your signature here',
    },
    payment: {
      heading: 'Payment Schedule',
      intro: 'The total course cost is $1,000 (including taxes and course materials), payable in six installments.',
      dueToday: 'Due today',
      total: 'Total',
      rows: [
        { phase: 'On Registration', roadClass: null },
        { phase: '1st Certificate', roadClass: null },
        { phase: 'Phase 2', roadClass: 'Road Class 1' },
        { phase: 'Phase 3', roadClass: 'Road Class 6' },
        { phase: 'Phase 3', roadClass: 'Road Class 9' },
        { phase: 'Phase 4', roadClass: 'Road Class 12' },
      ],
      firstDue: 'First payment due now:',
      firstDueNote: "You'll be redirected to our secure checkout to complete payment and confirm your registration.",
    },
    tc: {
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
    actions: {
      back: 'Back',
      next: 'Next',
      checkout: 'Proceed to Checkout — $250',
    },
    errors: {
      network: 'Network error. Please try again.',
      failed: 'Registration failed',
      qcOnlyTitle: 'Quebec residents only',
      qcOnlyBody: 'Qazi Driving School currently accepts students residing in Quebec. Please enter a Quebec address to continue.',
    },
    submitting: {
      title: 'Preparing your checkout…',
      sub: "You'll be redirected shortly.",
    },
    done: {
      titleA: 'Registration ',
      titleB: 'submitted.',
      body: "Thank you for registering with Qazi Driving School. We'll review your application and contact you shortly.",
    },
    footer: {
      h1a: 'Ready to',
      h1b: 'drive',
      h1c: ' your way.',
      lead: "Montreal's driving school since 2003. Class 5 (car) and Classes 1 & 3 (truck) — taught in English, French, or Arabic.",
      contact: 'Contact',
      cities: 'Montréal · Laval · Longueuil',
      follow: 'Follow',
      rights: 'Qazi Driving School. All rights reserved.',
      saaq: 'SAAQ-recognized school · Permit no. 12345',
    },
  },
  fr: {
    nav: {
      courses: 'Parcours',
      packages: 'Forfaits',
      contact: 'Contact',
      signup: "S'inscrire",
      signupCurrent: "S'inscrire — page actuelle",
      courseCar: 'Classe 5',
      courseCarMeta: 'Auto',
      courseTruck: 'Classes 1 et 3',
      courseTruckMeta: 'Camion',
    },
    hero: {
      eyebrow: 'Inscription élève',
      h1a: 'On commence',
      h1Accent: 'ensemble.',
      lead: "Remplissez votre inscription au cours de conduite Classe 5 avec École de conduite Qazi. Ça ne prend que quelques minutes.",
      class5Label: 'Classe 5 — Prochain groupe',
      class5Date: 'Juin 2026',
      class5Cadence: 'Nouveau groupe aux 5 semaines',
      truckLabel: 'Classes 1 et 3 — Camion',
      truckNote: 'Contactez-nous pour l’horaire',
      truckCta: 'Contact',
    },
    steps: {
      personal: 'Informations',
      address: 'Adresse',
      documents: 'Documents',
      agreement: 'Entente',
      payment: 'Paiement',
    },
    select: {
      heading: 'Pour quel cours voulez-vous vous inscrire ?',
      sub: 'Choisissez votre programme pour continuer.',
      class5Title: 'Classe 5',
      class5Sub: 'Auto — inscription en ligne',
      class5Cta: 'Continuer',
      truckTitle: 'Classes 1 et 3',
      truckSub: 'Camion — inscription en personne',
      truckCta: 'Voir les détails',
    },
    truck: {
      heading: 'Classes 1 et 3 — Camion',
      body: "L'inscription aux cours camion (Classes 1 et 3) se fait en personne à notre école. Venez nous voir ou appelez-nous pour qu'on vous présente le programme et l'horaire.",
      visitLabel: 'Venez nous voir',
      address: '786, rue Jean-Talon Ouest, Montréal, QC H3N 1S2',
      callLabel: 'Appelez-nous',
      phone: '(514) 555-0199',
      hoursLabel: 'Heures',
      hours: 'Ouvert tous les jours de 11 h à 19 h · Fermé le vendredi',
      backToChoice: 'Retour à la sélection du cours',
    },
    personal: {
      heading: 'Renseignements personnels',
      fullName: 'Nom complet',
      fullNamePh: 'Prénom et nom',
      phone: 'Téléphone',
      phonePh: '(514) 123-4567',
      email: 'Courriel',
      emailPh: 'courriel@exemple.com',
      dob: 'Date de naissance',
    },
    address: {
      heading: 'Adresse',
      street: 'Adresse',
      streetPh: '123, rue Principale, app. 4',
      city: 'Ville',
      province: 'Province',
      postal: 'Code postal',
      postalPh: 'H1N 1K4',
    },
    documents: {
      heading: 'Documents',
      sub: "Téléversez des photos de votre permis d'apprenti et d'une pièce d'identité (facultatif mais recommandé)",
      permitNumber: "Numéro du permis d'apprenti",
      permitPhoto: "Photo du permis d'apprenti",
      idPhoto: "Photo d'une pièce d'identité",
      takePhoto: 'Prendre une photo ou téléverser',
      takePhotoHint: 'Touchez pour ouvrir la caméra',
      idHint: "Passeport, carte d'assurance maladie ou autre pièce d'identité",
      remove: 'Retirer',
    },
    agreement: {
      heading: 'Entente et signature',
      agreeTerms: "J'accepte les conditions d'École de conduite Qazi",
      agreeAccurate: 'Je confirme que tous les renseignements fournis sont exacts',
      signature: 'Signature',
      clear: 'Effacer',
      signHint: 'Tracez votre signature ici',
    },
    payment: {
      heading: 'Calendrier des paiements',
      intro: 'Le coût total du cours est de 1 000 $ (taxes et manuels inclus), payable en six versements.',
      dueToday: "Dû aujourd'hui",
      total: 'Total',
      rows: [
        { phase: "À l'inscription", roadClass: null },
        { phase: '1er certificat', roadClass: null },
        { phase: 'Phase 2', roadClass: 'Cours pratique 1' },
        { phase: 'Phase 3', roadClass: 'Cours pratique 6' },
        { phase: 'Phase 3', roadClass: 'Cours pratique 9' },
        { phase: 'Phase 4', roadClass: 'Cours pratique 12' },
      ],
      firstDue: 'Premier paiement dû maintenant :',
      firstDueNote: 'Vous serez redirigé vers notre paiement sécurisé pour confirmer votre inscription.',
    },
    tc: {
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
    actions: {
      back: 'Retour',
      next: 'Suivant',
      checkout: 'Procéder au paiement — 250 $',
    },
    errors: {
      network: 'Erreur réseau. Veuillez réessayer.',
      failed: 'Inscription échouée',
      qcOnlyTitle: 'Résidents du Québec seulement',
      qcOnlyBody: "École de conduite Qazi accepte présentement seulement les élèves résidant au Québec. Veuillez saisir une adresse au Québec pour poursuivre.",
    },
    submitting: {
      title: 'Préparation du paiement…',
      sub: 'Vous serez redirigé sous peu.',
    },
    done: {
      titleA: 'Inscription ',
      titleB: 'envoyée.',
      body: 'Merci de vous être inscrit à École de conduite Qazi. Nous examinerons votre demande et vous contacterons rapidement.',
    },
    footer: {
      h1a: 'Prêt à',
      h1b: 'conduire',
      h1c: ' à votre rythme.',
      lead: "L'école de conduite de Montréal depuis 2003. Classe 5 (auto) et Classes 1 et 3 (camion) — enseignée en anglais, français ou arabe.",
      contact: 'Contact',
      cities: 'Montréal · Laval · Longueuil',
      follow: 'Suivez-nous',
      rights: 'École de conduite Qazi. Tous droits réservés.',
      saaq: 'École reconnue par la SAAQ · Permis no 12345',
    },
  },
} as const

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Dict }
const LangContext = createContext<Ctx | null>(null)

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY)
    if (saved === 'fr' || saved === 'en') setLangState(saved)
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANG_STORAGE_KEY && (e.newValue === 'fr' || e.newValue === 'en')) {
        setLangState(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setLang = (next: Lang) => {
    setLangState(next)
    window.localStorage.setItem(LANG_STORAGE_KEY, next)
    document.documentElement.lang = next
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: dict[lang] as Dict }}>
      {children}
    </LangContext.Provider>
  )
}

export function useT(): Ctx {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useT must be used within LangProvider')
  return ctx
}
