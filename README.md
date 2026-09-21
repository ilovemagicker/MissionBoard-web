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

Fill `.env.local` with the same project URL and anon key as iOS `Config.xcconfig`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/).
2. Add the same two env vars (Production + Preview).
3. In Supabase → Authentication → URL configuration, add:
   - `https://YOUR_DOMAIN.vercel.app`
   - `http://localhost:3000` for local
4. Deploy.

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing |
| `/login` | Email sign-in / sign-up |
| `/dashboard` | Spaces + missions list (RLS) |

## Notes

- Google sign-in on web can be added later (Supabase Google provider + redirect URLs).
- Creating Spaces/missions on web is planned; for now create them in iOS and view here.
- Node 22+ is recommended by current Supabase JS engines; Node 20 usually works for local build.
