import { db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, DocumentReference } from 'firebase/firestore';

export interface ResolvedJobData {
  id: string;
  docRef: DocumentReference;
  collectionName: 'jobs' | 'interviews';
  data: any;
}

/**
 * Normalizes job/interview document data so REST API created jobs and Recruiter Dashboard jobs
 * share consistent property names across the frontend application.
 */
export function normalizeJobData(rawId: string, data: any, collectionName: 'jobs' | 'interviews' = 'jobs') {
  if (!data) return null;

  const category = data.category || data.department || 'General';
  const department = data.department || data.category || 'General';
  const companyName = data.companyName || data.company || 'InterviewXpert Partner';
  const company = data.company || data.companyName || 'InterviewXpert Partner';
  const salaryRange = data.salaryRange || data.salary || '';
  const salary = data.salary || data.salaryRange || '';
  const location = data.location || data.city || 'Remote';
  const jobNo = data.jobNo ? String(data.jobNo) : '';
  const accessCode = data.accessCode || (jobNo ? jobNo : 'ACCESS');
  const interviewLink = data.interviewLink || `${window.location.origin}/#/interview/${rawId}`;
  
  let expStr = data.experience;
  if (expStr === undefined || expStr === null) {
    if (data.minExperience !== undefined || data.maxExperience !== undefined) {
      expStr = `${data.minExperience || 0} - ${data.maxExperience || 0} Years`;
    } else {
      expStr = '0 - 2 Years';
    }
  }

  return {
    id: rawId,
    ...data,
    category,
    department,
    companyName,
    company,
    salaryRange,
    salary,
    location,
    jobNo,
    accessCode,
    interviewLink,
    experience: String(expStr),
    skills: Array.isArray(data.skills) ? data.skills : (typeof data.skills === 'string' ? data.skills.split(',').map((s: string) => s.trim()) : []),
    status: data.status || 'Active',
    collectionName
  };
}

/**
 * Resolves a job or interview document by ID or numerical/string jobNo.
 * Strategy 1: Direct Document Lookup in 'jobs' then 'interviews'
 * Strategy 2: Fallback Query by jobNo in 'jobs' then 'interviews'
 */
export async function resolveJobOrInterviewDocument(idOrJobNoParam: string): Promise<ResolvedJobData | null> {
  if (!idOrJobNoParam) return null;
  const paramStr = String(idOrJobNoParam).trim();
  if (!paramStr) return null;

  // Strategy 1: Direct Document Lookup in 'jobs'
  try {
    const jobRef = doc(db, 'jobs', paramStr);
    const jobSnap = await getDoc(jobRef);
    if (jobSnap.exists()) {
      return {
        id: jobSnap.id,
        docRef: jobRef,
        collectionName: 'jobs',
        data: normalizeJobData(jobSnap.id, jobSnap.data(), 'jobs')
      };
    }
  } catch (err) {
    console.warn("Direct lookup in 'jobs' failed or threw error:", err);
  }

  // Strategy 1b: Direct Document Lookup in 'interviews'
  try {
    const intRef = doc(db, 'interviews', paramStr);
    const intSnap = await getDoc(intRef);
    if (intSnap.exists()) {
      return {
        id: intSnap.id,
        docRef: intRef,
        collectionName: 'interviews',
        data: normalizeJobData(intSnap.id, intSnap.data(), 'interviews')
      };
    }
  } catch (err) {
    console.warn("Direct lookup in 'interviews' failed or threw error:", err);
  }

  // Strategy 2: Fallback Query by jobNo in 'jobs'
  try {
    const qJobsStr = query(collection(db, 'jobs'), where('jobNo', '==', paramStr));
    const snapJobsStr = await getDocs(qJobsStr);
    if (!snapJobsStr.empty) {
      const matchDoc = snapJobsStr.docs[0];
      return {
        id: matchDoc.id,
        docRef: matchDoc.ref,
        collectionName: 'jobs',
        data: normalizeJobData(matchDoc.id, matchDoc.data(), 'jobs')
      };
    }

    if (!isNaN(Number(paramStr))) {
      const qJobsNum = query(collection(db, 'jobs'), where('jobNo', '==', Number(paramStr)));
      const snapJobsNum = await getDocs(qJobsNum);
      if (!snapJobsNum.empty) {
        const matchDoc = snapJobsNum.docs[0];
        return {
          id: matchDoc.id,
          docRef: matchDoc.ref,
          collectionName: 'jobs',
          data: normalizeJobData(matchDoc.id, matchDoc.data(), 'jobs')
        };
      }
    }
  } catch (err) {
    console.warn("Fallback query by jobNo in 'jobs' failed:", err);
  }

  // Strategy 2b: Fallback Query by jobNo in 'interviews'
  try {
    const qIntStr = query(collection(db, 'interviews'), where('jobNo', '==', paramStr));
    const snapIntStr = await getDocs(qIntStr);
    if (!snapIntStr.empty) {
      const matchDoc = snapIntStr.docs[0];
      return {
        id: matchDoc.id,
        docRef: matchDoc.ref,
        collectionName: 'interviews',
        data: normalizeJobData(matchDoc.id, matchDoc.data(), 'interviews')
      };
    }

    if (!isNaN(Number(paramStr))) {
      const qIntNum = query(collection(db, 'interviews'), where('jobNo', '==', Number(paramStr)));
      const snapIntNum = await getDocs(qIntNum);
      if (!snapIntNum.empty) {
        const matchDoc = snapIntNum.docs[0];
        return {
          id: matchDoc.id,
          docRef: matchDoc.ref,
          collectionName: 'interviews',
          data: normalizeJobData(matchDoc.id, matchDoc.data(), 'interviews')
        };
      }
    }
  } catch (err) {
    console.warn("Fallback query by jobNo in 'interviews' failed:", err);
  }

  return null;
}

/**
 * Subscribes to real-time updates for a job/interview document using Document ID or jobNo resolution.
 */
export function subscribeToJobOrInterview(
  idOrJobNoParam: string,
  onData: (data: any | null, resolved: ResolvedJobData | null) => void,
  onError?: (err: any) => void
): () => void {
  let activeUnsubscribe: (() => void) | null = null;
  let isCancelled = false;

  resolveJobOrInterviewDocument(idOrJobNoParam)
    .then((resolved) => {
      if (isCancelled) return;
      if (!resolved) {
        onData(null, null);
        return;
      }

      activeUnsubscribe = onSnapshot(
        resolved.docRef,
        (snap) => {
          if (!snap.exists()) {
            onData(null, null);
          } else {
            const normalized = normalizeJobData(snap.id, snap.data(), resolved.collectionName);
            onData(normalized, { ...resolved, data: normalized });
          }
        },
        (err) => {
          if (onError) onError(err);
          else console.error("Error in job subscription:", err);
        }
      );
    })
    .catch((err) => {
      if (onError) onError(err);
      else console.error("Error resolving job document:", err);
    });

  return () => {
    isCancelled = true;
    if (activeUnsubscribe) activeUnsubscribe();
  };
}
