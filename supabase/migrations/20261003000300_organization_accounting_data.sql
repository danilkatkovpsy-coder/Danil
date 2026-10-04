alter table public.organizations
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists bank_name text,
  add column if not exists bank_swift text,
  add column if not exists bank_iban text;

drop policy if exists "Owners can update their organizations" on public.organizations;

create policy "Owners and administrators can update their organizations"
  on public.organizations for update to authenticated
  using ((select public.has_organization_role(id, array['owner', 'administrator'])))
  with check ((select public.has_organization_role(id, array['owner', 'administrator'])));

create table public.organization_accounting_data (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  data_key text not null check (data_key in (
    'purchases', 'expenses', 'suppliers', 'supplierInvoices', 'articles',
    'background', 'logo', 'color', 'theme', 'designTokens',
    'invoiceNumberStart', 'paymentTermsDays', 'permissions', 'emailTemplate'
  )),
  data_value jsonb not null,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, data_key)
);

alter table public.organization_accounting_data enable row level security;

create policy "Organization members can read accounting data"
  on public.organization_accounting_data for select to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Authorized roles can create accounting data"
  on public.organization_accounting_data for insert to authenticated
  with check ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])));

create policy "Authorized roles can update accounting data"
  on public.organization_accounting_data for update to authenticated
  using ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])))
  with check ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])));

create policy "Owners and administrators can delete accounting data"
  on public.organization_accounting_data for delete to authenticated
  using ((select public.has_organization_role(organization_id, array['owner', 'administrator'])));

grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_accounting_data to authenticated;
