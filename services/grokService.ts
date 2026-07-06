// ── Grok AI Service ──────────────────────────────────────────────────────────
// Model: grok-4.3 (text/image capable; used here for text)
// Base URL: https://api.x.ai/v1
// Auth: VITE_XAI_API_KEY

const GROK_BASE_URL = "https://api.x.ai/v1";
const GROK_MODEL = import.meta.env.VITE_XAI_MODEL || "grok-4.3";
const GROK_REASONING_EFFORT = import.meta.env.VITE_XAI_REASONING_EFFORT || "none";

// ── Token budgets ─────────────────────────────────────────────────────────────
// Hard ceiling on output tokens to prevent runaway costs.
// Questions: 5 template + AI-generated (~15 tokens each) → 280 safe headroom.
// Feedback report: 3 short sections + 3 score lines (out of 10) → 300 sufficient.
const MAX_TOKENS_QUESTIONS = 500;  // Increased for more robust questions
const MAX_TOKENS_FEEDBACK   = 1800;  // Increased for accurate resume scoring and communication analysis

// Resume cap: Provide much more context so the AI can give a specific, dynamic analysis
// without relying on generic placeholders.
const RESUME_EMBED_MAX_CHARS = 5000;

const getApiKey = (): string => {
  const key = import.meta.env.VITE_XAI_API_KEY;
  if (!key || key === "YOUR_XAI_API_KEY_HERE") {
    throw new Error("Grok API key missing. Add VITE_XAI_API_KEY to .env.");
  }
  return key;
};

// ── Internal fetch helper ─────────────────────────────────────────────────────
async function callGrok(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  temperature = 0.5,
  maxTokens?: number,
  responseFormat?: { type: "json_object" | "text" }
): Promise<string> {
  const apiKey = getApiKey();

  const body: any = {
    model: GROK_MODEL,
    messages,
    temperature,
    reasoning_effort: GROK_REASONING_EFFORT,
  };
  if (maxTokens) body.max_tokens = maxTokens;
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errMsg = `Grok API error: ${res.status}`;
    let rawError = "";
    try {
      rawError = await res.text();
      const errBody = rawError ? JSON.parse(rawError) : {};
      const serverMessage = errBody?.error?.message || errBody?.error || errBody?.message;
      if (serverMessage) {
        errMsg = typeof serverMessage === "string" ? serverMessage : JSON.stringify(serverMessage);
      } else if (rawError) {
        errMsg = rawError;
      }
    } catch {
      if (rawError) errMsg = rawError;
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

const stripMarkdownJson = (text: string): string =>
  text.replace(/```json/g, '').replace(/```/g, '').trim();

export async function grokGenerateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2,
  maxTokens?: number
): Promise<T> {
  const text = await callGrok(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    maxTokens,
    { type: "json_object" }
  );

  return JSON.parse(stripMarkdownJson(text)) as T;
}

// ── Resume extractor ──────────────────────────────────────────────────────────
// Decodes base64 resume and truncates to RESUME_EMBED_MAX_CHARS.
// This is the single biggest lever for reducing input token cost.
function extractResumeText(base64Resume: string, mimeType: string): string {
  if (!base64Resume) return "";

  const isTextBased = mimeType.startsWith("text/") || mimeType === "application/json";

  let raw = "";

  if (isTextBased) {
    try { raw = atob(base64Resume); } catch { raw = base64Resume; }
  } else {
    // PDF / image: decode and keep only if it has meaningful printable content
    try {
      const decoded = atob(base64Resume);
      const printable = decoded.split("").filter(
        (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127
      ).length;
      if (printable / decoded.length > 0.2) raw = decoded;
    } catch { /* ignore binary */ }
  }

  if (!raw) {
    return "(Resume is binary/unreadable. Evaluate based on JD and stated experience.)";
  }

  // Hard truncate — the most important token-saving step
  return raw.length > RESUME_EMBED_MAX_CHARS
    ? raw.slice(0, RESUME_EMBED_MAX_CHARS) + "…"
    : raw;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** One-shot text generation — no resume context. */
export async function grokGenerateText(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.5,
  maxTokens?: number
): Promise<string> {
  return callGrok(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    maxTokens
  );
}

/** Resume-aware generation — used by question gen & feedback. */
export async function grokGenerateWithResume(
  systemPrompt: string,
  textPrompt: string,
  base64Resume: string,
  mimeType: string,
  temperature = 0.5,
  maxTokens?: number,
  resumeTextContent?: string // New optional parameter
): Promise<string> {
  // Prioritize the pre-parsed text if available, otherwise extract from base64.
  const resumeText = resumeTextContent || extractResumeText(base64Resume, mimeType);

  const fullUserMessage = resumeText
    ? `${textPrompt}\n\n[Resume]\n${resumeText}`
    : textPrompt;

  return callGrok(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: fullUserMessage },
    ],
    temperature,
    maxTokens
  );
}

export async function grokGenerateWithResumeJson<T>(
  systemPrompt: string,
  textPrompt: string,
  base64Resume: string,
  mimeType: string,
  temperature = 0.2,
  maxTokens?: number,
  resumeTextContent?: string
): Promise<T> {
  const resumeText = resumeTextContent || extractResumeText(base64Resume, mimeType);
  const fullUserMessage = resumeText
    ? `${textPrompt}\n\n[Resume]\n${resumeText}`
    : textPrompt;

  const text = await callGrok(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: fullUserMessage },
    ],
    temperature,
    maxTokens,
    { type: "json_object" }
  );

  return JSON.parse(stripMarkdownJson(text)) as T;
}

/** Multi-turn chat — used by AIAgent & CareerBot. */
export async function grokChat(
  systemPrompt: string,
  history: { role: "user" | "assistant"; content: string }[],
  temperature = 0.7
): Promise<string> {
  return callGrok(
    [{ role: "system", content: systemPrompt }, ...history],
    temperature
    // No max_tokens cap on chat — user conversations need flexibility
  );
}

// ── Token budget exports (used by api.ts) ─────────────────────────────────────
export const BUDGET = {
  QUESTIONS: MAX_TOKENS_QUESTIONS,
  FEEDBACK: MAX_TOKENS_FEEDBACK,
};
