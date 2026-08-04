import React from 'react';

const SkeletonBlock = ({ className = '' }: { key?: React.Key; className?: string }) => (
  <div className={`animate-pulse rounded-[6px] bg-white/[0.08] ${className}`} />
);

const SkeletonLine = ({ className = '' }: { key?: React.Key; className?: string }) => (
  <SkeletonBlock className={`h-3 ${className}`} />
);

const Shell = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div
    aria-busy="true"
    aria-label={label}
    className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8"
  >
    {children}
  </div>
);

const HeaderSkeleton = ({ actionCount = 2 }: { actionCount?: number }) => (
  <section className="sticky top-14 z-20 border-b border-white/[0.11] bg-[#000]">
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-8 w-36" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
        <SkeletonBlock className="h-9 w-full max-w-[560px]" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-8 w-20" />
          <SkeletonBlock className="h-8 w-36" />
          <SkeletonBlock className="h-8 w-28" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 xl:justify-end">
        {Array.from({ length: actionCount }).map((_, index) => (
          <SkeletonBlock key={`header-action-${index}`} className="h-8 w-28" />
        ))}
      </div>
    </div>
  </section>
);

const StatsSkeleton = ({ count = 4 }: { count?: number }) => (
  <section className="grid border-b border-white/[0.11] sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`stat-${index}`} className="min-h-[76px] border-b border-white/[0.08] px-4 py-4 sm:px-6 lg:px-7 xl:border-r xl:last:border-r-0">
        <SkeletonLine className="w-20" />
        <SkeletonBlock className="mt-3 h-7 w-16" />
      </div>
    ))}
  </section>
);

const SectionTitleSkeleton = ({ action = false }: { action?: boolean }) => (
  <div className="flex items-start justify-between gap-4 border-b border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
    <div className="min-w-0 flex-1">
      <SkeletonBlock className="h-6 w-44" />
      <SkeletonLine className="mt-3 w-56" />
    </div>
    {action && <SkeletonBlock className="h-9 w-28" />}
  </div>
);

const TableHeaderSkeleton = ({ columns = 5 }: { columns?: number }) => (
  <div className="grid border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:px-7" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {Array.from({ length: columns }).map((_, index) => (
      <SkeletonLine key={`table-header-${index}`} className="w-20" />
    ))}
  </div>
);

const ResponseRowsSkeleton = () => (
  <div className="divide-y divide-white/[0.08]">
    {Array.from({ length: 7 }).map((_, index) => (
      <div key={`response-row-${index}`} className="grid grid-cols-[minmax(220px,1.3fr)_120px_120px_160px_150px] gap-4 px-4 py-4 sm:px-6 lg:px-7">
        <div>
          <SkeletonBlock className="h-4 w-48" />
          <SkeletonLine className="mt-3 w-64" />
        </div>
        <SkeletonBlock className="h-7 w-14" />
        <SkeletonBlock className="h-7 w-24" />
        <SkeletonBlock className="h-4 w-32" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-8 w-16" />
          <SkeletonBlock className="h-8 w-20" />
        </div>
      </div>
    ))}
  </div>
);

const CandidateRowsSkeleton = () => (
  <div className="divide-y divide-white/[0.08]">
    {Array.from({ length: 8 }).map((_, index) => (
      <div key={`candidate-row-${index}`} className="grid grid-cols-[minmax(260px,1.4fr)_120px_minmax(360px,1fr)] gap-4 px-4 py-4 sm:px-6 lg:px-7">
        <div>
          <SkeletonBlock className="h-4 w-64" />
          <SkeletonLine className="mt-3 w-40" />
        </div>
        <SkeletonBlock className="h-7 w-24" />
        <div className="flex flex-wrap justify-end gap-2">
          <SkeletonBlock className="h-8 w-20" />
          <SkeletonBlock className="h-8 w-24" />
          <SkeletonBlock className="h-8 w-24" />
        </div>
      </div>
    ))}
  </div>
);

export const InterviewOverviewSkeleton = () => (
  <Shell label="Loading interview overview">
    <HeaderSkeleton actionCount={3} />
    <StatsSkeleton count={4} />
    <main className="px-4 py-5 sm:px-6 lg:px-7">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="overflow-hidden border border-white/[0.11]">
          <SectionTitleSkeleton action />
          <div className="px-4 py-5 sm:px-6 lg:px-7">
            <SkeletonBlock className="h-5 w-full max-w-5xl" />
            <SkeletonBlock className="mt-3 h-5 w-[92%]" />
            <SkeletonBlock className="mt-3 h-5 w-[78%]" />
            <SkeletonBlock className="mt-5 h-24 w-full" />
          </div>
        </section>
        <section className="overflow-hidden border border-white/[0.11]">
          <SectionTitleSkeleton />
          <div className="divide-y divide-white/[0.08]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`snapshot-${index}`} className="grid grid-cols-[128px_minmax(0,1fr)] gap-5 px-4 py-4 sm:px-6 lg:px-7">
                <SkeletonLine className="w-24" />
                <SkeletonBlock className="h-5 w-36" />
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="mt-5 overflow-hidden border border-white/[0.11]">
        <SectionTitleSkeleton />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={`config-${index}`} className="min-h-[88px] border-b border-white/[0.08] px-4 py-4 sm:px-6 lg:px-7 xl:border-r">
              <SkeletonLine className="w-24" />
              <SkeletonBlock className="mt-3 h-5 w-40" />
            </div>
          ))}
        </div>
      </section>
    </main>
  </Shell>
);

export const InterviewResponsesSkeleton = () => (
  <Shell label="Loading interview responses">
    <HeaderSkeleton actionCount={4} />
    <StatsSkeleton count={6} />
    <main className="px-4 py-5 sm:px-6 lg:px-7">
      <section className="overflow-hidden border border-white/[0.11]">
        <div className="flex flex-col gap-3 border-b border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-9 w-64" />
            <SkeletonBlock className="h-9 w-32" />
            <SkeletonBlock className="h-9 w-32" />
          </div>
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-9 w-24" />
            <SkeletonBlock className="h-9 w-28" />
          </div>
        </div>
        <div className="border-b border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <SkeletonBlock className="h-8 w-full max-w-4xl" />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <TableHeaderSkeleton columns={5} />
            <ResponseRowsSkeleton />
          </div>
        </div>
      </section>
    </main>
  </Shell>
);

export const InterviewCandidatesSkeleton = () => (
  <Shell label="Loading interview candidates">
    <HeaderSkeleton actionCount={1} />
    <StatsSkeleton count={4} />
    <main className="px-4 py-5 sm:px-6 lg:px-7">
      <section className="overflow-hidden border border-white/[0.11]">
        <SectionTitleSkeleton />
        <div className="grid gap-3 border-b border-white/[0.11] px-4 py-4 sm:grid-cols-[minmax(220px,1fr)_180px_auto] sm:px-6 lg:px-7">
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-32" />
        </div>
        <div className="grid gap-3 border-b border-white/[0.11] px-4 py-4 sm:grid-cols-[minmax(260px,1fr)_160px_auto] sm:px-6 lg:px-7">
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-40" />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <TableHeaderSkeleton columns={3} />
            <CandidateRowsSkeleton />
          </div>
        </div>
      </section>
    </main>
  </Shell>
);
