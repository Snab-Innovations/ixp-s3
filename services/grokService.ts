import {
  callBedrockApi,
  callBedrockChat,
  bedrockGenerateJson,
  stripMarkdownJson,
  type BedrockModelPurpose,
} from './bedrockService';

// ── Token budgets & constants ────────────────────────────────────────────────
export const MAX_TOKENS_QUESTIONS = 2048;
export const MAX_TOKENS_FEEDBACK = 8192; // MiniMax M2.5 uses reasoning tokens; keep headroom for report body
export const RESUME_EMBED_MAX_CHARS = 3000;

// ── Bedrock AI Service Router (legacy "grok*" names kept for call-site stability)

async function callAi(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature = 0.5,
  maxTokens?: number,
  responseFormat?: { type: 'json_object' | 'text' },
  purpose: BedrockModelPurpose = 'default'
): Promise<string> {
  const systemInstruction = messages.find((m) => m.role === 'system')?.content || '';
  const history = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

  const responseJson = responseFormat?.type === 'json_object';
  const tokens = maxTokens ?? 4096;

  if (history.length === 1 && history[0].role === 'user') {
    return callBedrockApi(
      systemInstruction,
      history[0].content,
      temperature,
      responseJson,
      purpose,
      tokens
    );
  }

  const text = await callBedrockChat(systemInstruction, history, temperature, purpose, tokens);
  if (responseJson) {
    // Caller may parse; ensure instruction was applied via system prompt at call sites.
    return text;
  }
  return text;
}

export async function grokGenerateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2,
  maxTokens?: number,
  purpose: BedrockModelPurpose = 'default'
): Promise<T> {
  return bedrockGenerateJson<T>(
    systemPrompt,
    userPrompt,
    temperature,
    purpose,
    maxTokens ?? 4096
  );
}

// ── Resume extractor ──────────────────────────────────────────────────────────
function extractResumeText(base64Resume: string, mimeType: string): string {
  if (!base64Resume) return '';

  const isTextBased = mimeType.startsWith('text/') || mimeType === 'application/json';

  let raw = '';

  if (isTextBased) {
    try {
      raw = atob(base64Resume);
    } catch {
      raw = base64Resume;
    }
  } else {
    try {
      const decoded = atob(base64Resume);
      const printable = decoded.split('').filter(
        (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127
      ).length;
      if (printable / decoded.length > 0.2) raw = decoded;
    } catch {
      /* ignore binary */
    }
  }

  if (!raw) {
    return '(Resume is binary/unreadable. Evaluate based on JD and stated experience.)';
  }

  return raw.length > RESUME_EMBED_MAX_CHARS
    ? raw.slice(0, RESUME_EMBED_MAX_CHARS) + '…'
    : raw;
}

/** One-shot text generation — no resume context. */
export async function grokGenerateText(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.5,
  maxTokens?: number,
  purpose: BedrockModelPurpose = 'default'
): Promise<string> {
  return callAi(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    maxTokens,
    undefined,
    purpose
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
  resumeTextContent?: string,
  purpose: BedrockModelPurpose = 'default'
): Promise<string> {
  const resumeText = resumeTextContent || extractResumeText(base64Resume, mimeType);

  const fullUserMessage = resumeText
    ? `${textPrompt}\n\n[Resume]\n${resumeText}`
    : textPrompt;

  return callAi(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: fullUserMessage },
    ],
    temperature,
    maxTokens,
    undefined,
    purpose
  );
}

export async function grokGenerateWithResumeJson<T>(
  systemPrompt: string,
  textPrompt: string,
  base64Resume: string,
  mimeType: string,
  temperature = 0.2,
  maxTokens?: number,
  resumeTextContent?: string,
  purpose: BedrockModelPurpose = 'default'
): Promise<T> {
  const resumeText = resumeTextContent || extractResumeText(base64Resume, mimeType);
  const fullUserMessage = resumeText
    ? `${textPrompt}\n\n[Resume]\n${resumeText}`
    : textPrompt;

  const text = await callAi(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: fullUserMessage },
    ],
    temperature,
    maxTokens,
    { type: 'json_object' },
    purpose
  );

  return JSON.parse(stripMarkdownJson(text)) as T;
}

/** Multi-turn chat — used by CareerHub bot (GLM 4.7 Flash). */
export async function grokChat(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  temperature = 0.7
): Promise<string> {
  return callBedrockChat(systemPrompt, history, temperature, 'default', 4096);
}

export const BUDGET = {
  QUESTIONS: MAX_TOKENS_QUESTIONS,
  FEEDBACK: MAX_TOKENS_FEEDBACK,
};
