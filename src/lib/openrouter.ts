// Single source of truth for the OpenRouter model used by all OCR routes
// (certificate licence/attendance/combined scans + registration licence).
//
// We default to Google's auto-updating "latest Flash" router rather than a
// pinned version: a pinned slug (e.g. google/gemini-2.0-flash-001) gets
// retired over time and every OCR call then 404s with "No endpoints found".
// The router follows the current Flash model, and OPENROUTER_OCR_MODEL lets
// us pin or swap the model from env without a code deploy if needed.
export const OCR_MODEL = process.env.OPENROUTER_OCR_MODEL || 'google/gemini-flash-latest'
