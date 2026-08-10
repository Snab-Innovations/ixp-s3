import { grokGenerateWithResume, grokGenerateWithResumeJson, grokGenerateText, BUDGET } from "./grokService";
import { uploadToS3, isS3Configured } from './s3Service';

// Config Constants (loaded from environment variables)
const ASSEMBLYAI_API_KEY = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const VIDEO_CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
const RESUME_CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const AUTO_CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
const RAW_CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;
const ASSEMBLYAI_TRANSCRIPT_ENDPOINT = 'https://api.assemblyai.com/v2/transcript';

// ── Token-saving helpers ──────────────────────────────────────────────────────
// Truncate long strings at the source so we never send walls of text to the API.
const truncate = (s: string, max: number) =>
  s && s.length > max ? s.slice(0, max) + '…' : (s || '');

// Resume: 3000 chars provides much better context for a complete analysis.
const RESUME_MAX_CHARS = 3000;
// JD: 2000 chars keeps the role context without padding.
const JD_MAX_CHARS = 2000;
// Transcript per answer: cap long rambling answers to save feedback input tokens.
const TRANSCRIPT_MAX_CHARS = 1000;

// ── TTS ───────────────────────────────────────────────────────────────────────
export const generateOpenAITTS = async (text: string) => {
  const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key missing. Add VITE_OPENAI_API_KEY to .env.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "tts-1", input: text, voice: "alloy" })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || "OpenAI TTS failed");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

// ── Interview Question Generation ─────────────────────────────────────────────
export const DEFAULT_WORK_EXPERIENCE_QUESTION_EN = "Please tell us about your work experience. For each company, tell us your job title, what work you did every day, and your main responsibilities.";
export const DEFAULT_WORK_EXPERIENCE_QUESTION_HI = "कृपया अपने कार्य अनुभव के बारे में बताएं। प्रत्येक कंपनी के लिए, अपना पद (Job Title), प्रतिदिन किया जाने वाला कार्य और अपनी मुख्य जिम्मेदारियां बताएं।";
export const DEFAULT_WORK_EXPERIENCE_QUESTION_MR = "कृपया आपल्या कामाच्या अनुभवाबद्दल सांगा. प्रत्येक कंपनीसाठी, तुमचे पद (Job Title), तुम्ही रोज काय काम करायचे आणि तुमच्या मुख्य जबाबदाऱ्या सांगा.";

export interface CandidateProfileForQuestions {
  name?: string;
  designation?: string;
  currentCompany?: string;
  qualification?: string;
  totalExperienceYears?: string;
  totalExperienceMonths?: string;
  isFresher?: boolean;
  skills?: string[];
}

export const generateInterviewQuestions = async (
  jobTitle: string,
  jobDescription: string,
  candidateExp: string,
  base64Resume: string,
  mimeType: string,
  languageCode: string = 'en',
  numQuestions: number = 5,
  resumeTextContent?: string,
  candidateProfile?: CandidateProfileForQuestions
) => {
  // Language-specific instructions for easy, natural language
  let langInstruction = '';

  if (languageCode === 'mr') {
    langInstruction = `Language: Marathi (Devanagari script).
IMPORTANT: Use simple, everyday Marathi that common people speak. Do NOT use heavy/literary Marathi words. If any word is difficult or technical (like "quality management", "KPI", "compliance", "production planning" etc.), keep that word in English and write the rest in easy Marathi. The question should feel natural like a normal conversation, not like a textbook.`;
  } else if (languageCode === 'hi') {
    langInstruction = `Language: Hindi (Devanagari script).
IMPORTANT: Use simple, everyday Hindi that common people speak. Do NOT use heavy/Shudh Hindi words. If any word is difficult or technical (like "quality management", "KPI", "compliance", "production planning" etc.), keep that word in English and write the rest in easy Hindi. The question should feel natural like a normal conversation, not like a textbook.`;
  } else {
    langInstruction = 'Language: English.';
  }

  // Truncate to save input tokens
  const jd  = truncate(jobDescription, JD_MAX_CHARS);
  const exp = truncate(candidateExp, 150);

  // Build structured candidate profile summary
  const candName = candidateProfile?.name?.trim() || '';
  const candDesignation = candidateProfile?.designation?.trim() || '';
  const candCompany = candidateProfile?.currentCompany?.trim() || '';
  const candQual = candidateProfile?.qualification?.trim() || '';
  const candExpStr = candidateProfile?.isFresher
    ? 'Fresher (0 years experience)'
    : (exp || `${candidateProfile?.totalExperienceYears || '0'} years ${candidateProfile?.totalExperienceMonths || '0'} months`);

  const profileSummaryLines = [
    candName ? `Candidate Name: ${candName}` : null,
    candDesignation ? `Current/Recent Role: ${candDesignation}` : null,
    candCompany ? `Company: ${candCompany}` : null,
    candQual ? `Education: ${candQual}` : null,
    `Experience: ${candExpStr}`,
  ].filter(Boolean).join('\n');

  // Combine candidate profile summary with parsed resume text
  const combinedResumeText = resumeTextContent?.trim()
    ? `[Candidate Profile Summary]\n${profileSummaryLines}\n\n[Full Resume Text]\n${resumeTextContent.trim()}`
    : `[Candidate Profile Summary]\n${profileSummaryLines}`;

  const sys = `You are an expert HR interviewer. Your tone is warm, professional, respectful, and conversational.
Rules:
- Generate questions that are 100% personalized to THIS candidate based on BOTH the Job Description (JD) and their Resume/profile.
- Output ONLY a valid JSON object: {"questions":["Question 1", "Question 2", ...]}`;

  const prompt =
`Target Job Title: "${jobTitle}"
Job Description (JD):
${jd}

Candidate Profile & Experience:
${profileSummaryLines}

${langInstruction}

Generate exactly ${Math.max(1, numQuestions)} personalized interview questions.

CRITICAL INSTRUCTIONS FOR PERSONALIZED QUESTIONS:
1. QUESTION 1 (Personalized Introduction & Background):
   - Personalize Question 1 specifically for ${candName || 'this candidate'}.
   - Greet the candidate by name (if provided) and ask them to introduce themselves and walk through their work experience or background (mentioning their role as ${candDesignation || 'their past role'} at ${candCompany || 'their past company'} or degree in ${candQual || 'their field'} if known) and how it prepares them for this "${jobTitle}" position.

2. QUESTIONS 2 to ${Math.max(1, numQuestions)} (Resume + JD Deep-Dive Verification):
   - EVERY question MUST be deeply customized to THIS candidate by cross-referencing specific details from their resume/profile (past roles, specific companies, projects, tools, frameworks, degrees, or claimed achievements) against the core requirements in the JD.
   - For example:
     * "On your resume at ${candCompany || '[Company]'}, you mentioned using [Tool/Tech]. In our JD, we need [JD Requirement]. How did you apply [Tool/Tech] in your past project and how will you apply it here?"
     * "You listed [Skill/Project] on your resume. Walk me through a challenging situation you faced with [Skill/Project] and how you resolved it."
   - DO NOT ask generic candidate-agnostic textbook questions (e.g. "What is React?", "Tell me about a time you had a conflict").
   - Every candidate applying for this job MUST receive completely distinct questions tailored strictly to THEIR individual resume.
   - Keep questions clear, practical, conversational, and direct.`;

  try {
    const parsed = await grokGenerateWithResumeJson<{ questions?: string[] }>(
      sys,
      prompt,
      base64Resume,
      mimeType,
      0.6,
      BUDGET.QUESTIONS,
      combinedResumeText,
      'questions' // Bedrock model
    );
    const parsedQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];

    // Deduplicate while preserving order and limit to total requested numQuestions
    const uniqueQuestions: string[] = [];
    const seen = new Set<string>();
    for (const q of parsedQuestions) {
      if (!q || typeof q !== 'string') continue;
      const trimmed = q.trim();
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueQuestions.push(trimmed);
      }
    }

    if (uniqueQuestions.length === 0) {
      const fallbackIntro = candName
        ? `Hello ${candName}, welcome! Please tell us about your work experience as ${candDesignation || 'a professional'} at ${candCompany || 'your previous company'} and why you are interested in the ${jobTitle} role.`
        : DEFAULT_WORK_EXPERIENCE_QUESTION_EN;
      uniqueQuestions.push(fallbackIntro);
    }

    return uniqueQuestions.slice(0, numQuestions);
  } catch (error: any) {
    console.error("Bedrock Generate Questions Error:", error);
    throw new Error(error.message || "Failed to generate questions");
  }
};

// ── Feedback / Report Generation ──────────────────────────────────────────────
export const generateFeedback = async (
  jobTitle: string,
  jobDescription: string,
  candidateExp: string,
  base64Resume: string,
  mimeType: string,
  questions: string[],
  transcripts: string[],
  resumeTextContent?: string,
  strictness: 'Low' | 'Medium' | 'Hard' = 'Medium'
) => {
  const jd  = truncate(jobDescription, JD_MAX_CHARS);
  const exp = truncate(candidateExp, 150);

  // Build Q&A block — each transcript is capped to save tokens
  const qaBlock = questions.map((q, i) => {
    const ans = truncate(transcripts[i] || '(no answer given)', TRANSCRIPT_MAX_CHARS);
    return `Q${i + 1}: ${q}\nA${i + 1}: ${ans}`;
  }).join('\n\n---\n\n');

  let strictnessInstructions = "You are an experienced hiring manager evaluating a candidate after an interview. Your goal is to provide a realistic, accurate, and human-like hiring assessment. Be fair and practical, focusing on job readiness over perfection. If the candidate shows reasonable understanding and decent communication, avoid very low scores. If answers are mostly correct but imperfect, consider them positively. This is an interview, not an academic test.";
  if (strictness === 'Low') {
    strictnessInstructions = "You are an encouraging hiring manager. Ignore very small points in communication and minor technical mistakes. Focus on the candidate's core understanding. Do not give low scores for small errors. Be extremely forgiving.";
  } else if (strictness === 'Hard') {
    strictnessInstructions = "You are an extremely strict hiring manager. Scrutinize every detail of the answers. Provide strict feedback, heavily penalizing any technical gaps, hesitation, or communication errors. Demand perfection.";
  }

  const sys = `${strictnessInstructions} Adhere strictly to the output format provided.`;

  const feedbackPrompt =
`## Candidate Evaluation

**ROLE:** ${jobTitle}
**CANDIDATE STATED EXPERIENCE:** ${exp}

---

### JOB DESCRIPTION
${jd}

---

### INTERVIEW TRANSCRIPT
${qaBlock}

---

### EVALUATION TASK

Based on the Job Description, the candidate's resume (provided in context), and their Q&A performance, provide a comprehensive evaluation.

**1. Resume Analysis (Role Fit):**
   - **Goal:** Assess the candidate's **Role Fit**.
   - **Action:** Clearly state how well the candidate fits the role (e.g., Strong Fit, Moderate Fit, Partial Fit, Not a Fit). Explain WHY in 2–3 lines, referencing their resume and experience against the job description.

**2. Answer Quality (Technical & Domain Skills):**
   - **Goal:** Evaluate **Technical & Domain Skills**.
   - **Action:** Evaluate how clearly and effectively the candidate answered the technical and domain questions, mentioning if they demonstrate practical understanding.

**3. Communication Skills Analysis:**
   - **Goal:** Assess candidate's **Communication Skills** style and quality.
   - **Action:** Evaluate the candidate's spoken communication quality based on the specified parameters below:
     - Fluency in English / Hindi / Marathi
     - Clarity of Speech
     - Confidence Level
     - Grammar & Vocabulary
     - Listening Skills
     - Professional Tone
     - Pronunciation / Accent Neutrality
     - Ability to Explain Experience
     - Response Speed & Presence of Mind
     - Telephone Etiquette
     - Interpersonal Skills
     - Overall Communication Rating

**4. Overall Evaluation (Summary):**
   - **Goal:** Provide a **Summary**.
   - **Action:** Write a concise 2–3 line summary of the candidate’s overall performance.

**5. Verdict (Final Verdict):**
   - **Goal:** Give a clear **Final Verdict**.
   - **Action:** State if the candidate is a "Strong Hire", "Hire", "Leaning No", or "No Hire". Keep it professional and balanced.

**6. Scoring (MANDATORY):**
   - **Resume Score:** A numerical score from 0-100 based on the resume's alignment with the JD.
   - **Q&A Score:** A numerical score from 0-100 based on the quality and accuracy of their answers.
   - **DO NOT** provide an "Overall Score". The application will calculate it.

---

### OUTPUT FORMAT (Strictly follow this structure)

**Resume Analysis:**
- [Bullet point analysis of resume vs JD]
- [Identify a key strength]
- [Identify a key weakness or gap]

**Answer Quality:**
- [Bullet point analysis of technical answer quality]
- [Comment on strongest/weakest technical answer]
- [Overall technical skills assessment]

**Communication Skills:**
Fluency in English / Hindi / Marathi: [Excellent | Good | Average | Poor] - [1-sentence reason]
Clarity of Speech: [Excellent | Good | Average | Poor] - [1-sentence reason]
Confidence Level: [High | Medium | Low] - [1-sentence reason]
Grammar & Vocabulary: [Excellent | Good | Average | Poor] - [1-sentence reason]
Listening Skills: [Excellent | Good | Average | Poor] - [1-sentence reason]
Professional Tone: [Professional | Casual | Unprofessional] - [1-sentence reason]
Pronunciation / Accent Neutrality: [Neutral | Light Accent | Heavy Accent] - [1-sentence reason]
Ability to Explain Experience: [Excellent | Good | Average | Poor] - [1-sentence reason]
Response Speed & Presence of Mind: [Excellent | Good | Average | Poor] - [1-sentence reason]
Telephone Etiquette: [Excellent | Good | Average | Poor] - [1-sentence reason]
Interpersonal Skills: [Excellent | Good | Average | Poor] - [1-sentence reason]
Overall Communication Rating: [SCORE]/10
Detailed Style Analysis: [A brief paragraph summarizing their communication style, strengths, and feedback]

**Overall Evaluation:**
[Your 1-2 sentence executive summary.]

**Verdict:** [Strong Hire | Hire | Leaning No | No Hire]

**Scores:**
Resume Score: [SCORE]/100
Q&A Score: [SCORE]/100
`;

  try {
    const result = await grokGenerateWithResume(
      sys,
      feedbackPrompt,
      base64Resume,
      mimeType,
      0.2,
      BUDGET.FEEDBACK,
      resumeTextContent,
      'report' // MiniMax M2.5
    );
    return result || "AI feedback generation failed.";
  } catch (error: any) {
    console.error("Bedrock Feedback Error:", error);
    throw new Error(error.message);
  }
};

// ── Invite Resume Match ────────────────────────────────────────────────────────
export const evaluateResumeMatch = async (
  jobTitle: string,
  jobDescription: string,
  resumeText: string,
  extraRequirements?: {
    education?: string;
    gender?: string;
  }
): Promise<string> => {
  const jd = truncate(jobDescription, JD_MAX_CHARS);
  const eduReq = extraRequirements?.education ? `\nRequired Education: ${extraRequirements.education}` : '';
  const genderReq = extraRequirements?.gender ? `\nRequired Gender: ${extraRequirements.gender}` : '';

  const sys = `You are an extremely strict HR recruiter enforcing HARD ELIGIBILITY FILTERS.

CRITICAL MANDATORY FILTERS (AUTOMATIC 0% MATCH IF FAILED):
1. QUALIFICATION / EDUCATION STRICT FILTER:
   - If the Job Title, Job Description, or Required Education specifies a required qualification/degree level (e.g. B.Tech, M.Tech, Bachelor's, Master's, MBA, Diploma, 12th, PhD, etc.):
   - The candidate's resume MUST meet or exceed this required level.
   - If the candidate's degree is BELOW the required qualification (e.g., job requires B.Tech/Master's but candidate has 12th/Diploma or lower), you MUST output EXACTLY 0.

2. GENDER REQUIREMENTS STRICT FILTER:
   - If the Job Title, Job Description, or Required Gender explicitly mentions a gender preference/restriction (e.g., "Female only", "Male only", "Girls", "Boys", "Women only", "Men only"):
   - Analyze the candidate's resume for gender (name, pronouns, explicit gender field).
   - If candidate's gender does NOT match the required gender, you MUST output EXACTLY 0.

If and ONLY IF candidate passes both strict qualification and gender filters (or if neither is specified), calculate a realistic match percentage (0 to 100) based on skill overlap, experience, and role fit. Be critical.`;

  const prompt = `Job Title: ${jobTitle}${eduReq}${genderReq}\nJD: ${jd}\n\nCandidate Resume:\n${truncate(resumeText, RESUME_MAX_CHARS)}\n\nOutput ONLY an integer number between 0 and 100 representing the match percentage (e.g. 85 or 0). Do not output any other text or percentage signs.`;

  try {
    const result = await grokGenerateText(sys, prompt, 0.1, 10);
    const score = parseInt(result.trim(), 10);
    if (isNaN(score)) return "N/A";
    return score.toString();
  } catch (error: any) {
    console.error("Resume Match Error:", error);
    return "N/A";
  }
};

// ── Multi-Job Resume Match ───────────────────────────────────────────────────
export const evaluateResumeForMultipleJobs = async (
  jobs: { id: string; title: string; description: string; education?: string; gender?: string }[],
  resumeText: string
): Promise<Record<string, string>> => {
  if (jobs.length === 0) return {};

  const jobsContext = jobs.map(j => {
    const edu = j.education ? ` | Required Education: ${j.education}` : '';
    const gen = j.gender ? ` | Required Gender: ${j.gender}` : '';
    return `Job ID: ${j.id}\nTitle: ${j.title}${edu}${gen}\nJD: ${truncate(j.description, JD_MAX_CHARS / 2)}`;
  }).join('\n\n');

  const sys = `You are an extremely strict HR recruiter enforcing HARD ELIGIBILITY FILTERS for multiple jobs simultaneously.

CRITICAL MANDATORY HARD FILTERS (AUTOMATIC 0% MATCH IF FAILED):
1. QUALIFICATION / EDUCATION STRICT FILTER:
   - If Job Title, Description, or Required Education specifies a qualification/degree (e.g., B.Tech, M.Tech, Bachelor's, Master's, MBA, Diploma, 12th, PhD, etc.):
   - Candidate resume MUST meet or exceed this required level.
   - If candidate's degree is BELOW requirement (e.g. Job requires B.Tech/Master's but resume only lists 12th/Diploma), set match percentage for that job to 0.

2. GENDER REQUIREMENTS STRICT FILTER:
   - If Job Title, Description, or Required Gender specifies a gender restriction (e.g. "Female only", "Male only", "Girls", "Boys", "Women only", "Men only"):
   - Inspect candidate resume for gender. If candidate's gender does NOT match the job requirement, set match percentage for that job to 0.

Only if candidate passes both strict qualification and gender requirements, score from 0 to 100 based on skill and experience fit.
Output ONLY a valid JSON object where keys are Job IDs and values are integer match percentages (0-100). Do NOT output markdown formatting like \`\`\`json.`;

  const prompt = `Jobs:\n${jobsContext}\n\nCandidate Resume:\n${truncate(resumeText, RESUME_MAX_CHARS)}\n\nOutput strictly JSON mapping Job ID to percentage match. Example: {"job123": 85, "job456": 0}`;

  try {
    const result = await grokGenerateText(sys, prompt, 0.1, 50 + jobs.length * 20);
    const cleanResult = result.replace(/```json/g, '').replace(/```/g, '').trim();
    const scores = JSON.parse(cleanResult);
    
    const formattedScores: Record<string, string> = {};
    for (const [key, val] of Object.entries(scores)) {
        formattedScores[key] = String(val);
    }
    return formattedScores;
  } catch (error: any) {
    console.error("Multi-Job Resume Match Error:", error);
    return {};
  }
};

// ── Storage (Amazon S3 Primary with Cloudinary Fallback) ──────────────────────────────────
export const uploadToCloudinary = async (blob: Blob, resourceType: 'video' | 'image' | 'auto' | 'raw' = 'auto') => {
  // If S3 is configured, upload directly to Amazon S3
  if (isS3Configured()) {
    try {
      return await uploadToS3(blob, resourceType);
    } catch (s3Err) {
      console.warn("Amazon S3 Upload failed, attempting Cloudinary fallback...", s3Err);
    }
  }

  // Cloudinary fallback logic
  const isVideo = resourceType === 'video';
  const isRaw = resourceType === 'raw';
  const uploadUrl = resourceType === 'auto'
    ? AUTO_CLOUDINARY_UPLOAD_URL
    : (isVideo ? VIDEO_CLOUDINARY_UPLOAD_URL : (isRaw ? RAW_CLOUDINARY_UPLOAD_URL : RESUME_CLOUDINARY_UPLOAD_URL));

  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  try {
    const response = await fetch(uploadUrl, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText);
    return data.secure_url;
  } catch (error: any) {
    console.error("Cloudinary Upload Error:", error);
    throw error;
  }
};

// ── AssemblyAI ────────────────────────────────────────────────────────────────
export const requestTranscription = async (audioUrl: string, languageCode: string = 'en') => {
  try {
    const body: any = { audio_url: audioUrl, language_code: languageCode };
    const response = await fetch(ASSEMBLYAI_TRANSCRIPT_ENDPOINT, {
      method: 'POST',
      headers: { 'authorization': ASSEMBLYAI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Transcription request failed");
    return data.id;
  } catch (error: any) {
    console.error("AssemblyAI Request Error:", error);
    throw error;
  }
};

export const fetchTranscriptText = async (transcriptId: string) => {
  try {
    const response = await fetch(`${ASSEMBLYAI_TRANSCRIPT_ENDPOINT}/${transcriptId}`, {
      method: 'GET',
      headers: { 'authorization': ASSEMBLYAI_API_KEY }
    });
    const data = await response.json();
    if (data.status === 'completed') return { status: 'completed', text: data.text || '(No speech detected)' };
    if (data.status === 'error') return { status: 'error', text: `Error: ${data.error}` };
    return { status: data.status, text: null };
  } catch (error: any) {
    return { status: 'error', text: `Error: ${error.message}` };
  }
};
