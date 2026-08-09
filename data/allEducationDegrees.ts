export interface EducationCategory {
  category: string;
  icon: string;
  degrees: string[];
}

export const CATEGORIZED_EDUCATION_DEGREES: EducationCategory[] = [
  {
    category: "B.Tech / B.E. Engineering Branches",
    icon: "⚙️",
    degrees: [
      "B.Tech / B.E. - Civil Engineering",
      "B.Tech / B.E. - Computer Science & Engineering (CSE)",
      "B.Tech / B.E. - Mechanical Engineering",
      "B.Tech / B.E. - Electrical Engineering",
      "B.Tech / B.E. - Electronics & Telecommunication (E&TC)",
      "B.Tech / B.E. - Information Technology (IT)",
      "B.Tech / B.E. - Chemical Engineering",
      "B.Tech / B.E. - Automobile Engineering",
      "B.Tech / B.E. - Instrumentation & Control",
      "B.Tech / B.E. - Aerospace / Aeronautical Engineering",
      "B.Tech / B.E. - Biotechnology / Bio-Engineering",
      "B.Tech / B.E. - Mechatronics & Robotics",
      "B.Tech / B.E. - Environmental Engineering",
      "B.Tech / B.E. - Mining & Metallurgy",
      "B.Tech / B.E. - Structural Engineering"
    ]
  },
  {
    category: "Diploma Trades (Polytechnic)",
    icon: "🛠️",
    degrees: [
      "Diploma in Civil Engineering",
      "Diploma in Mechanical Engineering",
      "Diploma in Electrical Engineering",
      "Diploma in Computer Engineering / IT",
      "Diploma in Electronics & Telecommunication",
      "Diploma in Automobile Engineering",
      "Diploma in Architecture / Interior Design",
      "Diploma in Chemical Engineering",
      "Diploma in Tool & Die Making",
      "Diploma in Industrial Safety & Environmental Health",
      "Diploma in Mining Engineering"
    ]
  },
  {
    category: "M.Tech / M.E. Engineering Masters",
    icon: "🎓",
    degrees: [
      "M.Tech / M.E. - Civil / Structural Engineering",
      "M.Tech / M.E. - Computer Science / Software Engineering",
      "M.Tech / M.E. - Mechanical / Thermal Engineering",
      "M.Tech / M.E. - Electrical & Power Systems",
      "M.Tech / M.E. - VLSI & Embedded Systems",
      "M.Tech / M.E. - Construction Management"
    ]
  },
  {
    category: "Management & Business",
    icon: "💼",
    degrees: [
      "MBA / PGDM - Human Resource (HR)",
      "MBA / PGDM - Finance & Accounting",
      "MBA / PGDM - Marketing & Sales",
      "MBA / PGDM - Operations & Supply Chain",
      "MBA / PGDM - Business Analytics / IT",
      "BBA / BBM - Bachelor of Business Administration"
    ]
  },
  {
    category: "IT & Computer Applications",
    icon: "💻",
    degrees: [
      "BCA - Bachelor of Computer Applications",
      "MCA - Master of Computer Applications",
      "B.Sc - Computer Science / Information Technology",
      "M.Sc - Computer Science / Data Science / IT"
    ]
  },
  {
    category: "Commerce & Finance",
    icon: "📊",
    degrees: [
      "B.Com - Accounting & Finance",
      "B.Com - Banking & Insurance",
      "B.Com - Tax & Auditing",
      "M.Com - Master of Commerce",
      "CA - Chartered Accountant / IPCC",
      "CS - Company Secretary",
      "CMA - Cost & Management Accountant"
    ]
  },
  {
    category: "Science & Research",
    icon: "🔬",
    degrees: [
      "B.Sc - Chemistry / Industrial Chemistry",
      "B.Sc - Physics / Mathematics",
      "B.Sc - Biotechnology / Microbiology",
      "B.Sc - Agriculture / Forestry",
      "M.Sc - Chemistry / Physics / Maths / Biotech"
    ]
  },
  {
    category: "Arts & Humanities",
    icon: "🎨",
    degrees: [
      "B.A. - Economics",
      "B.A. - English Literature",
      "B.A. - Psychology / Sociology",
      "B.A. - History / Political Science",
      "M.A. - Master of Arts (Economics/English/Psychology)"
    ]
  },
  {
    category: "Law, Pharmacy & Technical",
    icon: "⚖️",
    degrees: [
      "B.Arch - Bachelor of Architecture",
      "B.Pharm - Bachelor of Pharmacy",
      "D.Pharm - Diploma in Pharmacy",
      "LLB / B.A. LLB - Law",
      "LLM - Master of Laws",
      "Ph.D. / Doctorate",
      "ITI Trade (Fitter / Electrician / Welder / Machinist / Turner)"
    ]
  },
  {
    category: "High School Qualification",
    icon: "🏫",
    degrees: [
      "12th Pass / HSC - Science Stream",
      "12th Pass / HSC - Commerce Stream",
      "12th Pass / HSC - Arts Stream",
      "10th Pass / SSC (Secondary Certificate)",
      "Other Qualification"
    ]
  }
];

export const ALL_EDUCATION_DEGREES: string[] = CATEGORIZED_EDUCATION_DEGREES.flatMap(c => c.degrees);

export { isEducationMatching } from '../utils/educationMatcher';

