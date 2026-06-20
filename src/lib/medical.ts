// The 17 conditions from SAAQ form 6224A (English; rows 1-17 in PDF order).
// Shared by the registration medical checklist and the medical-declaration PDF
// so the indexes stored in a registration's `medical.conditions` array stay in
// sync between the two.
export const MEDICAL_CONDITIONS: string[] = [
  'I wear glasses or contact lenses to drive.',
  'I have an eye disease or disorder (cataracts, glaucoma, retinopathy, macular degeneration, double vision, loss of an eye or no vision in one eye, etc.).',
  'I have a hearing impairment and I drive a minibus, a bus or an emergency vehicle, or I transport dangerous substances.',
  'I suffer from vertigo that restricts my activities.',
  'I have a heart disease that restricts activities such as walking.',
  'I experience excessive sleepiness related to a sleep disorder.',
  'I have had significant movement limitations for several months in my neck, hands, and feet.',
  'I have a serious psychiatric disorder (schizophrenia, bipolar disorder, major depression, etc.).',
  'I have a substance use disorder (alcohol, drugs or other substances).',
  "I have a cognitive impairment (dementia, Alzheimer's disease, memory or orientation problems, etc.).",
  'I have had epileptic seizures.',
  "I have a neurological condition that restricts my activities (stroke, head trauma, paralysis, Parkinson's disease, multiple sclerosis, etc.).",
  'I have experienced loss of consciousness in the past 12 months (syncopes, convulsions, hypoglycemic episodes, etc.).',
  'I have insulin-treated diabetes.',
  'I have a lung disease that restricts activities such as walking.',
  'I experience a deterioration of my functional abilities (I need home assistance to carry out daily activities such as eating, hygiene, dressing, getting around, etc.).',
  'I regularly take medication that causes daytime drowsiness.',
]
