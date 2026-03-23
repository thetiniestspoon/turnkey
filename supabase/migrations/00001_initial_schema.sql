-- Properties
create table properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  city text not null,
  state text not null check (char_length(state) = 2),
  zip text not null,
  county text,
  lat numeric,
  lng numeric,
  property_type text check (property_type in ('single_family', 'condo', 'multi_family', 'townhouse')),
  bedrooms int,
  bathrooms numeric,
  sqft int,
  lot_size numeric,
  year_built int,
  list_price numeric,
  estimated_value numeric,
  source text check (source in ('zillow', 'census', 'manual', 'agent_scout')),
  raw_data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (address, city, state)
);

create table property_analyses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  flip_arv numeric, flip_renovation_est numeric, flip_carrying_costs numeric,
  flip_total_investment numeric, flip_profit_margin numeric, flip_roi numeric,
  flip_timeline text,
  rental_monthly_est numeric, rental_monthly_expenses numeric,
  rental_monthly_cash_flow numeric, rental_annual_noi numeric,
  rental_cap_rate numeric, rental_cash_on_cash numeric,
  recommended_strategy text check (recommended_strategy in ('flip', 'rental', 'either')),
  confidence_score int check (confidence_score between 0 and 100),
  analysis_summary text,
  neighborhood_data jsonb default '{}',
  agent_model text,
  analyzed_at timestamptz default now()
);

create table property_predictions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  metric text not null,
  predicted_value numeric not null,
  actual_value numeric,
  predicted_at timestamptz default now(),
  resolved_at timestamptz,
  accuracy_score numeric
);

create table pipeline (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  stage text not null default 'watching'
    check (stage in ('watching', 'analyzing', 'offer', 'negotiating', 'acquired', 'tracking', 'closed')),
  entered_stage_at timestamptz default now(),
  purchase_price numeric, actual_renovation_cost numeric, sale_price numeric,
  outcome text check (outcome in ('profitable', 'break_even', 'loss')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  role text check (role in ('agent', 'contractor', 'lender', 'attorney', 'partner')),
  email text, phone text, company text, notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table contact_links (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  pipeline_id uuid references pipeline(id) on delete cascade,
  created_at timestamptz default now(),
  check (property_id is not null or pipeline_id is not null)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  pipeline_id uuid references pipeline(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  file_path text not null, file_name text not null,
  doc_type text check (doc_type in ('inspection', 'appraisal', 'contract', 'photo', 'other')),
  uploaded_at timestamptz default now()
);

create table property_notes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  content text not null,
  created_at timestamptz default now()
);

create table market_data (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  region_type text not null check (region_type in ('zip', 'county', 'metro')),
  data_type text not null check (data_type in ('census_acs', 'fred_rates', 'hud_fmr')),
  data jsonb not null,
  fetched_at timestamptz default now(),
  expires_at timestamptz not null,
  unique (region, region_type, data_type)
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in ('scout', 'analyst', 'tracker', 'advisor', 'enricher')),
  trigger text not null check (trigger in ('cron', 'manual', 'auto')),
  input_summary text, output_summary text,
  tokens_used int, model text, cost_est numeric,
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'error', 'timeout'))
);

-- Indexes
create index idx_properties_state_zip on properties(state, zip);
create index idx_properties_source on properties(source);
create index idx_property_analyses_property on property_analyses(property_id);
create index idx_pipeline_user_stage on pipeline(user_id, stage);
create index idx_pipeline_property on pipeline(property_id);
create index idx_contacts_user on contacts(user_id);
create index idx_market_data_lookup on market_data(region, region_type, data_type);
create index idx_agent_runs_type_status on agent_runs(agent_type, status);

-- RLS
alter table properties enable row level security;
alter table property_analyses enable row level security;
alter table property_predictions enable row level security;
alter table pipeline enable row level security;
alter table contacts enable row level security;
alter table contact_links enable row level security;
alter table documents enable row level security;
alter table property_notes enable row level security;
alter table market_data enable row level security;
alter table agent_runs enable row level security;

create policy "Authenticated users can read properties" on properties for select to authenticated using (true);
create policy "Authenticated users can insert properties" on properties for insert to authenticated with check (true);
create policy "Authenticated users can update properties" on properties for update to authenticated using (true);

create policy "Authenticated users can read analyses" on property_analyses for select to authenticated using (true);
create policy "Service role can manage analyses" on property_analyses for all to service_role using (true);

create policy "Users see own pipeline entries" on pipeline for select to authenticated using (auth.uid() = user_id);
create policy "Users manage own pipeline entries" on pipeline for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own pipeline entries" on pipeline for update to authenticated using (auth.uid() = user_id);

create policy "Users see own contacts" on contacts for select to authenticated using (auth.uid() = user_id);
create policy "Users manage own contacts" on contacts for all to authenticated using (auth.uid() = user_id);

create policy "Users see own contact links" on contact_links for select to authenticated
  using (exists (select 1 from contacts where contacts.id = contact_links.contact_id and contacts.user_id = auth.uid()));
create policy "Users manage own contact links" on contact_links for all to authenticated
  using (exists (select 1 from contacts where contacts.id = contact_links.contact_id and contacts.user_id = auth.uid()));

create policy "Authenticated users can read documents" on documents for select to authenticated using (true);
create policy "Authenticated users can manage documents" on documents for all to authenticated using (true);

create policy "Users see own notes" on property_notes for select to authenticated using (auth.uid() = user_id);
create policy "Users manage own notes" on property_notes for all to authenticated using (auth.uid() = user_id);

create policy "Authenticated users can read market data" on market_data for select to authenticated using (true);
create policy "Service role manages market data" on market_data for all to service_role using (true);

create policy "Authenticated users can read agent runs" on agent_runs for select to authenticated using (true);
create policy "Service role manages agent runs" on agent_runs for all to service_role using (true);

create policy "Authenticated users can read predictions" on property_predictions for select to authenticated using (true);
create policy "Service role manages predictions" on property_predictions for all to service_role using (true);
create policy "Users can update actual values" on property_predictions for update to authenticated using (true) with check (true);

-- Triggers
create or replace function update_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger properties_updated_at before update on properties for each row execute function update_updated_at();
create trigger pipeline_updated_at before update on pipeline for each row execute function update_updated_at();
create trigger contacts_updated_at before update on contacts for each row execute function update_updated_at();

create or replace function validate_pipeline_stage_transition() returns trigger as $$
declare
  stage_order text[] := array['watching', 'analyzing', 'offer', 'negotiating', 'acquired', 'tracking', 'closed'];
  old_idx int; new_idx int;
begin
  if old.stage = new.stage then return new; end if;
  old_idx := array_position(stage_order, old.stage);
  new_idx := array_position(stage_order, new.stage);
  if new_idx <= old_idx then
    raise exception 'Invalid stage transition: cannot move backward from % to %', old.stage, new.stage;
  end if;
  new.entered_stage_at = now();
  return new;
end;
$$ language plpgsql;

create trigger pipeline_stage_transition before update of stage on pipeline
  for each row execute function validate_pipeline_stage_transition();
