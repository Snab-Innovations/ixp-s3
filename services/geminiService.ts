import { bedrockGenerateJson, callBedrockApi, getBedrockApiKey } from './bedrockService';

/**
 * Legacy Gemini service surface — now backed by Amazon Bedrock Mantle (GLM 4.7 Flash).
 * Kept so existing imports (JD parse, AdminApiTester) continue to work.
 */

export const getGeminiApiKey = (): string => getBedrockApiKey();

export const GEMINI_MODEL =
  import.meta.env.VITE_BEDROCK_MODEL_DEFAULT || 'zai.glm-4.7-flash';

export async function callGeminiApi(
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.2,
  responseJson = false
): Promise<string> {
  return callBedrockApi(
    systemInstruction,
    userPrompt,
    temperature,
    responseJson,
    'default',
    4096
  );
}

export async function geminiGenerateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2
): Promise<T> {
  return bedrockGenerateJson<T>(systemPrompt, userPrompt, temperature, 'default', 4096);
}

export interface ParsedJdResult {
  title?: string;
  vacancyName?: string;
  designation?: string;
  description?: string;
  department?: string;
  industry?: string;
  roleCategory?: string;
  employmentType?: string;
  minExperience?: number;
  maxExperience?: number;
  minSalary?: string;
  maxSalary?: string;
  salaryRange?: string;
  location?: string;
  city?: string;
  district?: string;
  state?: string;
  gender?: string;
  maritalStatus?: string;
  qualification?: string;
  education?: string;
  skills?: string;
  technicalSkills?: string;
  softSkills?: string;
  noOfRounds?: number;
  travelRequired?: string;
  jobTiming?: string;
  interviewDates?: string;
  interviewTiming?: string;
  bondOrAgreement?: string;
  weeklyOff?: string;
  facilities?: string;
  companyProfile?: string;
  customFields?: Array<{ key: string; value: string }>;
}

export async function parseJobDescriptionText(rawText: string): Promise<ParsedJdResult> {
  const systemPrompt = `You are an expert HR AI assistant. Parse the provided job description (JD) text and return a JSON object with structured details.

Standard Fields to extract (if present):
- "title": Job title / Role / Designation (e.g. "Production Engineer" or "Jr. Production Engineer")
- "description": Detailed job description and responsibilities
- "department": Industry / Department / Category (e.g. "Manufacturing" or "Engineering")
- "employmentType": Employment type (e.g. "Full-Time")
- "minExperience": Minimum experience in years as a number (e.g. 1)
- "maxExperience": Maximum experience in years as a number (e.g. 2)
- "salaryRange": Salary range string (e.g. "20000 - 22000 / month")
- "location": Job location (e.g. "Ambad, Nashik, Maharashtra")
- "gender": Gender requirement if specified ("Male", "Female", or "Any")
- "qualification": Qualification & specialization required (e.g. "Diploma Mechanical")
- "skills": Comma-separated list of required technical and soft skills

CRITICAL FEATURE - AUTOMATIC DYNAMIC CUSTOM FIELDS:
Extract ANY and ALL other extra attributes present in the JD that are not standard single fields (for example: "Job No", "Company Product / Service Sold", "Marital Status", "Interview Dates", "Interview Timing", "No. of Interview Rounds", "Travel Required", "State", "District", "City", "Job Timing", "Service Agreement/Bond", "Weekly Off", "Company Facilities", "Company Profile", "Turnover", "Role Category", etc.).
Store all these extra key-value pairs in an array under "customFields" as objects with "key" and "value" string properties!

Return ONLY valid JSON matching this schema.`;

  const userPrompt = `Job Description Text to parse:\n\n${rawText}`;
  return bedrockGenerateJson<ParsedJdResult>(systemPrompt, userPrompt, 0.1, 'default', 4096);
}
