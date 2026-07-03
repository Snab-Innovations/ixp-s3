import React from 'react';
import {
  BriefcaseBusiness,
  ClipboardList,
  LayoutDashboard,
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
        match: (path) => path === '/recruiter/interviews' || path.startsWith('/recruiter/interview/responses'),
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
        'group flex w-full items-center justify-between rounded-[6px] px-2.5 py-[7px] text-left transition-all duration-200',
        isActive
          ? 'bg-muted text-foreground font-medium shadow-sm'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <item.icon
          className={cn(
            'size-4 shrink-0 transition-colors',
            isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
          )}
          strokeWidth={1.5}
        />
        <span className="truncate text-[13px]">{item.title}</span>
      </span>

      <span className="flex items-center gap-2">
        {item.shortcut && (
          <kbd className="hidden h-5 items-center justify-center rounded-[4px] border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm group-hover:inline-flex">
            {item.shortcut}
          </kbd>
        )}
        {item.badge && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
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

  return (
      <aside className={cn('flex h-full w-[218px] flex-col border-r border-border bg-card/80 p-2.5 pt-5 font-sans', className)}>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {recruiterNavGroups.map((group, index) => (
            <div key={group.heading || index} className="flex flex-col gap-0.5">
              {group.heading && (
                <span className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.heading}
                </span>
              )}
              {group.items.map((item) => (
                <NavItem key={item.id} item={item} activePath={activePath} onNavigate={handleNavigate} />
              ))}
            </div>
          ))}
        </div>
      </aside>
  );
}

export default DashboardSidebar;
