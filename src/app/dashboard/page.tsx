import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SpaceRow = { id: string; name: string };
type MissionRow = { id: string; title: string; status: string; space_id: string };

export default async function DashboardPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!configured) {
    return (
      <Shell>
        <EmptyCard
          title="尚未設定 Supabase"
          body="在專案根目錄建立 .env.local，填入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY（與 iOS Config.xcconfig 同一專案）。"
        />
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("user_id", user.id);

  const spaceIds = (memberships ?? []).map((m) => m.space_id as string);

  let spaces: SpaceRow[] = [];
  let missions: MissionRow[] = [];

  if (spaceIds.length > 0) {
    const { data: spaceRows } = await supabase
      .from("spaces")
      .select("id,name")
      .in("id", spaceIds)
      .order("name");
    spaces = (spaceRows as SpaceRow[] | null) ?? [];

    const { data: missionRows } = await supabase
      .from("missions")
      .select("id,title,status,space_id")
      .in("space_id", spaceIds)
      .order("updated_at", { ascending: false })
      .limit(40);
    missions = (missionRows as MissionRow[] | null) ?? [];
  }

  return (
    <Shell email={user.email}>
      <section className="grid gap-6 md:grid-cols-2">
        <Card title="Spaces">
          {spaces.length === 0 ? (
            <p className="text-sm text-slate-500">
              還沒有空間。請先在 iOS App 建立或加入空間。
            </p>
          ) : (
            <ul className="space-y-2">
              {spaces.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800"
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Missions">
          {missions.length === 0 ? (
            <p className="text-sm text-slate-500">此帳號目前沒有任務可顯示。</p>
          ) : (
            <ul className="space-y-2">
              {missions.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {m.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                    {m.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </Shell>
  );
}

function Shell({
  children,
  email,
}: {
  children: React.ReactNode;
  email?: string | null;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm font-semibold text-blue-600">
            Mission Board
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">工作台</h1>
          {email && <p className="mt-1 text-sm text-slate-500">{email}</p>}
        </div>
        <Link
          href="/login"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          帳號
        </Link>
      </header>
      {children}
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200/80">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}
