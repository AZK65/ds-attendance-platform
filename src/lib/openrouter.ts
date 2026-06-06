// Single source of truth for the OpenRouter model used by all OCR routes
// (certificate licence/attendance/combined scans + registration licence).
//
// Pinned to a current Google Gemini Flash model. Note: pinned slugs get
// retired over time and then every OCR call fails (a retired version 404s
// with "No endpoints found"; an unknown slug 400s with "not a valid model
// ID"). OPENROUTER_OCR_MODEL lets us swap to the next Flash model from env
// without a code deploy when that happens — check the current id at
// https://openrouter.ai/models?q=gemini+flash
export const OCR_MODEL = process.env.OPENROUTER_OCR_MODEL || 'google/gemini-3.5-flash'
