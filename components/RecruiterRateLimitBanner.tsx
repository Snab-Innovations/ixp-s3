import React from 'react';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCompanyRateLimits } from '../hooks/useRecruiterRateLimits';
import { isRateLimitReached, type RateLimitResource } from '../services/rateLimitService';

const RESOURCE_LABELS: Record<RateLimitResource, string> = {
  interviews: 'Interviews',
  assessments: 'Assessments',
  codingAssessments: 'Coding exams',
};

const RESOURCES = Object.keys(RESOURCE_LABELS) as RateLimitResource[];

const RecruiterRateLimitBanner: React.FC = () => {
  const { status } = useCompanyRateLimits();
  const reachedResources = status
    ? RESOURCES.filter(resource => isRateLimitReached(status, resource))
    : [];

  if (reachedResources.length === 0) return null;

  return (
    <div role="alert" className="relative z-50 border-b border-red-500/25 bg-[#160606] text-red-100">
      <div className="mx-auto flex min-h-10 w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-center text-xs sm:text-sm">
        <AlertTriangle size={15} className="shrink-0 text-red-400" aria-hidden="true" />
        <span className="font-semibold">Limit reached.</span>
        <span className="text-red-200/75">{reachedResources.map(resource => RESOURCE_LABELS[resource]).join(', ')} cannot accept more candidate submissions.</span>
        <Link to="/contact" className="inline-flex shrink-0 items-center gap-1 font-semibold text-white underline decoration-red-400/60 underline-offset-4 hover:decoration-white">
          Contact InterviewXpert for add-on <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};

export default RecruiterRateLimitBanner;
