/**
 * Helper utility to extract complete Job Details & Company Info for Invitations & Reminders.
 * Ensures fields stored in DB columns or raw JSONB objects are extracted without missing anything.
 */

export interface ExtractedJobDetails {
  gender?: string;
  location?: string;
  education?: string;
  qualification?: string;
  experience?: string;
  salary?: string;
  detailedJdUrl?: string;
  aboutCompany?: string;
  companyDescription?: string;
  jobDescription?: string;
  recruiterName?: string;
  recruiterPhone?: string;
  whatsappSessionId?: string;
  whatsappSessionPasscode?: string;
}

export function extractJobDetailsOptions(
  job: any,
  userProfile?: any,
  user?: any
): ExtractedJobDetails {
  if (!job) return {};

  const raw = job.raw || {};

  // Location
  const location =
    job.location ||
    raw.location ||
    (job.city ? `${job.city}${job.state ? `, ${job.state}` : ''}` : undefined) ||
    (raw.city ? `${raw.city}${raw.state ? `, ${raw.state}` : ''}` : undefined) ||
    raw.city ||
    raw.state;

  // Qualification / Education
  const qualification =
    job.education ||
    job.qualification ||
    job.qualifications ||
    raw.education ||
    raw.qualification ||
    raw.qualifications;

  // Experience
  let experience =
    job.experience ||
    raw.experience ||
    job.experienceRequired ||
    raw.experienceRequired;

  if (
    !experience &&
    (job.minExperience !== undefined ||
      raw.minExperience !== undefined ||
      job.maxExperience !== undefined ||
      raw.maxExperience !== undefined)
  ) {
    const min = job.minExperience ?? raw.minExperience ?? 0;
    const max = job.maxExperience ?? raw.maxExperience ?? min;
    experience = min === max ? `${min} Yrs` : `${min} - ${max} Yrs`;
  }

  // Salary Range
  const salary =
    job.salaryRange ||
    job.salary ||
    raw.salaryRange ||
    raw.salary ||
    (job.minSalary && job.maxSalary ? `₹${job.minSalary} - ₹${job.maxSalary}` : undefined) ||
    (raw.minSalary && raw.maxSalary ? `₹${raw.minSalary} - ₹${raw.maxSalary}` : undefined);

  // Gender Requirement
  const gender =
    job.genderRequirement ||
    job.gender ||
    raw.genderRequirement ||
    raw.gender;

  // Detailed JD Link
  const detailedJdUrl =
    job.detailedJdUrl ||
    raw.detailedJdUrl ||
    job.jdUrl ||
    raw.jdUrl;

  // About Company
  const aboutCompany =
    job.aboutCompany ||
    raw.aboutCompany ||
    job.companyProfile ||
    raw.companyProfile ||
    job.companyDescription ||
    raw.companyDescription;

  // Job Description
  const jobDescription =
    job.description ||
    raw.description ||
    job.jobDescription ||
    raw.jobDescription;

  // Recruiter Details
  const recruiterName =
    userProfile?.name ||
    userProfile?.fullname ||
    user?.displayName ||
    job.createdBy?.name ||
    raw.recruiterName ||
    'Recruiting Team';

  const recruiterPhone =
    userProfile?.phone ||
    userProfile?.phoneNumber ||
    userProfile?.contactNumber ||
    user?.phoneNumber ||
    raw.recruiterPhone ||
    '';

  const whatsappSessionId =
    userProfile?.whatsappSessionId || raw.whatsappSessionId || '';
  const whatsappSessionPasscode =
    userProfile?.whatsappSessionPasscode || raw.whatsappSessionPasscode || '';

  return {
    gender: gender && gender !== 'Any' ? gender : undefined,
    location: location ? String(location) : undefined,
    education: qualification ? String(qualification) : undefined,
    qualification: qualification ? String(qualification) : undefined,
    experience: experience ? String(experience) : undefined,
    salary: salary ? String(salary) : undefined,
    detailedJdUrl: detailedJdUrl ? String(detailedJdUrl) : undefined,
    aboutCompany: aboutCompany ? String(aboutCompany) : undefined,
    companyDescription: aboutCompany ? String(aboutCompany) : undefined,
    jobDescription: jobDescription ? String(jobDescription) : undefined,
    recruiterName: String(recruiterName),
    recruiterPhone: String(recruiterPhone),
    whatsappSessionId: String(whatsappSessionId),
    whatsappSessionPasscode: String(whatsappSessionPasscode),
  };
}
