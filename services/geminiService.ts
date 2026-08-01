import { GoogleGenAI } from '@google/genai';

/**
 * Google Gemini API Service with Multi-Model Fallback & OpenRouter Backup
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models
 */

export const getGeminiApiKey = (): string => {
  const sanitize = (key?: string) => (key || '').replace(/['"]/g, '').trim();

  const geminiKey = sanitize(import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY);
  if (geminiKey && geminiKey !== 'YOUR_GEMINI_API_KEY') {
    return geminiKey;
  }
  const openRouterKey = sanitize(import.meta.env.VITE_OPENROUTER_API_KEY || import.meta.env.VITE_XAI_API_KEY);
  if (openRouterKey && openRouterKey !== 'YOUR_OPENROUTER_API_KEY') {
    return openRouterKey;
  }
  throw new Error('API key missing. Please set VITE_GEMINI_API_KEY in your .env file.');
};

export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';

// List of official Google Gemini models to cycle through if a model fails
const FALLBACK_MODELS = [
  GEMINI_MODEL,
  'gemini-flash-latest',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest'
];

async function callGoogleDirect(
  apiKey: string,
  modelName: string,
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.2,
  responseJson = false
): Promise<string> {
  // 1. Try official @google/genai SDK models.generateContent
  try {
    const ai = new GoogleGenAI({ apiKey });
    if ((ai as any).models?.generateContent) {
      const response = await (ai as any).models.generateContent({
        model: modelName,
        contents: systemInstruction ? `${systemInstruction}\n\n${userPrompt}` : userPrompt,
        config: {
          temperature,
          responseMimeType: responseJson ? 'application/json' : 'text/plain'
        }
      });
      if (response?.text) return response.text;
    }
  } catch (sdkErr: any) {
    console.warn(`[Gemini SDK generateContent failed on ${modelName}]`, sdkErr?.message || sdkErr);
  }

  // 2. Direct REST API Call to Google Gemini
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const promptText = systemInstruction 
    ? `System Instruction:\n${systemInstruction}\n\nUser Prompt:\n${userPrompt}`
    : userPrompt;

  const body: any = {
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    generationConfig: { temperature }
  };
  if (responseJson) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const rawErr = await res.text();
    let msg = rawErr;
    try {
      const json = JSON.parse(rawErr);
      msg = json?.error?.message || rawErr;
    } catch {}
    throw new Error(`Google Gemini API error ${res.status} [Model ${modelName}]: ${msg}`);
  }

  const data = await res.json();
  const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) {
    throw new Error(`No text content returned from Google Gemini API model ${modelName}.`);
  }
  return candidateText;
}

async function callOpenRouterFallback(
  apiKey: string,
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.2,
  responseJson = false
): Promise<string> {
  const messages: any[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: userPrompt });

  const body: any = {
    model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
    messages,
    temperature
  };
  if (responseJson) body.response_format = { type: 'json_object' };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://interviewxpert.in',
      'X-Title': 'InterviewXpert Platform'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const rawErr = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${rawErr}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function callGeminiApi(
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.2,
  responseJson = false
): Promise<string> {
  const apiKey = getGeminiApiKey();

  // If OpenRouter key is provided, route through OpenRouter directly
  if (apiKey.startsWith('sk-or-') || apiKey.startsWith('xai-')) {
    return await callOpenRouterFallback(apiKey, systemInstruction, userPrompt, temperature, responseJson);
  }

  // Google API Key: Try each Gemini model in order on ANY failure
  let lastError: Error | null = null;
  const modelsToTry = Array.from(new Set(FALLBACK_MODELS));

  for (const model of modelsToTry) {
    try {
      return await callGoogleDirect(apiKey, model, systemInstruction, userPrompt, temperature, responseJson);
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini Fallback Triggered on ${model}] Error: ${err?.message || err}. Trying next model...`);
      continue;
    }
  }

  // If all direct Google models fail, try OpenRouter as final backup if key exists
  const openRouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (openRouterKey && openRouterKey.startsWith('sk-or-')) {
    console.warn('[Gemini Fallback] All Google models failed. Switching to OpenRouter Free Gemini...');
    return await callOpenRouterFallback(openRouterKey, systemInstruction, userPrompt, temperature, responseJson);
  }

  throw lastError || new Error('All Google Gemini AI models failed.');
}

const stripMarkdownJson = (text: string): string =>
  text.replace(/```json/g, '').replace(/```/g, '').trim();

export async function geminiGenerateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2
): Promise<T> {
  const apiKey = getGeminiApiKey();

  // If OpenRouter key is provided, route through OpenRouter directly
  if (apiKey.startsWith('sk-or-') || apiKey.startsWith('xai-')) {
    const text = await callOpenRouterFallback(apiKey, systemPrompt, userPrompt, temperature, true);
    return JSON.parse(stripMarkdownJson(text)) as T;
  }

  // Try each Google Gemini model to parse JSON cleanly
  const modelsToTry = Array.from(new Set(FALLBACK_MODELS));
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const text = await callGoogleDirect(apiKey, model, systemPrompt, userPrompt, temperature, true);
      const parsed = JSON.parse(stripMarkdownJson(text)) as T;
      return parsed;
    } catch (err: any) {
      console.warn(`[Gemini JSON Model Fallback on ${model}] Error: ${err?.message || err}. Trying next model...`);
      lastError = err;
    }
  }

  // Final backup call
  const text = await callGeminiApi(systemPrompt, userPrompt, temperature, true);
  return JSON.parse(stripMarkdownJson(text)) as T;
}
