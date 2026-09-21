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
3. In Supabase → Authentication → URL configuration, add your Vercel URL(s) and `http://localhost:3000` as **Site URL** / **Redirect URLs**.
4. Deploy.

### Google sign-in

1. Supabase → Authentication → Providers → enable **Google** (same Client ID/Secret as iOS if shared).
2. Add redirect URLs (exact):
   - `http://localhost:3000/auth/callback`
   - `https://YOUR_VERCEL_DOMAIN/auth/callback`
   - Preview domains as needed: `https://*.vercel.app/auth/callback` (or each preview URL)
3. In Google Cloud Console OAuth client, allow the same redirect URIs that Supabase shows for the Google provider (Supabase callback host, not only the app `/auth/callback`).
4. Web login uses `signInWithOAuth({ provider: 'google', options: { redirectTo: origin + '/auth/callback' } })`; `/auth/callback` exchanges the code for a session (`@supabase/ssr`).

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing |
| `/login` | Email sign-in / sign-up + Google OAuth |
| `/auth/callback` | OAuth code → session exchange |
| `/app/missions` | Mission list (`?archived=1` to include archived) |
| `/app/missions/new` | Create mission |
| `/app/missions/[id]` | Detail: status, working, readers/workers panel, steps, comments, archive/delete |
| `/app/calendar` | Month calendar for active space |
| `/app/spaces` | List / create / join / members / pending + owner archive/delete |
| `/app/spaces/join` | Redirects to `/app/spaces` |
| `/dashboard` | Redirects to `/app/missions` |

Preferences (cookies):

- `mb_active_space` — active space id
- `mb_locale` — `zh-Hant` (default) or `en`

## Functional design

Scope and waves (zh): [`docs/FUNCTIONAL_DESIGN.md`](docs/FUNCTIONAL_DESIGN.md).

**Wave 1 MVP: done** — app shell, missions list/create/detail, spaces create/join/approve, locale, logout.  
**Wave 2: done** — calendar, readers/workers who+when, mission + space archive/delete, Google OAuth.  
Wave 3+ (realtime, push, billing, activity feed) not started.

## Schema assumptions (shared with iOS)

Migrations: `MissionBoard-iOS/supabase/migrations/`

- `mission_steps.completed_at` (`005`) — set when toggling `is_done`; if the column is missing, update falls back to `is_done` only.
- `missions.archived_at` / `spaces.archived_at` (`004`) — lists filter `archived_at IS NULL` by default; RPCs `archive_mission` / `unarchive_mission` / `archive_space` / `unarchive_space` / `delete_space`.
- Mission hard-delete via `DELETE` on `missions` (RLS: any space member).
- Creating a space inserts `invite_code` + `created_by`; trigger adds the creator as `owner` in `space_members`.
- Join: RPC `lookup_space_by_invite_code` → insert `space_join_requests`; approve/decline via `accept_join_request` / `decline_join_request`.
- Mission status values: `todo` | `inProgress` | `done`.
- `mission_readers.read_at`, `mission_workers.started_at` — detail chips open a who+when panel (join `profiles.display_name`).
- Calendar appearance (aligned with iOS): deadline day = red, overdue (cell day after due) = purple; incomplete missions span from `start_date` (else `created_at`) onward; done missions only on start/due days.
- Ownership transfer RPC `transfer_space_ownership` exists but **no web UI yet** (optional / Wave 2 skip).
- Activity feed skipped — no shared DB table yet.

## Notes

- No guest/mock accounts on web.
- Apple Sign In deferred.
- Do not commit `.env.local` or secrets.
