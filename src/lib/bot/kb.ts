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
- Total duration: about 12 months from start to licence (SAAQ minimum wait rules).
- Theory: 12 live group modules taught online on Zoom. Students follow their group's scheduled module dates; it is not a self-paced course.
- Practical: in-car with a certified instructor.
- Total price: ${dollars(pricing.car.total)}.
- Payment plan: ${pricing.car.schedule.length} installments — ${paymentPlan(pricing.car)}.
- Deposit authorized at registration: ${dollars(pricing.car.depositCents / 100)} (hold on card — nothing charged until the school approves the registration, usually within 72 h).
- Extra hourly driving (à la carte practice / refresher): $50 / hour.
- Age requirement: 16 for Class 5 (16+ can start once they have their apprenti / learner's permit path underway).

## Class 1 (Semi-trailer) — details
- SAAQ-mandated PESR — Class 1 program (required since December 15, 2025).
- Total: 125 hours (75 hours classroom theory + 50 hours in-cab practical with a licensed instructor).
- Theory schedule: 17 hours per week, in-class, Tuesday evenings 17h30–21h30, Thursday evenings 17h30–21h30, Saturday 9h00–18h00. All three days are theory.
- Practical (50 h in-cab): scheduled separately, arranged around the student's and instructor's availability. NOT on the fixed weekly grid.
- Roughly 4.5 to 5 weeks to complete the 75 theory hours at 17 h/week.
- Total price: ${dollars(pricing.truck.total)} before taxes.
- Payment plan: ${pricing.truck.schedule.length} installments — ${paymentPlan(pricing.truck)}.
- Deposit authorized at registration: ${dollars(pricing.truck.depositCents / 100)} (hold on card — nothing charged until the school approves).
- Age requirement: 18+, valid Class 5 licence (probationary accepted), clean driving/criminal record, medical fitness.
- Financing option through a partner bank available on approval.
- Job-placement support available with our carrier partner network.

## Class 3 (Straight truck) — details
- Two- and three-axle straight trucks (moving trucks, dump trucks, garbage trucks, heavy delivery).
- Starter package: $1,495 CAD.
- Extra hours: $90 / hour (à la carte, based on the student's progression).
- Focus: hands-on driving — yard manoeuvres, urban traffic, SAAQ road-test prep.
- Age requirement: 18+, valid Class 5 licence, clean record.

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
- Official certificate submitted to SAAQ.
- Free admin help with paperwork.

## SAAQ facts (accurate as of 2026, useful for prospective students)
- Class 5 licence: 16+, requires PESR program completion + theory exam + road exam.
- Class 5 probationary licence: 24 months for drivers under 25.
- Class 1 licence: 18+, valid Class 5 for at least 24 months, PESR – Class 1 mandatory since Dec 15, 2025.
- SAAQ Class 1 practical exam typically done in Laval.
- SAAQ Class 3: 18+, valid Class 5, medical + practical exam.
- SAAQ theory exam is separate from any driving school — student books it directly with SAAQ.

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
