// Content-shaped loading placeholders (ux-best-practices/skeleton-loading):
// mirror the real layout so nothing jumps when data arrives.

export const Skeleton = ({ className }: { className?: string | undefined }) => (
  <div className={`skeleton rounded-md ${className ?? ''}`} />
);

/** Card-list placeholder matching due-action / lead / account rows. */
export const ListSkeleton = ({ rows = 3 }: { rows?: number | undefined }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="rounded-md border border-border bg-surface p-4 shadow-card">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="mt-3 h-3 w-3/5" />
      </div>
    ))}
  </div>
);

export const StatRowSkeleton = () => (
  <div className="grid grid-cols-2 gap-3">
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-3 h-7 w-1/3" />
    </div>
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-3 h-7 w-1/3" />
    </div>
  </div>
);

/** Full-screen splash while the session probe runs. */
export const SplashSkeleton = () => (
  <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24 pt-6">
    <Skeleton className="h-8 w-1/2" />
    <Skeleton className="mt-2 h-4 w-2/3" />
    <div className="mt-6">
      <StatRowSkeleton />
    </div>
    <div className="mt-6">
      <ListSkeleton rows={4} />
    </div>
  </div>
);
