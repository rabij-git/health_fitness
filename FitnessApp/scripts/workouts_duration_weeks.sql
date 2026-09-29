-- ============================================================================
-- Adds an optional "how many weeks is this for" field to a trainee's
-- assigned workout — separate from workouts.duration (a per-session length
-- string like "60 min", currently hardcoded and not user-editable) and
-- separate from programs.duration (an always-required weeks value on the
-- coach's reusable TEMPLATE, not the per-trainee instance). Nullable —
-- optional by design, since a coach may not always know/want to commit to
-- a program length up front.
--
-- Run this whole file once in the Supabase SQL Editor. Idempotent (safe to
-- re-run) — IF NOT EXISTS throughout.
-- ============================================================================

alter table public.workouts
  add column if not exists duration_weeks int;

alter table public.workouts
  drop constraint if exists workouts_duration_weeks_check;

alter table public.workouts
  add constraint workouts_duration_weeks_check
  check (duration_weeks is null or (duration_weeks >= 1 and duration_weeks <= 52));
