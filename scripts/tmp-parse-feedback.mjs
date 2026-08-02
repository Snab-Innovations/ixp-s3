const feedback = `**Resume Analysis:**
- The resume demonstrates practical DevOps experience with AWS (EC2, IAM, S3, EKS), Docker, Kubernetes, and CI/CD tools (GitHub Actions, Jenkins), aligning well with the JD requirements for AWS, Docker, and Kubernetes.
- Key Strength: Strong project portfolio including a Jenkins CI/CD pipeline with DevSecOps implementation and production deployments on AWS EC2/Kubernetes.
- Key Weakness: No Azure experience (mentioned in JD), and limited professional experience (only internship + current role as a student).

**Answer Quality:**
- Q1 (Work Experience): Extremely vague and incomplete - candidate failed to articulate job title, daily responsibilities, or specific achievements.
- Q2 (Technical Deep Dive): Complete inability to provide any specific example of a security vulnerability detected or how it was resolved - simply stated "No, I don't know."
- Overall Technical Skills Assessment: Despite resume showing DevSecOps implementation, candidate couldn't demonstrate practical understanding or communicate technical details.

**Communication Skills:**
Fluency in English / Hindi / Marathi: Good - Able to communicate in English
Clarity of Speech: Poor - Very brief responses, lacked detail and articulation
Confidence Level: Low - Seemed uncertain and unprepared
Grammar & Vocabulary: Good - Basic grammar was correct
Listening Skills: Good - Responded to questions asked
Professional Tone: Casual - Too informal ("So I work for my company, for DevOps. So, yeah.")
Pronunciation / Accent Neutrality: Neutral - Clear pronunciation
Ability to Explain Experience: Poor - Could not elaborate on own experience
Response Speed & Presence of Mind: Poor - Slow to respond, couldn't provide substantive answers
Telephone Etiquette: Good - Polite and courteous
Interpersonal Skills: Average - Basic interaction
Overall Communication Rating: 4/10
Detailed Style Analysis: The candidate demonstrated poor communication skills during the interview.

**Overall Evaluation:**
The candidate has a technically relevant resume with good DevOps project experience, but completely failed to demonstrate this during the interview.

**Verdict:** Leaning No

**Scores:**
Resume Score: 75/100
Q&A Score: 15/100
`;

const summaryMatch = feedback.match(/\*\*Overall Evaluation:\*\*([\s\S]*?)(?=\*\*Verdict:\*\*|\*\*Scores:\*\*|$)/);
const roleFitMatch = feedback.match(/\*\*Resume Analysis:\*\*([\s\S]*?)(?=\*\*Answer Quality:\*\*|\*\*Scores:\*\*|$)/);
console.log('summary', summaryMatch?.[1]?.trim()?.slice(0, 120));
console.log('roleFit', roleFitMatch?.[1]?.trim()?.slice(0, 120));
