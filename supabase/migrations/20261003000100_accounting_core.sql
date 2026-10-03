create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  registration_code text,
  address text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'accountant', 'administrator')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
  );
$$;

create function public.has_organization_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
      and member.role = any (allowed_roles)
  );
$$;

create function public.create_organization(
  organization_name text,
  organization_registration_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if organization_name is null or length(trim(organization_name)) = 0 then
    raise exception 'Organization name is required';
  end if;

  insert into public.organizations (name, registration_code)
  values (trim(organization_name), nullif(trim(organization_registration_code), ''))
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, (select auth.uid()), 'owner');

  return new_organization_id;
end;
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  client_type text not null default 'company' check (client_type in ('company', 'person')),
  registration_code text,
  address text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid,
  number text not null check (length(trim(number)) > 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  issue_date date not null,
  due_date date,
  currency text not null default 'EUR' check (currency = 'EUR'),
  reference_number text,
  note text,
  client_name text not null,
  client_email text,
  client_address text,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  tax_total numeric(14, 2) not null default 0 check (tax_total >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (id, organization_id),
  foreign key (client_id, organization_id)
    references public.clients (id, organization_id)
    on delete set null (client_id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  position integer not null check (position > 0),
  article_number text,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  created_at timestamptz not null default now(),
  unique (invoice_id, position),
  foreign key (invoice_id, organization_id)
    references public.invoices (id, organization_id)
    on delete cascade
);

create table public.invoice_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, organization_id)
    references public.invoices (id, organization_id)
    on delete cascade
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_email_deliveries enable row level security;

create policy "Members can read their organizations"
  on public.organizations for select to authenticated
  using ((select public.is_organization_member(id)));

create policy "Owners can update their organizations"
  on public.organizations for update to authenticated
  using ((select public.has_organization_role(id, array['owner'])))
  with check ((select public.has_organization_role(id, array['owner'])));

create policy "Members can read organization memberships"
  on public.organization_members for select to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Members can manage clients"
  on public.clients for all to authenticated
  using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));

create policy "Members can manage invoices"
  on public.invoices for all to authenticated
  using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));

create policy "Members can manage invoice items"
  on public.invoice_items for all to authenticated
  using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));

create policy "Members can read invoice email deliveries"
  on public.invoice_email_deliveries for select to authenticated
  using ((select public.is_organization_member(organization_id)));

grant usage on schema public to authenticated;
grant select, update on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;
grant select on public.invoice_email_deliveries to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;

revoke all on function public.create_organization(text, text) from public, anon;