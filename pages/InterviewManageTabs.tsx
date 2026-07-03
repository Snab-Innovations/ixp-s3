import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';

interface InterviewManageTabsProps {
  interviewId: string;
}

const InterviewManageTabs: React.FC<InterviewManageTabsProps> = ({ interviewId }) => {
  const tabs = [
    { label: 'Overview', href: `/recruiter/interview/${interviewId}/overview`, icon: 'fas fa-layer-group' },
    { label: 'Responses', href: `/recruiter/interview/${interviewId}/responses`, icon: 'fas fa-inbox' },
    { label: 'Candidates', href: `/recruiter/interview/${interviewId}/candidates`, icon: 'fas fa-users' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs.map((tab) => (
        <NavLink
          key={tab.href}
          to={tab.href}
          className={({ isActive }) =>
            cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
              isActive
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:bg-[#111] dark:text-gray-300 dark:hover:bg-white/5'
            )
          }
        >
          <i className={tab.icon}></i>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </div>
  );
};

export default InterviewManageTabs;
