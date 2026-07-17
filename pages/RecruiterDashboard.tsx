import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Interview } from '../types';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { ArrowRight, ClipboardList, ListChecks, Video } from 'lucide-react';
import { useCompanyRateLimits } from '../hooks/useRecruiterRateLimits';
import { getRateLimitReachedMessage, isRateLimitReached, RateLimitResource } from '../services/rateLimitService';
import { useMessageBox } from '../components/MessageBox';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../components/ui/line-chart';

type TimestampLike =
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
    }
  | Date
  | string
  | null
  | undefined;

interface RecruiterJobRecord {
  id: string;
  title?: string;
  companyName?: string;
  location?: string;
  category?: string;
  employmentType?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  postedAt?: TimestampLike;
  applyDeadline?: TimestampLike;
  recruiterUID?: string;
}

interface RecruiterInterviewRecord extends Partial<Interview> {
  id: string;
  recruiterUID?: string;
  title?: string;
  description?: string;
  department?: string;
  employmentType?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  deadline?: TimestampLike;
  candidateEmails?: string[];
  isMock?: boolean;
}

interface RecruiterTestRecord {
  id: string;
  title?: string;
  createdAt?: TimestampLike;
  questions?: unknown[];
}

interface InterviewAttemptRecord {
  id: string;
  interviewId?: string;
  submittedAt?: TimestampLike;
}

interface DashboardRoleEntry {
  id: string;
  title: string;
  location: string;
  companyName?: string;
  category?: string;
  employmentType?: string;
  createdAt?: TimestampLike;
  deadline?: TimestampLike;
  sourceLabel: 'Job Post' | 'Interview' | 'Synced';
  hasJobDoc: boolean;
  hasInterviewDoc: boolean;
  candidateEmails: string[];
}

const toMillis = (value: TimestampLike): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const formatDate = (value: TimestampLike, options?: Intl.DateTimeFormatOptions): string => {
  const millis = toMillis(value);
  if (!millis) return 'N/A';
  return new Date(millis).toLocaleDateString('en-GB', options || {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const normalizeInterviewTitle = (title?: string) => {
  if (!title) return 'Untitled Role';
  return title.replace(/\s+Interview$/i, '').trim() || 'Untitled Role';
};

const getLocalDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const activityChartConfig = {
  roles: {
    label: 'Roles',
    color: '#7c9cff',
  },
  assessments: {
    label: 'Assessments',
    color: '#71c38d',
  },
  responses: {
    label: 'Responses',
    color: '#f4b94f',
  },
} satisfies ChartConfig;

const SkeletonBlock = ({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`animate-pulse rounded-[6px] bg-white/[0.07] ${className}`} {...props} />
);

export const RecruiterDashboardSkeleton = () => (
  <div className="w-full bg-[#000] text-white">
    <section className="border-b border-white/[0.11]">
      <div className="px-4 py-5 sm:px-6 lg:px-7">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="mt-2 h-8 w-64 max-w-full" />
      </div>

      <div className="border-t border-white/[0.11]">
        <div className="grid grid-cols-1 divide-y divide-white/[0.11] sm:grid-cols-2 xl:grid-cols-5 xl:divide-x xl:divide-y-0">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
              <SkeletonBlock className="h-4 w-20" />
              <div className="mt-2 flex items-baseline gap-2.5">
                <SkeletonBlock className="h-7 w-10" />
                <SkeletonBlock className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="grid grid-cols-1 border-b border-white/[0.11] lg:grid-cols-[minmax(0,2fr)_1px_minmax(260px,0.84fr)]">
      <div className="px-4 py-5 sm:px-6 lg:pl-7 lg:pr-8">
        <div className="flex h-full min-h-[276px] flex-col">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="mt-1 h-4 w-64 max-w-full" />
          <div className="mt-5 grid h-[174px] grid-cols-7 items-end gap-3">
            {[42, 58, 35, 70, 46, 62, 82].map((height, index) => (
              <SkeletonBlock key={index} className="w-full" style={{ height: `${height}%` } as React.CSSProperties} />
            ))}
          </div>
          <div className="mt-3 flex gap-4">
            <SkeletonBlock className="h-4 w-16" />
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-4 w-20" />
          </div>
        </div>
      </div>

      <div className="h-px bg-white/[0.11] lg:h-auto lg:w-px" />

      <div className="px-4 py-5 sm:px-6 lg:pl-7 lg:pr-7">
        <div className="flex h-full min-h-[276px] flex-col justify-center">
          <SkeletonBlock className="h-5 w-28" />
          <SkeletonBlock className="mt-1 h-4 w-64 max-w-full" />
          <div className="mt-3 border border-white/[0.11]">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 border-b border-white/[0.11] px-3.5 py-3 last:border-b-0">
                <SkeletonBlock className="h-8 w-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-4 w-32" />
                  <SkeletonBlock className="mt-1 h-3 w-40" />
                </div>
                <SkeletonBlock className="h-3.5 w-3.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

    <div className="border-b border-white/[0.11]">
      <div className="px-4 py-5 sm:px-6 lg:px-7">
        <SkeletonBlock className="h-5 w-36" />
        <SkeletonBlock className="mt-1 h-4 w-80 max-w-full" />
      </div>
      <div className="border-t border-white/[0.11]">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[minmax(180px,1.4fr)_0.7fr_0.7fr_0.7fr_0.5fr] gap-4 border-b border-white/[0.11] px-4 py-3 last:border-b-0 sm:px-6 lg:px-7">
            <div>
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="mt-1 h-3 w-24" />
            </div>
            <SkeletonBlock className="h-5 w-20" />
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const RecruiterDashboard: React.FC = () => {
  const { user, userProfile } = useAuth();
  const { status: rateLimitStatus } = useCompanyRateLimits();
  const messageBox = useMessageBox();
  const [jobDocs, setJobDocs] = useState<RecruiterJobRecord[]>([]);
  const [interviews, setInterviews] = useState<RecruiterInterviewRecord[]>([]);
  const [tests, setTests] = useState<RecruiterTestRecord[]>([]);
  const [attempts, setAttempts] = useState<InterviewAttemptRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingInterviews, setLoadingInterviews] = useState(true);
  const [loadingTests, setLoadingTests] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(true);

  useEffect(() => {
    if (!user) {
      setJobDocs([]);
      setInterviews([]);
      setTests([]);
      setAttempts([]);
      setLoadingJobs(false);
      setLoadingInterviews(false);
      setLoadingTests(false);
      setLoadingAttempts(false);
      return;
    }

    setLoadingJobs(true);
    setLoadingInterviews(true);
    setLoadingTests(true);

    const jobsQuery = query(collection(db, 'jobs'), where('recruiterUID', '==', user.uid));
    const interviewsQuery = query(collection(db, 'interviews'), where('recruiterUID', '==', user.uid));
    const testsQuery = query(collection(db, 'tests'), where('recruiterUID', '==', user.uid));

    const unsubscribeJobs = onSnapshot(
      jobsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        } as RecruiterJobRecord));
        setJobDocs(records);
        setLoadingJobs(false);
      },
      (error) => {
        console.error('Error fetching recruiter jobs:', error);
        setJobDocs([]);
        setLoadingJobs(false);
      }
    );

    const unsubscribeInterviews = onSnapshot(
      interviewsQuery,
      (snapshot) => {
        const records = snapshot.docs
          .map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          } as RecruiterInterviewRecord))
          .filter((record) => record.isMock !== true);
        setInterviews(records);
        setLoadingInterviews(false);
      },
      (error) => {
        console.error('Error fetching recruiter interviews:', error);
        setInterviews([]);
        setLoadingInterviews(false);
      }
    );

    const unsubscribeTests = onSnapshot(
      testsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        } as RecruiterTestRecord));
        setTests(records);
        setLoadingTests(false);
      },
      (error) => {
        console.error('Error fetching recruiter tests:', error);
        setTests([]);
        setLoadingTests(false);
      }
    );

    return () => {
      unsubscribeJobs();
      unsubscribeInterviews();
      unsubscribeTests();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAttempts([]);
      setLoadingAttempts(false);
      return;
    }

    const interviewIds = interviews.map((interview) => interview.id);
    if (interviewIds.length === 0) {
      setAttempts([]);
      setLoadingAttempts(false);
      return;
    }

    setLoadingAttempts(true);

    const attemptsByInterview = new Map<string, InterviewAttemptRecord[]>();
    const initializedInterviews = new Set<string>();

    const syncAttemptState = () => {
      const mergedAttempts = Array.from(attemptsByInterview.values())
        .flat()
        .sort((left, right) => toMillis(right.submittedAt) - toMillis(left.submittedAt));
      setAttempts(mergedAttempts);
    };

    const unsubscribers = interviewIds.map((interviewId) => {
      const attemptsQuery = collection(db, 'interviews', interviewId, 'attempts');
      return onSnapshot(
        attemptsQuery,
        (snapshot) => {
          attemptsByInterview.set(
            interviewId,
            snapshot.docs.map((snapshotDoc) => ({
              id: snapshotDoc.id,
              ...snapshotDoc.data(),
            } as InterviewAttemptRecord))
          );
          syncAttemptState();

          if (!initializedInterviews.has(interviewId)) {
            initializedInterviews.add(interviewId);
            if (initializedInterviews.size === interviewIds.length) {
              setLoadingAttempts(false);
            }
          }
        },
        (error) => {
          console.error('Error fetching interview attempts:', error);
          attemptsByInterview.set(interviewId, []);
          syncAttemptState();

          if (!initializedInterviews.has(interviewId)) {
            initializedInterviews.add(interviewId);
            if (initializedInterviews.size === interviewIds.length) {
              setLoadingAttempts(false);
            }
          }
        }
      );
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [interviews, user]);

  const dashboardRoles = useMemo<DashboardRoleEntry[]>(() => {
    const roleMap = new Map<string, DashboardRoleEntry>();

    jobDocs.forEach((job) => {
      roleMap.set(job.id, {
        id: job.id,
        title: job.title || 'Untitled Role',
        location: job.location || 'Remote',
        companyName: job.companyName,
        category: job.category,
        employmentType: job.employmentType,
        createdAt: job.createdAt || job.postedAt || job.updatedAt,
        deadline: job.applyDeadline,
        sourceLabel: 'Job Post',
        hasJobDoc: true,
        hasInterviewDoc: false,
        candidateEmails: [],
      });
    });

    interviews.forEach((interview) => {
      const existingEntry = roleMap.get(interview.id);
      const interviewEntry: DashboardRoleEntry = {
        id: interview.id,
        title: normalizeInterviewTitle(interview.title),
        location: existingEntry?.location || 'Remote',
        companyName: existingEntry?.companyName,
        category: interview.department || existingEntry?.category,
        employmentType: interview.employmentType || existingEntry?.employmentType,
        createdAt: existingEntry?.createdAt || interview.createdAt || interview.updatedAt,
        deadline: existingEntry?.deadline || interview.deadline,
        sourceLabel: existingEntry ? 'Synced' : 'Interview',
        hasJobDoc: existingEntry?.hasJobDoc || false,
        hasInterviewDoc: true,
        candidateEmails: interview.candidateEmails || existingEntry?.candidateEmails || [],
      };

      if (existingEntry) {
        roleMap.set(interview.id, {
          ...existingEntry,
          ...interviewEntry,
          title: existingEntry.title || interviewEntry.title,
          location: existingEntry.location || interviewEntry.location,
          sourceLabel: 'Synced',
          hasJobDoc: true,
          hasInterviewDoc: true,
          candidateEmails: interviewEntry.candidateEmails,
        });
      } else {
        roleMap.set(interview.id, interviewEntry);
      }
    });

    return Array.from(roleMap.values()).sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
  }, [interviews, jobDocs]);

  const attemptsByInterview = useMemo(() => {
    return attempts.reduce((accumulator, attempt) => {
      if (!attempt.interviewId) return accumulator;
      accumulator.set(attempt.interviewId, (accumulator.get(attempt.interviewId) || 0) + 1);
      return accumulator;
    }, new Map<string, number>());
  }, [attempts]);

  const pendingReviewCount = useMemo(() => {
    return interviews.reduce((total, interview) => {
      const invitedCount = interview.candidateEmails?.length || 0;
      const submittedCount = attemptsByInterview.get(interview.id) || 0;
      return total + Math.max(invitedCount - submittedCount, 0);
    }, 0);
  }, [attemptsByInterview, interviews]);

  const activityData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const buckets = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const dayKey = getLocalDayKey(day);

      return {
        dayKey,
        date: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        roles: 0,
        assessments: 0,
        responses: 0,
      };
    });

    const bucketMap = new Map(buckets.map((bucket) => [bucket.dayKey, bucket]));

    const incrementBucket = (
      value: TimestampLike,
      key: 'roles' | 'assessments' | 'responses'
    ) => {
      const millis = toMillis(value);
      if (!millis) return;

      const bucketDate = new Date(millis);
      bucketDate.setHours(0, 0, 0, 0);
      const dayKey = getLocalDayKey(bucketDate);
      const bucket = bucketMap.get(dayKey);
      if (bucket) bucket[key] += 1;
    };

    dashboardRoles.forEach((role) => incrementBucket(role.createdAt, 'roles'));
    tests.forEach((test) => incrementBucket(test.createdAt, 'assessments'));
    attempts.forEach((attempt) => incrementBucket(attempt.submittedAt, 'responses'));

    return buckets;
  }, [attempts, dashboardRoles, tests]);

  const hasActivity = activityData.some(
    (bucket) => bucket.roles > 0 || bucket.assessments > 0 || bucket.responses > 0
  );

  const loading = loadingJobs || loadingInterviews || loadingTests || loadingAttempts;

  const getRoleStatus = (role: DashboardRoleEntry) => {
    const deadlineMillis = toMillis(role.deadline);
    if (deadlineMillis && deadlineMillis < Date.now()) {
      return {
        label: 'Expired',
        className:
          'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20',
      };
    }

    return {
      label: 'Active',
      className:
        'bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20',
    };
  };

  const activeJobPosts = dashboardRoles.filter((role) => getRoleStatus(role).label === 'Active');
  const visibleJobPosts = activeJobPosts.slice(0, 4);

  const recruiterName =
    userProfile?.fullname ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'there';

  const quickActions = [
    {
      label: 'Create Interview',
      description: 'Questions and invites.',
      href: '/recruiter/interview/create',
      icon: Video,
      resource: 'interviews' as RateLimitResource,
    },
    {
      label: 'Create Assessment',
      description: 'Screening test setup.',
      href: '/recruiter/tests/create?type=aptitude',
      icon: ClipboardList,
      resource: 'assessments' as RateLimitResource,
    },
    {
      label: 'Manage Interviews',
      description: 'Workflows and reports.',
      href: '/recruiter/interviews',
      icon: ListChecks,
      resource: null,
    },
  ];

  if (loading) {
    return <RecruiterDashboardSkeleton />;
  }

  return (
    <div className="w-full bg-[#000] text-white">
      <section className="border-b border-white/[0.11]">
        <div className="px-4 py-5 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">
            Recruiter Overview
          </p>
          <h2 className="geist-page-title mt-2 text-white">
            Welcome back, {recruiterName}
          </h2>
        </div>

        <div className="border-t border-white/[0.11]">
          <div className="grid grid-cols-1 divide-y divide-white/[0.11] sm:grid-cols-2 xl:grid-cols-5 xl:divide-x xl:divide-y-0">
            <div className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
              <p className="geist-label text-[#6b7280]">Jobs</p>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="geist-metric text-white">{dashboardRoles.length}</span>
                <span className="geist-caption text-[#6b7280]">{activeJobPosts.length} active</span>
              </div>
            </div>

            <div className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
              <p className="geist-label text-[#6b7280]">Interviews</p>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="geist-metric text-white">{interviews.length}</span>
                <span className="geist-caption text-[#6b7280]">{attempts.length} reports</span>
              </div>
            </div>

            <div className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
              <p className="geist-label text-[#6b7280]">Pending</p>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="geist-metric text-white">{pendingReviewCount}</span>
                <span className="geist-caption text-[#6b7280]">awaiting review</span>
              </div>
            </div>

            <Link to="/recruiter/tests" className="min-h-[76px] px-4 py-4 transition-colors hover:bg-white/[0.025] sm:px-6 lg:px-7">
              <p className="geist-label text-[#6b7280]">Assessments</p>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="geist-metric text-white">{tests.length}</span>
                <span className="geist-caption text-[#6b7280]">screening tests</span>
              </div>
            </Link>

            <div className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
              <p className="geist-label text-[#6b7280]">Responses</p>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="geist-metric text-white">{attempts.length}</span>
                <span className="geist-caption text-[#6b7280]">submitted</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 border-b border-white/[0.11] lg:grid-cols-[minmax(0,2fr)_1px_minmax(260px,0.84fr)]">
        <div className="px-4 py-5 sm:px-6 lg:pl-7 lg:pr-8">
          <div className="flex h-full min-h-[276px] flex-col">
            <div className="mb-3 text-left">
              <h3 className="geist-section-title text-white">Recruitment Activity</h3>
              <p className="geist-small mt-0.5 text-[#8f8f8f]">
                Live graph tracking roles created over time.
              </p>
            </div>
            <div className="min-h-[210px] flex-1 w-full">
              {hasActivity ? (
                <div className="flex h-full min-h-[210px] flex-col">
                  <ChartContainer config={activityChartConfig} className="h-[174px] w-full flex-none aspect-auto">
                  <LineChart data={activityData} margin={{ left: -18, right: 10, top: 8, bottom: 0 }}>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="4 8"
                    />
                    <XAxis
                      dataKey="date"
                      tickMargin={8}
                      tick={{ fill: '#8f8f8f', fontSize: 12, fontFamily: 'var(--font-geist-mono, var(--font-mono))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      width={30}
                      tick={{ fill: '#8f8f8f', fontSize: 12, fontFamily: 'var(--font-geist-mono, var(--font-mono))' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent hideLabel />}
                    />
                    <Line
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="roles"
                      stroke="var(--color-roles)"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                    <Line
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="assessments"
                      stroke="var(--color-assessments)"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                    <Line
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="responses"
                      stroke="var(--color-responses)"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  </LineChart>
                  </ChartContainer>
                  <div className="geist-small mt-3 flex flex-wrap items-center gap-4 text-[#8f8f8f]">
                    {Object.entries(activityChartConfig).map(([key, item]) => (
                      <span key={key} className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-[2px]"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#9ca3af]">
                    <i className="fas fa-chart-area text-xl"></i>
                  </div>
                  <p className="geist-caption font-medium text-white">No live activity yet</p>
                  <p className="geist-caption mt-2 max-w-md text-[#9ca3af]">
                    New recruiter activity will appear here automatically as roles, assessments, and candidate responses come in.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="h-px bg-white/[0.11] lg:h-auto lg:w-px" />

        <div className="px-4 py-5 text-white sm:px-6 lg:pl-7 lg:pr-7">
          <div className="flex h-full min-h-[276px] flex-col justify-center">
            <div className="mb-3 text-left">
              <h3 className="geist-section-title text-white">Quick Action</h3>
              <p className="geist-small mt-0.5 text-[#8f8f8f]">
                Start a new hiring workflow from one place.
              </p>
            </div>

            <div className="border border-white/[0.11]">
              {quickActions.map((action, index) => {
                const ActionIcon = action.icon;
                const limitReached = action.resource ? isRateLimitReached(rateLimitStatus, action.resource) : false;
                const iconClassName =
                  index === 0
                    ? 'border-white bg-white text-black'
                    : index === 1
                      ? 'border-[#2f6f4f] bg-[#092016] text-[#83d0a3]'
                      : 'border-[#24415e] bg-[#071625] text-[#8bbde8]';

                return (
                  <Link
                    key={action.label}
                    to={action.href}
                    onClick={(event) => {
                      if (!limitReached || !action.resource) return;
                      event.preventDefault();
                      messageBox.showWarning(getRateLimitReachedMessage(action.resource));
                    }}
                    aria-disabled={limitReached}
                    className={`group flex items-center gap-3 border-b border-white/[0.11] px-3.5 py-3 text-left transition-colors last:border-b-0 ${limitReached ? 'cursor-not-allowed opacity-55' : 'hover:bg-white/[0.025]'}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center border ${iconClassName}`}>
                      <ActionIcon size={14} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="geist-caption block font-semibold text-white">{action.label}</span>
                      <span className={`geist-small block ${limitReached ? 'text-red-400' : 'text-[#6b7280]'}`}>
                        {limitReached ? 'Rate limit reached.' : action.description}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#6b7280] transition-transform group-hover:translate-x-0.5 group-hover:text-white" strokeWidth={1.6} />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="border-b border-white/[0.11]">
        <div className="flex flex-col gap-1.5 px-4 py-5 sm:px-6 lg:px-7 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="geist-section-title text-white">Existing Job Posts</h2>
            <p className="geist-caption mt-0.5 text-[#9ca3af]">
              Interview-created roles and synced job posts appear here automatically.
            </p>
          </div>
        </div>

        {visibleJobPosts.length === 0 ? (
          <div className="border-t border-dashed border-white/[0.11] py-10 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#6b7280]">
              <i className="fas fa-clipboard-list text-base"></i>
            </div>
            <p className="geist-caption mb-4 text-[#9ca3af]">
              No active recruiter-owned roles are live yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden border-t border-white/[0.11] bg-black">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.11]">
                <thead className="bg-[#080808]">
                  <tr>
                    <th className="geist-label px-4 py-2.5 text-left uppercase text-[#6b7280] sm:px-6 lg:px-7">
                      Job title
                    </th>
                    <th className="geist-label px-4 py-2.5 text-left uppercase text-[#6b7280]">
                      Source
                    </th>
                    <th className="geist-label px-4 py-2.5 text-left uppercase text-[#6b7280]">
                      Posted date
                    </th>
                    <th className="geist-label px-4 py-2.5 text-left uppercase text-[#6b7280]">
                      Deadline
                    </th>
                    <th className="geist-label px-4 py-2.5 text-left uppercase text-[#6b7280]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.11]">
                  {visibleJobPosts.map((role) => {
                    const roleStatus = getRoleStatus(role);

                    return (
                      <tr
                        key={role.id}
                        className="group hover:bg-white/[0.025]"
                      >
                        <td className="px-4 py-3 sm:px-6 lg:px-7">
                          <div className="geist-caption font-medium text-white">
                            {role.title}
                          </div>
                          <div className="geist-small mt-0.5 text-[#6b7280]">
                            {role.category || role.companyName || role.location}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="geist-small inline-flex rounded-[6px] border border-[#24364c] bg-[#06111f] px-2 py-0.5 font-medium text-[#8bbde8]">
                            {role.sourceLabel}
                          </span>
                        </td>
                        <td className="geist-label whitespace-nowrap px-4 py-3 text-[#9ca3af]">
                          {formatDate(role.createdAt)}
                        </td>
                        <td className="geist-label whitespace-nowrap px-4 py-3 text-[#9ca3af]">
                          {role.deadline ? formatDate(role.deadline) : 'Open'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`geist-small inline-flex rounded-[6px] px-2 py-0.5 font-medium ${roleStatus.className}`}
                          >
                            {roleStatus.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default RecruiterDashboard;
