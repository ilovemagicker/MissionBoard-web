# Mission Board (Web)

Next.js (App Router) web client for **Mission Board**. Shares the same **Supabase** project as the iOS app ([MissionBoard-iOS](https://github.com/ilovemagicker/MissionBoard-iOS)).

## Stack

- Next.js + TypeScript + Tailwind
- `@supabase/ssr` + `@supabase/supabase-js`
- Deploy target: **Vercel**

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with the same project URL and anon key as iOS:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/).
2. Add the same two env vars (Production + Preview).
3. In Supabase → Authentication → URL configuration, add your Vercel URL and `http://localhost:3000`.
4. Deploy.

## Routes (Wave 1)

| Path | Purpose |
|------|---------|
| `/` | Landing |
| `/login` | Email sign-in / sign-up (+ sign-out if already logged in) |
| `/app/missions` | Mission list for active space (search, All / Active / Done) |
| `/app/missions/new` | Create mission |
| `/app/missions/[id]` | Detail: status, working, steps (claim/assign/done), comments |
| `/app/spaces` | List / create / join by invite / members / pending requests |
| `/app/spaces/join` | Redirects to `/app/spaces` |
| `/dashboard` | Redirects to `/app/missions` |

Preferences (cookies):

- `mb_active_space` — active space id
- `mb_locale` — `zh-Hant` (default) or `en`

## Functional design

Scope and waves (zh): [`docs/FUNCTIONAL_DESIGN.md`](docs/FUNCTIONAL_DESIGN.md).

**Wave 1 MVP: done** — app shell, missions list/create/detail (status, working, steps, comments), spaces create/join/approve, locale toggle, logout.  
Wave 2+ (calendar, activity, Google OAuth, archive UI, billing) not started.

## Schema assumptions (shared with iOS)

Migrations: `MissionBoard-iOS/supabase/migrations/`

- `mission_steps.completed_at` (`005`) — set when toggling `is_done`; if the column is missing, update falls back to `is_done` only.
- `missions.archived_at` / `spaces.archived_at` (`004`) — lists filter `archived_at IS NULL`; archive UI is Wave 2.
- Creating a space inserts `invite_code` + `created_by`; trigger adds the creator as `owner` in `space_members`.
- Join: RPC `lookup_space_by_invite_code` → insert `space_join_requests`; approve/decline via `accept_join_request` / `decline_join_request`.
- Mission status values: `todo` | `inProgress` | `done`.

## Notes

- No guest/mock accounts on web.
- Google / Apple sign-in deferred (Wave 2+).
- Do not commit `.env.local` or secrets.
