import { AuditLog } from '../types';
import { poll, rds } from './rdsApi';

/**
 * Log a team activity event to Postgres via the data API.
 */
export async function logTeamActivity(
  teamId: string,
  action: string,
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
    await rds.createAuditLog({
      teamId,
      action,
      details,
      performedBy: {
        uid: performedBy.uid || '',
        name: performedBy.name || performedBy.email || 'Team Member',
        email: performedBy.email || '',
        role: performedBy.role || 'recruiter',
        designation: performedBy.designation || 'Recruiter',
      },
      isoTimestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Audit Log Error]', err);
  }
}

/**
 * Poll audit logs for a team (replaces Firestore onSnapshot).
 */
export function subscribeTeamAuditLogs(
  teamId: string,
  callback: (logs: AuditLog[]) => void
): () => void {
  if (!teamId) {
    callback([]);
    return () => {};
  }

  return poll(
    () => rds.listAuditLogs(teamId),
    ({ logs }) => {
      callback(
        (logs || []).map((row: any) => ({
          id: row.id,
          teamId: row.team_id || row.teamId,
          action: row.action,
          details: row.details,
          performedBy: row.performed_by || row.performedBy || {},
          createdAt: row.created_at || row.iso_timestamp || row.isoTimestamp || new Date().toISOString(),
        }))
      );
    },
    (err) => {
      console.warn('[Audit Logs Subscription Warning]', err);
      callback([]);
    },
    10000
  );
}
