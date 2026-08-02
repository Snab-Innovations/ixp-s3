import OpenAI from 'openai';

/**
 * Amazon Bedrock Mantle (ap-south-1) — Chat Completions API + API key auth.
 *
 * MiniMax M2.1 / M2.5 and GLM 4.7 Flash do NOT support Anthropic Messages
 * (`/anthropic/v1/messages`). AWS docs require Chat Completions on:
 *   https://bedrock-mantle.{region}.api.aws/v1
 *
 * Auth still uses the Bedrock Mantle API key (ABSK… / ANTHROPIC_API_KEY).
 *
 * Model routing:
 * - Interview question generation → MiniMax M2.1
 * - Interview report / feedback   → MiniMax M2.5
 * - All other AI workloads        → GLM 4.7 Flash
 */

export type BedrockModelPurpose = 'questions' | 'report' | 'default';

export const BEDROCK_MODELS = {
  questions: import.meta.env.VITE_BEDROCK_MODEL_QUESTIONS || 'minimax.minimax-m2.1',
  report: import.meta.env.VITE_BEDROCK_MODEL_REPORT || 'minimax.minimax-m2.5',
  default: import.meta.env.VITE_BEDROCK_MODEL_DEFAULT || 'zai.glm-4.7-flash',
} as const;

const sanitize = (value?: string) => (value || '').replace(/['"]/g, '').trim();

export const getBedrockApiKey = (): string => {
  const key = sanitize(import.meta.env.VITE_ANTHROPIC_API_KEY);
  if (!key) {
    throw new Error('Bedrock API key missing. Set VITE_ANTHROPIC_API_KEY in your .env file.');
  }
  return key;
};

/** Anthropic Messages base (kept for config parity with AWS/Anthropic samples). */
export const getBedrockAnthropicBaseUrl = (): string =>
  sanitize(import.meta.env.VITE_ANTHROPIC_BASE_URL) ||
  'https://bedrock-mantle.ap-south-1.api.aws/anthropic';

/**
 * Chat Completions base for MiniMax / GLM on Mantle.
 * Derived from Anthropic base by swapping `/anthropic` → `/v1`.
 */
export const getBedrockChatBaseUrl = (): string => {
  const explicit = sanitize(import.meta.env.VITE_BEDROCK_CHAT_BASE_URL);
  if (explicit) return explicit.replace(/\/$/, '');

  const anthropicBase = getBedrockAnthropicBaseUrl().replace(/\/$/, '');
  if (anthropicBase.endsWith('/anthropic')) {
    return `${anthropicBase.slice(0, -'/anthropic'.length)}/v1`;
  }
  return 'https://bedrock-mantle.ap-south-1.api.aws/v1';
};

export const getBedrockWorkspaceId = (): string =>
  sanitize(import.meta.env.VITE_ANTHROPIC_WORKSPACE_ID) || 'default';

export const resolveBedrockModel = (purpose: BedrockModelPurpose = 'default'): string =>
  BEDROCK_MODELS[purpose] || BEDROCK_MODELS.default;

let clientInstance: OpenAI | null = null;

export const getBedrockClient = (): OpenAI => {
  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: getBedrockApiKey(),
      baseURL: getBedrockChatBaseUrl(),
      // Browser Vite app calls Mantle directly (same pattern as prior Gemini client calls).
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        // Project scoping on Mantle OpenAI-compatible APIs
        'OpenAI-Project': getBedrockWorkspaceId(),
      },
    });
  }
  return clientInstance;
};

const stripMarkdownJson = (text: string): string =>
  text.replace(/```json/gi, '').replace(/```/g, '').trim();

export interface BedrockCallOptions {
  purpose?: BedrockModelPurpose;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseJson?: boolean;
}

/**
 * Core text completion via Chat Completions on Bedrock Mantle.
 */
export async function callBedrockApi(
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.2,
  responseJson = false,
  purpose: BedrockModelPurpose = 'default',
  maxTokens = 4096,
  modelOverride?: string
): Promise<string> {
  const client = getBedrockClient();
  const model = modelOverride || resolveBedrockModel(purpose);

  const system = responseJson
    ? `${systemInstruction}\n\nIMPORTANT: Respond with valid JSON only. No markdown fences, no commentary.`
    : systemInstruction;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: userPrompt });

  const create = async (withJsonFormat: boolean) =>
    client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(withJsonFormat && responseJson
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });

  let response: OpenAI.Chat.ChatCompletion;
  try {
    response = await create(true);
  } catch (err: any) {
    // Some Mantle models reject response_format; retry without it.
    const msg = String(err?.message || err || '');
    if (responseJson && /response_format|json_object|invalid/i.test(msg)) {
      response = await create(false);
    } else {
      throw err;
    }
  }

  const text =
    extractBedrockMessageText(response.choices?.[0]?.message) ||
    '';
  if (!text) {
    throw new Error(`No text content returned from Bedrock model ${model}.`);
  }
  return text;
}

/** MiniMax / reasoning models may put the answer in content, reasoning, or array parts. */
function extractBedrockMessageText(message: any): string {
  if (!message) return '';

  const fromPart = (part: any): string => {
    if (!part) return '';
    if (typeof part === 'string') return part;
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    return '';
  };

  let content = '';
  if (typeof message.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    content = message.content.map(fromPart).filter(Boolean).join('\n');
  }

  // Some Mantle reasoning models return the usable report outside `content`.
  const reasoning =
    (typeof message.reasoning === 'string' && message.reasoning) ||
    (typeof message.reasoning_content === 'string' && message.reasoning_content) ||
    '';

  let text = (content || '').trim();
  if (!text && reasoning) text = reasoning.trim();

  // Strip common think / reasoning wrappers if the model embeds them.
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/```thinking[\s\S]*?```/gi, '')
    .trim();

  return text;
}

/**
 * Multi-turn chat (CareerHub, etc.).
 */
export async function callBedrockChat(
  systemInstruction: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  temperature = 0.7,
  purpose: BedrockModelPurpose = 'default',
  maxTokens = 4096
): Promise<string> {
  const client = getBedrockClient();
  const model = resolveBedrockModel(purpose);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const text = extractBedrockMessageText(response.choices?.[0]?.message);
  if (!text) {
    throw new Error(`No text content returned from Bedrock chat model ${model}.`);
  }
  return text;
}

export async function bedrockGenerateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2,
  purpose: BedrockModelPurpose = 'default',
  maxTokens = 4096,
  modelOverride?: string
): Promise<T> {
  const text = await callBedrockApi(
    systemPrompt,
    userPrompt,
    temperature,
    true,
    purpose,
    maxTokens,
    modelOverride
  );
  return JSON.parse(stripMarkdownJson(text)) as T;
}

export { stripMarkdownJson };
