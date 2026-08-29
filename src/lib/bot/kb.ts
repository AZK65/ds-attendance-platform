import type { Pricing } from '@/lib/pricing'

// Knowledge base for the WhatsApp bot. Bundled into the system prompt on
// every request. Program and contact details mirror the marketing site;
// editable prices are injected from Settings → Pricing at reply time.
//
// Source of truth mapping:
//   - Pricing / installments / deposits: live /settings/pricing DB values
//   - Class content, hours, SAAQ regs: marketing site dict.ts (Class 5 / 1 / 3)
//   - Location, phone, hours, languages: Footer + Contact page
//
// Rules for editing:
//   - Keep numbers exact — the bot quotes these verbatim.
//   - Keep it short. Every token here is billed on every request.
//   - Anything not covered here should read as "the bot should defer".

const dollars = (amount: number) => Number.isInteger(amount)
  ? `$${amount.toLocaleString('en-CA')} CAD`
  : `$${amount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`

const paymentPlan = (pricing: Pricing['car'] | Pricing['truck']) => pricing.schedule
  .map(item => `${item.label}${item.sub ? ` (${item.sub})` : ''}: ${dollars(item.amount)}`)
  .join('; ')

export function buildKnowledge(pricing: Pricing): string {
  return `
# Qazi Driving School — reference facts

## Identity
- Name: École de conduite Qazi / Qazi Driving School
- Family-run, third generation, running since 2003 (22+ years).
- Location: 786 Rue Jean-Talon Ouest, Montréal, QC H3N 1S2
- Phone: (514) 274-6948
- Website: qazidriving.ca
- Serves Montreal, Laval, and the South Shore (Longueuil).
- Instructors speak French, English, Urdu, and Arabic.
- Reviews: 4.9 on Google (312 reviews). 4,800+ licences delivered.

## Programs offered
- Class 5 (Auto / Car) — regular driver's licence, ages 16+
- Class 1 (Semi-remorque / Truck / Tractor-trailer)
- Class 3 (Camion porteur / Straight truck)

We do NOT currently offer: motorcycle (Class 6), bus (Class 2 or 4), scooter, ATV.

## Class 5 (Car) — details
- SAAQ-mandated PESR program: 4 phases, 12 theory modules, 15 practical (in-car) hours.
- The driving course is structured over about 12 months. A new driver must hold the learner's licence for at least 12 months before the road test, then normally holds a probationary licence for 24 months before receiving the full Class 5 licence.
- Theory: 12 live group modules taught online on Zoom. Students follow their group's scheduled module dates; it is not a self-paced course.
- Practical: in-car with a certified instructor.
- Total price: ${dollars(pricing.car.total)}.
- Payment plan: ${pricing.car.schedule.length} installments — ${paymentPlan(pricing.car)}.
- Deposit authorized at registration: ${dollars(pricing.car.depositCents / 100)} (hold on card — nothing charged until the school approves the registration, usually within 72 h).
- Extra hourly driving (à la carte practice / refresher): $50 / hour.
- Minimum age: 16. A parent or legal guardian must consent if the student is under 18.
- Before obtaining the learner's licence, the student completes Phase 1 theory and passes the driving school's Module 5 test.
- The SAAQ knowledge test can be taken after holding the learner's licence for at least 10 months. The SAAQ road test requires at least 12 months with the learner's licence, successful completion of the driving course, and a passed knowledge test.
- A new Class 5 probationary licence normally lasts 24 months and is subject to the zero-alcohol rule and fewer than four demerit points. This is not limited to drivers under age 25.
- Failed Class 5 knowledge or road tests normally have a minimum 28-day wait before a retake.

## Class 1 (Semi-trailer) — details
- SAAQ-mandated PESR — Class 1 program (required since December 15, 2025).
- Total: 125 hours (75 hours classroom theory + 50 hours in-cab practical with a licensed instructor).
- Theory schedule: 17 hours per week, in-class, Tuesday evenings 17h30–21h30, Thursday evenings 17h30–21h30, Saturday 9h00–18h00. All three days are theory.
- Practical (50 h in-cab): scheduled separately, arranged around the student's and instructor's availability. NOT on the fixed weekly grid.
- Roughly 4.5 to 5 weeks to complete the 75 theory hours at 17 h/week.
- Total price: ${dollars(pricing.truck.total)} before taxes.
- Payment plan: ${pricing.truck.schedule.length} installments — ${paymentPlan(pricing.truck)}.
- Deposit authorized at registration: ${dollars(pricing.truck.depositCents / 100)} (hold on card — nothing charged until the school approves).
- Eligibility requires at least 24 months of Class 5 driving experience; experience with a Class 5 probationary licence counts.
- The driving record must have fewer than four demerit points. The licence must not have been suspended or revoked in the previous two years because of accumulated demerit points or a driving-related Criminal Code offence, and the driver must not be prohibited by the CTQ from driving heavy vehicles.
- The first licensing step is a medical report that includes an eye examination; the SAAQ decides medical eligibility.
- Obtaining Class 1 requires the mandatory training, a SAAQ knowledge test, and two road tests. The Class 1 learner's licence is required before the practical component in a safe practice area or on the road.
- The mandatory 125-hour training requirement has applied since December 15, 2025. Someone who already holds a valid Class 1 licence does not redo the full program merely to keep that licence.
- Financing option through a partner bank available on approval.
- Job-placement support available with our carrier partner network.

## Class 3 (Straight truck) — details
- Two- and three-axle straight trucks (moving trucks, dump trucks, garbage trucks, heavy delivery).
- Starter package: $1,495 CAD.
- Extra hours: $90 / hour (à la carte, based on the student's progression).
- Focus: hands-on driving — yard manoeuvres, urban traffic, SAAQ road-test prep.
- Eligibility requires at least 24 months of Class 5 driving experience; probationary Class 5 experience counts.
- The driving record must have fewer than four demerit points, with no suspension or revocation in the previous two years for accumulated demerit points or a driving-related Criminal Code offence, and no CTQ heavy-vehicle prohibition.
- The first licensing step is a medical report including an eye examination. Obtaining Class 3 requires a knowledge test and two road tests.

## Registration flow
- Website form at qazidriving.ca/inscription.
- Card put on file at registration — HOLD only, no charge until Qazi reviews and approves the registration.
- Approval turnaround: usually within 72 hours.
- On submit → student gets a pending-approval email.
- On approval → student gets a "you're registered" confirmation email.

## Cancellation / rescheduling policy
- Practical (in-car) cancellations require 24 h notice. Late cancels: $40 + tax fee.
- Missed theory hours (Class 1): $30/hour make-up fee.
- Practical (Class 1) cancellations without 48 h notice: $65.

## What's typically included
- Bilingual instructors (FR / EN / Urdu / Arabic on request).
- Student portal with progress tracking.
- SMS + email reminders before every class.
- School-issued course attestations required by the program.
- Free admin help with paperwork.

## SAAQ attestations, documents, tests and address changes
- For the Class 5 learner's licence, the student must bring the original Phase 1 attestation bearing the driving school's seal and confirming completion of Phase 1 and the school's Module 5 test. If the student attended more than one school, an attestation from each school is required.
- For the Class 5 road test, the student must bring the driving-course attestation. Again, an attestation from every school attended may be required.
- The driving school issues its course attestations free of charge, must place its seal on the attestation, and is the first point of contact when the name, school information, address, dates, attestation number, or other school-issued information appears incorrect.
- Never tell a student that a wrong school attestation or attestation number is solely SAAQ's responsibility. The school must verify its own record and document. Because the bot cannot inspect the student's document, it must leave that case for staff.
- A person must notify the SAAQ within 30 days after changing their address. This can be done through the official SAAQ change-of-address service. A wrong address printed on a school-issued attestation must still be checked with the school.
- SAAQ knowledge and road test appointments are managed through SAAQclic. The driving school does not control SAAQ appointment availability.
- SAAQ general information: 1-800-361-7620. Do not replace the school's phone number with this number unless the question specifically requires contacting the SAAQ.

## Official SAAQ reference pages (verified August 29, 2026)
- Class 5 licensing: https://saaq.gouv.qc.ca/en/drivers-licences/obtaining-licence/passenger-vehicle-class-5
- Class 5 course structure: https://saaq.gouv.qc.ca/en/drivers-licences/driving-course/automobile
- Recognized schools and attestation responsibilities: https://saaq.gouv.qc.ca/en/drivers-licences/driving-course/finding-recognized-driving-school
- Class 1 licensing: https://saaq.gouv.qc.ca/en/drivers-licences/obtaining-licence/heavy-vehicle/drivers-licence-class-1
- Class 1 mandatory course: https://saaq.gouv.qc.ca/en/drivers-licences/class-1-driving-course-heavy-vehicle-combinations
- Class 3 licensing: https://saaq.gouv.qc.ca/en/drivers-licences/obtaining-licence/heavy-vehicle/truck-class-3
- SAAQ contact and change of address: https://saaq.gouv.qc.ca/en/reach-us

## Office hours
${process.env.BOT_HOURS || `- Saturday through Thursday: 11:00 AM – 7:00 PM
- Friday: closed`}
- Phone: (514) 274-6948
- WhatsApp: same number
- Address: 786 Rue Jean-Talon Ouest, Montréal, QC H3N 1S2
- These hours are the same hours published on the Qazi marketing website.
`.trim()
}

// Language detection — a very small heuristic. Anything else falls through
// to the LLM to decide. The persona prompt instructs it to reply in the
// same language the user wrote in, so this is only used for the greeting
// / defer templates that live outside the LLM call.
export function detectLang(text: string): 'fr' | 'en' {
  // Common French words + Quebec-specific markers.
  const fr = /\b(bonjour|salut|allo|est[- ]ce|combien|quand|où|pourquoi|puis|voudrais|j[ae]|le|la|les|une|un|des|pour|avec|sans|oui|non|merci|svp|s'il|c'est|nous|vous|elle|ils|elles|ça)\b/i
  return fr.test(text) ? 'fr' : 'en'
}
