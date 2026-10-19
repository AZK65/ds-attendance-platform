import { ASSISTANT_TIMEZONE, MAX_RANGE_DAYS } from '@/lib/assistant/dates'

export function assistantSchema() {
  const base = 'https://qazidrivingschool.ca'
  return {
    name: 'Qazi Driving School assistant API',
    readOnly: true,
    timezone: ASSISTANT_TIMEZONE,
    auth: 'Authorization: Bearer <ASSISTANT_API_TOKEN>',
    notes: [
      'Every route is GET and read-only. Tokens in the query string are rejected.',
      'If ASSISTANT_API_TOKEN is unset, every route returns 503.',
      'Dates are America/Toronto civil dates. A single date defaults to today.',
      `from/to is inclusive and limited to ${MAX_RANGE_DAYS} days. from/to overrides date when both are sent.`,
      'Phone numbers are masked. Exam answer keys, files, and message bodies are not returned.',
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/assistant',
        url: `${base}/api/assistant`,
        params: [],
        description: 'This description of the available routes.',
      },
      {
        method: 'GET',
        path: '/api/assistant/schema',
        url: `${base}/api/assistant/schema`,
        params: [],
        description: 'Same payload as GET /api/assistant.',
      },
      {
        method: 'GET',
        path: '/api/assistant/exams',
        url: `${base}/api/assistant/exams`,
        params: ['date=YYYY-MM-DD', 'from=YYYY-MM-DD', 'to=YYYY-MM-DD'],
        description: 'Paper exam sessions for the day, plus online Exam/ExamAttempt results in a separate section.',
      },
      {
        method: 'GET',
        path: '/api/assistant/students/search',
        url: `${base}/api/assistant/students/search`,
        params: ['q='],
        description: 'Basic student lookup (name, masked phone, groups) and recent paper and online exam results.',
      },
      {
        method: 'GET',
        path: '/api/assistant/summary',
        url: `${base}/api/assistant/summary`,
        params: ['date=YYYY-MM-DD', 'from=YYYY-MM-DD', 'to=YYYY-MM-DD'],
        description: 'Counts for exams, attendance, in-car sign-in, invoices, leads, registrations, and sent messages.',
      },
    ],
  }
}
