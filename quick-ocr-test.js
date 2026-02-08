const fs = require('fs');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const imagePath = process.argv[2];

if (!OPENROUTER_API_KEY || !imagePath) {
  console.log('Usage: OPENROUTER_API_KEY=xxx node quick-ocr-test.js <image>');
  process.exit(1);
}

const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');
console.log('Image loaded:', Math.round(imageBuffer.length / 1024), 'KB');

const PROMPT = `Extract ONLY the date for M7 - OEA Strategy from this attendance sheet.

IMPORTANT: Dates are written as DD/MM/YYYY (day/month/year). Convert to YYYY-MM-DD format.
Example: "16/03/2025" written on paper → output as "2025-03-16" (March 16th)

Return ONLY the date in YYYY-MM-DD format, nothing else.`;

const MODELS = [
  'qwen/qwen2.5-vl-72b-instruct',
  'google/gemini-2.0-flash-001',
  'openai/gpt-4o',
  'anthropic/claude-sonnet-4',
];

async function testModel(model) {
  console.log(`\nTesting: ${model}...`);
  const start = Date.now();

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }],
        max_tokens: 50,
        temperature: 0
      })
    });

    const data = await res.json();
    const time = Date.now() - start;

    if (data.error) {
      console.log(`  ERROR: ${data.error.message || JSON.stringify(data.error)}`);
      return;
    }

    const result = data.choices?.[0]?.message?.content?.trim() || 'NO RESPONSE';
    const correct = result === '2025-03-16';
    console.log(`  Result: ${result} ${correct ? '✅ CORRECT' : '❌ WRONG'} (${time}ms)`);
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }
}

async function main() {
  console.log('\n=== Testing OCR Models for M7 Date ===');
  console.log('Expected: 2025-03-16 (from handwritten 16/03/2025)\n');

  for (const model of MODELS) {
    await testModel(model);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== Done ===');
}

main();
