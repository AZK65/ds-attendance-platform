'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { REGISTRATION_TERMS } from '@/lib/registration-terms'

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
    tc: REGISTRATION_TERMS.en,
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
    tc: REGISTRATION_TERMS.fr,
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
