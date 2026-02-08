const fs = require('fs');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const imagePath = process.argv[2];

if (!OPENROUTER_API_KEY || !imagePath) {
  console.log('Usage: OPENROUTER_API_KEY=xxx node test-gemini.js <image>');
  process.exit(1);
}

const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');
console.log('Image loaded:', Math.round(imageBuffer.length / 1024), 'KB\n');

const FULL_PROMPT = `You are an OCR assistant. Extract dates from this HANDWRITTEN driving school attendance sheet.

IMPORTANT: Dates are written as DD/MM/YYYY (day/month/year). Convert to YYYY-MM-DD format.
Example: "16/03/2025" written on paper → output as "2025-03-16" (March 16th)
Example: "02/02/2025" written on paper → output as "2025-02-02" (February 2nd)

The first number is the DAY (01-31), the second number is the MONTH (01-12), the third is the YEAR.

This is a "STUDENT ATTENDANCE SHEET" with:
- Student info: Name, Phone, Contract Number, Class 5 Licence Number, Registration Date, Expiry Date
- PHASE 1: M1, M2, M3, M4, M5 (theory modules)
- PHASE 2: M6, In-Car Sessions 1-4, M7
- PHASE 3: M8, Sessions 5-6, M9, Sessions 7-8, M10, Sessions 9-10
- PHASE 4: M11, Sessions 11-13, M12, Sessions 14-15

Return ONLY valid JSON:
{
  "name": "student name",
  "contractNumber": "contract number",
  "phone": "phone number",
  "licenceNumber": "licence number",
  "registrationDate": "YYYY-MM-DD",
  "expiryDate": "YYYY-MM-DD",
  "module1Date": "YYYY-MM-DD",
  "module2Date": "YYYY-MM-DD",
  "module3Date": "YYYY-MM-DD",
  "module4Date": "YYYY-MM-DD",
  "module5Date": "YYYY-MM-DD",
  "module6Date": "YYYY-MM-DD",
  "sortie1Date": "YYYY-MM-DD",
  "sortie2Date": "YYYY-MM-DD",
  "module7Date": "YYYY-MM-DD",
  "sortie3Date": "YYYY-MM-DD",
  "sortie4Date": "YYYY-MM-DD",
  "module8Date": "YYYY-MM-DD",
  "sortie5Date": "YYYY-MM-DD",
  "module9Date": "YYYY-MM-DD",
  "sortie6Date": "YYYY-MM-DD",
  "sortie7Date": "YYYY-MM-DD",
  "sortie8Date": "YYYY-MM-DD",
  "module10Date": "YYYY-MM-DD",
  "sortie9Date": "YYYY-MM-DD",
  "sortie10Date": "YYYY-MM-DD",
  "module11Date": "YYYY-MM-DD",
  "sortie11Date": "YYYY-MM-DD",
  "sortie12Date": "YYYY-MM-DD",
  "sortie13Date": "YYYY-MM-DD",
  "module12Date": "YYYY-MM-DD",
  "sortie14Date": "YYYY-MM-DD",
  "sortie15Date": "YYYY-MM-DD"
}

Use empty string for fields not found. Read each date carefully - the format is DD/MM/YYYY!`;

async function testModel(modelName) {
  console.log(`\n=== Testing ${modelName} ===\n`);

  const start = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: FULL_PROMPT }
        ]
      }],
      max_tokens: 2000,
      temperature: 0
    })
  });

  const data = await res.json();
  const time = Date.now() - start;

  if (data.error) {
    console.log('ERROR:', data.error.message || JSON.stringify(data.error));
    return;
  }

  const content = data.choices?.[0]?.message?.content || '';
  console.log('Time:', time, 'ms\n');

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      const keyDates = {
        'M1 (26/10/2024)': { field: 'module1Date', expected: '2024-10-26' },
        'M2 (02/11/2024)': { field: 'module2Date', expected: '2024-11-02' },
        'M3 (09/11/2024)': { field: 'module3Date', expected: '2024-11-09' },
        'M4 (16/11/2024)': { field: 'module4Date', expected: '2024-11-16' },
        'M5 (23/11/2024)': { field: 'module5Date', expected: '2024-11-23' },
        'M6 (19/01/2025)': { field: 'module6Date', expected: '2025-01-19' },
        'M7 (16/03/2025)': { field: 'module7Date', expected: '2025-03-16' },
        'M8 (03/05/2025)': { field: 'module8Date', expected: '2025-05-03' },
        'M9 (14/06/2025)': { field: 'module9Date', expected: '2025-06-14' },
        'M10 (03/08/2025)': { field: 'module10Date', expected: '2025-08-03' },
        'M11 (11/10/2025)': { field: 'module11Date', expected: '2025-10-11' },
        'M12 (15/11/2025)': { field: 'module12Date', expected: '2025-11-15' },
      };

      let correct = 0;
      let wrong = 0;

      for (const [label, { field, expected }] of Object.entries(keyDates)) {
        const actual = parsed[field] || '(empty)';
        const isCorrect = actual === expected;
        const icon = isCorrect ? '✅' : '❌';
        console.log(`${icon} ${label}: got "${actual}" ${isCorrect ? '' : `(expected "${expected}")`}`);
        if (isCorrect) correct++;
        else wrong++;
      }

      console.log(`\nScore: ${correct}/${correct + wrong} correct`);
      console.log('Name:', parsed.name);
      console.log('Contract:', parsed.contractNumber);
    }
  } catch (e) {
    console.log('Failed to parse JSON:', e.message);
    console.log('Raw response:', content.substring(0, 500));
  }
}

async function main() {
  await testModel('google/gemini-2.0-flash-001');
  await testModel('openai/gpt-4o');
}

main();
