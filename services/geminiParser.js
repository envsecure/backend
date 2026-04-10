const { GoogleGenAI } = require('@google/genai');

const MODELS = ['gemma-3-27b-it'];

/**
 * Parse retryDelay from Gemini error message (e.g. "Please retry in 43s")
 */
function parseRetryDelay(errMsg) {
  const match = errMsg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (match) return Math.ceil(parseFloat(match[1])) + 2; // add 2s buffer
  return null;
}

/**
 * Call Gemini with retry, backoff, and model fallback
 */
async function callGemini(ai, promptParts, retries = 3) {
  for (const model of MODELS) {
    console.log(`🤖 Trying model: ${model}`);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: promptParts
            }
          ],
          config: {
            // Note: Gemma models often reject responseMimeType config, so we rely on aggressive post-parsing.
            temperature: 0.1,
          },
        });
        console.log(`✅ Success with ${model} (attempt ${attempt + 1})`);
        return response.text.trim();
      } catch (err) {
        const msg = err.message || '';
        const isQuotaError = msg.includes('429') || msg.includes('quota')
          || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503')
          || msg.includes('high demand') || msg.includes('rate');

        // Check if it's a DAILY limit (limit: 0) — no point retrying this model
        const isDailyExhausted = msg.includes('limit: 0') || msg.includes('PerDay');

        if (isDailyExhausted) {
          console.log(`❌ ${model} daily quota exhausted, trying next model...`);
          break; // skip to next model
        }

        if (isQuotaError && attempt < retries - 1) {
          const parsedDelay = parseRetryDelay(msg);
          const waitSec = parsedDelay || (attempt + 1) * 5;
          console.log(`⏳ Rate limited on ${model}. Waiting ${waitSec}s... (attempt ${attempt + 1}/${retries})`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }

        if (!isQuotaError) {
          console.log(`⚠️ Non-quota error on ${model}: ${msg}`);
          break; // Let it fallback to the next model for safety
        }

        console.log(`❌ ${model} exhausted after ${retries} retries, trying next...`);
        break;
      }
    }
  }

  throw new Error('All fallback models exhausted or failed to process the document.');
}

/**
 * Robust JSON parser that handles LLM quirks
 */
function parseGeminiJSON(text) {
  let cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  try { return JSON.parse(cleaned); } catch (_) { }

  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) cleaned = jsonMatch[1];

  try { return JSON.parse(cleaned); } catch (_) { }

  let fixed = cleaned
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/(?<=[:,\[\{]\s*)'([^']*?)'/g, '"$1"')
    .replace(/(?<=[{,]\s*)([a-zA-Z_]\w*)\s*:/g, '"$1":')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  try { return JSON.parse(fixed); } catch (_) { }

  if (!cleaned.includes('"') && cleaned.includes("'")) {
    const aggressive = cleaned.replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(aggressive); } catch (_) { }
  }

  let truncated = fixed;
  const openBraces = (truncated.match(/{/g) || []).length;
  const closeBraces = (truncated.match(/}/g) || []).length;
  const openBrackets = (truncated.match(/\[/g) || []).length;
  const closeBrackets = (truncated.match(/]/g) || []).length;

  truncated = truncated.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
  for (let i = 0; i < openBrackets - closeBrackets; i++) truncated += ']';
  for (let i = 0; i < openBraces - closeBraces; i++) truncated += '}';

  try {
    return JSON.parse(truncated);
  } catch (finalErr) {
    console.error('❌ All JSON parse attempts failed. First 500 chars of response:', text.slice(0, 500));
    throw new Error('AI returned invalid JSON structure.');
  }
}

/**
 * Main Export - Parses resume text/buffer into structured JSON
 */
async function parseResumeWithGemini(fileBuffer, mimeType, apiKey) {
  if (!apiKey) throw new Error('Gemini API key is required');

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
  You are an expert resume parser algorithm.
  Analyze the provided resume document explicitly extracting information into strict JSON output.
  Do NOT wrap the JSON in markdown code blocks.
  Use the following schema exactly:
  {
    "name": "Full Name",
    "email": "Email Address",
    "phone": "Phone Number",
    "location": "City, State",
    "linkedin": "LinkedIn URL",
    "skills": ["Skill 1", "Skill 2"],
    "education": [
      {
        "institution": "University Name",
        "degree": "Degree Title",
        "graduationDate": "YYYY or YYYY-MM",
        "details": ["Award 1", "GPA details"]
      }
    ],
    "experience": [
      {
        "company": "Company Name",
        "role": "Job Title",
        "startDate": "YYYY-MM",
        "endDate": "YYYY-MM or Present",
        "description": ["Bullet point 1", "Bullet point 2"]
      }
    ],
    "projects": [
      {
        "name": "Project Name",
        "description": ["Bullet point 1", "Bullet point 2"],
        "link": "url if any"
      }
    ]
  }
  `;

  // Provide the inline document parts
  const promptParts = [
    { text: prompt },
    {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType: mimeType
      }
    }
  ];

  // Try the cascade wrapper which handles Gemma and Gemini retries gracefully
  const rawResponseText = await callGemini(ai, promptParts);

  // Use aggressive JSON processor to fix Gemma bugs
  return parseGeminiJSON(rawResponseText);
}

module.exports = { parseResumeWithGemini };
