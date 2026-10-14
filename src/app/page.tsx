import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl bg-white p-10 shadow-sm ring-1 ring-slate-200/80">
        <p className="text-sm font-semibold tracking-wide text-blue-600">
          Work Assistants
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
          任務助理 — 和團隊一起完成任務與排班
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          用空間分開學校、家庭與專案。建立任務、拆成步驟、排班、一起推進。
          Web 與 iOS／Android（Work Assistants）共用同一套 Supabase。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500"
          >
            登入 / 註冊
          </Link>
          <Link
            href="/app/missions"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            打開工作台
          </Link>
        </div>
      </div>
    </main>
  );
}
