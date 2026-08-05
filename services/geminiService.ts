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
  jobNo?: string;
  companyProfile?: string;
  establishmentYear?: string;
  typeOfCompany?: string;
  companyType?: string;
  employeeCount?: string;
  noOfOfficesOrFactories?: string;
  officeLocations?: string;
  turnover?: string;
  companyProductOrService?: string;
  strictGenderMatch?: boolean;
  strictLocationMatch?: boolean;
  strictEducationMatch?: boolean;
  strictExperienceMatch?: boolean;
  customFields?: Array<{ key: string; value: string }>;
}

export function compileCompanyProfile(parsed: Partial<ParsedJdResult>, customFields: Array<{ key: string; value: string }> = []): string {
  const parts: string[] = [];

  const estYear = parsed.establishmentYear;
  const companyType = parsed.typeOfCompany || parsed.companyType;
  const employees = parsed.employeeCount;
  const offices = parsed.noOfOfficesOrFactories;
  const locations = parsed.officeLocations;
  const turnover = parsed.turnover;
  const product = parsed.companyProductOrService;

  if (estYear) parts.push(`• Establishment Year: ${estYear}`);
  if (companyType) parts.push(`• Type of Company: ${companyType}`);
  if (employees) parts.push(`• Number of People Working: ${employees}`);
  if (offices) parts.push(`• Number of Offices/Factories: ${offices}`);
  if (locations) parts.push(`• Office Locations: ${locations}`);
  if (turnover) parts.push(`• Turnover: ${turnover}`);
  if (product) parts.push(`• Company Product / Service: ${product}`);

  const companyKeysMap: { [key: string]: string } = {
    'establishment year': 'Establishment Year',
    'established': 'Establishment Year',
    'est year': 'Establishment Year',
    'est. year': 'Establishment Year',
    'type of company': 'Type of Company',
    'company type': 'Type of Company',
    'number of people working': 'Number of People Working',
    'employee count': 'Number of People Working',
    'employees': 'Number of People Working',
    'headcount': 'Number of People Working',
    'number of offices/factories': 'Number of Offices/Factories',
    'no. of offices/factories': 'Number of Offices/Factories',
    'number of offices': 'Number of Offices/Factories',
    'number of factories': 'Number of Offices/Factories',
    'factories': 'Number of Offices/Factories',
    'office locations': 'Office Locations',
    'factory locations': 'Office Locations',
    'turnover': 'Turnover',
    'annual turnover': 'Turnover',
    'company product / service': 'Company Product / Service',
    'company product': 'Company Product / Service',
    'company service': 'Company Product / Service',
    'product / service': 'Company Product / Service',
    'company profile': 'Company Profile',
  };

  if (Array.isArray(customFields)) {
    customFields.forEach(cf => {
      const keyLower = cf.key.trim().toLowerCase();
      for (const [pattern, label] of Object.entries(companyKeysMap)) {
        if (keyLower.includes(pattern) && cf.value.trim()) {
          const entryStr = `• ${label}: ${cf.value.trim()}`;
          if (!parts.some(p => p.toLowerCase().includes(label.toLowerCase()))) {
            parts.push(entryStr);
          }
        }
      }
    });
  }

  if (parsed.companyProfile && !parts.some(p => p.toLowerCase().includes(parsed.companyProfile!.toLowerCase()))) {
    parts.unshift(parsed.companyProfile);
  }

  return parts.join('\n');
}

export async function parseJobDescriptionText(rawText: string): Promise<ParsedJdResult> {
  const systemPrompt = `You are an expert HR AI assistant. Parse the provided job description (JD) text and return a JSON object with structured details.

Standard Fields to extract (if present):
- "jobNo": Job Number / Job Code / Requisition ID (e.g. "Job No: 1042" or "REQ-901")
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
- "companyProfile": Overview of the company if present
- "establishmentYear": Year of establishment / founded year (e.g. "1974")
- "typeOfCompany": Type of company / industry (e.g. "Manufacturing")
- "employeeCount": Number of people working / headcount (e.g. "14")
- "noOfOfficesOrFactories": Number of offices/factories (e.g. "4")
- "officeLocations": Office or factory locations (e.g. "Mumbai, Nashik, Gujrat")
- "turnover": Company turnover / revenue (e.g. "250 Cr")
- "companyProductOrService": Products or services provided (e.g. "Switchgear")
- "strictGenderMatch": Set to true if the JD states gender is MANDATORY / compulsory / required / Male Only / Female Only.
- "strictLocationMatch": Set to true if the JD states location or local candidate is MANDATORY / compulsory / required / local candidates only.
- "strictEducationMatch": Set to true if qualification/degree is MANDATORY / compulsory / required.
- "strictExperienceMatch": Set to true if experience years is MANDATORY / compulsory / required.

CRITICAL FEATURE - AUTOMATIC DYNAMIC CUSTOM FIELDS:
Extract ANY and ALL other extra attributes present in the JD that are not standard single fields (for example: "Job No", "Company Product / Service Sold", "Marital Status", "Interview Dates", "Interview Timing", "No. of Interview Rounds", "Travel Required", "State", "District", "City", "Job Timing", "Service Agreement/Bond", "Weekly Off", "Company Facilities", "Company Profile", "Turnover", "Role Category", etc.).
Store all these extra key-value pairs in an array under "customFields" as objects with "key" and "value" string properties!

Return ONLY valid JSON matching this schema.`;

  const userPrompt = `Job Description Text to parse:\n\n${rawText}`;
  return bedrockGenerateJson<ParsedJdResult>(systemPrompt, userPrompt, 0.1, 'default', 4096);
}
