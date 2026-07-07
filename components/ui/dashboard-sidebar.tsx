import React from 'react';
import {
  BriefcaseBusiness,
  ClipboardList,
  LayoutDashboard,
  Archive,
  Users,
  Video,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export type NavItemData = {
  id: string;
  title: string;
  icon: React.ElementType;
  href: string;
  badge?: number | string;
  shortcut?: string;
  match?: (path: string) => boolean;
};

export type NavGroupData = {
  heading?: string;
  items: NavItemData[];
};

const recruiterNavGroups: NavGroupData[] = [
  {
    items: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        icon: LayoutDashboard,
        href: '/recruiter/jobs',
        match: (path) => path === '/recruiter/jobs',
      },
      {
        id: 'interviews',
        title: 'My Interviews',
        icon: Video,
        href: '/recruiter/interviews',
        match: (path) =>
          path === '/recruiter/interviews' ||
          path.startsWith('/recruiter/interview/responses') ||
          (path.startsWith('/recruiter/interview/') && !path.startsWith('/recruiter/interview/create')),
      },
      {
        id: 'candidate-hub',
        title: 'Candidate Hub',
        icon: Users,
        href: '/recruiter/invites',
        match: (path) => path === '/recruiter/invites',
      },
      {
        id: 'resume-dump',
        title: 'Resume Dump',
        icon: Archive,
        href: '/recruiter/resume-dump',
        match: (path) => path === '/recruiter/resume-dump',
      },
      {
        id: 'create-interview',
        title: 'Create Interview',
        icon: BriefcaseBusiness,
        href: '/recruiter/interview/create',
        match: (path) => path === '/recruiter/interview/create',
      },
      {
        id: 'assessments',
        title: 'Assessments',
        icon: ClipboardList,
        href: '/recruiter/tests',
        match: (path) => path.startsWith('/recruiter/tests'),
      },
    ],
  },
];

function NavItem({
  item,
  activePath,
  onNavigate,
}: {
  item: NavItemData;
  activePath: string;
  onNavigate: (href: string) => void;
}) {
  const isActive = item.match ? item.match(activePath) : activePath === item.href;

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.href)}
      className={cn(
        'group flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left transition-all duration-200',
        isActive
          ? 'bg-white/[0.07] text-white font-medium'
          : 'text-[#8f8f8f] hover:bg-white/[0.04] hover:text-white'
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <item.icon
          className={cn(
            'size-[15px] shrink-0 transition-colors',
            isActive ? 'text-white' : 'text-[#6b7280] group-hover:text-white'
          )}
          strokeWidth={1.5}
        />
        <span className="geist-small truncate">{item.title}</span>
      </span>

      <span className="flex items-center gap-2">
        {item.shortcut && (
          <kbd className="hidden h-5 items-center justify-center rounded-[4px] border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm group-hover:inline-flex">
            {item.shortcut}
          </kbd>
        )}
        {item.badge && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.04] px-1.5 text-[10px] font-medium text-white">
            {item.badge}
          </span>
        )}
      </span>
    </button>
  );
}

export function DashboardSidebar({
  className,
  activePath,
  onNavigate,
}: {
  className?: string;
  activePath: string;
  onNavigate: (href: string) => void;
}) {
  const handleNavigate = (href: string) => {
    onNavigate(href);
  };

  const manageMatch = activePath.match(/^\/recruiter\/interview\/([^/]+)(?:\/(overview|responses|candidates))?$/);
  const legacyResponsesMatch = activePath.match(/^\/recruiter\/interview\/responses\/([^/]+)$/);
  const managedInterviewId = legacyResponsesMatch?.[1] || (manageMatch && !['create', 'responses'].includes(manageMatch[1]) ? manageMatch[1] : null);
  const activeManageSection = legacyResponsesMatch ? 'responses' : manageMatch?.[2] || (managedInterviewId ? 'overview' : '');
  const manageSubItems = managedInterviewId
    ? [
        { id: 'overview', title: 'Overview', href: `/recruiter/interview/${managedInterviewId}/overview` },
        { id: 'responses', title: 'Responses', href: `/recruiter/interview/${managedInterviewId}/responses` },
        { id: 'candidates', title: 'Candidates', href: `/recruiter/interview/${managedInterviewId}/candidates` },
      ]
    : [];

  const assessmentResultsMatch = activePath.match(/^\/recruiter\/tests\/([^/]+)\/results$/);
  const activeAssessmentSection = activePath === '/recruiter/tests/create' ? 'create' : assessmentResultsMatch ? 'results' : activePath.startsWith('/recruiter/tests') ? 'overview' : '';
  const assessmentSubItems = activePath.startsWith('/recruiter/tests')
    ? [
        { id: 'overview', title: 'Overview', href: '/recruiter/tests' },
        { id: 'create', title: 'Create', href: '/recruiter/tests/create' },
        ...(assessmentResultsMatch ? [{ id: 'results', title: 'Results', href: `/recruiter/tests/${assessmentResultsMatch[1]}/results` }] : []),
      ]
    : [];

  return (
      <aside className={cn('flex h-full w-[190px] flex-col border-r border-white/[0.11] bg-[#000] p-2 pt-3 font-sans text-white', className)}>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {recruiterNavGroups.map((group, index) => (
            <div key={group.heading || index} className="flex flex-col gap-0.5">
              {group.heading && (
                <span className="geist-label mb-1 px-2 uppercase text-[#6b7280]">
                  {group.heading}
                </span>
              )}
              {group.items.map((item) => (
                <div key={item.id}>
                  <NavItem item={item} activePath={activePath} onNavigate={handleNavigate} />
                  {item.id === 'interviews' && manageSubItems.length > 0 && (
                    <div className="ml-[17px] mt-1 border-l border-white/[0.13] pl-3">
                      <div className="flex flex-col gap-0.5">
                        {manageSubItems.map((subItem) => {
                          const isActive = activeManageSection === subItem.id;
                          return (
                            <button
                              key={subItem.id}
                              type="button"
                              onClick={() => handleNavigate(subItem.href)}
                              className={cn(
                                'group flex w-full items-center rounded-[6px] px-2 py-1.5 text-left transition-colors',
                                isActive
                                  ? 'bg-white/[0.07] text-white font-medium'
                                  : 'text-[#8f8f8f] hover:bg-white/[0.04] hover:text-white'
                              )}
                            >
                              <span className="geist-small truncate">{subItem.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {item.id === 'assessments' && assessmentSubItems.length > 0 && (
                    <div className="ml-[17px] mt-1 border-l border-white/[0.13] pl-3">
                      <div className="flex flex-col gap-0.5">
                        {assessmentSubItems.map((subItem) => {
                          const isActive = activeAssessmentSection === subItem.id;
                          return (
                            <button
                              key={subItem.id}
                              type="button"
                              onClick={() => handleNavigate(subItem.href)}
                              className={cn(
                                'group flex w-full items-center rounded-[6px] px-2 py-1.5 text-left transition-colors',
                                isActive
                                  ? 'bg-white/[0.07] text-white font-medium'
                                  : 'text-[#8f8f8f] hover:bg-white/[0.04] hover:text-white'
                              )}
                            >
                              <span className="geist-small truncate">{subItem.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
  );
}

export default DashboardSidebar;
