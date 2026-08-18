export type EducationQualification =
  | 'Diploma'
  | 'Graduate'
  | 'HSC'
  | 'ITI'
  | 'Post-Graduate'
  | 'SSC';

export const EDUCATION_QUALIFICATIONS: EducationQualification[] = [
  'Diploma',
  'Graduate',
  'HSC',
  'ITI',
  'Post-Graduate',
  'SSC'
];

export const EDUCATION_QUALIFICATION_ICONS: Record<EducationQualification, string> = {
  'Diploma': '',
  'Graduate': '',
  'HSC': '',
  'ITI': '',
  'Post-Graduate': '',
  'SSC': ''
};

export const EDUCATION_SPECIALIZATIONS: Record<EducationQualification, string[]> = {
  'Diploma': [
    'Automobile engineering',
    'Computer',
    'Diploma - Any',
    'Diploma Architecture',
    'Diploma Automobile',
    'Diploma Chemical',
    'Diploma Civil',
    'Diploma Computers',
    'Diploma Electrical',
    'Diploma Electronics/Telecommunications',
    'Diploma Export/Import',
    'Diploma Fashion Design/Other Designing',
    'Diploma Fire & Safety',
    'Diploma Graphic/Web Designing',
    'Diploma Hotel Management',
    'Diploma Insurance',
    'Diploma IT',
    'Diploma Management',
    'Diploma Mechanical',
    'Diploma Metallurgy',
    'Diploma Plastic',
    'Diploma Production/Industrial Engineering',
    'Not Applicable',
    'Other',
    'Textile Engineering',
    'Tool & Die',
    'Tourism',
    'Travel & Tourism',
    'Visual Arts'
  ],
  'Graduate': [
    'Any Graduate',
    'B.A',
    'B.Arch',
    'B.B.A',
    'B.Com',
    'B.E/B.Tech',
    'B.Ed',
    'B.Pharm',
    'B.Sc',
    'B.Sc Microbiology',
    'BAMS',
    'BCA',
    'BCS',
    'BDS',
    'BE Automobile',
    'BE Chemical',
    'BE Civil',
    'BE Computers',
    'BE E&TC',
    'BE Electrical',
    'BE Instrumentation',
    'BE IT',
    'BE Mechanical',
    'BE Metallurgy',
    'BE Other',
    'BE Plastic',
    'BE Polymer',
    'BE Production/Industrial',
    'BE Textile',
    'BE Tool & Die',
    'BHM',
    'BHMS',
    'BL/LLB',
    'BSc Computer Science',
    'BSW',
    'BTech',
    'CA',
    'CA Inter',
    'CS',
    'Environmental Health & Safety',
    'Fashion Designing',
    'Graduate - Any',
    'Home Science',
    'ICWA',
    'ICWA Inter',
    'Not Applicable'
  ],
  'HSC': [
    'HSC - Any',
    'HSC Arts',
    'HSC Commerce',
    'HSC Fail',
    'HSC Science',
    'MCVC',
    'Not Applicable'
  ],
  'ITI': [
    'Fitter',
    'ITI',
    'ITI - All Trade',
    'ITI Automobile',
    'ITI Carpenter',
    'ITI Diesel Mechanic',
    'ITI Draughtsman',
    'ITI Electrician',
    'ITI Machinist',
    'ITI Mechanic',
    'ITI Plumber',
    'ITI Turner',
    'ITI Welder',
    'ITI Wireman',
    'Not Applicable',
    'Other'
  ],
  'Post-Graduate': [
    'M.A',
    'M.Arch',
    'M.Com',
    'M.E/M.Tech/MS',
    'M.Ed',
    'M.Pharm',
    'M.Sc',
    'M.Sc Microbiology',
    'MBA Finance',
    'MBA HR',
    'MBA Logistics',
    'MBA Marketing',
    'MBA Operations',
    'MBA Other',
    'MBA Systems',
    'MCA',
    'MCM',
    'MCS',
    'MPM',
    'MSW',
    'Not Applicable',
    'Other',
    'Post Graduate - Any'
  ],
  'SSC': [
    'Fail',
    'Pass'
  ]
};

export interface EducationCategory {
  category: string;
  icon: string;
  degrees: string[];
}

export const CATEGORIZED_EDUCATION_DEGREES: EducationCategory[] = EDUCATION_QUALIFICATIONS.map(qual => ({
  category: qual,
  icon: EDUCATION_QUALIFICATION_ICONS[qual] || '',
  degrees: EDUCATION_SPECIALIZATIONS[qual]
}));

// All unique specializations flattened
export const ALL_EDUCATION_DEGREES: string[] = Array.from(
  new Set(EDUCATION_QUALIFICATIONS.flatMap(qual => EDUCATION_SPECIALIZATIONS[qual]))
);

// Helper: Get specializations for a given qualification
export function getSpecializationsForQualification(qualification: string): string[] {
  const match = EDUCATION_QUALIFICATIONS.find(
    q => q.toLowerCase() === qualification.trim().toLowerCase()
  );
  if (match) {
    return EDUCATION_SPECIALIZATIONS[match];
  }
  return [];
}

// Helper: Find qualification(s) for a given specialization
export function getQualificationForSpecialization(specialization: string): EducationQualification[] {
  const norm = specialization.trim().toLowerCase();
  const results: EducationQualification[] = [];
  for (const qual of EDUCATION_QUALIFICATIONS) {
    if (EDUCATION_SPECIALIZATIONS[qual].some(s => s.toLowerCase() === norm)) {
      results.push(qual);
    }
  }
  return results;
}

export { isEducationMatching } from '../utils/educationMatcher';
