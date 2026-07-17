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
    photoURL?: string;
    company?: string;
    skills?: string[];
    experience?: number;
    resumeUrl?: string;
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
  
