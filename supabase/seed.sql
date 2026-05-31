-- ============================================================
-- REAXN — Seed: Bootstrap user + initial invite codes
-- Run once in Supabase SQL Editor after initial_schema migration
-- ============================================================

do $$
declare
  seed_id uuid := '00000000-0000-0000-0000-000000000001';
begin

  -- 1. Insert into auth.users (triggers handle_new_user automatically)
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    raw_app_meta_data,
    is_super_admin,
    confirmation_token
  ) values (
    seed_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'seed@reaxn.app',
    '',
    now(),
    now(),
    now(),
    '{"handle": "reaxn_seed", "display_name": "Reaxn"}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    false,
    ''
  ) on conflict (id) do nothing;

  -- 2. Add known invite codes on top of the 3 random ones the trigger generated
  --    Change these to whatever you want to hand out
  insert into public.invite_codes (code, created_by) values
    ('REAXN-AAAA', seed_id),
    ('REAXN-BBBB', seed_id),
    ('REAXN-CCCC', seed_id),
    ('REAXN-DDDD', seed_id),
    ('REAXN-EEEE', seed_id)
  on conflict (code) do nothing;

end;
$$;
