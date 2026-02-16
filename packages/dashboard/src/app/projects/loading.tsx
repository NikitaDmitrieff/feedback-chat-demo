export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
      {/* Header skeleton */}
      <div className="mb-8 flex items-center justify-between">
        <div className="skeleton h-6 w-24" />
        <div className="skeleton h-9 w-32 rounded-xl" />
      </div>

      {/* Project cards skeleton */}
      <div className="grid gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card px-5 py-4">
            <div className="skeleton mb-2 h-4 w-40" />
            <div className="skeleton h-3 w-56" />
          </div>
        ))}
      </div>
    </div>
  )
}
