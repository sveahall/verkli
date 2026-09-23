export default function LibraryLoading() {
  return (
    <div role="status" aria-label="Loading library" className="mx-auto max-w-[1680px] space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <span className="sr-only">Loading your library…</span>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="flex justify-between gap-6"><div className="h-10 w-36 rounded-xl bg-muted" /><div className="h-11 w-32 rounded-xl bg-muted" /></div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_252px]">
          <div className="space-y-6">
            <div className="h-48 rounded-2xl bg-muted" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-muted" />)}</div>
            <div className="h-11 max-w-md rounded-full bg-muted" />
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-80 rounded-2xl bg-muted" />)}</div>
          </div>
          <div className="hidden space-y-4 xl:block"><div className="h-64 rounded-2xl bg-muted" /><div className="h-44 rounded-2xl bg-muted" /></div>
        </div>
      </div>
    </div>
  );
}
