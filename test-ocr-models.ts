/**
 * Test script to compare OCR models on the M7 date extraction
 *
 * Usage:
 * 1. Set your OpenRouter API key: export OPENROUTER_API_KEY="sk-or-..."
 * 2. Run: npx tsx test-ocr-models.ts
 *
 * Expected result for M7: 2025-03-16 (the handwritten date shows 16/03/2025)
 */

import fs from 'fs'
import path from 'path'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY environment variable is not set')
  console.error('Run: export OPENROUTER_API_KEY="your-key-here"')
  process.exit(1)
}

// Models to test (top vision models on OpenRouter)
const MODELS_TO_TEST = [
  'qwen/qwen2.5-vl-72b-instruct',
  'google/gemini-2.0-flash-001',
  'google/gemini-2.5-pro-preview-03-25',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-sonnet-4',
  'meta-llama/llama-4-maverick',
]

// The prompt we're using (simplified version focusing on DD/MM/YYYY)
const OCR_PROMPT = `Extract ONLY the date for M7 from this attendance sheet image.

IMPORTANT: Dates are written as DD/MM/YYYY (day/month/year). Convert to YYYY-MM-DD format.
Example: "16/03/2025" written on paper → output as "2025-03-16" (March 16th)
Example: "05/02/2025" written on paper → output as "2025-02-05" (February 5th)

Return ONLY the date in YYYY-MM-DD format, nothing else.`

async function testModel(model: string, imageBase64: string): Promise<{ model: string; result: string; time: number; error?: string }> {
  const startTime = Date.now()

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'OCR Model Test'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: OCR_PROMPT
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 50,
        temperature: 0
      })
    })

    const data = await response.json()
    const endTime = Date.now()

    if (data.error) {
      return {
        model,
        result: 'ERROR',
        time: endTime - startTime,
        error: data.error.message || JSON.stringify(data.error)
      }
    }

    const result = data.choices?.[0]?.message?.content?.trim() || 'NO RESPONSE'

    return {
      model,
      result,
      time: endTime - startTime
    }
  } catch (error) {
    return {
      model,
      result: 'ERROR',
      time: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function main() {
  // Look for the most recent screenshot or uploaded image
  // You'll need to provide the path to your attendance sheet image
  const imagePath = process.argv[2]

  if (!imagePath) {
    console.error('Usage: npx tsx test-ocr-models.ts <path-to-image>')
    console.error('Example: npx tsx test-ocr-models.ts ./attendance-sheet.png')
    process.exit(1)
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`Error: Image file not found: ${imagePath}`)
    process.exit(1)
  }

  console.log('Loading image:', imagePath)
  const imageBuffer = fs.readFileSync(imagePath)
  const imageBase64 = imageBuffer.toString('base64')
  console.log('Image size:', Math.round(imageBuffer.length / 1024), 'KB')
  console.log('')

  console.log('='.repeat(70))
  console.log('Testing OCR Models for M7 Date Extraction')
  console.log('Expected result: 2025-03-16 (from handwritten 16/03/2025)')
  console.log('='.repeat(70))
  console.log('')

  const results: Array<{ model: string; result: string; time: number; correct: boolean; error?: string }> = []

  for (const model of MODELS_TO_TEST) {
    console.log(`Testing: ${model}...`)
    const result = await testModel(model, imageBase64)
    const correct = result.result === '2025-03-16'
    results.push({ ...result, correct })

    const status = result.error ? '❌ ERROR' : (correct ? '✅ CORRECT' : '❌ WRONG')
    console.log(`  Result: ${result.result} ${status} (${result.time}ms)`)
    if (result.error) {
      console.log(`  Error: ${result.error}`)
    }
    console.log('')

    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log('')

  const correctModels = results.filter(r => r.correct)
  const wrongModels = results.filter(r => !r.correct && !r.error)
  const errorModels = results.filter(r => r.error)

  console.log('CORRECT (got 2025-03-16):')
  if (correctModels.length === 0) {
    console.log('  None')
  } else {
    correctModels.forEach(r => console.log(`  ✅ ${r.model} (${r.time}ms)`))
  }
  console.log('')

  console.log('WRONG:')
  if (wrongModels.length === 0) {
    console.log('  None')
  } else {
    wrongModels.forEach(r => console.log(`  ❌ ${r.model}: ${r.result} (${r.time}ms)`))
  }
  console.log('')

  console.log('ERRORS:')
  if (errorModels.length === 0) {
    console.log('  None')
  } else {
    errorModels.forEach(r => console.log(`  ⚠️ ${r.model}: ${r.error}`))
  }
  console.log('')

  // Recommendation
  if (correctModels.length > 0) {
    const fastest = correctModels.reduce((a, b) => a.time < b.time ? a : b)
    console.log(`RECOMMENDATION: Use "${fastest.model}" - it got the correct result in ${fastest.time}ms`)
  } else {
    console.log('WARNING: No model got the correct result. Manual verification may be needed.')
  }
}

main().catch(console.error)
