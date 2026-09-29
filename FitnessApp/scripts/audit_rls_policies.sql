-- ============================================================================
-- Read-only security audit — lists the ACTUAL current RLS state, since the
-- original lockdown migration was deleted locally after being applied and
-- there's no live DB access from this environment to check it any other
-- way. Almost every write in db.ts filters only by the row's own `id` (no
-- explicit coach_id/trainee_id check in the client query) and relies
-- entirely on RLS to reject cross-account access — so confirming these
-- policies actually say what CLAUDE.md's documentation claims they say is
-- the single most load-bearing check in this whole audit.
--
-- Run this in the Supabase SQL Editor and share the full output back —
-- nothing here modifies anything.
-- ============================================================================

-- 1. Which public.* tables have RLS enabled at all — anything showing
--    rowsecurity = false is wide open to any authenticated (or even anon)
--    request that reaches it, regardless of any policy text below.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- 2. Every policy currently defined on every public.* table — the actual
--    USING/WITH CHECK expressions, not a summary. This is what to compare
--    against CLAUDE.md's "coach_id"/"trainee_id"/"auth.uid()" claims.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- 3. Storage bucket configuration — confirms whether nutrition-plans (and
--    anything else) is actually "public" as documented, and whether RLS is
--    enabled on storage.objects (run nutrition_plans_storage_policies.sql
--    first if this shows it disabled).
select id, name, public, created_at from storage.buckets order by name;
select tablename, rowsecurity from pg_tables where schemaname = 'storage' and tablename = 'objects';
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects';

-- 4. Every SECURITY DEFINER function in public — these run with elevated
--    privilege regardless of the caller's own RLS, so each one is a
--    hand-audited trust boundary, not something RLS itself protects.
--    Confirms exactly which functions exist (in case anything was created
--    outside this repo's tracked .sql scripts) and who can call them.
select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_get_function_identity_arguments(p.oid) as arguments,
  array_agg(distinct r.rolname) filter (where has_function_privilege(r.oid, p.oid, 'execute')) as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public'
  and r.rolname in ('anon', 'authenticated')
group by p.proname, p.prosecdef, p.oid
order by p.proname;

-- 5. Any table trigger — confirms the "non-admin can't change users.role"
--    trigger (and anything else) is actually still installed.
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table;
