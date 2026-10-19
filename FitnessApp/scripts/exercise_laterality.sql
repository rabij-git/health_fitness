-- Adds a "which side" marker to exercises, for exercises a coach wants to
-- flag as done one side at a time (e.g. single-arm dumbbell row, single-leg
-- RDL) rather than both sides together. Null/omitted = both sides together
-- (the existing default for every exercise already in the app).
--
-- Added to both program_exercises (coach's reusable template) and exercises
-- (the per-trainee assigned copy) — same pattern as every other shared
-- field (name/sets/reps/weight/time/rest_seconds) that exists on both
-- tables, so a coach can mark it at either the template or per-trainee
-- assignment stage.
alter table public.program_exercises
  add column if not exists laterality text null
    check (laterality is null or laterality in ('single_arm', 'single_leg'));

alter table public.exercises
  add column if not exists laterality text null
    check (laterality is null or laterality in ('single_arm', 'single_leg'));
