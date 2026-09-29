-- ============================================================================
-- Real RLS policies for the `nutrition-plans` Storage bucket's objects —
-- this bucket had NO storage.objects policies at all until now (deliberately
-- scoped out of the earlier app-wide RLS lockdown, tracked as a known gap in
-- CLAUDE.md's "Pending / Future Work"). Without these, either (a) writes
-- silently fail once RLS is enabled, or (b) if RLS was never enabled at all,
-- any authenticated user could read/overwrite/delete ANY trainee's uploaded
-- nutrition-plan PDF, not just their own or one they coach.
--
-- Storage paths are `${traineeId}/${timestamp}-${filename}` (see
-- uploadNutritionPlan in db.ts) — access is scoped to that trainee
-- themselves, their assigned coach, or an admin, mirroring every other
-- coach-ownership check already established for `public.*` tables.
--
-- Run this whole file once in the Supabase SQL Editor. Idempotent (safe to
-- re-run) — uses CREATE OR REPLACE / DROP POLICY IF EXISTS throughout.
--
-- Scope note: `alter table storage.objects enable row level security` is a
-- PROJECT-WIDE setting — it applies to every bucket, not just this one. As
-- of this app's own code, `nutrition-plans` is the ONLY bucket the app ever
-- reads or writes (grep confirms no other `supabase.storage.from(...)` call
-- anywhere) — if a different bucket was created by hand in the Supabase
-- dashboard and isn't reflected in this codebase, it will start
-- default-denying all access the moment this script runs, until it gets its
-- own policies too. Check the Storage tab for other buckets before running
-- this if you're not sure.
--
-- Residual risk NOT fixed here, by design — a decision for you to make: this
-- bucket is configured "public" (per CLAUDE.md), meaning `getPublicUrl()`
-- URLs are served directly and bypass storage.objects RLS entirely for
-- plain GET requests — these policies still lock down the authenticated
-- Storage API (listing, and any direct read/write/delete through it), but
-- NOT a leaked/logged public URL itself, which stays retrievable by anyone
-- who has it (the trainee id in the path is an unguessable UUID, so this is
-- "unlisted," not "protected"). Switching the bucket to private + signed,
-- expiring URLs closes that gap fully but needs upload/display code changes
-- on top of this script — ask if you want that done as a follow-up.
-- ============================================================================

create or replace function public.can_access_nutrition_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (storage.foldername(object_name))[1] = auth.uid()::text
    or exists (
      select 1 from public.users u
      where u.id::text = (storage.foldername(object_name))[1]
        and u.coach_id = auth.uid()
    )
    or public.is_admin();
$$;

alter table storage.objects enable row level security;

drop policy if exists "nutrition_plans_select" on storage.objects;
drop policy if exists "nutrition_plans_insert" on storage.objects;
drop policy if exists "nutrition_plans_update" on storage.objects;
drop policy if exists "nutrition_plans_delete" on storage.objects;

create policy "nutrition_plans_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'nutrition-plans' and public.can_access_nutrition_file(name));

create policy "nutrition_plans_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'nutrition-plans' and public.can_access_nutrition_file(name));

create policy "nutrition_plans_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'nutrition-plans' and public.can_access_nutrition_file(name))
  with check (bucket_id = 'nutrition-plans' and public.can_access_nutrition_file(name));

create policy "nutrition_plans_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'nutrition-plans' and public.can_access_nutrition_file(name));
