"use client";

export function QuotaMeterRow({
  title,
  used,
  limit,
  footnote,
}: {
  title: string;
  used: number;
  limit: number;
  footnote?: string;
}) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const atLimit = used >= limit && limit > 0;

  return (
    <div className="space-y-1.5" aria-label={`${title} ${used} / ${limit}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">{title}</span>
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${
            atLimit ? "text-orange-600" : "text-slate-500"
          }`}
        >
          {used}/{limit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            atLimit ? "bg-orange-500" : "bg-blue-600"
          }`}
          style={{ width: `${Math.max(4, ratio * 100)}%` }}
        />
      </div>
      {footnote && (
        <p className="text-[11px] text-slate-400">{footnote}</p>
      )}
    </div>
  );
}
