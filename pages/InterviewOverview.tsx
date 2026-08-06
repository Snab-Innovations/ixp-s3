import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { db } from '../services/firebase';
import { subscribeToJobOrInterview } from '../services/jobResolutionService';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { InterviewOverviewSkeleton } from '../components/ui/interview-loading-skeleton';
import { Interview } from '../types';
import EditJobModal from './EditJob';

const formatDate = (value: any) => {
  if (!value) return 'N/A';
  const date = value.toDate ? value.toDate() : value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-GB');
};

const formatValue = (value: any) => {
  if (value === undefined || value === null || value === '') return 'N/A';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'N/A';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const getQuestionsCount = (interview: Interview) => {
  const anyInterview = interview as any;
  return interview.questions?.length || ((anyInterview.manualQuestions?.length || 0) + (anyInterview.numQuestions || 0));
};

const ActionButton = ({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
  <button
    {...props}
    className={`geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border px-3 font-medium transition-colors active:translate-y-px ${className}`}
  >
    {children}
  </button>
);

const ActionLink = ({
  children,
  className = '',
  ...props
}: React.ComponentProps<typeof Link> & { children: React.ReactNode }) => (
  <Link
    {...props}
    className={`geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border px-3 font-medium transition-colors active:translate-y-px ${className}`}
  >
    {children}
  </Link>
);

const StatCell = ({ label, value, tone = 'text-white' }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
    <p className="geist-label uppercase text-[#6b7280]">{label}</p>
    <div className="mt-2 flex items-baseline gap-2.5">
      <span className={`geist-metric tabular-nums ${tone}`}>{value}</span>
    </div>
  </div>
);

const InfoLine = ({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) => (
  <div className="grid grid-cols-1 gap-1 border-b border-white/[0.08] px-4 py-3 last:border-b-0 sm:grid-cols-[132px_minmax(0,1fr)]">
    <dt className="geist-label uppercase text-[#6b7280]">{label}</dt>
    <dd className={`${mono ? 'geist-label tabular-nums' : 'geist-caption'} min-w-0 break-words text-[#d4d4d4]`}>
      {formatValue(value)}
    </dd>
  </div>
);

const ConfigTile = ({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) => (
  <div className="min-h-[88px] border-b border-white/[0.08] px-4 py-3 sm:px-6 lg:px-7 xl:border-r xl:last:border-r-0">
    <dt className="geist-label uppercase text-[#6b7280]">{label}</dt>
    <dd className={`${mono ? 'geist-label tabular-nums' : 'geist-caption'} mt-2 break-words text-[#d4d4d4]`}>
      {formatValue(value)}
    </dd>
  </div>
);

const SectionHeader = ({ title, description }: { title: string; description?: string }) => (
  <div className="border-b border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
    <h2 className="geist-section-title text-white">{title}</h2>
    {description && <p className="geist-small mt-0.5 text-[#8f8f8f]">{description}</p>}
  </div>
);

const ListBlock = ({ label, items }: { label: string; items: any[] }) => (
  <div className="border-b border-white/[0.11] last:border-b-0">
    <SectionHeader title={label} />
    {items.length === 0 ? (
      <p className="geist-caption px-4 py-5 text-[#6b7280] sm:px-6 lg:px-7">No records added.</p>
    ) : (
      <div className="divide-y divide-white/[0.08]">
        {items.map((item, index) => (
          <div key={`${label}-${index}`} className="px-4 py-3 sm:px-6 lg:px-7">
            <p className="geist-caption break-words text-[#d4d4d4]">{formatValue(item)}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

const InterviewOverview: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [responsesCount, setResponsesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEffect(() => {
    if (!interviewId || !user) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToJobOrInterview(
      interviewId,
      async (data, resolved) => {
        if (!data || !resolved) {
          setInterview(null);
          setLoading(false);
          return;
        }

        const currentTeamId = userProfile?.teamId || userProfile?.parentRecruiterId || userProfile?.primaryRecruiterUID || user.uid;
        const interviewTeamId = data.teamId || data.recruiterUID;
        const roleLower = (userProfile?.role || '').toLowerCase();
        const isRecruiterRole = roleLower === 'recruiter' || roleLower === 'primary' || roleLower === 'subrecruiter' || roleLower === 'admin' || roleLower === 'owner';
        const isTeamMember = isRecruiterRole || interviewTeamId === currentTeamId || data.recruiterUID === user.uid || (userProfile?.primaryRecruiterUID && data.recruiterUID === userProfile.primaryRecruiterUID);

        if (!isTeamMember) {
          setInterview(null);
          setLoading(false);
          return;
        }

        setInterview(data as Interview);
        try {
          const attemptsCollection = collection(db, resolved.collectionName, resolved.id, 'attempts');
          const attempts = await getDocs(attemptsCollection);
          setResponsesCount(attempts.size);
        } catch (error) {
          console.error('Error loading interview attempts:', error);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error loading interview:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [interviewId, user, userProfile]);

  const details = useMemo(() => {
    if (!interview) return [];
    const anyInterview = interview as any;
    return [
      ['Employment Type', anyInterview.employmentType],
      ['Experience', anyInterview.minExperience !== undefined || anyInterview.maxExperience !== undefined ? `${anyInterview.minExperience || 0} - ${anyInterview.maxExperience || 0} years` : anyInterview.experience],
      ['Education', anyInterview.education],
      ['Skills', anyInterview.skills],
      ['Difficulty', interview.difficulty],
      ['Strictness', interview.strictness],
      ['Duration', interview.duration ? `${interview.duration} minutes` : undefined],
      ['Question Count', getQuestionsCount(interview)],
      ['Responses', responsesCount],
      ['Created At', formatDate(interview.createdAt)],
      ['Updated At', formatDate(interview.updatedAt)],
      ['Deadline', formatDate(anyInterview.deadline)],
      ['Status', interview.status],
      ['Interview ID', interview.id],
    ] as Array<[string, any]>;
  }, [interview, responsesCount]);

  const canDelete = useMemo(() => {
    if (!user || !interview) return false;
    const role = (userProfile?.role || '').toLowerCase();
    if (role === 'guest') return false;
    return true;
  }, [user, userProfile, interview]);

  const handleDelete = () => {
    if (!interview) return;
    if (!canDelete) {
      messageBox.showError('You do not have permission to delete this job.');
      return;
    }
    const title = interview.title || 'this interview';
    messageBox.showConfirm(`Are you sure you want to delete "${title}"?`, async () => {
      try {
        await Promise.all([
          deleteDoc(doc(db, 'interviews', interview.id)).catch(() => {}),
          deleteDoc(doc(db, 'jobs', interview.id)).catch(() => {})
        ]);

        const code = interview.accessCode || (interview as any).jobNo || '';
        if (code) {
          try {
            const [jobsSnap, interviewsSnap] = await Promise.all([
              getDocs(query(collection(db, 'jobs'), where('jobNo', '==', code))),
              getDocs(query(collection(db, 'interviews'), where('accessCode', '==', code)))
            ]);
            await Promise.all([
              ...jobsSnap.docs.map(d => deleteDoc(doc(db, 'jobs', d.id)).catch(() => {})),
              ...interviewsSnap.docs.map(d => deleteDoc(doc(db, 'interviews', d.id)).catch(() => {}))
            ]);
          } catch (e) {
            console.warn("Secondary cleanup by code warning:", e);
          }
        }

        messageBox.showSuccess(`Job "${title}" deleted successfully.`);
        navigate('/recruiter/all-jobs');
      } catch (error) {
        console.error('Error deleting interview:', error);
        messageBox.showError('Error deleting interview');
      }
    });
  };

  if (loading) {
    return <InterviewOverviewSkeleton />;
  }

  if (!interview || !interviewId) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Interview not found</h1>
        <Link to="/recruiter/all-jobs" className="mt-4 inline-flex text-sm font-bold text-primary hover:underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  const anyInterview = interview as any;
  const interviewLink = interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`;
  const manualQuestions = anyInterview.manualQuestions || [];
  const generatedQuestions = interview.questions?.map((question: any) => question.text || question) || [];
  const customFields = anyInterview.customFields || [];
  const candidateEmails = interview.candidateEmails || [];
  const candidateCount = candidateEmails.length;
  const pendingCount = Math.max(candidateCount - responsesCount, 0);
  const description = interview.description || 'No description provided.';

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#000] text-white">

      <section className="sticky top-14 z-20 border-b border-white/[0.11] bg-[#000]">
        <div className="px-4 py-5 sm:px-6 lg:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Link
                  to="/recruiter/all-jobs"
                  className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <i className="fas fa-arrow-left text-[11px]"></i>
                  <span>Back to jobs</span>
                </Link>
                <span className="geist-label uppercase text-[#9ca3af]">Overview</span>
              </div>
              <h1 className="geist-page-title mt-2 max-w-5xl truncate text-white">{interview.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="geist-small rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1 font-medium text-[#d4d4d4]">
                  {interview.department || 'No department'}
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(interview.accessCode || '').then(() => messageBox.showSuccess('Access code copied'))}
                  className="geist-small inline-flex items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="text-[#8f8f8f]">Code</span>
                  <span className="font-mono tracking-wider">{interview.accessCode || 'N/A'}</span>
                  <i className="fas fa-copy text-[10px] text-[#6b7280]"></i>
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(interviewLink).then(() => messageBox.showSuccess('Interview link copied'))}
                  className="geist-small inline-flex items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <i className="fas fa-link text-[10px] text-[#8f8f8f]"></i>
                  <span>Copy link</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <ActionLink
                to={`/interview/${interview.id}`}
                target="_blank"
                className="border-white bg-white text-black hover:bg-[#ededed]"
              >
                <i className="fas fa-external-link-alt text-[11px]"></i>
                <span>Open link</span>
              </ActionLink>
              <ActionButton
                type="button"
                onClick={() => setEditingJobId(interview.id)}
                className="border-white/[0.11] bg-transparent text-[#d4d4d4] hover:bg-white/[0.05] hover:text-white"
              >
                <i className="fas fa-pencil-alt text-[11px]"></i>
                <span>Edit</span>
              </ActionButton>
              {canDelete && (
                <ActionButton
                  type="button"
                  onClick={handleDelete}
                  className="border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 dark:border-[#512828] dark:bg-[#180808] dark:text-[#ff8f8f] dark:hover:bg-[#250d0d] dark:hover:text-[#ffc3c3]"
                >
                  <i className="fas fa-trash text-[11px]"></i>
                  <span>Delete</span>
                </ActionButton>
              )}
            </div>
          </div>
        </div>

      </section>

      <div className="border-b border-white/[0.11]">
        <div className="grid grid-cols-1 divide-y divide-white/[0.11] sm:grid-cols-2 xl:grid-cols-5 xl:divide-x xl:divide-y-0">
          <StatCell label="Responses" value={responsesCount} tone="text-[#83d0a3]" />
          <StatCell label="Candidates" value={candidateCount} />
          <StatCell label="Pending" value={pendingCount} tone="text-[#f5c76b]" />
          <StatCell label="Questions" value={getQuestionsCount(interview)} />
          <StatCell label="Difficulty" value={interview.difficulty || 'Medium'} tone="text-[#8bbde8]" />
        </div>
      </div>

      <div>
        <section className="grid grid-cols-1 items-stretch border-b border-white/[0.11] xl:grid-cols-[minmax(0,2fr)_1px_minmax(330px,0.92fr)]">
          <div className="flex flex-col">
            <div className="flex flex-col gap-3 border-b border-white/[0.11] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-7">
              <div>
                <h2 className="geist-section-title text-white">Job description</h2>
                <p className="geist-small mt-0.5 text-[#8f8f8f]">Preview from the JD.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullDescription(true)}
                className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-transparent px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <i className="fas fa-expand-alt text-[11px]"></i>
                <span>Full view</span>
              </button>
            </div>
            <div className="flex flex-1 items-start overflow-hidden px-4 py-4 sm:px-6 lg:px-7">
              <p
                className="geist-caption max-w-full leading-6 text-[#d4d4d4]"
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 6,
                  overflow: 'hidden',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                {description}
              </p>
            </div>
          </div>

          <div className="h-px bg-white/[0.11] xl:h-auto xl:w-px" />

          <div className="flex flex-col">
            <div className="border-b border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
              <h2 className="geist-section-title text-white">Role snapshot</h2>
              <p className="geist-small mt-0.5 text-[#8f8f8f]">The essentials at a glance.</p>
            </div>
            <InfoLine label="Department" value={interview.department || 'N/A'} />
            <InfoLine label="Employment" value={anyInterview.employmentType} />
            <InfoLine
              label="Experience"
              value={anyInterview.minExperience !== undefined || anyInterview.maxExperience !== undefined ? `${anyInterview.minExperience || 0} - ${anyInterview.maxExperience || 0} years` : anyInterview.experience}
            />
            <InfoLine label="Deadline" value={formatDate(anyInterview.deadline)} mono />
          </div>
        </section>

        <section className="border-b border-white/[0.11]">
          <SectionHeader title="Configuration" description="Core interview settings and timestamps." />
          <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {details.map(([label, value]) => (
              <ConfigTile key={label} label={label} value={value} mono={label.includes('At') || label.includes('ID') || label.includes('Code')} />
            ))}
          </dl>
        </section>

        <section className="grid grid-cols-1 border-b border-white/[0.11] xl:grid-cols-3 xl:divide-x xl:divide-white/[0.11]">
          <ListBlock label="Manual questions" items={manualQuestions} />
          <ListBlock label="Generated questions" items={generatedQuestions} />
          <ListBlock label="Candidate emails" items={candidateEmails} />
        </section>

        <section>
          <SectionHeader title="Custom fields" description="Additional fields collected or attached to this interview." />
          {customFields.length === 0 ? (
            <p className="geist-caption px-4 py-5 text-[#6b7280] sm:px-6 lg:px-7">No custom fields added.</p>
          ) : (
            <dl className="divide-y divide-white/[0.08]">
              {customFields.map((field: any, index: number) => (
                <InfoLine key={field.id || index} label={field.key || `Field ${index + 1}`} value={field.value || field} />
              ))}
            </dl>
          )}
        </section>
      </div>

      {editingJobId && <EditJobModal jobId={editingJobId} onClose={() => setEditingJobId(null)} />}
      {showFullDescription && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[84vh] w-full max-w-3xl flex-col border border-white/[0.14] bg-[#050505] text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.11] px-5 py-4">
              <div className="min-w-0">
                <p className="geist-label uppercase text-[#6b7280]">Full job description</p>
                <h3 className="geist-section-title mt-1 truncate text-white">{interview.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFullDescription(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.11] text-[#8f8f8f] transition-colors hover:bg-white/[0.06] hover:text-white"
                title="Close"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5">
              <p className="geist-caption whitespace-pre-wrap leading-6 text-[#d4d4d4]">{description}</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default InterviewOverview;
