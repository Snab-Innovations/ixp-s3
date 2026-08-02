import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { AuditLog } from '../types';

/**
 * Log a team activity event to Cloud Firestore
 */
export async function logTeamActivity(
  teamId: string,
  action: 'job_created' | 'interview_created' | 'candidate_added' | 'test_created' | 'secondary_recruiter_added' | 'status_updated' | 'resume_uploaded',
  details: string,
  performedBy: {
    uid: string;
    name?: string;
    email?: string;
    role?: string;
    designation?: string;
  }
): Promise<void> {
  if (!teamId) return;

  try {
    await addDoc(collection(db, 'auditLogs'), {
      teamId,
      action,
      details,
      performedBy: {
        uid: performedBy.uid || '',
        name: performedBy.name || performedBy.email || 'Team Member',
        email: performedBy.email || '',
        role: performedBy.role || 'recruiter',
        designation: performedBy.designation || 'Recruiter'
      },
      createdAt: serverTimestamp(),
      isoTimestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Audit Log Error]', err);
  }
}

/**
 * Subscribe to real-time audit logs for a specific team
 */
export function subscribeTeamAuditLogs(
  teamId: string,
  callback: (logs: AuditLog[]) => void
): () => void {
  if (!teamId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'auditLogs'),
    where('teamId', '==', teamId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const logs: AuditLog[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          teamId: data.teamId,
          action: data.action,
          details: data.details,
          performedBy: data.performedBy || {},
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.isoTimestamp || new Date().toISOString()
        };
      });
      callback(logs);
    },
    (err) => {
      console.warn('[Audit Logs Subscription Warning]', err);
      // Fallback query without orderBy if index is building
      const fallbackQuery = query(collection(db, 'auditLogs'), where('teamId', '==', teamId));
      getDocs(fallbackQuery).then(snapshot => {
        const logs: AuditLog[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            teamId: data.teamId,
            action: data.action,
            details: data.details,
            performedBy: data.performedBy || {},
            createdAt: data.isoTimestamp || new Date().toISOString()
          };
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(logs);
      }).catch(() => callback([]));
    }
  );
}
