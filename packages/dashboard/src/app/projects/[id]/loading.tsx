export default function ProjectDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      {/* Breadcrumb skeleton */}
      <div className="skeleton mb-6 h-3 w-20" />

      {/* Header skeleton */}
      <div className="mb-8">
        <div className="skeleton mb-2 h-5 w-48" />
        <div className="skeleton h-3 w-32" />
      </div>

      {/* Stats bar skeleton */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="stat-card">
            <div className="skeleton mb-2 h-3 w-20" />
            <div className="skeleton h-7 w-16" />
          </div>
        ))}
      </div>

      {/* Checklist skeleton */}
      <div className="glass-card mb-8 p-6">
        <div className="skeleton mb-4 h-4 w-32" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-8 w-full" />
          ))}
        </div>
      </div>

      {/* Runs table skeleton */}
      <div className="mb-8">
        <div className="skeleton mb-4 h-4 w-28" />
        <div className="glass-card overflow-hidden">
          {/* Header row */}
          <div className="flex gap-4 border-b border-edge px-5 py-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton h-3 w-16" />
            ))}
          </div>
          {/* Data rows */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 border-b border-edge/50 px-5 py-3 last:border-0">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <div key={j} className="skeleton h-3 w-16" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
