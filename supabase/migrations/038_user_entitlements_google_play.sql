-- 038 — Allow Google Play as user_entitlements.source (Android Pro).
-- Safe to re-run. Does not change Apple rows or verify-apple-entitlement.

alter table public.user_entitlements
  drop constraint if exists user_entitlements_source_check;

alter table public.user_entitlements
  add constraint user_entitlements_source_check
  check (source in ('apple', 'google_play'));

comment on table public.user_entitlements is
  'Pro subscription entitlement per user. Written by verify-apple-entitlement (source=apple) or verify-google-play-entitlement (source=google_play). Service role only.';
