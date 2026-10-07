export interface Interview {
    id: string;
    title: string;
    description: string;
    department?: string;
    duration: number;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    strictness?: 'Low' | 'Medium' | 'Hard';
    questions: Question[];
    candidateId?: string;
    candidateEmails?: string[];
    recruiterId: string;
    scheduledAt: any; 
    status: 'Pending' | 'Invited' | 'Completed' | 'Cancelled';
    interviewLink?: string;
    accessCode: string;
    report?: InterviewReport;
    createdAt: any;
    updatedAt: any;
  }
  
  export interface Question {
    id: string;
    text: string;
    type: 'Code' | 'Theory';
    expectedOutput?: string;
    constraints?: string[];
  }
  
  export interface InterviewReport {
    id: string;
    interviewId: string;
    candidateId: string;
    score: number;
    feedback: string;
    codeAnalysis: CodeAnalysis[];
    recordingUrl?: string; // URL to the video recording of the interview
    completedAt: any;
  }
  
  export interface CodeAnalysis {
    questionId: string;
    language: string;
    code: string;
    output: string[];
    executionTime: number;
    pass: boolean; // Did the code pass all test cases?
  }
  
  export interface UserProfile {
    uid: string;
    email: string;
    role: 'candidate' | 'recruiter' | 'admin';
    name: string;
    displayName?: string;
    phone?: string;
    phoneNumber?: string;
    contactNumber?: string;
    photoURL?: string;
    company?: string;
    skills?: string[];
    experience?: number;
    resumeUrl?: string;
    domain?: string;
    preferredDomains?: string[];
    parentRecruiterId?: string;
    teamId?: string;
    isSecondary?: boolean;
    designation?: string;
    whatsappSessionId?: string;
    whatsappSessionPasscode?: string;
    customTemplates?: any;
  }

  export interface AuditLog {
    id: string;
    teamId: string;
    action: string;
    details: string;
    performedBy: {
      uid: string;
      name?: string;
      email?: string;
      role?: string;
      designation?: string;
    };
    createdAt: any;
  }
  
  export interface Job {
    id: string;
    recruiterId: string;
    title: string;
    description: string;
    requirements: string[];
    location: string;
    salary: number;
    postedAt: any;
  }
  
  export interface Application {
    id: string;
    jobId: string;
    candidateId: string;
    status: 'Applied' | 'Shortlisted' | 'Rejected' | 'Hired';
    appliedAt: any;
  }
  
  export interface Test {
    id: string;
    title: string;
    description: string;
    duration: number;
    questions: TestQuestion[];
    recruiterId: string;
    accessCode: string;
    passingScore?: number;
    nextInterviewId?: string;
    externalInterviewLink?: string;
    externalAccessCode?: string;
    createdAt: any;
  }
  
  export interface TestQuestion {
    id: string;
    text: string;
    options: string[];
    correctAnswer: number; 
  }
  
  export interface TestResult {
    id: string;
    testId: string;
    candidateId: string;
    score: number;
    answers: number[];
    emailSent?: boolean;
    emailError?: string;
    completedAt: any;
  }
  
export interface InterviewSubmission {
  id: string;
  candidateInfo?: { 
    name: string; 
    email: string; 
    phone?: string;
    gender?: string;
    dob?: string;
    age?: string;
    maritalStatus?: string;
    currentCity?: string;
    nativePlace?: string;
    qualificationBasic?: string;
    qualificationPG?: string;
    totalExperienceYears?: string;
    totalExperienceMonths?: string;
    currentCompanyName?: string;
    designation?: string;
    currentSalary?: string;
    expectedSalary?: string;
    employmentStatus?: string;
    isWorking?: boolean;
    noticePeriod?: string;
    noticePeriodVal?: string;
    noticePeriodUnit?: string;
    noticePeriodDays?: string;
    reasonForJobChange?: string;
    resumeUpdated?: string;
    highlightedSkillsForJob?: string;
    isFresher?: boolean;
    resumeText?: string; 
    language?: string; 
    experienceType?: string;
  };
  score: any;
  resumeScore?: any;
  qnaScore?: any;
  feedback: string;
  submittedAt?: any;
  meta?: { tabSwitchCount?: number; };
  questions?: string[];
  videoURLs?: Array<string | null>;
  transcriptTexts?: Array<string | null>;
  candidateResumeURL?: string;
  status?: 'Completed' | 'Terminated' | 'Shortlist' | 'Reject' | 'Hold';
  visibilitySettings?: {
    hiddenVideos?: Record<string, boolean>;
    hiddenQuestions?: Record<string, boolean>;
  };
  clientAccessExpiresAt?: any;
}

export interface InterviewState {
  jobId?: string;
  jobTitle: string;
  jobDescription: string;
  questions: string[];
  answers: Array<string | null>;
  videoURLs: Array<string | null>;
  transcriptIds: Array<string | null>;
  transcriptTexts?: Array<string | null>;
  candidateResumeURL: string | null;
  candidateResumeMimeType: string | null;
  candidateResumeBase64?: string | null;
  candidateResumeText?: string;
  language: string;
  currentQuestionIndex: number;
  pendingResponseCount?: number;
  isMock?: boolean;
  terminated?: boolean;
  strictness?: 'Low' | 'Medium' | 'Hard';
}

export interface VoiceInterviewQuestion {
  id: string;
  question: string;
  category: 'relocation' | 'notice_period' | 'salary' | 'skills' | 'experience' | 'general';
  expectedAnswerNotes?: string;
  isCustom?: boolean;
}

export interface VoiceInterview {
  id: string;
  jobId?: string;
  interviewId?: string;
  title: string;
  jobTitle?: string;
  jobDescription?: string;
  companyName?: string;
  location?: string;
  recruiterUID: string;
  teamId?: string;
  questions: VoiceInterviewQuestion[];
  screeningSettings?: {
    askRelocation?: boolean;
    relocationLocation?: string;
    askNoticePeriod?: boolean;
    askSalary?: boolean;
    allowCrossQuestioning?: boolean;
    maxCrossQuestionsPerQuestion?: number;
  };
  status: 'active' | 'paused' | 'archived';
  createdAt: any;
  updatedAt?: any;
}

export interface VoiceInterviewTurn {
  speaker: 'ai' | 'candidate';
  text: string;
  timestamp: string;
  isCrossQuestion?: boolean;
  intent?: 'answer' | 'repeat' | 'skip';
  questionId?: string;
}

export interface VoiceInterviewResponse {
  id: string;
  voiceInterviewId: string;
  jobId?: string;
  recruiterUID: string;
  candidateInfo: {
    name: string;
    email: string;
    phone: string;
    currentCity?: string;
    resumeUrl?: string;
    resumeFileName?: string;
    resumeText?: string;
  };
  dialogueHistory: VoiceInterviewTurn[];
  answersSummary: Array<{
    question: string;
    answer: string;
    crossQuestions?: Array<{ question: string; answer: string }>;
    score?: number;
    notes?: string;
  }>;
  screeningReport: {
    overallScore: number; // out of 10
    relocationStatus: 'Ready to relocate' | 'Already local' | 'Not willing to relocate' | 'Negotiable' | 'Not applicable';
    relocationDetails?: string; // specific relocation confirmation (e.g. to Nashik)
    noticePeriod: string; // e.g. "Immediate", "15 days", "30 days"
    noticePeriodDetails?: string;
    salaryExpectation: string; // e.g. "Current ₹4.5 LPA, Expected ₹6 LPA"
    salaryFit?: string;
    skillsRating: number; // out of 10
    skillsFeedback?: string; // in-depth technical analysis vs JD
    communicationRating: number; // out of 10
    summary: string;
    strengths: string[];
    concerns: string[];
    recommendation: 'Shortlist' | 'Hold' | 'Reject';
    recommendationReason?: string;
  };
  callDurationSeconds: number;
  audioRecordingUrl?: string;
  recordingStorageKey?: string;
  candidateResumeUrl?: string;
  candidateResumeFileName?: string;
  status: 'Completed' | 'Terminated' | 'Shortlist' | 'Hold' | 'Reject';
  submittedAt: any;
}
