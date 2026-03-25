-- Emoji PIN authentication
-- Each user gets a unique emoji sequence as an alternative login method

create table user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji_pin_hash text,
  emoji_pin_length int default 4 check (emoji_pin_length >= 4),
  pin_set_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id),
  unique(emoji_pin_hash)
);

create table emoji_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  attempted_at timestamptz default now(),
  success boolean default false
);

-- Index for rate-limit lookups
create index idx_emoji_pin_attempts_ip_time on emoji_pin_attempts(ip_address, attempted_at);

-- RLS
alter table user_profiles enable row level security;
alter table emoji_pin_attempts enable row level security;

-- Users can read/update their own profile
create policy "Users read own profile" on user_profiles
  for select to authenticated using (auth.uid() = user_id);

create policy "Users update own profile" on user_profiles
  for update to authenticated using (auth.uid() = user_id);

-- Service role manages all profiles (for Edge Functions)
create policy "Service role manages profiles" on user_profiles
  for all to service_role using (true);

-- Only service role touches attempts
create policy "Service role manages attempts" on emoji_pin_attempts
  for all to service_role using (true);

-- Auto-update timestamp
create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function update_updated_at();

-- Cleanup old attempts (keep 24 hours)
-- Can be scheduled via pg_cron if desired
create or replace function cleanup_old_pin_attempts() returns void as $$
begin
  delete from emoji_pin_attempts where attempted_at < now() - interval '24 hours';
end;
$$ language plpgsql security definer;
