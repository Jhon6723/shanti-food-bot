export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-20 bg-slate-200 rounded-full" />
          <div className="h-5 w-5 bg-slate-200 rounded-full" />
        </div>
        <div className="h-6 w-24 bg-slate-200 rounded-full" />
      </div>
      <div className="h-4 w-36 bg-slate-200 rounded-full mb-1.5" />
      <div className="h-3 w-24 bg-slate-200 rounded-full mb-3" />
      <div className="h-3 w-56 bg-slate-200 rounded-full mb-4" />
      <div className="flex justify-between items-center">
        <div className="h-4 w-20 bg-slate-200 rounded-full" />
        <div className="h-8 w-24 bg-slate-200 rounded-xl" />
      </div>
    </div>
  );
}
