-- ============================================================================
-- Coach -> trainee invite links, mirroring the existing admin -> coach
-- invite system (coach_invites / redeem_coach_invite) exactly, one level
-- down: a coach generates a code, shares it, and a brand-new signup that
-- redeems it is automatically connected to that coach as their trainee —
-- skipping the search + request + accept flow entirely.
--
-- Run this whole file once in the Supabase SQL Editor. Idempotent (safe to
-- re-run) — uses CREATE OR REPLACE / IF NOT EXISTS throughout.
-- ============================================================================

create table if not exists public.trainee_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references public.users(id),
  used_by uuid references public.users(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.trainee_invites enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'trainee_invites'
  loop
    execute format('drop policy if exists %I on public.trainee_invites', pol.policyname);
  end loop;
end $$;

-- A coach only ever sees/manages their OWN invites (admins see everyone's,
-- consistent with every other coach-owned-content policy in this app).
create policy "trainee_invites_select" on public.trainee_invites
  for select to authenticated
  using (created_by = auth.uid() or public.is_admin());

create policy "trainee_invites_insert" on public.trainee_invites
  for insert to authenticated
  with check (created_by = auth.uid() and public.my_role() in ('coach', 'admin'));

create policy "trainee_invites_delete" on public.trainee_invites
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- Redemption goes through this RPC, not a plain client read+update of
-- coach_invites — same reasoning as redeem_coach_invite: validates and
-- marks the code used atomically, and is the only path allowed to insert a
-- trainee's profile row with a non-null coach_id already set (a plain
-- self-signup can't set coach_id in the same insert).
create or replace function public.redeem_trainee_invite(
  p_code text,
  p_name text,
  p_email text,
  p_avatar text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
  v_coach_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.trainee_invites
     set used_by = auth.uid(), used_at = now()
   where code = upper(trim(p_code))
     and used_by is null
   returning id, created_by into v_invite_id, v_coach_id;

  if v_invite_id is null then
    raise exception 'That invite code is invalid or has already been used.';
  end if;

  insert into public.users (id, name, email, role, avatar, level, xp, streak, status, coach_id)
  values (auth.uid(), p_name, p_email, 'trainee', p_avatar, 1, 0, 0, 'assigned', v_coach_id)
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.redeem_trainee_invite(text, text, text, text) from public;
grant execute on function public.redeem_trainee_invite(text, text, text, text) to authenticated;
