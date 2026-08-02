/**
 * Parse Bedrock-generated interview feedback into report sections.
 * Tolerates markdown variants MiniMax / GLM often return.
 */
export type ParsedInterviewFeedback = {
  summary: string;
  roleFit: string;
  answerQuality: string;
  communicationSkills: string;
  technicalSkills: string;
  verdict: string;
  keyStrength: string | null;
  keyWeakness: string | null;
  hasDetailedComms: boolean;
  communicationDetails: Record<string, { rating: string; comment: string }>;
  overallCommsRating: string;
  detailedStyleAnalysis: string;
  rawFeedback: string;
};

const EMPTY: ParsedInterviewFeedback = {
  summary: 'N/A',
  roleFit: 'N/A',
  answerQuality: 'N/A',
  communicationSkills: 'N/A',
  technicalSkills: 'N/A',
  verdict: 'Not Available',
  keyStrength: null,
  keyWeakness: null,
  hasDetailedComms: false,
  communicationDetails: {},
  overallCommsRating: 'N/A',
  detailedStyleAnalysis: 'N/A',
  rawFeedback: '',
};

function extractSection(text: string, label: string, untilLabels: string[]): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const until = untilLabels.map(esc).join('|');
  const re = new RegExp(
    `(?:\\*\\*|__|#{1,3}\\s*)?${esc(label)}(?:\\*\\*|__)?\\s*:?\\s*([\\s\\S]*?)(?=(?:\\*\\*|__|#{1,3}\\s*)?(?:${until})(?:\\*\\*|__)?\\s*:|$)`,
    'i'
  );
  return text.match(re)?.[1]?.trim() || '';
}

export function parseInterviewFeedback(feedback: unknown): ParsedInterviewFeedback {
  if (typeof feedback !== 'string' || !feedback.trim()) return { ...EMPTY };

  const normalized = feedback
    .replace(/\r\n/g, '\n')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();

  const roleFit = extractSection(normalized, 'Resume Analysis', [
    'Answer Quality',
    'Communication Skills',
    'Overall Evaluation',
    'Verdict',
    'Scores',
  ]);
  const answerQualityRaw = extractSection(normalized, 'Answer Quality', [
    'Communication Skills',
    'Overall Evaluation',
    'Verdict',
    'Scores',
  ]);
  const communicationBlock = extractSection(normalized, 'Communication Skills', [
    'Overall Evaluation',
    'Verdict',
    'Scores',
  ]);
  const summary = extractSection(normalized, 'Overall Evaluation', ['Verdict', 'Scores']);
  const verdictBlock = extractSection(normalized, 'Verdict', ['Scores']);

  let communicationSkills = 'N/A';
  let technicalSkills = 'N/A';
  let answerQuality = answerQualityRaw || 'N/A';

  if (answerQualityRaw) {
    const nestedComms = answerQualityRaw.match(
      /\*\*Communication Skills:\*\*([\s\S]*?)(?=\*\*Technical Skills:\*\*|$)/i
    );
    const nestedTech = answerQualityRaw.match(/\*\*Technical Skills:\*\*([\s\S]*)/i);
    communicationSkills = nestedComms ? nestedComms[1].trim() : 'N/A';
    technicalSkills = nestedTech ? nestedTech[1].trim() : 'N/A';
    if (communicationSkills === 'N/A' && technicalSkills === 'N/A') {
      technicalSkills = answerQualityRaw;
      answerQuality = answerQualityRaw;
    } else if (technicalSkills !== 'N/A') {
      answerQuality = technicalSkills;
    }
  }

  const communicationDetails: Record<string, { rating: string; comment: string }> = {};
  let overallCommsRating = 'N/A';
  let detailedStyleAnalysis = 'N/A';
  let hasDetailedComms = false;

  if (communicationBlock) {
    hasDetailedComms = true;
    const params = [
      { key: 'fluency', pattern: /(?:Fluency in English \/ Hindi \/ Marathi):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'clarity', pattern: /(?:Clarity of Speech):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'confidence', pattern: /(?:Confidence Level):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'grammar', pattern: /(?:Grammar & Vocabulary):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'listening', pattern: /(?:Listening Skills):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'tone', pattern: /(?:Professional Tone):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'accent', pattern: /(?:Pronunciation \/ Accent Neutrality):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'explainExp', pattern: /(?:Ability to Explain Experience):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'presence', pattern: /(?:Response Speed & Presence of Mind):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'etiquette', pattern: /(?:Telephone Etiquette):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
      { key: 'interpersonal', pattern: /(?:Interpersonal Skills):\s*([^-]*?)(?:\s*-\s*([^\n]*))?$/im },
    ];

    for (const p of params) {
      let matched = false;
      for (const line of communicationBlock.split('\n')) {
        const m = line.match(p.pattern);
        if (m) {
          communicationDetails[p.key] = {
            rating: m[1]?.trim() || 'N/A',
            comment: m[2]?.trim() || '',
          };
          matched = true;
          break;
        }
      }
      if (!matched) communicationDetails[p.key] = { rating: 'N/A', comment: '' };
    }

    overallCommsRating =
      communicationBlock.match(/Overall Communication Rating:\s*([^\n]*)/i)?.[1]?.trim() || 'N/A';
    detailedStyleAnalysis =
      communicationBlock.match(/Detailed Style Analysis:\s*([\s\S]*)/i)?.[1]?.trim() || 'N/A';
  }

  const keyStrength =
    normalized.match(/(?:-\s*)?Key\s*strength:\s*([^\n]*)/i)?.[1]?.trim() || null;
  const keyWeakness =
    normalized.match(/(?:-\s*)?Key\s*weakness:\s*([^\n]*)/i)?.[1]?.trim() || null;

  const structuredMissing = !summary && !roleFit && !answerQualityRaw && !communicationBlock;

  return {
    summary: summary || (structuredMissing ? normalized : 'N/A'),
    roleFit: roleFit || 'N/A',
    answerQuality,
    communicationSkills,
    technicalSkills,
    verdict: verdictBlock ? verdictBlock.split('\n')[0].trim() : 'Not Available',
    keyStrength,
    keyWeakness,
    hasDetailedComms,
    communicationDetails,
    overallCommsRating,
    detailedStyleAnalysis,
    rawFeedback: normalized,
  };
}
