-- ============================================================================
-- Adds an optional per-set breakdown to a trainee's assigned exercises —
-- lets a coach give each SET of an exercise its own reps/weight/time/rest
-- (e.g. a lighter warm-up set before heavier working sets), instead of one
-- shared reps/weight applied to every set. Scoped to `exercises` (the
-- per-trainee instance table) only, NOT `program_exercises` (the coach's
-- reusable templates) — templates stay at the simpler "N sets of X reps"
-- level; per-set customization is a per-trainee, at-assignment/edit-time
-- concern.
--
-- Additive, not a replacement: `sets`/`reps`/`weight`/`time`/`rest_seconds`
-- stay exactly as they are (kept in sync as a single-value summary — sets =
-- array length, the other four = the first set's values) so every existing
-- read site (coach's collapsed workout-list view, exercise_weight_logs,
-- etc.) keeps working unchanged whether or not a given exercise actually
-- uses per-set detail yet. NULL/absent set_details means "not using this
-- yet" — the coach UI (CoachTrainees.tsx) falls back to expanding the
-- scalar columns into N identical rows in that case, not a broken UI.
--
-- Run this whole file once in the Supabase SQL Editor. Idempotent (safe to
-- re-run) — IF NOT EXISTS.
-- ============================================================================

alter table public.exercises
  add column if not exists set_details jsonb;
