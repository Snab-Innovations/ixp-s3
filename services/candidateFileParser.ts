import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { grokGenerateJson } from './grokService';

export interface CandidateFileRecord {
  name: string;
  phone: string;
  email: string;
}

const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
const PHONE_REGEX = /(?:\+?\d{1,4}[\s.-]?)?(?:[6-9]\d{4}[\s.-]?\d{5}|(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4,5})/;

/**
 * Parses Excel (.xlsx, .xls), CSV (.csv), PDF (.pdf), Word (.docx), or TXT (.txt) files
 * to extract candidate Name, Contact Number (Phone), and Email address.
 */
export async function parseCandidateDocument(file: File): Promise<CandidateFileRecord[]> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
    return parseSpreadsheetFile(file);
  } else if (fileName.endsWith('.pdf')) {
    return parsePdfFile(file);
  } else if (fileName.endsWith('.docx')) {
    return parseDocxFile(file);
  } else {
    return parseTextFile(file);
  }
}

/**
 * Spreadsheet parser for XLSX, XLS, and CSV files
 */
async function parseSpreadsheetFile(file: File): Promise<CandidateFileRecord[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

  const candidates: CandidateFileRecord[] = [];

  for (const row of jsonRows) {
    let name = '';
    let firstName = '';
    let lastName = '';
    let email = '';
    let phone = '';
    let unassignedTextValues: string[] = [];

    // Inspect object keys for header names
    for (const [key, val] of Object.entries(row)) {
      const colName = key.toLowerCase().trim();
      const strVal = String(val).trim();
      if (!strVal) continue;

      if (colName.includes('first name') || colName.includes('fname') || colName.includes('given name')) {
        firstName = strVal;
      } else if (colName.includes('last name') || colName.includes('lname') || colName.includes('surname') || colName.includes('family name')) {
        lastName = strVal;
      } else if (
        colName.includes('candidate name') ||
        colName.includes('full name') ||
        colName.includes('fullname') ||
        colName.includes('applicant name') ||
        colName.includes('student name') ||
        colName.includes('person name') ||
        colName.includes('candidate') ||
        colName.includes('applicant') ||
        colName.includes('student') ||
        colName.includes('name')
      ) {
        if (!name) name = strVal;
      } else if (colName.includes('email') || colName.includes('mail') || colName.includes('e-mail')) {
        if (!email) email = strVal;
      } else if (
        colName.includes('phone') ||
        colName.includes('mobile') ||
        colName.includes('contact') ||
        colName.includes('num') ||
        colName.includes('whatsapp') ||
        colName.includes('tel') ||
        colName.includes('cell')
      ) {
        if (!phone) phone = strVal;
      } else {
        // Unassigned columns fallback
        if (!email && EMAIL_REGEX.test(strVal)) {
          email = strVal.match(EMAIL_REGEX)?.[1] || strVal;
        } else if (!phone && PHONE_REGEX.test(strVal)) {
          phone = strVal;
        } else if (strVal.length >= 2 && strVal.length <= 60 && !strVal.includes('@') && !/^\d+$/.test(strVal)) {
          unassignedTextValues.push(strVal);
        }
      }
    }

    // Combine First & Last Name if present
    if (!name && (firstName || lastName)) {
      name = `${firstName} ${lastName}`.trim();
    }

    // Fallback name from unassigned text columns
    if (!name && unassignedTextValues.length > 0) {
      name = unassignedTextValues[0];
    }

    // Clean up extracted email and phone
    const cleanEmail = email ? (email.match(EMAIL_REGEX)?.[1] || email).trim() : '';
    const cleanPhone = phone ? phone.replace(/[^0-9+]/g, '').trim() : '';

    let cleanName = name.replace(/["',]/g, '').trim();
    if (!cleanName || cleanName.toLowerCase() === 'candidate') {
      if (cleanEmail) {
        const parts = cleanEmail.split('@')[0].split(/[._-]/).filter(Boolean);
        cleanName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ') || 'Candidate';
      } else {
        cleanName = 'Candidate';
      }
    }

    if (cleanEmail || cleanPhone) {
      candidates.push({
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone
      });
    }
  }

  return candidates;
}

/**
 * PDF parser for candidate lists / resumes
 */
async function parsePdfFile(file: File): Promise<CandidateFileRecord[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return parseTextContentWithAI(fullText);
}

/**
 * DOCX parser
 */
async function parseDocxFile(file: File): Promise<CandidateFileRecord[]> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return parseTextContentWithAI(result.value);
}

/**
 * Plain Text parser
 */
async function parseTextFile(file: File): Promise<CandidateFileRecord[]> {
  const text = await file.text();
  return parseTextContentWithAI(text);
}

/**
 * Uses Grok AI / regex to parse candidate lists from unstructured document text
 */
async function parseTextContentWithAI(text: string): Promise<CandidateFileRecord[]> {
  if (!text || text.trim().length < 10) return [];

  // Try AI extraction first for high accuracy on lists and tables
  try {
    const sysPrompt = `You are a data extraction assistant. Extract candidate information (Name, Contact Number / Phone, Email) from the document text. Return a JSON array of candidate objects: [{"name": "...", "phone": "...", "email": "..."}]`;
    const userPrompt = `Document Text:\n${text.substring(0, 15000)}\n\nExtract all candidates into a JSON array with name, phone, and email.`;
    
    const candidates = await grokGenerateJson<CandidateFileRecord[]>(sysPrompt, userPrompt);
    if (Array.isArray(candidates) && candidates.length > 0) {
      return candidates.map(c => ({
        name: String(c.name || '').trim() || (c.email ? String(c.email).split('@')[0] : 'Candidate'),
        phone: String(c.phone || '').trim(),
        email: String(c.email || '').trim()
      }));
    }
  } catch (err) {
    console.warn('AI Candidate parsing fallback to regex:', err);
  }

  // Regex Fallback
  const lines = text.split(/\r?\n/);
  const candidates: CandidateFileRecord[] = [];

  for (const line of lines) {
    const emailMatch = line.match(EMAIL_REGEX);
    const phoneMatch = line.match(PHONE_REGEX);
    if (emailMatch || phoneMatch) {
      const email = emailMatch ? emailMatch[1] : '';
      const phone = phoneMatch ? phoneMatch[0].replace(/[^0-9+]/g, '') : '';
      const namePart = line.replace(EMAIL_REGEX, '').replace(PHONE_REGEX, '').replace(/[,|;:\-\t]/g, ' ').trim();
      
      candidates.push({
        name: namePart.substring(0, 40) || (email ? email.split('@')[0] : 'Candidate'),
        email,
        phone
      });
    }
  }

  return candidates;
}

/**
 * Smart parser for bulk candidate text (e.g. copied & pasted directly from Excel or CSV tables).
 * Extracts Name, Email, and Phone for each line.
 */
export function parseBulkCandidateTextInput(rawText: string): CandidateFileRecord[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const candidates: CandidateFileRecord[] = [];

  for (const line of lines) {
    const emailMatch = line.match(EMAIL_REGEX);
    const phoneMatch = line.match(PHONE_REGEX);

    const email = emailMatch ? emailMatch[1].trim() : '';
    const phone = phoneMatch ? phoneMatch[0].replace(/[^0-9+]/g, '').trim() : '';

    // Remove email and phone from line to isolate candidate name
    let namePart = line;
    if (emailMatch) {
      namePart = namePart.replace(emailMatch[0], '');
    }
    if (phoneMatch) {
      namePart = namePart.replace(phoneMatch[0], '');
    }

    // Clean up residual punctuation and tab separators from Excel copy-paste
    namePart = namePart.replace(/[,|;:\t<>/]/g, ' ').replace(/\s+/g, ' ').trim();

    let name = namePart;
    if (!name || name.length < 2) {
      if (email) {
        const parts = email.split('@')[0].split(/[._-]/).filter(Boolean);
        name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ') || 'Candidate';
      } else {
        name = 'Candidate';
      }
    }

    if (email || phone) {
      candidates.push({ name, email, phone });
    }
  }

  return candidates;
}
